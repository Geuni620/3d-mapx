import { describe, expect, it } from "vitest";
import { SUBWAY_LINES } from "./subway-constants";
import { createSubwayRouteSampler } from "./subway-route-sampler";
import { getActiveSubwayTrips, getSubwayServiceSecond, sampleSubwayTrip } from "./subway-timetable";
import { createSubwayVisualLevel } from "./subway-paths";
import timetable from "./data/subway-timetable.json";

describe("1~8호선 시간표 지도", () => {
  it("평일 출근시간에 각 호선의 운행 경로를 표시한다", () => {
    const timestamp = Date.parse("2026-11-23T08:30:00+09:00");
    const trips = getActiveSubwayTrips(timestamp, SUBWAY_LINES);
    expect(new Set(trips.map(([line]) => line))).toEqual(new Set(SUBWAY_LINES));
    const seconds = getSubwayServiceSecond(timestamp);
    expect(trips.every(trip => sampleSubwayTrip(trip, seconds)?.front.every(Number.isFinite))).toBe(true);
    expect(getActiveSubwayTrips(timestamp, [5]).every(([line]) => line === 5)).toBe(true);
  });

  it("광명셔틀과 2호선 두 지선의 편성을 본선과 구분한다", () => {
    const timestamp = Date.parse("2026-11-23T08:30:00+09:00");
    const formations = (line: 1 | 2 | 5 | 8) => new Set(getActiveSubwayTrips(timestamp, [line]).map(trip => trip[4]));
    expect(formations(1)).toEqual(new Set([4, 10]));
    expect(formations(2)).toEqual(new Set([4, 6]));
    expect(formations(5)).toEqual(new Set([8]));
    expect(formations(8)).toEqual(new Set([6]));
  });

  it("출발과 도착에서는 0km/h이고 역 사이에서는 달린다", () => {
    const timestamp = Date.parse("2026-11-23T08:30:00+09:00");
    const trip = getActiveSubwayTrips(timestamp, [5])[0];
    const [, start, , index] = trip;
    const [, travel, dwell] = timetable.patterns[index][0];
    expect(dwell).toBeGreaterThan(0);
    expect(sampleSubwayTrip(trip, start)?.speedMetersPerSecond).toBe(0);
    expect(sampleSubwayTrip(trip, start + travel / 2)?.speedMetersPerSecond).toBeGreaterThan(0);
    expect(sampleSubwayTrip(trip, start + travel)).toMatchObject({
      speedMetersPerSecond: 0,
      dwelling: true,
    });
    expect(sampleSubwayTrip(trip, start + travel + dwell / 2)?.front)
      .toEqual(sampleSubwayTrip(trip, start + travel)?.front);
  });

  it("급행 통과역에서 위치와 속도를 이어 간다", () => {
    const timestamp = Date.parse("2026-11-23T08:30:00+09:00");
    const trip = getActiveSubwayTrips(timestamp, [1]).find(([, , , pattern]) =>
      timetable.patterns[pattern].some(([, , , passesStation]) => passesStation === 1))!;
    const [, start, , pattern] = trip;
    let passage = start;
    for (const [, travel, dwell, passesStation] of timetable.patterns[pattern]) {
      passage += travel + dwell;
      if (passesStation) break;
    }
    const before = sampleSubwayTrip(trip, passage - 0.001)!;
    const after = sampleSubwayTrip(trip, passage + 0.001)!;
    expect(before.dwelling).toBe(false);
    expect(after.dwelling).toBe(false);
    expect(before.speedMetersPerSecond).toBeGreaterThan(0);
    expect(before.speedMetersPerSecond).toBeCloseTo(after.speedMetersPerSecond, 2);
    expect(before.front[0]).toBeCloseTo(after.front[0], 5);
    expect(before.front[1]).toBeCloseTo(after.front[1], 5);
  });

  it("종착역을 넘겨 샘플링해도 시작역으로 돌아가지 않는다", () => {
    const path = [[126.97, 37.56], [126.98, 37.56]] as const;
    const sampler = createSubwayRouteSampler(path, { closed: false })!;
    expect(sampler.sample(sampler.totalDistanceMeters + 10).coordinate).toEqual(path[1]);
  });

  it("같은 렌더링 단계의 확대 중 노선 레이어 스타일을 재사용한다", () => {
    expect(createSubwayVisualLevel(11)).toBe(createSubwayVisualLevel(12.39));
    expect(createSubwayVisualLevel(12.4)).not.toBe(createSubwayVisualLevel(12.41));
  });
});
