"""장래 노선 조사 자료(plans.json)를 소요시간 계산용 future-lines.json으로 가공한다.

python3 scripts/generate-future-lines.py PLANS_JSON

- 반영 기준: plans.json status가 "착공"인 사업만 included=true (사업시행인가에 준하는 승인·고시 이후 단계).
- 선형은 plans.json의 OSM 매핑/개략선을 그대로 옮긴다. 공식 기계판독 선형이 아니다.
- 경로 계산용 역 순서와 역간 거리는 아래 CHAINS에 적은 선형 조각 순서대로 이은 한 줄 위에 역을 투영해 구한다.
  조각 사이 빈틈과 approx 조각은 직선 개략으로 보고 approxMeters에 따로 기록한다.
- 좌표가 없거나 선형에서 1.2km 넘게 떨어진 역은 경로 계산에서 빼고 사유를 남긴다. 위치를 지어내지 않는다.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GRAPH = ROOT / "src/features/travel-time/data/subway-travel-graph.json"
OUTPUT = ROOT / "src/features/travel-time/data/future-lines.json"
SNAP_LIMIT_METERS = 1200

# 경로 계산에 쓰는 선형 조각 순서. (조각 번호, 뒤집기). 여기 없는 노선은 지도 표시만 한다.
CHAINS = {
    "GTXA_LINK": [(0, False)],
    "SINAN": [(0, False)],
    "DONGBUK": [(0, False)],
    "SBD_HOMAESIL": [(0, False)],
    "DOBONG_OKJEONG": [(3, False), (0, False), (1, False)],
    "GTXB": [(0, False), (2, False), (3, False)],
    "GTXC": [(4, False), (2, False), (1, False), (5, False), (6, False), (7, False)],
}

# 경로 계산에서 제외하는 이유가 자료 밖 판단인 경우만 적는다.
NOT_ROUTED = {
    "L9EXT": "9호선 기존 구간이 기준망(1~8호선)에 없고 941(고덕) 환승역이 자료에 없음",
    "WOLPAN": "자료의 정차역이 모두 신설역이라 기준망과 연결되는 환승역이 없음",
    "INDONG": "인덕원(4호선) 쪽 선형·정차역이 자료에 없어 기준망과 연결되지 않음",
    "DAEJANG": "정거장 좌표 미확보",
    "WIRYE_TRAM": "정거장 좌표 미확보",
}

# 직결 운행: 기존 호선 종점에서 갈아타지 않고 이어 달린다.
THROUGH_SERVICE = {"DOBONG_OKJEONG": {"line": 7, "junction": "7:장암", "before": "7:도봉산"}}

# 화면 칩·범례용 짧은 이름. 9호선 4단계를 "9호선"으로만 쓰면 기존 9호선 전체로 오해된다.
SHORT_NAMES = {
    "GTXA_LINK": "GTX-A 삼성 연결",
    "L9EXT": "9호선 4단계",
    "SBD_HOMAESIL": "신분당선 연장",
    "DOBONG_OKJEONG": "7호선 연장",
    "BYEOLNAE_EXT": "별내선 연장",
}

# 지도 표시에서 뺄 조각. 정차역 목록 밖 구간을 개통 노선처럼 보이지 않게 한다.
HIDDEN_PARTS = {"SINAN": {6: "여의도–서울역(2단계) 선형: plans.json 정차역 목록 밖", 7: "여의도–서울역(2단계) 선형: plans.json 정차역 목록 밖"}}


def haversine(a, b):
    dlon, dlat = (math.radians(y - x) for x, y in zip(a, b))
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[1])) * math.cos(math.radians(b[1])) * math.sin(dlon / 2) ** 2
    return 2 * 6_371_008.8 * math.asin(math.sqrt(h))


def simplify(points, tolerance_meters=8.0):
    if len(points) < 3:
        return points
    scale = math.cos(math.radians(points[0][1]))

    def xy(p):
        return p[0] * scale * 111_320, p[1] * 110_540

    def offset(p, a, b):
        (ax, ay), (bx, by), (px, py) = xy(a), xy(b), xy(p)
        dx, dy = bx - ax, by - ay
        length = dx * dx + dy * dy
        t = 0 if length == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        best, index = 0.0, None
        for i in range(first + 1, last):
            distance = offset(points[i], points[first], points[last])
            if distance > best:
                best, index = distance, i
        if index is not None and best > tolerance_meters:
            keep[index] = True
            stack += [(first, index), (index, last)]
    return [p for p, k in zip(points, keep) if k]


def rounded(points):
    return [[round(p[0], 5), round(p[1], 5)] for p in points]


def build_chain(corridor, chain):
    """선형 조각을 한 줄로 잇고, 점마다 누적거리와 개략 여부를 남긴다."""
    parts = corridor["geometry"]["parts"]
    points, cumulative, approx = [], [], []
    for index, flip in chain:
        part = parts[index]
        coords = list(reversed(part["coords"])) if flip else list(part["coords"])
        is_approx = part["kind"] != "osm"
        for j, coord in enumerate(coords):
            if points:
                gap = haversine(points[-1], coord)
                cumulative.append(cumulative[-1] + gap)
                # 조각 사이 50m 넘는 빈틈은 직선 개략이다.
                approx.append(is_approx or (j == 0 and gap > 50))
            else:
                cumulative.append(0.0)
                approx.append(is_approx)
            points.append(coord)
    return points, cumulative, approx


def project(points, cumulative, coordinate):
    best = None
    scale = math.cos(math.radians(coordinate[1]))
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        dx, dy = (b[0] - a[0]) * scale, b[1] - a[1]
        px, py = (coordinate[0] - a[0]) * scale, coordinate[1] - a[1]
        length = dx * dx + dy * dy
        t = 0 if length == 0 else max(0, min(1, (px * dx + py * dy) / length))
        point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        offset = haversine(point, coordinate)
        if best is None or offset < best[0]:
            best = (offset, cumulative[i] + (cumulative[i + 1] - cumulative[i]) * t, i, point)
    return best


def slice_chain(points, cumulative, approx, start, end):
    """누적거리 start~end 사이 선형과 그중 개략 구간 길이."""
    lo, hi = min(start, end), max(start, end)

    def at(meters):
        for i in range(1, len(points)):
            if cumulative[i] >= meters:
                span = max(1e-9, cumulative[i] - cumulative[i - 1])
                r = (meters - cumulative[i - 1]) / span
                a, b = points[i - 1], points[i]
                return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]
        return points[-1]

    coords = [at(lo)] + [p for p, m in zip(points, cumulative) if lo < m < hi] + [at(hi)]
    approx_meters = 0.0
    for i in range(1, len(points)):
        a, b = max(lo, cumulative[i - 1]), min(hi, cumulative[i])
        if b > a and approx[i]:
            approx_meters += b - a
    if start > end:
        coords.reverse()
    return coords, approx_meters


def approval_for(corridor, stage):
    kind = "사업계획 승인" if "도시철도" in corridor["lineType"] else "실시계획 승인"
    if stage != "착공":
        return {"kind": kind, "note": f"{stage} 단계 — 승인·고시 이전이라 반영 기준 미충족"}
    if corridor["id"] == "GTXB":
        return {
            "kind": kind,
            "notice": "국토교통부고시 제2024-373호",
            "date": "2024-07-11",
            "note": "민자구간 실시계획 승인(기획서 기재). 고시 원문 URL 미대조",
        }
    return {"kind": kind, "note": "착공 확인, 고시번호 미확인"}


def generate(plans_path):
    plans_bytes = plans_path.read_bytes()
    plans = json.loads(plans_bytes)
    graph = json.loads(GRAPH.read_text())
    base = graph["stations"]
    plan_stations = {s["id"]: s for s in plans["stations"]}

    def base_transfers(station):
        result = []
        for candidate in base:
            distance = haversine(candidate["coordinate"], station["coordinates"])
            same_name = candidate["complex"] == station["name"].split("(")[0].replace(" ", "")
            if (station["kind"] == "환승정차" and distance <= 500) or (same_name and distance <= 700):
                result.append(candidate["id"])
        return result

    lines = []
    for corridor in plans["corridors"]:
        cid = corridor["id"]
        stage = corridor["status"]
        parts = corridor["geometry"].get("parts") or []
        hidden = HIDDEN_PARTS.get(cid, {})
        display = [rounded(simplify(p["coords"])) for i, p in enumerate(parts) if i not in hidden]
        stations = []
        for sid in corridor["stations"]:
            s = plan_stations[sid]
            stations.append({
                "id": f"{cid}:{s['name']}",
                "sourceId": sid,
                "name": s["name"],
                "kind": s["kind"],
                "coordinate": [round(c, 6) for c in s["coordinates"]] if s.get("coordinates") else None,
                "coordSource": s.get("coordSource"),
                "transferTo": base_transfers(s) if s.get("coordinates") else [],
            })

        routing = {"enabled": False, "reason": NOT_ROUTED.get(cid, "반영 기준 미충족(지도 참고 표시만)")}
        if stage == "착공" and cid in CHAINS:
            points, cumulative, approx = build_chain(corridor, CHAINS[cid])
            placed, excluded = [], []
            for station in stations:
                if station["coordinate"] is None:
                    excluded.append({"station": station["id"], "reason": "좌표 미확보"})
                    continue
                offset, along, _, _ = project(points, cumulative, station["coordinate"])
                if offset > SNAP_LIMIT_METERS:
                    excluded.append({"station": station["id"], "reason": f"경로 선형에서 {round(offset)}m 떨어짐(지선 선형 미확보)"})
                    continue
                placed.append((along, station["id"], offset))
            through = THROUGH_SERVICE.get(cid)
            if through:
                junction = next(s for s in base if s["id"] == through["junction"])
                offset, along, _, _ = project(points, cumulative, junction["coordinate"])
                placed.append((along, junction["id"], offset))
            placed.sort()
            segments = []
            for (a_along, a, _), (b_along, b, _) in zip(placed, placed[1:]):
                coords, approx_meters = slice_chain(points, cumulative, approx, a_along, b_along)
                segments.append({
                    "from": a,
                    "to": b,
                    "meters": round(b_along - a_along),
                    "approxMeters": round(approx_meters),
                    "path": rounded(simplify(coords)),
                })
            routing = {
                "enabled": True,
                "order": [sid for _, sid, _ in placed],
                "snapOffsets": {sid: round(off) for _, sid, off in placed},
                "segments": segments,
                "excluded": excluded,
            }
            if through:
                routing["through"] = through

        opening = {
            "year": corridor.get("targetYear"),
            "kind": corridor.get("targetKind"),
            "confidence": corridor["confidence"],
        }
        if corridor.get("reportedYear"):
            opening["reportedYear"] = corridor["reportedYear"]
        lines.append({
            "id": cid,
            "name": corridor["name"],
            "shortName": SHORT_NAMES.get(cid, corridor["name"].split(" ")[0]),
            "color": corridor["color"],
            "lineType": corridor["lineType"],
            "stage": stage,
            "statusNote": corridor.get("statusNote", ""),
            "included": stage == "착공",
            "approval": approval_for(corridor, stage),
            "opening": opening,
            "milestones": corridor.get("milestones", []),
            "length": corridor.get("length"),
            "geometryNote": corridor["geometry"].get("coordConfidence"),
            "hiddenParts": list(hidden.values()),
            "geometry": display,
            "stations": stations,
            "routing": routing,
            "sources": [{k: s.get(k) for k in ("org", "title", "date", "url", "tier")} for s in corridor["sources"]],
            "conflicts": corridor["conflicts"],
        })

    result = {
        "source": "plans.json (17개 코리도·98역 조사 자료)",
        "sourceGenerated": plans["meta"]["generated"],
        "sourceSha256": hashlib.sha256(plans_bytes).hexdigest(),
        "osmAttribution": plans["meta"]["osmAttribution"],
        "confidence": plans["meta"]["confidence"],
        "rules": plans["meta"]["rules"] + [
            "status=착공만 반영(included). 기본계획·예타는 참고 표시만",
            "경로 계산 역간 거리는 선형 위 투영 거리, 빈틈·approx 조각은 approxMeters로 구분",
        ],
        "pending": plans["pending"],
        "lines": lines,
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    for line in lines:
        routing = line["routing"]
        if routing["enabled"]:
            total = sum(s["meters"] for s in routing["segments"])
            approx = sum(s["approxMeters"] for s in routing["segments"])
            print(f"{line['id']}: {' → '.join(routing['order'])} · {total / 1000:.1f}km (개략 {approx / 1000:.1f}km)"
                  f" · 제외 {[e['station'] for e in routing['excluded']]}")
        else:
            print(f"{line['id']}: 표시만 — {routing['reason']}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("plans", type=Path)
    args = parser.parse_args()
    generate(args.plans)
