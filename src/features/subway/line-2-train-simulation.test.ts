import { describe, expect, it } from "vitest";
import type { SubwayRouteSampler } from "./subway-route-sampler";
import { createSubwayTrainSimulation } from "./line-2-train-simulation";

const SIMULATION_EPOCH_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const TEST_ROUTE_LENGTH_METERS = 100;
const TEST_CRUISE_SPEED_METERS_PER_SECOND = 10;
const TEST_DWELL_SECONDS = 2;
const TEST_CYCLE_SECONDS = 14;

const TEST_SAMPLER: SubwayRouteSampler = {
  totalDistanceMeters: TEST_ROUTE_LENGTH_METERS,
  sample(distanceMeters) {
    const wrappedDistanceMeters = wrap(
      distanceMeters,
      TEST_ROUTE_LENGTH_METERS,
    );

    return {
      coordinate: [wrappedDistanceMeters, 0],
      headingRadians: wrappedDistanceMeters < 50 ? 0 : Math.PI,
    };
  },
  project(coordinate) {
    return {
      coordinate,
      distanceMeters: coordinate[0],
      headingRadians: 0,
      offsetMeters: 0,
    };
  },
};

describe("2호선 열차 운행 시뮬레이션", () => {
  it("같은 시각이 주어졌을 때 열차 상태를 조회하면 항상 같은 운행 상태를 반환한다", () => {
    const simulation = createTestSimulation();
    const timestamp = atSecond(3.25);
    const expectedState = simulation.getState(timestamp);

    simulation.getState(atSecond(9.75));

    expect(simulation.getState(timestamp)).toEqual(expectedState);
  });

  it("열차가 역 사이를 이동할 때 상태를 조회하면 설정한 일정 순항 속도로 이동한다", () => {
    const simulation = createTestSimulation();
    const earlierState = simulation.getState(atSecond(2.5));
    const laterState = simulation.getState(atSecond(4));

    expect(laterState.frontDistanceMeters - earlierState.frontDistanceMeters).toBe(
      TEST_CRUISE_SPEED_METERS_PER_SECOND * 1.5,
    );
    expect(earlierState.speedMetersPerSecond).toBe(
      TEST_CRUISE_SPEED_METERS_PER_SECOND,
    );
    expect(laterState.speedMetersPerSecond).toBe(
      TEST_CRUISE_SPEED_METERS_PER_SECOND,
    );
  });

  it("열차가 각 역에 도착했을 때 상태를 조회하면 설정한 시간 동안 정차한다", () => {
    const simulation = createTestSimulation();
    const firstStopState = simulation.getState(atSecond(1.999));
    const firstDepartureState = simulation.getState(atSecond(2));
    const secondStopState = simulation.getState(atSecond(7.999));
    const secondDepartureState = simulation.getState(atSecond(8));

    expect(firstStopState.phase).toBe("dwelling");
    expect(firstStopState.frontDistanceMeters).toBe(0);
    expect(firstStopState.speedMetersPerSecond).toBe(0);
    expect(firstDepartureState.phase).toBe("moving");
    expect(secondStopState.phase).toBe("dwelling");
    expect(secondStopState.frontDistanceMeters).toBe(40);
    expect(secondStopState.speedMetersPerSecond).toBe(0);
    expect(secondDepartureState.phase).toBe("moving");
  });

  it("한 바퀴 운행 시간이 지난 뒤 상태를 조회하면 이전과 같은 운행 상태를 반환한다", () => {
    const simulation = createTestSimulation();

    expect(simulation.getState(atSecond(1))).toEqual(
      simulation.getState(atSecond(1 + TEST_CYCLE_SECONDS)),
    );
  });

  it("아주 긴 시간이 지난 뒤 상태를 조회하면 누적 오차 없이 같은 운행 상태를 반환한다", () => {
    const simulation = createTestSimulation();
    const cycleCount = 1_000_000;

    expect(
      simulation.getState(
        atSecond(1 + TEST_CYCLE_SECONDS * cycleCount),
      ),
    ).toEqual(simulation.getState(atSecond(1)));
  });

  it("열차별 출발 시차가 설정되어 있을 때 상태를 조회하면 프레임 시간을 누적하지 않고 시차를 적용한다", () => {
    const simulation = createTestSimulation({ phaseOffsetSeconds: 3 });
    const state = simulation.getState(atSecond(0));

    expect(state.phase).toBe("moving");
    expect(state.frontDistanceMeters).toBe(10);
  });

  it("마지막 역에서 첫 역으로 이동할 때 상태를 조회하면 경로 끝을 지나 출발점으로 이어진다", () => {
    const simulation = createTestSimulation();
    const beforeCycleEnd = simulation.getState(atSecond(13.999));
    const cycleStart = simulation.getState(atSecond(14));

    expect(beforeCycleEnd.phase).toBe("moving");
    expect(beforeCycleEnd.frontDistanceMeters).toBeCloseTo(99.99, 5);
    expect(cycleStart.phase).toBe("dwelling");
    expect(cycleStart.frontDistanceMeters).toBe(0);
  });

  it("여러 칸으로 구성된 열차가 이동할 때 상태를 조회하면 차량마다 서로 다른 위치를 반환한다", () => {
    const simulation = createTestSimulation();
    const state = simulation.getState(atSecond(4));

    expect(state.carPoses).toHaveLength(3);
    expect(new Set(state.carPoses.map((pose) => pose.distanceMeters)).size).toBe(
      3,
    );
  });

  it.each([
    ["0 이하의 순항 속도", { cruiseSpeedMetersPerSecond: 0 }],
    ["음수인 정차 시간", { dwellSeconds: -1 }],
    ["비어 있는 정차역 목록", { stopDistancesMeters: [] }],
    ["잘못된 정차역 목록", { stopDistancesMeters: [Number.NaN] }],
    [
      "잘못된 경로 길이",
      { sampler: { ...TEST_SAMPLER, totalDistanceMeters: 0 } },
    ],
  ])("%s 설정이 주어졌을 때 시뮬레이션을 만들면 오류를 반환한다", (_label, overrides) => {
    expect(() => createTestSimulation(overrides)).toThrow();
  });
});

function createTestSimulation(
  overrides: Partial<Parameters<typeof createSubwayTrainSimulation>[0]> = {},
) {
  return createSubwayTrainSimulation({
    id: "test-train",
    sampler: TEST_SAMPLER,
    stopDistancesMeters: [0, 40],
    carCount: 3,
    carSpacingMeters: 20,
    cruiseSpeedMetersPerSecond: TEST_CRUISE_SPEED_METERS_PER_SECOND,
    dwellSeconds: TEST_DWELL_SECONDS,
    phaseOffsetSeconds: 0,
    simulationEpochMs: SIMULATION_EPOCH_MS,
    ...overrides,
  });
}

function atSecond(second: number) {
  return SIMULATION_EPOCH_MS + second * 1_000;
}

function wrap(value: number, maximum: number) {
  return ((value % maximum) + maximum) % maximum;
}
