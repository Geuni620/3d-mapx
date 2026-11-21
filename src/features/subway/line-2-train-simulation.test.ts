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
    expect(moving.motion).toBe("accelerating");
    expect(moving.speedMetersPerSecond).toBeGreaterThan(0);
    expect(moving.speedMetersPerSecond).toBeLessThan(10);
    expect(moving.frontDistanceMeters).toBeGreaterThan(0);
  });

  it("여러 칸으로 구성된 열차가 이동할 때 운행 상태를 조회하면 차량마다 서로 다른 위치와 방향을 반환한다", () => {
    const simulation = createTestSimulation();
    const state = simulation.getState(KOREAN_MIDNIGHT + 19_000);

    expect(state.carPoses).toHaveLength(3);
    expect(new Set(state.carPoses.map((pose) => pose.distanceMeters)).size).toBe(
      3,
    );
    expect(new Set(state.carPoses.map((pose) => pose.headingRadians)).size).toBeGreaterThan(
      1,
    );
  });

  it("주행 중에는 초 경계 안팎에서 경과한 밀리초만큼 전진하고 정차 중에는 제자리에 머문다", () => {
    const simulation = createTestSimulation();
    const distance = (ms: number) => simulation.getState(KOREAN_MIDNIGHT + ms).frontDistanceMeters;
    expect(distance(1_999)).toBe(distance(1_001));
    expect(distance(2_016)).toBeGreaterThan(distance(2_000));
    // 출발 첫 1초는 jerk가 일정해 속도는 t²/2, 이동거리는 t³/6에 비례한다.
    const advance = distance(3_008) - distance(2_992);
    expect(advance).toBeCloseTo(0.65 * (1.008 ** 3 - 0.992 ** 3) / 6, 8);
  });

  it("감속 구간을 지나면 역에 정지하고, 다음 출발 전까지 같은 거리와 영속도를 유지한다", () => {
    const simulation = createTestSimulation();
    let braking = false;
    for (let ms = 2_001; ms < 90_000; ms += 16) {
      const state = simulation.getMotion(KOREAN_MIDNIGHT + ms);
      if (state.motion === "braking") {
        const next = simulation.getMotion(KOREAN_MIDNIGHT + ms + 1);
        expect(next.speedMetersPerSecond).toBeLessThanOrEqual(state.speedMetersPerSecond + 1e-9);
        braking = true;
      }
      if (braking && state.phase === "dwelling") {
        const later = simulation.getMotion(KOREAN_MIDNIGHT + ms + 1_000);
        expect(state.speedMetersPerSecond).toBe(0);
        expect(later.frontDistanceMeters).toBe(state.frontDistanceMeters);
        expect(simulation.getLeadPose(KOREAN_MIDNIGHT + ms).lead).toEqual(simulation.getState(KOREAN_MIDNIGHT + ms).carPoses[0]);
        return;
      }
    }
    throw new Error("감속 후 첫 정차 구간을 찾지 못했습니다.");
  });

  it("한국 시간대별 속도가 설정되어 있을 때 운행 상태를 조회하면 해당 시간의 속도를 적용한다", () => {
    const simulation = createTestSimulation();

    // 당장 속도를 바꾸지 않고 다음 역에서 출발할 때 해당 시간대의 순항 제한을 선택한다.
    function peakSpeed(start: number) {
      const samples = Array.from({ length: 90 }, (_, i) =>
        simulation.getMotion(KOREAN_MIDNIGHT + start + i * 1_000).speedMetersPerSecond,
      );
      return Math.max(...samples);
    }
    expect(peakSpeed(0)).toBeCloseTo(10);
    expect(peakSpeed(6 * 3_600_000 + 120_000)).toBeCloseTo(5);

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
