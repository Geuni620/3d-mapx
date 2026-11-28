"""수도권 광역·도시철도 공표 시간표를 역→역 차내시간·시간대별 배차로 굽는다.

python3 scripts/generate-regional-timing.py --sources DIR

DIR에는 아래 원본 파일을 그대로 둔다(파일명 앞부분으로 찾는다). 원본은 커밋하지 않고 출처 URL·sha256만 남긴다.
- datago-15098251-*.csv  서울교통공사 도시철도 열차운행시각표(9호선 행만 사용)
- kric-6-*.xlsx           국가철도공단 철도산업정보센터 표준데이터 운행정보: 한국철도공사
- kric-7-*.xlsx           〃 공항철도
- kric-15-*.xlsx          〃 신분당선
- kric-1221-*.xlsx        〃 신림선
- kric-903-*.xlsx         〃 김포도시철도
- kric-911-*.xlsx         〃 우이신설선
- kric-17-*.xlsx          〃 의정부경전철
- kric-816-*.xlsx         〃 인천교통공사(인천 1호선)
- datago-1505120[7-9]-*.csv, datago-15051210-*.csv  인천2호선 열차운행시각표

생성 규칙은 1~8호선 그래프(generate-subway-travel-graph.py)와 같다.
- 정차역 이름을 노선 OSM 역(data/regional/<id>.json)에 붙인다. 코레일 자료의 줄임 역명은 앞글자 일치와 별칭표로 푼다.
- 시각이 없는 역(통과)은 건너뛰어 앞뒤 정차역 구간에 합친다.
- 차내시간·정차시간은 표본 중앙값, 배차는 출발역에서 같은 다음 정차역으로 떠난 시간대별 열차 수다.
결과: src/features/travel-time/data/regional-timing/<id>.json
"""
import argparse
import csv
import hashlib
import io
import json
import re
import statistics
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGIONAL_DIR = ROOT / "src/features/travel-time/data/regional"
OUTPUT_DIR = ROOT / "src/features/travel-time/data/regional-timing"
DAYS = ("DAY", "SAT", "END")
FIRST_HOUR, LAST_HOUR = 4, 26
KRIC_URL = "https://data.kric.go.kr/rips/dataset/download.file?type=filedata&id={id}&operation=1"

# 노선별 원본. kricLines는 KRIC 파일의 노선명 열 값(여러 노선이 한 파일에 있는 코레일 자료용).
SOURCES = {
    "L9": {"kind": "seoul-metro", "file": "datago-15098251-", "line": "9",
           "title": "서울교통공사 도시철도 열차운행시각표", "url": "https://www.data.go.kr/data/15098251/fileData.do"},
    "GJ": {"kind": "kric", "file": "kric-6-", "kricLines": ["경의중앙선"], "id": 6, "title": "KRIC 표준데이터 운행정보(한국철도공사)"},
    "GC": {"kind": "kric", "file": "kric-6-", "kricLines": ["경춘선"], "id": 6, "title": "KRIC 표준데이터 운행정보(한국철도공사)"},
    "SB": {"kind": "kric", "file": "kric-6-", "kricLines": ["수인분당선"], "id": 6, "title": "KRIC 표준데이터 운행정보(한국철도공사)"},
    "GG": {"kind": "kric", "file": "kric-6-", "kricLines": ["경강선"], "id": 6, "title": "KRIC 표준데이터 운행정보(한국철도공사)"},
    "SH": {"kind": "kric", "file": "kric-6-", "kricLines": ["서해선"], "id": 6, "title": "KRIC 표준데이터 운행정보(한국철도공사)"},
    "AREX": {"kind": "kric", "file": "kric-7-", "id": 7, "title": "KRIC 표준데이터 운행정보(공항철도)"},
    "SBD": {"kind": "kric", "file": "kric-15-", "id": 15, "title": "KRIC 표준데이터 운행정보(신분당선)"},
    "SL": {"kind": "kric", "file": "kric-1221-", "id": 1221, "title": "KRIC 표준데이터 운행정보(신림선)"},
    "GOLD": {"kind": "kric", "file": "kric-903-", "id": 903, "title": "KRIC 표준데이터 운행정보(김포도시철도)"},
    "UI": {"kind": "kric", "file": "kric-911-", "id": 911, "title": "KRIC 표준데이터 운행정보(우이신설선)"},
    "UJB": {"kind": "kric", "file": "kric-17-", "id": 17, "title": "KRIC 표준데이터 운행정보(의정부경전철)"},
    "IC1": {"kind": "kric", "file": "kric-816-", "id": 816, "title": "KRIC 표준데이터 운행정보(인천교통공사)", "kricLines": ["인천지하철 1호선"]},
    "IC2": {"kind": "incheon2", "files": ["datago-15051207-", "datago-15051208-", "datago-15051209-", "datago-15051210-"],
            "title": "인천교통공사 인천2호선 열차운행시각표", "url": "https://www.data.go.kr/data/15051208/fileData.do"},
}

