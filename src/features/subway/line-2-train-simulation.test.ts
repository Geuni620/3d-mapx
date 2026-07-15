import { describe, expect, it } from "vitest";
import { createSubwayRouteSampler } from "./subway-route-sampler";
import {
  createSubwayTrainSimulation,
  getKoreanMinuteOfDay,
} from "./line-2-train-simulation";

const TEST_LOOP = [
  [126.97, 37.56],
  [126.971, 37.56],
  [126.971, 37.561],
  [126.97, 37.561],
] as const;

const KOREAN_MIDNIGHT = Date.UTC(2026, 6, 9, 15, 0, 0);

describe("한국 시간 계산", () => {
  it("실행 환경의 시간대가 다를 때 한국 시각을 계산하면 Asia/Seoul 기준 하루 경과 분을 반환한다", () => {
    expect(getKoreanMinuteOfDay(KOREAN_MIDNIGHT)).toBe(0);
    expect(getKoreanMinuteOfDay(KOREAN_MIDNIGHT + 6 * 60 * 60 * 1000)).toBe(
      360,
    );
  });
});

describe("2호선 열차 운행 시뮬레이션", () => {
  it("같은 시각이 주어졌을 때 열차 상태를 조회하면 항상 같은 운행 상태를 반환한다", () => {
    const simulation = createTestSimulation();
    const timestamp = KOREAN_MIDNIGHT + 12_345;

    expect(simulation.getState(timestamp)).toEqual(
      simulation.getState(timestamp),
    );
  });

  it("열차가 역에 도착했을 때 운행 상태를 조회하면 정차한 뒤 다음 역으로 이동한다", () => {
    const simulation = createTestSimulation();

    const dwelling = simulation.getState(KOREAN_MIDNIGHT + 1_000);
    const moving = simulation.getState(KOREAN_MIDNIGHT + 3_000);

    expect(dwelling.phase).toBe("dwelling");
    expect(dwelling.speedMetersPerSecond).toBe(0);
    expect(moving.phase).toBe("moving");
    expect(moving.speedMetersPerSecond).toBeGreaterThan(0);
    expect(moving.speedMetersPerSecond).toBeLessThan(10);
    expect(moving.frontDistanceMeters).toBeGreaterThan(0);
  });

  it("열차가 출발할 때 밀리초 단위 위치와 속도, 가속도가 연속적으로 증가한다", () => {
    const simulation = createTestSimulation();
    const first = simulation.getState(KOREAN_MIDNIGHT + 2_100);
    const second = simulation.getState(KOREAN_MIDNIGHT + 2_200);

    expect(second.frontDistanceMeters).toBeGreaterThan(
      first.frontDistanceMeters,
    );
    expect(second.speedMetersPerSecond).toBeGreaterThan(
      first.speedMetersPerSecond,
    );
    expect(second.accelerationMetersPerSecondSquared).toBeGreaterThan(
      first.accelerationMetersPerSecondSquared,
    );
    expect(second.accelerationMetersPerSecondSquared).toBeLessThanOrEqual(0.9);
  });

  it("여러 칸으로 구성된 열차가 이동할 때 운행 상태를 조회하면 차량마다 서로 다른 위치와 방향을 반환한다", () => {
    const simulation = createTestSimulation();
    const state = simulation.getState(KOREAN_MIDNIGHT + 15_000);

    expect(state.carPoses).toHaveLength(3);
    expect(new Set(state.carPoses.map((pose) => pose.distanceMeters)).size).toBe(
      3,
    );
    expect(new Set(state.carPoses.map((pose) => pose.headingRadians)).size).toBeGreaterThan(
      1,
    );
  });

  it("한국 시간대별 속도가 설정되어 있을 때 운행 상태를 조회하면 해당 시간의 속도를 적용한다", () => {
    const simulation = createTestSimulation();

    const normal = simulation.getState(KOREAN_MIDNIGHT + 3_000);
    const slower = simulation.getState(
      KOREAN_MIDNIGHT + 6 * 60 * 60 * 1000 + 120_000,
    );

    expect(normal.speedMetersPerSecond).toBeLessThanOrEqual(10);
    expect(slower.speedMetersPerSecond).toBeLessThanOrEqual(5);
  });
});

function createTestSimulation() {
  const sampler = createSubwayRouteSampler(TEST_LOOP);

  if (sampler === undefined) {
    throw new Error("Expected the test route to be valid");
  }

  return createSubwayTrainSimulation({
    id: "test-train",
    sampler,
    stopDistancesMeters: [0, sampler.totalDistanceMeters / 2],
    carCount: 3,
    carSpacingMeters: 24,
    dwellSeconds: 2,
    phaseOffsetSeconds: 0,
    speedProfile: [
      { startMinute: 0, speedMetersPerSecond: 10 },
      { startMinute: 360, speedMetersPerSecond: 5 },
      { startMinute: 420, speedMetersPerSecond: 10 },
    ],
  });
}
