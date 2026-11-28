"""1~8호선 운행시각표를 역→역 소요시간 그래프로 굽는다.

python3 scripts/generate-subway-travel-graph.py --transfers scripts/data/seoul-metro-transfer-distance-20260831.csv

입력
- src/features/subway/data/subway-timetable.json (서울교통공사 운행시각표, data.go.kr 15098251)
- src/features/subway/data/osm-subway-line-{1..8}.json (OSM 역 좌표)
- 선택: 서울교통공사 환승역거리 소요시간 정보 CSV (data.go.kr 15044419)

생성 규칙
- 시간표 구간(leg)은 역 이름이 아니라 경로상 거리(m)로 저장돼 있다. 구간 끝점을 경로 위 좌표로 되돌린 뒤
  같은 호선 OSM 역 중 가장 가까운 역에 붙인다(허용 400m).
- 통과역은 정차역 사이 구간에 합쳐 급행을 별도 역→역 구간으로 남긴다.
- 차내시간은 같은 (호선, 출발역, 도착역) 표본의 중앙값, 정차시간은 도착역에서 계속 운행한 표본의 중앙값이다.
- 배차는 출발역에서 같은 다음 정차역으로 떠나는 시간대별 열차 수다. 대기시간은 앱에서 배차/2로 계산한다.
- continuations는 한 열차가 실제로 이어 달린 (이전역, 역, 다음역) 조합이다. 여기에 없는 갈아타기는 환승으로 본다.
"""
import argparse
import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUBWAY_DATA = ROOT / "src/features/subway/data"
OUTPUT = ROOT / "src/features/travel-time/data/subway-travel-graph.json"
TIMETABLE_SOURCE = "https://www.data.go.kr/data/15098251/fileData.do"
TRANSFER_SOURCE = "https://www.data.go.kr/data/15044419/fileData.do"
DAYS = ("DAY", "SAT", "END")
FIRST_HOUR, LAST_HOUR = 4, 26
MATCH_LIMIT_METERS = 400
# 같은 이름이 아닌 환승역. 4호선 총신대입구와 7호선 이수는 한 역으로 운영된다.
COMPLEX_ALIASES = {"총신대입구": "이수"}
COMPLEX_LABELS = {"이수": "총신대입구(이수)"}
# 환승역거리 CSV에서 1~8호선 밖 노선으로 가는 환승. 수도권 광역·도시철도 기준망과 GTX-A 연결에 쓴다.
EXTERNAL_TRANSFER_LINES = {
    "9호선", "경의중앙선", "경춘선", "수인분당선", "서해선", "공항철도", "신분당선", "GTX-A",
    "우이신설선", "신림선", "김포골드라인",
}
# CSV가 1호선 구간을 선로 이름으로 적은 경우(6호선 석계 → 경원선)
TARGET_ALIASES = {"경원선": "1호선"}


def haversine(a, b):
    dlon, dlat = (math.radians(y - x) for x, y in zip(a, b))
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[1])) * math.cos(math.radians(b[1])) * math.sin(dlon / 2) ** 2
    return 2 * 6_371_008.8 * math.asin(math.sqrt(h))


def plain_name(name):
    return name.split("(")[0].replace(" ", "").strip()


def complex_key(name):
    plain = plain_name(name)
    return COMPLEX_ALIASES.get(plain, plain)


class PathIndex:
    def __init__(self, coordinates):
        self.coordinates = coordinates
        self.cumulative = [0.0]
        for a, b in zip(coordinates, coordinates[1:]):
            self.cumulative.append(self.cumulative[-1] + haversine(a, b))

    def point(self, meters):
        coords, cumulative = self.coordinates, self.cumulative
        for index in range(1, len(coords)):
            if cumulative[index] >= meters:
                span = max(1e-9, cumulative[index] - cumulative[index - 1])
                ratio = (meters - cumulative[index - 1]) / span
                a, b = coords[index - 1], coords[index]
                return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio]
        return list(coords[-1])

    def slice(self, start, end):
        inner = [list(c) for c, m in zip(self.coordinates, self.cumulative) if start < m < end]
        return [self.point(start), *inner, self.point(end)]


