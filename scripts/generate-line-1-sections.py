"""Build the Line 1 overlay from OSM API XML and the checked-in snapshots."""
import argparse
import bisect
import hashlib
import json
import math
import runpy
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "src/features/subway/data"
SOURCES = {
    "osm": "https://www.openstreetmap.org/relation/8691899",
    "osmApi": "https://api.openstreetmap.org/api/0.6/",
    "metro": "https://data.seoul.go.kr/dataList/OA-22482/F/1/datasetView.do",
    "korail": "https://info.korail.com/info/contents.do?key=1446",
    "byeongjeom": "https://info.korail.com/info/contents.do?key=861",
    "gwangmyeong": "https://info.korail.com/info/selectBbsNttView.do?bbsNo=199&key=911&nttNo=7670",
    "timetable": "https://www.data.go.kr/data/15098251/fileData.do",
}
SECTIONS = [
    ["metro", "서울교통공사", "서울 지하철 1호선", "서울역", "청량리", "종로3가"],
    ["gyeongbu", "코레일", "경부선", "서울역", "천안", "수원"],
    ["gyeongin", "코레일", "경인선", "구로", "인천", "부천"],
    ["gyeongwon", "코레일", "경원선", "청량리", "연천", "창동"],
    ["janghang", "코레일", "장항선", "천안", "신창", "아산"],
    ["byeongjeom", "코레일", "병점기지선", "병점", "서동탄", "서동탄"],
    ["gwangmyeong", "코레일", "광명 셔틀", "영등포", "광명", "광명"],
]
WAY_NAMES = {section[2]: section[0] for section in SECTIONS}
WAY_NAMES.update({"경부제2선": "gyeongbu"})


def tags(element):
    return {tag.attrib["k"]: tag.attrib["v"] for tag in element.findall("tag")}


def elements(folder, kind):
    return {
        element.attrib["id"]: element
        for file in sorted(folder.glob("*.xml"))
        for element in ET.parse(file).getroot().findall(kind)
    }


def section_for_way(way_tags, in_shuttle):
    name = way_tags.get("name:ko", way_tags.get("name"))
    if in_shuttle and name in {"시흥연결선", "경부고속선"}:
        return "gwangmyeong"
    if name == "서울 지하철 1호선":
        # 서울역·청량리 접속부는 같은 선로 이름 안에서도 운영 태그가 갈린다.
        return {"서울교통공사": "metro", "한국철도공사": "korail"}.get(way_tags.get("operator"), "unknown")
    if name in WAY_NAMES:
        return WAY_NAMES[name]
    if way_tags.get("operator") == "한국철도공사":
        return "korail"
    return "unknown"


def distance(a, b):
    a_lat, b_lat = math.radians(a[1]), math.radians(b[1])
    h = math.sin((b_lat - a_lat) / 2) ** 2 + math.cos(a_lat) * math.cos(b_lat) * (
        math.sin(math.radians(b[0] - a[0]) / 2) ** 2
    )
    return 2 * 6_371_008.8 * math.atan2(math.sqrt(h), math.sqrt(1 - h))


def normalize(name):
    return name.split("(")[0].replace(" ", "").replace("·", "").strip()


def ranges(path, edge_sections):
    result = []
    for end, (a, b) in enumerate(zip(path, path[1:]), 1):
        candidates = edge_sections.get(tuple(sorted((tuple(a), tuple(b)))), set())
        section = next(iter(candidates)) if len(candidates) == 1 else "unknown"
        if result and result[-1][1] == section:
            result[-1][0] = end
        else:
            result.append([end, section])
    return result


def make_leg_stations(timetable, station_points):
    by_point = defaultdict(set)
    for name, points in station_points.items():
        for point in points:
            by_point[point].add(name)
    cumulative = {}
    result = {}
    trips = [trip for trips in timetable["days"].values() for trip in trips if trip[0] == 1]
    legs = {row[0] for trip in trips for row in timetable["patterns"][trip[3]]}
    for leg in sorted(legs):
        path_id, start, finish = timetable["legs"][leg]
        path = timetable["paths"][path_id]
        if path_id not in cumulative:
            traveled = [0]
            for a, b in zip(path, path[1:]):
                traveled.append(traveled[-1] + distance(a, b))
            cumulative[path_id] = traveled
        traveled = cumulative[path_id]
        names = []
        for offset in (start, finish):
            first = bisect.bisect_left(traveled, offset - .02)
            last = bisect.bisect_right(traveled, offset + .02)
            # 소수점 두 자리로 저장된 거리와 일치하는 OSM 정차 노드만 채택한다.
            matches = {name for point in path[first:last] for name in by_point[tuple(point)]}
            names.append(next(iter(matches)) if len(matches) == 1 else None)
        if any(names):
            result[str(leg)] = names
    return result, len(legs)


