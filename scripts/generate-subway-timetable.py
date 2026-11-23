"""Join the Seoul Metro CSV to directional paths from generate-osm-subway-network.mjs."""
import argparse
import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

SOURCE = "https://www.data.go.kr/data/15098251/fileData.do"
OUTPUT = Path(__file__).resolve().parents[1] / "src/features/subway/data/subway-timetable.json"


def seconds(clock):
    # 공표 시각표는 자정을 24:00:00으로, 1호선 급행의 빈 도착 시각은 00:00:00으로 기록한다.
    if not clock or clock == "00:00:00":
        return None
    hours, minutes, remainder = map(int, clock.split(":"))
    return hours * 3600 + minutes * 60 + remainder


def station_name(name):
    name = name.split("(")[0].replace(" ", "").replace("·", "").strip()
    return "응암" if name == "응암순환" else name


def read_trips(source):
    trips = defaultdict(list)
    with source.open(encoding="cp949", newline="") as file:
        for row in csv.DictReader(file):
            line = int(row["호선"])
            if 1 <= line <= 8 and row["방향"] in ("UP", "DOWN"):
                trips[line, row["주중주말"], row["방향"], row["열차코드"]].append(row)
    return trips


def read_routes(folder, line):
    filename = folder / f"osm-subway-line-{line}.json"
    routes = json.loads(filename.read_text())["serviceRoutes"]
    if line == 2:
        routes = [route for route in routes if route["direction"] not in ("inner-loop", "outer-loop")]
    if line == 6:
        for route in routes:
            add_eungam_return(route)
    return [(route, tuple(station_name(stop["name"]) for stop in route["stops"])) for route in routes]


def add_eungam_return(route):
    stops = route["stops"]
    if station_name(stops[0]["name"]) != "응암":
        return
    for index, (before, after) in enumerate(zip(stops, stops[1:])):
        if (before["name"], after["name"]) != ("구산", "새절"):
            continue
        # OSM 관계가 생략한 두 번째 응암 정차 위치를 순환선 복귀 구간 안에서만 찾는다.
        path = route["path"]
        traveled = 0
        candidates = []
        for start, end in zip(path, path[1:]):
            dlon, dlat = (math.radians(b - a) for a, b in zip(start, end))
            lat1, lat2 = math.radians(start[1]), math.radians(end[1])
            h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
            traveled += 2 * 6_371_008.8 * math.asin(math.sqrt(h))
            if before["distanceMeters"] < traveled < after["distanceMeters"]:
                candidates.append((distance_meters(stops[0]["coordinate"], end), traveled, end))
        if candidates:
            offset, traveled, point = min(candidates)
            if offset < 80:
                stops.insert(index + 1, {"name": "응암", "coordinate": point, "distanceMeters": round(traveled, 2)})
        return


def find_route(routes, stations):
    for route, names in routes:
        indexes = []
        try:
            for station in stations:
                indexes.append(names.index(station, indexes[-1] + 1 if indexes else 0))
        except ValueError:
            continue
        yield route, indexes


def choose_route(routes, stations, previous_endpoint=None):
    return min(
        find_route(routes, stations),
        key=lambda pair: (
            previous_endpoint is not None
            and distance_meters(previous_endpoint, pair[0]["stops"][pair[1][0]]["coordinate"]) > 100,
            pair[1][-1] - pair[1][0],
            len(pair[0]["stops"]) - len(pair[1]),
            pair[0]["osmRelationId"],
        ),
        default=None,
    )


def make_legs(routes, stations):
    matched = choose_route(routes, stations)
    if matched:
        route, indexes = matched
        return [(route, start, end) for start, end in zip(indexes, indexes[1:])]
    legs = []
    previous_endpoint = None
    for pair in zip(stations, stations[1:]):
        matched = choose_route(routes, pair, previous_endpoint)
        if not matched:
            return None
        route, (start, end) = matched
        legs.append((route, start, end))
        previous_endpoint = route["stops"][end]["coordinate"]
    return legs


def distance_meters(a, b):
    return math.hypot((a[0] - b[0]) * 88_000, (a[1] - b[1]) * 111_000)


def car_count(line, stations):
    if line == 1 and "광명" in stations:
        return 4
    if line == 2:
        return 4 if "신설동" in stations else 6
    return {1: 10, 3: 10, 4: 10, 5: 8, 6: 8, 7: 8, 8: 6}[line]


def generate(source, osm_folder, edition):
    routes = {line: read_routes(osm_folder, line) for line in range(1, 9)}
    route_matches = {}
    paths, legs, patterns = {}, {}, {}
    journeys = {}
    days = {day: [] for day in ("DAY", "SAT", "END")}
    coverage = {line: Counter() for line in routes}
    for (line, day, _, _), rows in sorted(read_trips(source).items()):
        stops = [
            (station_name(row["역사명"]), seconds(row["열차도착시간"]), seconds(row["열차출발시간"]))
            for row in rows
        ]
        if len(stops) < 2 or any(arrival is None and departure is None for _, arrival, departure in stops):
            coverage[line]["invalid time"] += 1
            continue
        stops.sort(key=lambda stop: stop[1] if stop[1] is not None else stop[2])
        stations = tuple(name for name, _, _ in stops)
        key = line, stations
        if key not in route_matches:
            route_matches[key] = make_legs(routes[line], stations)
        matched = route_matches[key]
        if not matched:
            coverage[line]["missing path"] += 1
            continue
        start_time = previous_departure = stops[0][2]
        if previous_departure is None:
            coverage[line]["invalid time"] += 1
            continue
        previous_endpoint = None
        pattern = []
        for index, ((_, arrival, departure), (route, start, end)) in enumerate(zip(stops[1:], matched), 1):
            passes_station = arrival is None and index < len(stops) - 1
            arrival = arrival if arrival is not None else departure
            departure = departure if departure is not None else arrival
            travel, dwell = arrival - previous_departure, departure - arrival
            first, last = route["stops"][start], route["stops"][end]
            begin, finish = first["distanceMeters"], last["distanceMeters"]
            if travel <= 0 or dwell < 0 or finish <= begin or (finish - begin) / travel > 60:
                coverage[line]["invalid leg"] += 1
                break
            if previous_endpoint and distance_meters(previous_endpoint, first["coordinate"]) > 100:
                coverage[line]["discontinuous path"] += 1
                break
            path_id = paths.setdefault(route["osmRelationId"], (len(paths), route["path"]))[0]
            leg = legs.setdefault((path_id, begin, finish), len(legs))
            pattern.append((leg, travel, dwell, int(passes_station)))
            previous_departure = departure
            previous_endpoint = last["coordinate"]
        else:
            pattern_id = patterns.setdefault(tuple(pattern), len(patterns))
            origin = rows[0]["출발역"].strip() or stations[0]
            destination = rows[0]["도착역"].strip() or stations[-1]
            journey_id = journeys.setdefault((origin, destination), len(journeys))
            days[day].append([line, start_time, previous_departure, pattern_id, car_count(line, stations), journey_id])
            coverage[line]["included"] += 1

    result = {
        "edition": edition,
        "source": SOURCE,
        "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "coverage": coverage,
        "paths": [entry[1] for entry in paths.values()],
        "legs": list(legs),
        "patterns": list(patterns),
        "journeys": list(journeys),
        "days": {day: sorted(trips, key=lambda trip: trip[1]) for day, trips in days.items()},
    }
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    for line, counts in coverage.items():
        print(f"{line}호선: {dict(counts)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("osm_folder", type=Path)
    parser.add_argument("--edition", required=True)
    args = parser.parse_args()
    generate(args.source, args.osm_folder, args.edition)
