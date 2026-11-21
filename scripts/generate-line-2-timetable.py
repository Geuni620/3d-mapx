"""Bake the official Seoul Metro CSV into shared timing patterns: python3 scripts/generate-line-2-timetable.py SOURCE.csv --edition YYYY-MM-DD."""
import argparse
import csv
import hashlib
import json
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "src/features/subway/data"
SOURCE = "https://www.data.go.kr/data/15098251/fileData.do"


def seconds(clock):
    hours, minutes, secs = map(int, clock.split(":"))
    return hours * 3600 + minutes * 60 + secs


def station_name(name):
    return name.split("(")[0].replace(" ", "")


def generate(source, edition):
    with source.open(encoding="cp949", newline="") as file:
        trips = defaultdict(list)
        for row in csv.DictReader(file):
            if row["호선"] == "2" and row["방향"] in ("IN", "OUT"):
                trips[row["주중주말"], row["방향"], row["열차코드"]].append(row)

    routes = {}
    for route in json.loads((DATA / "osm-subway-line-2.json").read_text())["serviceRoutes"]:
        if route["direction"] in ("outer-loop", "inner-loop"):
            routes[route["direction"]] = [station_name(s["name"]) for s in route["stops"]]

    days = {key: [] for key in ("DAY", "SAT", "END")}
    patterns = {}
    source_directions = defaultdict(set)
    for (day, raw_direction, train), stops in sorted(trips.items()):
        stops.sort(key=lambda row: seconds(row["열차도착시간"] or row["열차출발시간"]))
        names = [station_name(s["역사명"]) for s in stops]
        matches = []
        for direction, ordered in routes.items():
            if names[0] in ordered:
                first = ordered.index(names[0])
                if all(name == ordered[(first + i) % len(ordered)] for i, name in enumerate(names)):
                    matches.append((direction, first))
        if len(matches) != 1:
            raise ValueError(f"Unexpected station sequence: {day} {train} {names}")
        direction, first = matches[0]
        source_directions[direction].add(raw_direction)
        if len(stops) < 2 or stops[0]["열차도착시간"] or stops[-1]["열차출발시간"]:
            raise ValueError(f"Unexpected endpoints: {day} {train}")
        start = seconds(stops[0]["열차출발시간"])
        previous_departure = start
        intervals = []
        for i, stop in enumerate(stops[1:], 1):
            arrival = seconds(stop["열차도착시간"])
            departure = arrival if i == len(stops) - 1 else seconds(stop["열차출발시간"])
            if arrival <= previous_departure or departure < arrival:
                raise ValueError(f"Unexpected times: {day} {train} {stop}")
            intervals.extend([arrival - previous_departure, departure - arrival])
            previous_departure = departure
        pattern = (direction, first, *intervals)
        index = patterns.setdefault(pattern, len(patterns))
        days[day].append([train, start, index])
    result = {
        "edition": edition, "source": SOURCE, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "csvDirectionsByPhysicalRoute": {key: sorted(value) for key, value in source_directions.items()},
        "stations": routes, "patterns": list(patterns), "days": days,
    }
    (DATA / "line-2-timetable.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{sum(map(len, trips.values()))} calls, {len(trips)} trips, {len(patterns)} distinct patterns")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--edition", required=True)
    args = parser.parse_args()
    generate(args.source, args.edition)
