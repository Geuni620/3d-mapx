"""수도권 광역·도시철도(1~8호선 밖) 노선을 OSM route relation에서 읽어 소요시간 계산용 JSON으로 만든다.

python3 scripts/generate-regional-lines.py [LINE_ID ...] [--refresh]

- 출처: OpenStreetMap API `relation/{id}/full` (ODbL). route_master의 하위 route relation을 운행 계통으로 본다.
- 정차역: route relation의 stop 역할 노드 순서. 이름을 정규화해 같은 노선 안 같은 역으로 묶는다.
- 역간 거리: 계통의 선로 way를 이어 한 줄로 만든 뒤 정차 노드를 투영한 누적거리 차이.
  선로를 잇지 못한 구간은 직선거리로 두고 approx=true로 표시한다.
- 시간·배차는 여기서 정하지 않는다. 앱의 travel-time-parameters.ts가 노선별 출처와 함께 정한다.
- 결과: src/features/travel-time/data/regional/<line-id>.json (노선마다 한 파일)
"""
import argparse
import datetime
import json
import math
import os
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "src/features/travel-time/data/regional"
CACHE_DIR = Path(os.environ.get("OSM_REGIONAL_CACHE_DIR", "/private/tmp/3d-mapx-osm-regional"))
USER_AGENT = "3d-mapx-osm-regional-generator/1.0"
STOP_ROLES = {"stop", "stop_entry_only", "stop_exit_only", "stop_0", "stop_1", "stop_2"}
PLATFORM_ROLES = {"platform", "platform_entry_only", "platform_exit_only"}

# 노선 정의. routeMasters는 OSM route_master relation id(2026-11-28 Overpass 조회).
# 색은 OSM colour 태그를 쓴다. group은 커밋·화면에서 노선군을 묶는 단위다.
LINES = [
    {"id": "L9", "name": "서울 지하철 9호선", "shortName": "9호선", "group": "seoul-metro", "routeMasters": [7883317]},
    {"id": "GJ", "name": "경의·중앙선", "shortName": "경의중앙선", "group": "korail", "routeMasters": [8667957]},
    {"id": "GC", "name": "경춘선", "shortName": "경춘선", "group": "korail", "routeMasters": [8656365]},
    {"id": "SB", "name": "수인·분당선", "shortName": "수인분당선", "group": "korail", "routeMasters": [11619514]},
    {"id": "GG", "name": "경강선", "shortName": "경강선", "group": "korail", "routeMasters": [8735483]},
    {"id": "SH", "name": "서해선", "shortName": "서해선", "group": "korail", "routeMasters": [8725316]},
    {"id": "AREX", "name": "공항철도", "shortName": "공항철도", "group": "private", "routeMasters": [7919001, 9961461]},
    {"id": "SBD", "name": "신분당선", "shortName": "신분당선", "group": "private", "routeMasters": [7728256]},
    {"id": "GTXA", "name": "GTX-A", "shortName": "GTX-A", "group": "private", "routeMasters": [17443066]},
    {"id": "UI", "name": "우이신설선", "shortName": "우이신설선", "group": "light", "routeMasters": [7533584]},
    {"id": "SL", "name": "신림선", "shortName": "신림선", "group": "light", "routeMasters": [14191878]},
    {"id": "GOLD", "name": "김포골드라인", "shortName": "김포골드라인", "group": "light", "routeMasters": [10092721]},
    {"id": "UJB", "name": "의정부경전철", "shortName": "의정부경전철", "group": "light", "routeMasters": [7530882]},
    {"id": "EVER", "name": "용인경전철(에버라인)", "shortName": "에버라인", "group": "light", "routeMasters": [7531174]},
    {"id": "IC1", "name": "인천 1호선", "shortName": "인천1호선", "group": "light", "routeMasters": [7854149]},
    {"id": "IC2", "name": "인천 2호선", "shortName": "인천2호선", "group": "light", "routeMasters": [7527498]},
]


def haversine(a, b):
    dlon, dlat = (math.radians(y - x) for x, y in zip(a, b))
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[1])) * math.cos(math.radians(b[1])) * math.sin(dlon / 2) ** 2
    return 2 * 6_371_008.8 * math.asin(math.sqrt(h))


