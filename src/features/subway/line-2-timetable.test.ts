import { describe, expect, it } from "vitest";
import { SEOUL_SUBWAY_OSM_NETWORK } from "./osm-subway-network";
import { getScheduledFleet, getUpcomingStops, getLine2ServiceDay } from "./line-2-timetable";

const kst = (text: string) => Date.parse(text + "+09:00");

describe("서울교통공사 2026-09-01 본선 운행시각표", () => {
  it("평일 08:21과 토요일 16:20의 운행 편성 수를 정차 순서로 판별한 방향별로 복원한다", () => {
    const peak = getScheduledFleet(kst("2026-11-20T08:21:00"));
    const saturday = getScheduledFleet(kst("2026-11-21T16:20:00"));
    expect(peak.filter((t) => t.direction === "outer-loop")).toHaveLength(33);
    expect(peak.filter((t) => t.direction === "inner-loop")).toHaveLength(26);
    expect(saturday.filter((t) => t.direction === "outer-loop")).toHaveLength(17);
    expect(saturday.filter((t) => t.direction === "inner-loop")).toHaveLength(17);
    expect(new Set(saturday.map((t) => t.id)).size).toBe(saturday.length);
  });

  it("05:30 홍대입구 출발 2004열차가 내선 선로를 따라 05:32 신촌에 도착해 30초 정차한다", () => {
    const start = kst("2026-11-20T05:30:00");
    const train = getScheduledFleet(start).find((t) => t.number === "2004")!;
    expect(getScheduledFleet(start - 1).find((t) => t.number === "2004")).toBeUndefined();
    expect(train.direction).toBe("inner-loop");
    expect(train.origin).toBe("홍대입구");
    expect(train.destination).toBe("성수");
    const arrival = start + 120_000;
    const motion = train.getMotion(arrival);
    const officialStation = SEOUL_SUBWAY_OSM_NETWORK.serviceRoutes
      .find((r) => r.direction === "inner-loop")!
      .stops.find((s) => s.name.split("(")[0] === "신촌")!;
    expect(motion.frontDistanceMeters).toBe(officialStation.distanceMeters);
    expect(motion.speedMetersPerSecond).toBe(0);
    expect(motion.motion).toBe("dwelling");
    expect(train.getMotion(arrival - 10).frontDistanceMeters).toBeCloseTo(
      motion.frontDistanceMeters,
      5,
    );
    expect(train.getMotion(arrival - 10).motion).toBe("braking");
    expect(train.getMotion(arrival + 29_999)).toEqual(motion);
    expect(train.getMotion(arrival + 30_001).motion).toBe("accelerating");
    expect(train.getMotion(start + 16_016).frontDistanceMeters).toBeGreaterThan(
      train.getMotion(start + 16_000).frontDistanceMeters,
    );
    expect(train.getState(arrival).carPoses).toHaveLength(10);
    expect(train.getLeadPose(arrival).lead).toEqual(train.getState(arrival).carPoses[0]);
    expect(getScheduledFleet(start + 10_000).find((t) => t.number === "2004")).toBe(train);
  });

  it("2004열차의 홍대입구·신촌 출발 표시가 공식 출발시각 4초 뒤까지 유지된다", () => {
    const start = kst("2026-11-20T05:30:00");
    const train = getScheduledFleet(start).find((t) => t.number === "2004")!;
    const arrival = kst("2026-11-20T05:32:00");
    const departure = kst("2026-11-20T05:32:30");
    const origin = { station: "홍대입구", arrivalMs: null, departureMs: start };
    const sinchon = { station: "신촌", arrivalMs: arrival, departureMs: departure };
    expect(train.getStopEvent(start - 1)).toBeNull();
    expect(train.getStopEvent(start)).toEqual(origin);
    expect(train.getStopEvent(start + 4000)).toEqual(origin);
    expect(train.getStopEvent(start + 4001)).toBeNull();
    expect(train.getStopEvent(arrival - 1)).toBeNull();
    for (const time of [arrival, departure - 1, departure, departure + 4000]) {
      expect(train.getStopEvent(time)).toEqual(sinchon);
    }
    expect(train.getStopEvent(departure + 4001)).toBeNull();
    expect(train.getStopEvent(train.arrivalMs)).toBeNull();
    expect(train.getStopEvent(train.arrivalMs + 1000)).toBeNull();
  });

  it("외선 2001열차의 삼성 → 종합운동장 90초 구간과 단축 운행 종착을 지킨다", () => {
    const start = kst("2026-11-20T05:30:00");
    const train = getScheduledFleet(start).find((t) => t.number === "2001")!;
    expect(train.origin).toBe("삼성");
    expect(train.direction).toBe("outer-loop");
    const station = SEOUL_SUBWAY_OSM_NETWORK.serviceRoutes
      .find((r) => r.direction === "outer-loop")!
      .stops.find((s) => s.name === "종합운동장")!;
    expect(train.getMotion(start + 90_000).frontDistanceMeters).toBe(station.distanceMeters);
    const arrival = kst("2026-11-20T05:47:00");
    expect(train.arrivalMs).toBe(arrival);
    expect(getScheduledFleet(arrival - 1).includes(train)).toBe(true);
    expect(getScheduledFleet(arrival).includes(train)).toBe(false);
  });

  it("토요일 새벽에는 전날 금요일의 25:00:30 종착까지 운행하고 휴일과 심야 공백기를 구분한다", () => {
    const end = kst("2026-11-21T01:00:30");
    expect(getLine2ServiceDay(end)).toBe("DAY");
    expect(getScheduledFleet(end - 1).map((t) => t.number)).toContain("2527");
    expect(getScheduledFleet(end)).toHaveLength(0);
    expect(getScheduledFleet(kst("2026-11-21T04:59:00"))).toHaveLength(0);
    expect(getLine2ServiceDay(kst("2026-11-21T03:00:00"))).toBe("SAT");
    expect(getLine2ServiceDay(kst("2026-11-22T06:00:00"))).toBe("END");
    expect(getLine2ServiceDay(kst("2026-10-05T12:00:00"))).toBe("END");
  });
});

it("평일 21:02 외선 2455의 다음 세 정차역과 도착·출발 시각을 정차 패턴에서 읽는다", () => {
  const now = Date.parse("2026-11-23T21:02:00+09:00");
  const train = getScheduledFleet(now).find(item => item.number === "2455")!;
  expect(getUpcomingStops(train, now, 3)).toEqual([
    { station: "당산", arrivalMs: now + 60_000, departureMs: now + 90_000 },
    { station: "영등포구청", arrivalMs: now + 180_000, departureMs: now + 210_000 },
    { station: "문래", arrivalMs: now + 270_000, departureMs: now + 300_000 },
  ]);
  expect(getUpcomingStops(train, now + 60_000, 1)[0].station).toBe("영등포구청");
});
