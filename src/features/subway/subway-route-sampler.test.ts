import { describe, expect, it } from "vitest";
import { createSubwayRouteSampler } from "./subway-route-sampler";

const TEST_LOOP = [
  [126.97, 37.56],
  [126.971, 37.56],
  [126.971, 37.561],
  [126.97, 37.561],
] as const;

describe("운행 경로 위치 계산", () => {
  it("좌표가 없거나 하나뿐일 때 운행 경로를 만들면 경로를 만들 수 없음을 반환한다", () => {
    expect(createSubwayRouteSampler([])).toBeUndefined();
    expect(createSubwayRouteSampler([[126.97, 37.56]])).toBeUndefined();
  });

  it("순환 경로 좌표가 주어졌을 때 운행 경로를 만들면 전체 거리와 출발점 위치를 계산한다", () => {
    const sampler = createSubwayRouteSampler(TEST_LOOP);

    expect(sampler).toBeDefined();
    expect(sampler?.totalDistanceMeters).toBeGreaterThan(300);
    expect(sampler?.sample(0).coordinate).toEqual(TEST_LOOP[0]);
  });

  it("열차가 한 바퀴를 넘는 거리까지 이동했을 때 위치를 조회하면 다음 바퀴의 같은 위치와 방향을 반환한다", () => {
    const sampler = createSubwayRouteSampler(TEST_LOOP);

    expect(sampler).toBeDefined();

    const firstLap = sampler!.sample(20);
    const secondLap = sampler!.sample(sampler!.totalDistanceMeters + 20);

    expect(secondLap.coordinate[0]).toBeCloseTo(firstLap.coordinate[0], 7);
    expect(secondLap.coordinate[1]).toBeCloseTo(firstLap.coordinate[1], 7);
    expect(secondLap.headingRadians).toBeCloseTo(
      firstLap.headingRadians,
      7,
    );
  });

  it("역이 운행 경로에서 떨어져 있을 때 역 위치를 찾으면 경로상 거리와 경로에서 떨어진 거리를 반환한다", () => {
    const sampler = createSubwayRouteSampler(TEST_LOOP);

    expect(sampler).toBeDefined();

    const projection = sampler!.project([126.9705, 37.56005]);

    expect(projection.distanceMeters).toBeGreaterThan(30);
    expect(projection.offsetMeters).toBeLessThan(10);
  });
});