def fetch(path, refresh):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = CACHE_DIR / (path.replace("/", "-") + ".xml")
    if cache.exists() and not refresh:
        return cache.read_text()
    request = urllib.request.Request(f"https://api.openstreetmap.org/api/0.6/{path}", headers={"User-Agent": USER_AGENT})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                text = response.read().decode()
            cache.write_text(text)
            time.sleep(0.4)
            return text
        except Exception as error:  # 네트워크 일시 오류만 재시도한다.
            if attempt == 3:
                raise
            print(f"재시도 {path}: {error}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))


def parse(xml):
    root = ET.fromstring(xml)
    nodes, ways, relations = {}, {}, {}
    for element in root:
        tags = {t.get("k"): t.get("v") for t in element.findall("tag")}
        oid = int(element.get("id"))
        if element.tag == "node":
            nodes[oid] = {"coord": [float(element.get("lon")), float(element.get("lat"))], "tags": tags}
        elif element.tag == "way":
            ways[oid] = {"nodes": [int(n.get("ref")) for n in element.findall("nd")], "tags": tags}
        elif element.tag == "relation":
            members = [{"type": m.get("type"), "ref": int(m.get("ref")), "role": m.get("role") or ""} for m in element.findall("member")]
            relations[oid] = {"members": members, "tags": tags}
    return nodes, ways, relations


def station_name(raw):
    """OSM 정차 노드 이름을 역 이름으로 정규화한다. 괄호 부기와 '역' 접미어를 뗀다(서울역은 예외)."""
    name = raw.split("(")[0].split(" ")[0].strip()
    for suffix in ("승강장", "정류장"):
        name = name.removesuffix(suffix)
    if name.endswith("역") and len(name) > 2:
        name = name[:-1]
    return "서울역" if name == "서울" else name


def chain_ways(way_ids, ways, nodes):
    """way를 끝점끼리 이어 가장 긴 한 줄 좌표를 만든다."""
    segments = [list(ways[w]["nodes"]) for w in way_ids if w in ways and len(ways[w]["nodes"]) >= 2]
    chains = []
    for segment in segments:
        if chains and chains[-1][-1] == segment[0]:
            chains[-1].extend(segment[1:])
        elif chains and chains[-1][-1] == segment[-1]:
            chains[-1].extend(reversed(segment[:-1]))
        elif chains and len(chains[-1]) and chains[-1][0] == segment[-1]:
            chains[-1][:0] = segment[:-1]
        elif chains and chains[-1][0] == segment[0]:
            chains[-1][:0] = list(reversed(segment[1:]))
        else:
            chains.append(segment)
    coords = [[nodes[n]["coord"] for n in chain if n in nodes] for chain in chains]
    coords = [c for c in coords if len(c) >= 2]
    return coords


def cumulative(path):
    total = [0.0]
    for a, b in zip(path, path[1:]):
        total.append(total[-1] + haversine(a, b))
    return total


def project(path, dist, point):
    best = None
    scale = math.cos(math.radians(point[1]))
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        dx, dy = (b[0] - a[0]) * scale, b[1] - a[1]
        px, py = (point[0] - a[0]) * scale, point[1] - a[1]
        length = dx * dx + dy * dy
        t = 0 if length == 0 else max(0, min(1, (px * dx + py * dy) / length))
        foot = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
        offset = haversine(foot, point)
        if best is None or offset < best[0]:
            best = (offset, dist[i] + (dist[i + 1] - dist[i]) * t)
    return best


def slice_path(path, dist, start, end):
    lo, hi = min(start, end), max(start, end)

    def at(m):
        for i in range(1, len(path)):
            if dist[i] >= m:
                span = max(1e-9, dist[i] - dist[i - 1])
                r = (m - dist[i - 1]) / span
                a, b = path[i - 1], path[i]
                return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r]
        return path[-1]

    coords = [at(lo)] + [p for p, m in zip(path, dist) if lo < m < hi] + [at(hi)]
    return coords if start <= end else coords[::-1]


def simplify(points, tolerance=8.0):
    if len(points) < 3:
        return points
    scale = math.cos(math.radians(points[0][1]))

    def xy(p):
        return p[0] * scale * 111_320, p[1] * 110_540

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        (ax, ay), (bx, by) = xy(points[first]), xy(points[last])
        best, index = 0.0, None
        for i in range(first + 1, last):
            px, py = xy(points[i])
            dx, dy = bx - ax, by - ay
            length = dx * dx + dy * dy
            t = 0 if length == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / length))
            d = math.hypot(px - ax - t * dx, py - ay - t * dy)
            if d > best:
                best, index = d, i
        if index is not None and best > tolerance:
            keep[index] = True
            stack += [(first, index), (index, last)]
    return [[round(p[0], 5), round(p[1], 5)] for p, k in zip(points, keep) if k]