# 원본의 줄임·옛 역명 → OSM 역명. 앞글자 일치로 풀리지 않는 것만 적는다.
ALIASES = {
    "디엠시": "디지털미디어시티", "항공대": "한국항공대", "구룡역": "구룡", "로데오": "압구정로데오",
    "신인천": "인천", "신수원": "수원", "신김포": "김포공항", "신소사": "소사", "신신천": "신천", "신신현": "신현",
    "신초지": "초지", "시흥청": "시흥시청", "신판교": "판교", "신이매": "이매", "경광주": "경기광주",
    "도예촌": "신둔도예촌", "세종릉": "세종대왕릉", "서울": "서울역", "1양원": "양원", "1양정": "양정",
    "샛강역": "샛강", "센럴파크": "센트럴파크", "서구청": "서해구청", "사우(김포시청)": "사우", "어룡(용현산업단지)": "어룡", "동작(현충원)": "동작",
}


def station_key(raw):
    name = raw.strip()
    if name in ALIASES:
        return ALIASES[name]
    name = name.split("(")[0].replace(" ", "")
    if name in ALIASES:
        return ALIASES[name]
    if name.endswith("역") and len(name) > 2:
        name = name[:-1]
    return "서울역" if name == "서울" else name


def read_xlsx(path):
    """표준 라이브러리만으로 첫 시트를 행 목록으로 읽는다."""
    with zipfile.ZipFile(path) as archive:
        ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", ns):
                shared.append("".join(t.text or "" for t in item.iter("{%s}t" % ns["m"])))
        sheet = sorted(n for n in archive.namelist() if n.startswith("xl/worksheets/sheet"))[0]
        rows = []
        for row in ET.fromstring(archive.read(sheet)).iter("{%s}row" % ns["m"]):
            values = {}
            for cell in row.findall("m:c", ns):
                ref = re.match(r"[A-Z]+", cell.get("r")).group()
                column = 0
                for ch in ref:
                    column = column * 26 + ord(ch) - 64
                kind = cell.get("t")
                value = cell.find("m:v", ns)
                if kind == "s" and value is not None:
                    text = shared[int(value.text)]
                elif kind == "inlineStr":
                    text = "".join(t.text or "" for t in cell.iter("{%s}t" % ns["m"]))
                else:
                    text = value.text if value is not None else ""
                values[column - 1] = text
            if values:
                rows.append([values.get(i, "") for i in range(max(values) + 1)])
        return rows


def clock(text):
    text = (text or "").strip()
    match = re.fullmatch(r"(\d{1,2}):(\d{2})(?::(\d{2}))?", text)
    if match:
        h, m, s = match.groups()
        return int(h) * 3600 + int(m) * 60 + int(s or 0)
    try:
        value = float(text)
    except ValueError:
        return None
    return round(value * 86400) if 0 <= value < 2 else None


def day_of(label):
    if label in ("평일", "DAY"):
        return "DAY"
    if label in ("토요일", "SAT"):
        return "SAT"
    return "END"


