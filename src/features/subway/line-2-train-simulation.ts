import type { SubwayCoordinate } from "./osm-subway-network";
import type { SubwayRouteSampler } from "./subway-route-sampler";

export interface SubwayTrainCarPose {
  carIndex: number;
  distanceMeters: number;
  coordinate: SubwayCoordinate;
  headingRadians: number;
}

export interface SubwayTrainSimulationState {
  id: string;
  phase: "moving" | "dwelling";
  frontDistanceMeters: number;
  speedMetersPerSecond: number;
  carPoses: SubwayTrainCarPose[];
}

export interface SubwayTrainSimulation {
  getState: (timestampMs: number) => SubwayTrainSimulationState;
}

export interface SubwayTrainSimulationOptions {
  id: string;
  sampler: SubwayRouteSampler;
  stopDistancesMeters: number[];
  carCount: number;
  carSpacingMeters: number;
  cruiseSpeedMetersPerSecond: number;
  dwellSeconds: number;
  phaseOffsetSeconds: number;
  simulationEpochMs: number;
}

interface SimulationCycleSegment {
  startSecond: number;
  endSecond: number;
  startDistanceMeters: number;
  phase: "moving" | "dwelling";
  speedMetersPerSecond: number;
}

interface SimulationCycle {
  durationSeconds: number;
  segments: SimulationCycleSegment[];
}

// 운행 조건을 바탕으로 한 바퀴 운행 주기를 만들고, 특정 시각의 열차 위치와 상태를 계산할 수 있게 한다.
export function createSubwayTrainSimulation(
  options: SubwayTrainSimulationOptions,
): SubwayTrainSimulation {
  validateSimulationOptions(options);

  const cycle = createRouteCycle(options);

  return {
    getState(timestampMs) {
      const elapsedSeconds =
        (timestampMs - options.simulationEpochMs) / 1_000 +
        options.phaseOffsetSeconds;
      const cycleSecond = wrap(elapsedSeconds, cycle.durationSeconds);
      const segment = findCycleSegment(cycle.segments, cycleSecond);
      const segmentElapsedSeconds = cycleSecond - segment.startSecond;
      const frontDistanceMeters =
        segment.phase === "dwelling"
          ? segment.startDistanceMeters
          : segment.startDistanceMeters +
            segmentElapsedSeconds * segment.speedMetersPerSecond;

      return createSimulationState(options, segment, frontDistanceMeters);
    },
  };
}

// 각 역의 정차 구간과 다음 역까지의 일정 속도 이동 구간을 이어 한 바퀴 운행 주기를 만든다.
function createRouteCycle(
  options: SubwayTrainSimulationOptions,
): SimulationCycle {
  const routeLengthMeters = options.sampler.totalDistanceMeters;
  const stops = normalizeStops(options.stopDistancesMeters, routeLengthMeters);
  const segments: SimulationCycleSegment[] = [];
  let currentSecond = 0;

  stops.forEach((stopDistanceMeters, stopIndex) => {
    if (options.dwellSeconds > 0) {
      segments.push({
        startSecond: currentSecond,
        endSecond: currentSecond + options.dwellSeconds,
        startDistanceMeters: stopDistanceMeters,
        phase: "dwelling",
        speedMetersPerSecond: 0,
      });
      currentSecond += options.dwellSeconds;
    }

    const nextStopDistanceMeters =
      stops[(stopIndex + 1) % stops.length];
    const moveDistanceMeters = getForwardDistance(
      stopDistanceMeters,
      nextStopDistanceMeters,
      routeLengthMeters,
    );
    const moveDurationSeconds =
      moveDistanceMeters / options.cruiseSpeedMetersPerSecond;

    segments.push({
      startSecond: currentSecond,
      endSecond: currentSecond + moveDurationSeconds,
      startDistanceMeters: stopDistanceMeters,
      phase: "moving",
      speedMetersPerSecond: options.cruiseSpeedMetersPerSecond,
    });
    currentSecond += moveDurationSeconds;
  });

  return {
    durationSeconds: currentSecond,
    segments,
  };
}

