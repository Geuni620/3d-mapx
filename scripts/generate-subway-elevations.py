"""서울교통공사 역사심도정보 CSV를 OSM 역사 ID와 표시 고도로 변환한다."""

import argparse
import csv
import hashlib
import io
import json
from pathlib import Path


DATA = Path(__file__).resolve().parents[1] / "src/features/subway/data"
SOURCE = "https://www.data.go.kr/data/15071319/fileData.do"
CSV_NAMES = {
    1: {"서울역": "서울"},
    2: {"구로디지털단지": "구로디지털", "을지로3가": "을지3가", "을지로4가": "을지4가"},
    4: {"불암산": "당고개", "미아사거리": "미아삼거리"},
    5: {"동대문역사문화공원": "동대문운동장", "둔촌동": "둔촌", "애오개": "애오게"},
    6: {"디지털미디어시티": "DMC"},
    7: {"광명사거리": "광명", "숭실대입구": "숭실대", "신대방삼거리": "신대방", "자양": "뚝섬유원지"},
}


def station_name(name):
    return name.split("(", 1)[0].strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path)
    args = parser.parse_args()
    raw = args.csv.read_bytes()
    rows = list(csv.DictReader(io.StringIO(raw.decode("cp949"))))
    meters = {
        (int(row["호선"]), station_name(row["역명"])):
            (float(row["지반고"]), float(row["레일면고"]))
        for row in rows if row["지반고"] != "-" and row["레일면고"] != "-"
    }
    track_depths = {
        (int(row["호선"]), station_name(row["역명"])): float(row["선로기준정거장깊이"])
        for row in rows if row["선로기준정거장깊이"] != "-"
    }

    groups = {}
    matched = set()
    altitudes = {}
    for line in range(1, 9):
        network = json.loads((DATA / f"osm-subway-line-{line}.json").read_text())
        for station in network["stations"]:
            name = station_name(station["name"])
            key = (line, CSV_NAMES.get(line, {}).get(name, name))
            if key not in meters:
                if key in track_depths:
                    altitudes[station["id"]] = -track_depths[key]
                continue
            matched.add(key)
            transfer_name = "이수" if line == 4 and name == "총신대입구" else name
            groups.setdefault(transfer_name, []).append((station, *meters[key]))

    if matched != meters.keys():
        parser.error(f"OSM 역사와 연결하지 못한 CSV 행: {sorted(meters.keys() - matched)}")

    for group in groups.values():
        for station, _, rail in group:
            # 가까운 환승 승강장은 같은 지표 기준으로 레일면고 차이를 보존한다.
            ground = max(other_ground for other, other_ground, _ in group if (
                abs(station["longitude"] - other["longitude"]) < 0.004
                and abs(station["latitude"] - other["latitude"]) < 0.004
            ))
            altitudes[station["id"]] = round(rail - ground, 2)

    payload = {"source": SOURCE, "sha256": hashlib.sha256(raw).hexdigest(),
               "stations": dict(sorted(altitudes.items()))}
    (DATA / "subway-station-elevations.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
    )


if __name__ == "__main__":
    main()