def kric_trips(path, lines_filter):
    rows = read_xlsx(path)
    header_index = next(i for i, row in enumerate(rows) if "열차번호" in row)
    header = rows[header_index]
    col = {name: header.index(name) for name in header if name}
    station_col = col["운행구간정거장"]
    arrival_col = col["정거장도착시각"]
    departure_col = col.get("정거장출발시각", col.get("정가장출발시각"))
    line_col, day_col, kind_col = col["노선명"], col["요일구분"], col["운행유형"]
    trips = defaultdict(list)
    meta = {}
    data_date = None
    for row in rows[header_index + 1:]:
        if len(row) <= departure_col or not row[0]:
            continue
        if lines_filter and row[line_col] not in lines_filter:
            continue
        date_col = col.get("데이터기준일자", col.get("데이터기준일"))
        if date_col is not None and len(row) > date_col and row[date_col]:
            data_date = row[date_col]
        key = (row[0], day_of(row[day_col]))
        meta[key] = row[kind_col]
        stations = row[station_col]
        if re.search(r"[+,]", stations):
            # 한 행이 한 열차: "코드-역명+코드-역명", 시각은 "코드-HH:MM" 또는 "코드+HH:MM"
            names = {}
            order = []
            for token in re.split(r"[+,/]", stations):
                if "-" in token:
                    code, name = token.split("-", 1)
                    names[code.strip()] = name.strip()
                    order.append(code.strip())
            pattern = r"([A-Za-z0-9]+)[-+](\d{1,2}:\d{2}(?::\d{2})?|:)"
            arrivals = dict(re.findall(pattern, row[arrival_col] or ""))
            departures = dict(re.findall(pattern, row[departure_col] or ""))
            for code in order:
                trips[key].append((names[code], clock(arrivals.get(code)), clock(departures.get(code))))
        else:
            # 한 행이 한 정차
            trips[key].append((stations, clock(row[arrival_col]), clock(row[departure_col])))
    return trips, meta, data_date


def seoul_metro_trips(path, line):
    trips = defaultdict(list)
    meta = {}
    with path.open(encoding="cp949", newline="") as file:
        for row in csv.DictReader(file):
            if row["호선"] != line:
                continue
            key = (row["열차코드"], row["주중주말"])
            meta[key] = "급행" if row.get("급행여부", "").strip() in ("Y", "1", "급행") else "일반"
            arrival = None if row["열차도착시간"] in ("", "00:00:00") else clock(row["열차도착시간"])
            departure = None if row["열차출발시간"] in ("", "00:00:00") else clock(row["열차출발시간"])
            trips[key].append((row["역사명"], arrival, departure))
    for stops in trips.values():
        stops.sort(key=lambda stop: stop[1] if stop[1] is not None else stop[2] if stop[2] is not None else 0)
    return trips, meta


def incheon2_trips(paths):
    trips = defaultdict(list)
    meta = {}
    for path in paths:
        day = "DAY" if "평일" in path.name else "END"
        with path.open(encoding="cp949", newline="") as file:
            reader = csv.reader(file)
            header = next(reader)
            stations = header[3:]
            for row in reader:
                if len(row) < 4:
                    continue
                key = (f"{path.name[:16]}-{row[2]}", day)
                meta[key] = "일반"
                for name, value in zip(stations, row[3:]):
                    time = clock(value)
                    if time is not None:
                        trips[key].append((name, time, time))
    return trips, meta