// 선두 차량의 경로상 위치를 바탕으로 모든 차량의 지도 좌표와 진행 방향을 계산한다.
function createSimulationState(
  options: SubwayTrainSimulationOptions,
  segment: SimulationCycleSegment,
  unwrappedFrontDistanceMeters: number,
): SubwayTrainSimulationState {
  const routeLengthMeters = options.sampler.totalDistanceMeters;
  const frontDistanceMeters = wrap(
    unwrappedFrontDistanceMeters,
    routeLengthMeters,
  );

  return {
    id: options.id,
    phase: segment.phase,
    frontDistanceMeters,
    speedMetersPerSecond: segment.speedMetersPerSecond,
    carPoses: Array.from({ length: options.carCount }, (_, carIndex) => {
      const distanceMeters = wrap(
        frontDistanceMeters - carIndex * options.carSpacingMeters,
        routeLengthMeters,
      );
      const pose = options.sampler.sample(distanceMeters);

      return {
        carIndex,
        distanceMeters,
        coordinate: pose.coordinate,
        headingRadians: pose.headingRadians,
      };
    }),
  };
}

// 경로 길이, 순항 속도, 정차 시간과 정차역이 시뮬레이션에 사용할 수 있는 값인지 확인한다.
function validateSimulationOptions(options: SubwayTrainSimulationOptions) {
  if (
    !Number.isFinite(options.sampler.totalDistanceMeters) ||
    options.sampler.totalDistanceMeters <= 0
  ) {
    throw new Error("A train simulation requires a valid route length");
  }

  if (
    !Number.isFinite(options.cruiseSpeedMetersPerSecond) ||
    options.cruiseSpeedMetersPerSecond <= 0
  ) {
    throw new Error("Cruise speed must be greater than zero");
  }

  if (!Number.isFinite(options.dwellSeconds) || options.dwellSeconds < 0) {
    throw new Error("Dwell duration cannot be negative");
  }

  if (options.stopDistancesMeters.length === 0) {
    throw new Error("A train simulation requires at least one stop");
  }
}

// 역 위치를 한 바퀴 경로 안으로 맞추고, 잘못된 값과 중복을 제거한 뒤 이동 순서대로 정렬한다.
function normalizeStops(stopDistances: number[], totalDistanceMeters: number) {
  const stops = Array.from(
    new Set(
      stopDistances
        .filter(Number.isFinite)
        .map((distanceMeters) =>
          Number(wrap(distanceMeters, totalDistanceMeters).toFixed(3)),
        ),
    ),
  ).sort((first, second) => first - second);

  if (stops.length === 0) {
    throw new Error("A train simulation requires at least one valid stop");
  }

  return stops;
}

// 순환 경로에서 현재 역부터 다음 역까지 앞으로 이동해야 하는 거리를 계산한다.
function getForwardDistance(
  currentDistanceMeters: number,
  nextDistanceMeters: number,
  totalDistanceMeters: number,
) {
  const distanceMeters = nextDistanceMeters - currentDistanceMeters;

  return distanceMeters > 0
    ? distanceMeters
    : distanceMeters + totalDistanceMeters;
}

// 한 바퀴 운행 주기에서 주어진 시각이 포함된 이동 또는 정차 구간을 찾는다.
function findCycleSegment(
  segments: SimulationCycleSegment[],
  cycleSecond: number,
) {
  return (
    segments.find(
      (segment) =>
        cycleSecond >= segment.startSecond &&
        cycleSecond < segment.endSecond,
    ) ?? segments.at(-1)!
  );
}

// 거리나 시간이 범위를 넘어도 순환 경로나 한 바퀴 운행 주기 안의 값으로 되돌린다.
function wrap(value: number, maximum: number) {
  return ((value % maximum) + maximum) % maximum;
}
