import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import data from "./data/line-1-sections.json";
import {
  classifyLine1Service,
  formatLine1Headsign,
  getLine1SectionLabel,
  getLine1StationOperator,
  getLine1TrackSection,
  getLine1TripPresentation,
  line1LegStations,
  splitLine1Path,
} from "./line-1-sections";
import { getLine1StationBoard } from "./line-1-station-board";
import { SEOUL_SUBWAY_OSM_NETWORK } from "./osm-subway-network";
import { getScheduledSubwayTrips, getSubwayTripLegs } from "./subway-timetable";

const weekdayMorning = Date.parse("2026-09-02T08:00:00+09:00");
const line1Trips = getScheduledSubwayTrips(weekdayMorning).filter(trip => trip[0] === 1);

describe("1호선 구간", () => {
  it("구간과 정차역 매핑은 원본 스냅샷과 같은 버전이다", () => {
    const hash = (filename: string) => createHash("sha256")
      .update(readFileSync(new URL(`./data/${filename}`, import.meta.url))).digest("hex");
    expect(data.networkSha256).toBe(hash("osm-subway-line-1.json"));
    expect(data.timetableSha256).toBe(hash("subway-timetable.json"));
  });

  it("OSM 선로를 빠짐없이 나누고 반대 방향에서도 같은 구간을 반환한다", () => {
    const route = SEOUL_SUBWAY_OSM_NETWORK.routes.find(({ lineNumber }) => lineNumber === 1)!;
    const classified = new Set<string>();
    route.pathSegments.forEach((path, index) => {
      const split = splitLine1Path(path, index);
      expect(split.flatMap((part, i) => i ? part.path.slice(1) : part.path)).toEqual(path);
      for (const { path: sectionPath, section } of split) {
        classified.add(section);
        if (section === "metro") expect(getLine1TrackSection(sectionPath.toReversed(), 0)).toBe("metro");
      }
    });
    expect(classified).toEqual(new Set(["metro", "gyeongbu", "gyeongin", "gyeongwon", "janghang",
      "byeongjeom", "gwangmyeong", "korail", "unknown"]));
    expect(getLine1TrackSection([[0, 0], [0, 1]], 0)).toBe("unknown");
  });

  it("서울역과 청량리 승강장의 관할을 직결 구간 역과 구분한다", () => {
    expect(getLine1StationOperator("서울역")).toBe("서울교통공사");
    expect(getLine1StationOperator("청량리")).toBe("서울교통공사");
    expect(getLine1StationOperator("구로")).toBe("코레일");
    expect(getLine1StationOperator("회기")).toBe("코레일");
    expect(getLine1StationOperator("가상의 역")).toBeUndefined();
    expect(getLine1SectionLabel("gyeongin")).toBe("코레일 · 경인선");
    expect(getLine1SectionLabel("unknown")).toBe("구간 미확인");
  });
});

describe("1호선 시간표 표시", () => {
  it("원본 시간표의 급행 구분과 행선지를 표시한다", () => {
    const shortExpress = line1Trips.find(trip => trip[3] === 10)!;
    expect(getSubwayTripLegs(shortExpress).some(leg => leg[3])).toBe(false);
    expect(classifyLine1Service(shortExpress[3])).toBe("급행");
    expect(classifyLine1Service(0)).toBe("완행");
    expect(classifyLine1Service(-1)).toBeUndefined();
    expect(formatLine1Headsign("동인천", "급행")).toBe("동인천행 · 급행");
    expect(formatLine1Headsign("서울역")).toBe("서울역행");
    expect(line1Trips.some(trip => getLine1TripPresentation(trip).headsign === "동인천행 · 급행")).toBe(true);
  });

  it("시간표의 정차역을 모두 찾고 통과 열차는 전광판에서 제외한다", () => {
    const seenLegs = new Set<number>();
    const passed = line1Trips.flatMap(trip => {
      let elapsed = trip[1];
      return getSubwayTripLegs(trip).flatMap(([leg, travel, dwell, passes]) => {
        const station = line1LegStations[leg];
        if (!seenLegs.has(leg)) {
          expect(station?.[0]).toBeTruthy();
          expect(station?.[1]).toBeTruthy();
          seenLegs.add(leg);
        }
        const arrival = elapsed + travel;
        elapsed = arrival + dwell;
        return passes ? [{ station: station![1]!, arrival, headsign: getLine1TripPresentation(trip).headsign }] : [];
      });
    });
    const midnight = Date.parse("2026-09-02T00:00:00+09:00");
    const call = passed.find(entry => entry.station === "구일")!;
    const time = midnight + call.arrival * 1_000;
    const board = getLine1StationBoard(call.station, time - 1000, 100);
    expect(board.length).toBeGreaterThan(0);
    expect(board.some(entry => entry.headsign === call.headsign && entry.scheduledMs === time)).toBe(false);
    expect(getLine1StationBoard("구로", weekdayMorning)).toHaveLength(5);
  });
});