def make_pattern_services(timetable, leg_stations, source):
    if hashlib.sha256(source.read_bytes()).hexdigest() != timetable["sha256"]:
        raise ValueError("시간표 원본 CSV의 SHA-256이 스냅샷과 다릅니다.")
    generator = runpy.run_path(str(Path(__file__).with_name("generate-subway-timetable.py")))
    raw = defaultdict(set)
    for (line, day, _, _), rows in generator["read_trips"](source).items():
        if line != 1:
            continue
        stops = [
            (generator["station_name"](row["역사명"]), generator["seconds"](row["열차도착시간"]),
             generator["seconds"](row["열차출발시간"]))
            for row in rows
        ]
        if not stops or any(arrival is None and departure is None for _, arrival, departure in stops):
            continue
        stops.sort(key=lambda stop: stop[1] if stop[1] is not None else stop[2])
        calls = tuple((name, arrival if arrival is not None else departure,
                       departure if departure is not None else arrival)
                      for name, arrival, departure in stops[1:])
        raw[day, stops[0][0], stops[0][2], calls].update(row["급행여부"] for row in rows)

    by_pattern = defaultdict(set)
    for day, trips in timetable["days"].items():
        for line, start, _, pattern, _, _ in trips:
            if line != 1:
                continue
            legs = timetable["patterns"][pattern]
            origin = leg_stations.get(str(legs[0][0]), [None, None])[0]
            calls = []
            time = start
            for leg, travel, dwell, _ in legs:
                arrival = time + travel
                time = arrival + dwell
                calls.append((leg_stations.get(str(leg), [None, None])[1], arrival, time))
            by_pattern[pattern].update(raw.get((day, origin, start, tuple(calls)), {"unknown"}))
    # 같은 패턴을 쓰는 모든 편성의 공표 구분이 일치할 때만 표시한다.
    return {
        label: sorted(pattern for pattern, flags in by_pattern.items() if flags == {flag})
        for label, flag in (("local", "0"), ("express", "1"))
    }


def generate(folder, checked_at, timetable_source):
    network_file = DATA / "osm-subway-line-1.json"
    timetable_file = DATA / "subway-timetable.json"
    network = json.loads(network_file.read_text())
    timetable = json.loads(timetable_file.read_text())
    relations = elements(folder, "relation")
    ways = elements(folder, "way")
    nodes = elements(folder, "node")
    points = {key: (float(n.attrib["lon"]), float(n.attrib["lat"])) for key, n in nodes.items()}
    selected = [relations[str(key)] for key in network["route"]["osmRelationIds"]]
    members = [member.attrib for r in selected for member in r.findall("member")]
    shuttle = {m.attrib["ref"] for rid in ("4748705", "10881612")
               for m in relations[rid].findall("member") if m.attrib["type"] == "way"}
    edge_sections = defaultdict(set)
    for key in sorted({m["ref"] for m in members if m["type"] == "way"} & ways.keys()):
        way = ways[key]
        section = section_for_way(tags(way), key in shuttle)
        path = [points.get(node.attrib["ref"]) for node in way.findall("nd")]
        for a, b in zip(path, path[1:]):
            if a is not None and b is not None:
                edge_sections[tuple(sorted((a, b)))].add(section)

    known_stations = {normalize(station["name"]) for station in network["stations"]}
    station_points = defaultdict(set)
    for member in members:
        key = member["ref"]
        if member["type"] != "node" or "stop" not in member["role"] or key not in points:
            continue
        node_tags = tags(nodes[key])
        name = normalize(node_tags.get("name:ko", node_tags.get("name", "")))
        if name in known_stations:
            station_points[name].add(points[key])
    for station in network["stations"]:
        station_points[normalize(station["name"])].add((station["longitude"], station["latitude"]))

    leg_stations, leg_count = make_leg_stations(timetable, station_points)
    print(f"정차역 매칭 {len(leg_stations)}/{leg_count} 구간, 양쪽 확인 {sum(all(x) for x in leg_stations.values())}")
    result = {
        "checkedAt": checked_at,
        "sources": SOURCES,
        "networkSha256": hashlib.sha256(network_file.read_bytes()).hexdigest(),
        "timetableSha256": hashlib.sha256(timetable_file.read_bytes()).hexdigest(),
        "sections": SECTIONS,
        "patternServices": make_pattern_services(timetable, leg_stations, timetable_source),
        "paths": [ranges(path, edge_sections) for path in network["route"]["pathSegments"]],
        "legStations": leg_stations,
    }
    # 정차 구간은 한 행에 하나씩 쓰고 반복 좌표를 저장하지 않는다.
    lines = ["{"]
    for key, value in result.items():
        prefix = f'  "{key}": '
        if key in {"paths", "sections"}:
            lines.extend([prefix + "[", ",\n".join("    " + json.dumps(row, ensure_ascii=False) for row in value), "  ],"])
        elif key == "legStations":
            lines.extend([prefix + "{", ",\n".join(f'    "{leg}": {json.dumps(row, ensure_ascii=False)}' for leg, row in value.items()), "  }"])
        else:
            lines.append(prefix + json.dumps(value, ensure_ascii=False) + ",")
    (DATA / "line-1-sections.json").write_text("\n".join(lines + ["}", ""]), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("osm_xml", type=Path, help="OSM API relation, way and node XML directory")
    parser.add_argument("--checked-at", required=True)
    parser.add_argument("--timetable-csv", type=Path, required=True)
    args = parser.parse_args()
    generate(args.osm_xml, args.checked_at, args.timetable_csv)