def generate(line_id, source, sources_dir):
    regional = json.loads((REGIONAL_DIR / f"{line_id.lower()}.json").read_text())
    known = {station["name"]: station["id"] for station in regional["stations"]}
    files = []
    if source["kind"] == "seoul-metro":
        path = next(sources_dir.glob(source["file"] + "*.csv"))
        trips, meta = seoul_metro_trips(path, source["line"])
        files.append(path)
        data_date = re.search(r"(\d{8})", path.name).group(1)
    elif source["kind"] == "kric":
        path = next(sources_dir.glob(source["file"] + "*.xlsx"))
        trips, meta, data_date = kric_trips(path, source.get("kricLines"))
        files.append(path)
        file_date = re.search(r"_(\d{8})\.xlsx$", path.name)
        data_date = file_date.group(1) if file_date else data_date
    else:
        files = [next(sources_dir.glob(prefix + "*.csv")) for prefix in source["files"]]
        trips, meta = incheon2_trips(files)
        data_date = "20250630"

    unmatched = Counter()

    def resolve(raw):
        key = station_key(raw)
        if key in known:
            return known[key]
        stripped = key.lstrip("0123456789")
        candidates = [name for name in known if name.startswith(stripped)] if len(stripped) >= 2 else []
        if len(candidates) == 1:
            return known[candidates[0]]
        unmatched[raw] += 1
        return None

    travel, dwell, departures, continuations = defaultdict(list), defaultdict(list), defaultdict(Counter), Counter()
    days_present = set()
    for (train, day), raw_stops in trips.items():
        stops = []
        offset = 0
        previous_time = None
        for raw, arrival, departure in raw_stops:
            station = resolve(raw)
            if station is None or (arrival is None and departure is None):
                continue
            arrival = arrival if arrival is not None else departure
            departure = departure if departure is not None else arrival
            # 자정을 넘기는 열차
            if previous_time is not None and arrival + offset < previous_time - 6 * 3600:
                offset += 86400
            arrival, departure = arrival + offset, departure + offset
            if departure < arrival:
                departure = arrival
            previous_time = departure
            if stops and stops[-1][0] == station:
                continue
            stops.append((station, arrival, departure))
        if len(stops) < 2:
            continue
        days_present.add(day)
        for i in range(1, len(stops)):
            a, b = stops[i - 1], stops[i]
            seconds = b[1] - a[2]
            if seconds <= 0 or seconds > 3 * 3600:
                break
            key = (a[0], b[0])
            travel[key].append(seconds)
            if i + 1 < len(stops):
                dwell[key].append(b[2] - b[1])
                continuations[(a[0], b[0], stops[i + 1][0])] += 1
            departures[(key, day)][int(a[2] // 3600)] += 1

    # 토요일 자료가 없으면 휴일 시간표를 쓴다.
    fallback_day = {"SAT": "END" if "SAT" not in days_present else "SAT", "END": "END" if "END" in days_present else "DAY", "DAY": "DAY"}
    profiles, profile_index, runs = [], {}, []
    for key in sorted(travel):
        hourly = []
        for day in DAYS:
            source_day = fallback_day[day] if day not in days_present else day
            counts = tuple(departures[(key, source_day)].get(h, 0) for h in range(FIRST_HOUR, LAST_HOUR))
            if counts not in profile_index:
                profile_index[counts] = len(profiles)
                profiles.append(list(counts))
            hourly.append(profile_index[counts])
        runs.append([key[0], key[1], round(statistics.median(travel[key])),
                     round(statistics.median(dwell[key])) if dwell[key] else 0, len(travel[key]), hourly])
    result = {
        "lineId": line_id,
        "source": {
            "title": source["title"],
            "url": source.get("url") or KRIC_URL.format(id=source["id"]),
            "dataDate": f"{data_date[:4]}-{data_date[4:6]}-{data_date[6:8]}" if data_date and data_date.isdigit() and len(data_date) == 8 else data_date,
            "files": [{"name": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],
            "satFromHoliday": "SAT" not in days_present,
        },
        "hours": [FIRST_HOUR, LAST_HOUR],
        "days": list(DAYS),
        "runFields": ["from", "to", "seconds", "dwellSeconds", "samples", "hourlyProfile"],
        "runs": runs,
        "profiles": profiles,
        "continuations": sorted([a, b, c] for (a, b, c) in continuations if a != c),
        "unmatchedStations": sorted(unmatched),
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / f"{line_id.lower()}.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    trains = len({train for train, _ in trips})
    print(f"{line_id}: 열차 {trains} · 구간 {len(runs)} · 연속 {len(result['continuations'])} · 미매칭 역 {dict(unmatched)}")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("lines", nargs="*")
    args = parser.parse_args()
    for line_id, source in SOURCES.items():
        if args.lines and line_id not in args.lines:
            continue
        generate(line_id, source, args.sources)


if __name__ == "__main__":
    main()
