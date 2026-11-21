import { describe, expect, it } from "vitest";
import { getDoorCycle } from "./line-2-door-cycle";
import { getScheduledFleet } from "./line-2-timetable";
import { getPlatformSide } from "./line-2-platform-side";

const arrivalMs = Date.parse("2026-11-20T05:51:30+09:00");
const stop = { station: "왕십리", arrivalMs, departureMs: arrivalMs + 30_000 };
const at = (offset: number) => getDoorCycle(arrivalMs + offset, stop);
const shut = { open: 0, light: 0, closing: false };

describe("정차 중 객실 출입문", () => {
  it("도착시각이 없는 시발역과 정차 이외의 시간에는 열지 않는다", () => {
    expect(getDoorCycle(arrivalMs, null)).toEqual(shut);
    expect(getDoorCycle(arrivalMs, { ...stop, arrivalMs: null })).toEqual(shut);
    expect(at(-1)).toEqual(shut);
    expect(at(30_000)).toEqual(shut);
    expect(at(32_000)).toEqual(shut);
  });

  it("녹색 점멸 예고 뒤 서서히 열리고, 닫힘 중 황색 점멸 후 출발 전에 소등한다", () => {
    expect(at(0).open).toBe(0);
    expect(at(0).light).toBeGreaterThan(at(450).light);
    expect(at(1_500).open).toBeGreaterThan(0);
    expect(at(1_500).open).toBeLessThan(at(2_000).open);
    expect(at(10_000)).toEqual({ open: 1, light: 1, closing: false });
    expect(at(27_200).closing).toBe(true);
    expect(at(27_200).light).not.toBe(at(27_600).light);
    expect(at(28_000).open).toBeGreaterThan(at(29_000).open);
    expect(at(29_400)).toEqual(shut);
  });

  it("지나치게 짧은 정차는 연출을 생략하고, 짧은 정차도 출발 전까지 모두 닫는다", () => {
    expect(getDoorCycle(arrivalMs + 200, { ...stop, departureMs: arrivalMs + 500 })).toEqual(shut);
    const short = { ...stop, departureMs: arrivalMs + 3_000 };
    expect(getDoorCycle(arrivalMs + 1_400, short).open).toBe(1);
    expect(getDoorCycle(arrivalMs + 2_900, short)).toEqual(shut);
  });

  it("시연의 2004열차는 왕십리 정차 중 오른쪽 문을 열고 실제 출발시각부터 전진한다", () => {
    const train = getScheduledFleet(arrivalMs).find(
      (trip) => trip.number === "2004" && trip.direction === "inner-loop",
    )!;
    expect(train.getStopEvent(arrivalMs)).toEqual(stop);
    expect(getPlatformSide(stop.station, train.direction)).toBe("right");
    expect(getDoorCycle(arrivalMs + 5_000, train.getStopEvent(arrivalMs + 5_000)).open).toBe(1);
    const departure = train.getMotion(stop.departureMs);
    expect(getDoorCycle(stop.departureMs, train.getStopEvent(stop.departureMs))).toEqual(shut);
    expect(train.getMotion(stop.departureMs + 2_000).frontDistanceMeters).toBeGreaterThan(
      departure.frontDistanceMeters,
    );
  });
});