def simplify(points, tolerance_meters=6.0):
    """Douglas–Peucker. 경로 하이라이트용이라 6m 이내 굴곡은 버린다."""
    if len(points) < 3:
        return points
    scale = math.cos(math.radians(points[0][1]))

    def offset(p, a, b):
        ax, ay = a[0] * scale * 111_320, a[1] * 110_540
        bx, by = b[0] * scale * 111_320, b[1] * 110_540
        px, py = p[0] * scale * 111_320, p[1] * 110_540
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


def load_stations():
    stations = {}
    by_line = defaultdict(list)
    for line in range(1, 9):
        data = json.loads((SUBWAY_DATA / f"osm-subway-line-{line}.json").read_text())
        for station in data["stations"]:
            station_id = f"{line}:{plain_name(station['name'])}"
            if station_id in stations:
                continue
            record = {
                "id": station_id,
                "name": station["name"].replace(" (", "(").strip(),
                "complex": complex_key(station["name"]),
                "line": line,
                "coordinate": [round(station["longitude"], 6), round(station["latitude"], 6)],
            }
            stations[station_id] = record
            by_line[line].append(record)
    return stations, by_line


def read_transfer_csv(path):
    """서울교통공사 환승역거리 CSV(연번,호선,환승역명,환승노선,환승거리,환승소요시간)를 읽는다.

    (역, 출발호선, 도착노선 이름) → 최단환승거리(m). 도착노선은 "4호선"·"GTX-A"처럼 원문 그대로 둔다.
    """
    raw = path.read_bytes()
    for encoding in ("utf-8-sig", "cp949"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    result = {}
    for row in csv.DictReader(text.splitlines()):
        station, line, target, meters = (row[k].strip() for k in ("환승역명", "호선", "환승노선", "환승거리"))
        result[(complex_key(station), int(line), TARGET_ALIASES.get(target, target))] = float(meters)
    return result, hashlib.sha256(raw).hexdigest()


def transfer_meters(lookup, complex_name, from_line, to_line):
    """(거리, 근거). 한 방향만 실린 역은 반대 방향 값을 쓰고 근거를 구분한다."""
    direct = lookup.get((complex_name, from_line, f"{to_line}호선"))
    if direct:
        return round(direct), "csv"
    reverse = lookup.get((complex_name, to_line, f"{from_line}호선"))
    if reverse:
        return round(reverse), "csv-reverse"
    return None, None


def generate(transfer_csv):
    timetable_path = SUBWAY_DATA / "subway-timetable.json"
    timetable = json.loads(timetable_path.read_text())
    stations, by_line = load_stations()
    path_index = [PathIndex(p) for p in timetable["paths"]]

    leg_line = {}
    for trips in timetable["days"].values():
        for trip in trips:
            for leg, *_ in timetable["patterns"][trip[3]]:
                leg_line[leg] = trip[0]

    def nearest(line, point):
        best = min(by_line[line], key=lambda s: haversine(point, s["coordinate"]))
        return best, haversine(point, best["coordinate"])

    leg_stations = {}
    unmatched = 0
    for leg, (path, start, end) in enumerate(timetable["legs"]):
        line = leg_line.get(leg)
        if line is None:
            continue
        first, d1 = nearest(line, path_index[path].point(start))
        last, d2 = nearest(line, path_index[path].point(end))
        if max(d1, d2) > MATCH_LIMIT_METERS or first["id"] == last["id"]:
            unmatched += 1
            continue
        leg_stations[leg] = (first["id"], last["id"])

    travel = defaultdict(list)
    dwell = defaultdict(list)
    geometry_source = {}
    continuations = Counter()
    departures = defaultdict(Counter)
    skipped_trips = 0
    for day, trips in timetable["days"].items():
        for line, start, _end, pattern, _cars, _journey in trips:
            legs = timetable["patterns"][pattern]
            if any(leg not in leg_stations for leg, *_ in legs):
                skipped_trips += 1
                continue
            # 정차역 목록: (역, 도착, 출발, 이 역까지 온 구간들)
            stops = [(leg_stations[legs[0][0]][0], None, start, [])]
            clock = start
            pending = []
            for index, (leg, run_seconds, dwell_seconds, passes) in enumerate(legs):
                arrival = clock + run_seconds
                departure = arrival + dwell_seconds
                pending.append(leg)
                clock = departure
                if passes and index < len(legs) - 1:
                    continue
                stops.append((leg_stations[leg][1], arrival, departure if index < len(legs) - 1 else None, pending))
                pending = []
            for i in range(1, len(stops)):
                a, b = stops[i - 1], stops[i]
                key = (line, a[0], b[0])
                travel[key].append(b[1] - a[2])
                if b[2] is not None:
                    dwell[key].append(b[2] - b[1])
                geometry_source.setdefault(key, b[3])
                hour = int(a[2] // 3600)
                departures[(key, day)][hour] += 1
                if i + 1 < len(stops):
                    continuations[(line, a[0], b[0], stops[i + 1][0])] += 1

    # 2호선 본선 순환은 subway-timetable.json이 아니라 line-2-timetable.json에 있다.
    loop = json.loads((SUBWAY_DATA / "line-2-timetable.json").read_text())
    loop_routes = {}
    for route in json.loads((SUBWAY_DATA / "osm-subway-line-2.json").read_text())["serviceRoutes"]:
        if route["direction"] in ("outer-loop", "inner-loop"):
            loop_routes[route["direction"]] = (
                PathIndex(route["path"]),
                {plain_name(s["name"]): s["distanceMeters"] for s in route["stops"]},
            )
    for day, trips in loop["days"].items():
        for _train, start, pattern_index in trips:
            direction, first, *intervals = loop["patterns"][pattern_index]
            names = loop["stations"][direction]
            path, offsets = loop_routes[direction]
            clock = start
            stops = [(f"2:{names[first % len(names)]}", None, start)]
            for i in range(0, len(intervals), 2):
                arrival = clock + intervals[i]
                departure = arrival + intervals[i + 1]
                is_last = i + 2 >= len(intervals)
                stops.append((f"2:{names[(first + i // 2 + 1) % len(names)]}", arrival, None if is_last else departure))
                clock = departure
            for i in range(1, len(stops)):
                a, b = stops[i - 1], stops[i]
                key = (2, a[0], b[0])
                travel[key].append(b[1] - a[2])
                if b[2] is not None:
                    dwell[key].append(b[2] - b[1])
                if key not in geometry_source:
                    begin, finish = offsets[a[0][2:]], offsets[b[0][2:]]
                    total = path.cumulative[-1]
                    pieces = [(begin, finish)] if finish > begin else [(begin, total), (0, finish)]
                    geometry_source[key] = [("loop", path, s, e) for s, e in pieces]
                departures[(key, day)][int(a[2] // 3600)] += 1
                if i + 1 < len(stops):
                    continuations[(2, a[0], b[0], stops[i + 1][0])] += 1

    # 역 인덱스: 실제 운행에 등장한 역만 남긴다.
    used = sorted({sid for key in travel for sid in key[1:]}, key=lambda s: (stations[s]["line"], s))
    station_list = [stations[s] for s in used]
    index_of = {s: i for i, s in enumerate(used)}

    segments, segment_index = [], {}
    runs = []
    profile_index, profiles = {}, []
    for key in sorted(travel, key=lambda k: (k[0], index_of[k[1]], index_of[k[2]])):
        line, a, b = key
        pair = (line, min(a, b), max(a, b))
        if pair not in segment_index:
            coords = []
            for leg in geometry_source[key]:
                if isinstance(leg, tuple):
                    _, loop_path, start, end = leg
                    piece = loop_path.slice(start, end)
                else:
                    path, start, end = timetable["legs"][leg]
                    piece = path_index[path].slice(start, end)
                coords.extend(piece if not coords else piece[1:])
            coords = rounded(simplify(coords))
            if a != pair[1]:
                coords.reverse()
            segment_index[pair] = len(segments)
            segments.append(coords)
        reversed_flag = 0 if a == pair[1] else 1
        hourly = []
        for day in DAYS:
            counts = tuple(departures[(key, day)].get(h, 0) for h in range(FIRST_HOUR, LAST_HOUR))
            if counts not in profile_index:
                profile_index[counts] = len(profiles)
                profiles.append(list(counts))
            hourly.append(profile_index[counts])
        runs.append([
            line,
            index_of[a],
            index_of[b],
            round(statistics.median(travel[key])),
            round(statistics.median(dwell[key])) if dwell[key] else 0,
            len(travel[key]),
            segment_index[pair],
            reversed_flag,
            hourly,
        ])

    continuation_list = sorted(
        [index_of[a], index_of[b], index_of[c]]
        for (_line, a, b, c), count in continuations.items()
        if a != c
    )

    transfer_lookup, transfer_sha = ({}, None)
    if transfer_csv:
        transfer_lookup, transfer_sha = read_transfer_csv(transfer_csv)
    complexes = defaultdict(list)
    for station in station_list:
        complexes[station["complex"]].append(station)
    transfers = []
    for key, members in sorted(complexes.items()):
        for a in members:
            for b in members:
                if a["line"] == b["line"]:
                    continue
                if haversine(a["coordinate"], b["coordinate"]) > 900:
                    raise ValueError(f"환승역 좌표가 너무 멉니다: {a['id']} {b['id']}")
                meters, basis = transfer_meters(transfer_lookup, key, a["line"], b["line"])
                transfers.append([index_of[a["id"]], index_of[b["id"]], meters, basis])
    # 같은 역·같은 호선 계통 변경(성수·신도림·강동 지선)과, 장래선 중 이미 역이 있는 GTX-A 환승거리
    same_line = sorted(
        [index_of[f"{line}:{name}"], round(meters)]
        for (name, line, target), meters in transfer_lookup.items()
        if target == f"{line}호선" and f"{line}:{name}" in index_of
    )
    external = sorted(
        [index_of[s["id"]], target, round(meters)]
        for (name, line, target), meters in transfer_lookup.items()
        if target in EXTERNAL_TRANSFER_LINES
        for s in complexes.get(name, []) if s["line"] == line
    )

    result = {
        "edition": timetable["edition"],
        "source": TIMETABLE_SOURCE,
        "timetableSha256": hashlib.sha256(timetable_path.read_bytes()).hexdigest(),
        "transferSource": TRANSFER_SOURCE if transfer_sha else None,
        "transferSha256": transfer_sha,
        "rules": [
            "시간표 구간 끝점을 같은 호선 OSM 역(400m 이내)에 붙인다",
            "통과역은 앞뒤 정차역 구간에 합친다",
            "차내시간·정차시간은 표본 중앙값(초)",
            "시간대별 배차는 출발역에서 같은 다음 정차역으로 떠난 열차 수",
        ],
        "hours": [FIRST_HOUR, LAST_HOUR],
        "days": list(DAYS),
        "stations": [
            {k: s[k] for k in ("id", "name", "complex", "line", "coordinate")} for s in station_list
        ],
        "runFields": ["line", "from", "to", "seconds", "dwellSeconds", "samples", "segment", "reversed", "hourlyProfile"],
        "runs": runs,
        "profiles": profiles,
        "continuations": continuation_list,
        "transferFields": ["from", "to", "meters", "basis"],
        "transfers": transfers,
        "sameLineTransfers": same_line,
        "externalTransfers": external,
        "segments": segments,
        "segmentMeters": [
            round(sum(haversine(a, b) for a, b in zip(coords, coords[1:]))) for coords in segments
        ],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"역 {len(station_list)} · 구간 {len(runs)} · 연속 {len(continuation_list)} · 환승 {len(transfers)}"
          f" (CSV {sum(1 for t in transfers if t[3] == 'csv')}, 역방향 {sum(1 for t in transfers if t[3] == 'csv-reverse')}) · 배차 프로필 {len(profiles)}"
          f" · 미매칭 구간 {unmatched} · 제외 운행 {skipped_trips}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--transfers", type=Path)
    args = parser.parse_args()
    generate(args.transfers)