def build_line(config, refresh):
    route_ids, masters = [], []
    for master_id in config["routeMasters"]:
        _, _, master_relations = parse(fetch(f"relation/{master_id}", refresh))
        masters.append(master_relations[master_id])
        route_ids += [m["ref"] for m in master_relations[master_id]["members"] if m["type"] == "relation"]
    master = masters[0]
    stations, services, runs, warnings = {}, [], {}, []
    for route_id in route_ids:
        nodes, ways, relations = parse(fetch(f"relation/{route_id}/full", refresh))
        route = relations.get(route_id)
        if not route or route["tags"].get("type") != "route":
            continue
        stop_refs = [m["ref"] for m in route["members"] if m["type"] == "node" and m["role"] in STOP_ROLES]
        if len(stop_refs) < 2:
            stop_refs = [m["ref"] for m in route["members"] if m["type"] == "node" and m["role"] in PLATFORM_ROLES]
        stops = []
        for ref in stop_refs:
            node = nodes.get(ref)
            raw = node and (node["tags"].get("name:ko") or node["tags"].get("name"))
            if not raw:
                continue
            name = station_name(raw)
            if stops and stops[-1][0] == name:
                continue
            stops.append((name, node["coord"]))
        if len(stops) < 2:
            warnings.append(f"route {route_id}: 정차역 2개 미만")
            continue
        way_ids = [m["ref"] for m in route["members"] if m["type"] == "way" and m["role"] not in PLATFORM_ROLES]
        chains = chain_ways(way_ids, ways, nodes)
        path = max(chains, key=lambda c: len(c), default=None)
        dist = cumulative(path) if path else None
        positions = []
        for name, coord in stops:
            station_id = f"{config['id']}:{name}"
            entry = stations.setdefault(station_id, {"id": station_id, "name": name, "coords": []})
            entry["coords"].append(coord)
            positions.append(project(path, dist, coord) if path else None)
        tags = route["tags"]
        service = {
            "id": f"{config['id']}:{route_id}",
            "osmRelationId": route_id,
            "name": tags.get("name:ko") or tags.get("name") or "",
            "from": tags.get("from"),
            "to": tags.get("to"),
            "express": any(word in " ".join(tags.get(k) or "" for k in ("name", "name:ko", "service")) for word in ("급행", "직통", "express")),
            "stops": [f"{config['id']}:{name}" for name, _ in stops],
        }
        services.append(service)
        for i in range(len(stops) - 1):
            a, b = service["stops"][i], service["stops"][i + 1]
            pa, pb = positions[i], positions[i + 1]
            on_track = pa and pb and pa[0] < 400 and pb[0] < 400 and abs(pb[1] - pa[1]) > 50
            straight = haversine(stops[i][1], stops[i + 1][1])
            # 선로 거리가 직선의 2배를 넘으면 way 연결이 잘못된 것으로 보고 직선 개략으로 둔다.
            if on_track and abs(pb[1] - pa[1]) <= straight * 2 + 200:
                meters = abs(pb[1] - pa[1])
                geometry = simplify(slice_path(path, dist, pa[1], pb[1]))
                approx = False
            else:
                meters = straight
                geometry = [[round(c, 5) for c in stops[i][1]], [round(c, 5) for c in stops[i + 1][1]]]
                approx = True
            key = (a, b)
            if key not in runs or (runs[key]["approx"] and not approx):
                runs[key] = {"from": a, "to": b, "meters": round(meters), "approx": approx, "path": geometry}
    for entry in stations.values():
        coords = entry.pop("coords")
        entry["coordinate"] = [round(sum(c[0] for c in coords) / len(coords), 6), round(sum(c[1] for c in coords) / len(coords), 6)]
    master_tags = master["tags"]
    return {
        "id": config["id"],
        "name": config["name"],
        "shortName": config["shortName"],
        "group": config["group"],
        "color": config.get("color") or master_tags.get("colour") or "#888888",
        "operator": master_tags.get("operator"),
        "osm": {
            "routeMasterIds": config["routeMasters"],
            "routeRelationIds": route_ids,
            "fetchedAt": datetime.date.today().isoformat(),
            "license": "ODbL-1.0 © OpenStreetMap contributors",
        },
        "stations": sorted(stations.values(), key=lambda s: s["id"]),
        "services": services,
        "runs": sorted(runs.values(), key=lambda r: (r["from"], r["to"])),
        "warnings": warnings,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("lines", nargs="*")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for config in LINES:
        if args.lines and config["id"] not in args.lines:
            continue
        line = build_line(config, args.refresh)
        output = OUTPUT_DIR / f"{config['id'].lower()}.json"
        output.write_text(json.dumps(line, ensure_ascii=False, separators=(",", ":")) + "\n")
        approx = sum(1 for r in line["runs"] if r["approx"])
        print(f"{config['id']} {line['name']}: 계통 {len(line['services'])} · 역 {len(line['stations'])} · 구간 {len(line['runs'])} (직선 개략 {approx})"
              + (f" · 경고 {line['warnings']}" if line["warnings"] else ""))


if __name__ == "__main__":
    main()
