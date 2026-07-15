import type { SubwayCoordinate } from "./osm-subway-network";
import {
  sampleSubwayRouteChordPose,
  type SubwayRouteSampler,
} from "./subway-route-sampler";
import { SUBWAY_TRAIN_BOGIE_OFFSET_METERS } from "./subway-train-dimensions";

const SECONDS_PER_DAY = 24 * 60 * 60;
const KOREAN_UTC_OFFSET_SECONDS = 9 * 60 * 60;

export interface SubwaySpeedProfileEntry {
  startMinute: number;
  speedMetersPerSecond: number;
}

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
  accelerationMetersPerSecondSquared: number;
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
  dwellSeconds: number;
  phaseOffsetSeconds: number;
  speedProfile: SubwaySpeedProfileEntry[];
  maxAccelerationMetersPerSecondSquared?: number;
  maxDecelerationMetersPerSecondSquared?: number;
  maxJerkMetersPerSecondCubed?: number;
}

interface SimulationTimelineSegment {
  startSecond: number;
  endSecond: number;
  startDistanceMeters: number;
  endDistanceMeters: number;
  phase: "moving" | "dwelling";
  motion: "accelerating" | "cruising" | "braking" | "dwelling";
  startSpeedMetersPerSecond: number;
  startAccelerationMetersPerSecondSquared: number;
  jerkMetersPerSecondCubed: number;
}

interface MotionPhaseDefinition {
  durationSeconds: number;
  motion: "accelerating" | "cruising" | "braking";
  jerkMetersPerSecondCubed: number;
}

interface KinematicState {
  distanceMeters: number;
  speedMetersPerSecond: number;
  accelerationMetersPerSecondSquared: number;
}

const DEFAULT_MAX_ACCELERATION_METERS_PER_SECOND_SQUARED = 0.9;
const DEFAULT_MAX_DECELERATION_METERS_PER_SECOND_SQUARED = 1;
const DEFAULT_MAX_JERK_METERS_PER_SECOND_CUBED = 0.65;

// 운행 조건을 바탕으로 하루 시간표를 만들고, 특정 시각의 열차 위치와 상태를 계산할 수 있게 한다.
export function createSubwayTrainSimulation(
  options: SubwayTrainSimulationOptions,
): SubwayTrainSimulation {
  validateMotionLimits(options);
  const timeline = createDailyTimeline(options);

  return {
    getState(timestampMs) {
      const simulationSecond = wrap(
        getKoreanSecondOfDay(timestampMs) + options.phaseOffsetSeconds,
        SECONDS_PER_DAY,
      );
      const segment = findTimelineSegment(timeline, simulationSecond);
      const elapsedSeconds = simulationSecond - segment.startSecond;
      const kinematics = sampleTimelineSegment(segment, elapsedSeconds);

      return {
        id: options.id,
        phase: segment.phase,
        frontDistanceMeters: wrap(
          kinematics.distanceMeters,
          options.sampler.totalDistanceMeters,
        ),
        speedMetersPerSecond: kinematics.speedMetersPerSecond,
        accelerationMetersPerSecondSquared:
          kinematics.accelerationMetersPerSecondSquared,
        carPoses: Array.from({ length: options.carCount }, (_, carIndex) => {
          const distanceMeters = wrap(
            kinematics.distanceMeters - carIndex * options.carSpacingMeters,
            options.sampler.totalDistanceMeters,
          );
          const pose = sampleSubwayRouteChordPose(
            options.sampler,
            distanceMeters,
            SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
          );

          return {
            carIndex,
            distanceMeters,
            coordinate: pose.coordinate,
            headingRadians: pose.headingRadians,
          };
        }),
      };
    },
  };
}

// 입력된 시각을 한국 기준으로 바꾸고, 자정부터 몇 분이 지났는지 반환한다.
export function getKoreanMinuteOfDay(timestampMs: number) {
  return Math.floor(getKoreanSecondOfDay(timestampMs) / 60);
}

// 정차역과 속도 설정을 따라 하루 동안의 이동 구간과 정차 구간을 순서대로 만든다.
function createDailyTimeline(
  options: SubwayTrainSimulationOptions,
): SimulationTimelineSegment[] {
  const stops = normalizeStops(
    options.stopDistancesMeters,
    options.sampler.totalDistanceMeters,
  );
  const speedProfile = normalizeSpeedProfile(options.speedProfile);
  const timeline: SimulationTimelineSegment[] = [];
  let currentSecond = 0;
  let currentDistanceMeters = stops[0];
  let nextStopIndex = stops.length > 1 ? 1 : 0;

  currentSecond = addDwellingSegment(
    timeline,
    currentSecond,
    currentDistanceMeters,
    options.dwellSeconds,
  );

  while (currentSecond < SECONDS_PER_DAY) {
    const targetSpeedMetersPerSecond = getSpeedAtSecond(
      speedProfile,
      currentSecond,
    );
    const targetDistanceMeters = getNextStopDistance(
      stops,
      nextStopIndex,
      currentDistanceMeters,
      options.sampler.totalDistanceMeters,
    );
    const remainingDistanceMeters =
      targetDistanceMeters - currentDistanceMeters;
    const motionPhases = createJerkLimitedMotionPhases(
      remainingDistanceMeters,
      targetSpeedMetersPerSecond,
      options.maxAccelerationMetersPerSecondSquared ??
        DEFAULT_MAX_ACCELERATION_METERS_PER_SECOND_SQUARED,
      options.maxDecelerationMetersPerSecondSquared ??
        DEFAULT_MAX_DECELERATION_METERS_PER_SECOND_SQUARED,
      options.maxJerkMetersPerSecondCubed ??
        DEFAULT_MAX_JERK_METERS_PER_SECOND_CUBED,
    );

    const movement = appendMotionPhases(
      timeline,
      motionPhases,
      currentSecond,
      currentDistanceMeters,
    );

    currentSecond = movement.endSecond;
    currentDistanceMeters = movement.state.distanceMeters;

    if (!movement.completed || currentSecond >= SECONDS_PER_DAY) {
      break;
    }

    currentDistanceMeters = targetDistanceMeters;
    nextStopIndex = (nextStopIndex + 1) % stops.length;
    currentSecond = addDwellingSegment(
      timeline,
      currentSecond,
      currentDistanceMeters,
      options.dwellSeconds,
    );
  }

  return timeline;
}

// 열차가 한 역에서 움직이지 않고 머무르는 시간을 운행 시간표에 추가한다.
function addDwellingSegment(
  timeline: SimulationTimelineSegment[],
  startSecond: number,
  distanceMeters: number,
  dwellSeconds: number,
) {
  const endSecond = Math.min(startSecond + dwellSeconds, SECONDS_PER_DAY);

  if (endSecond > startSecond) {
    timeline.push({
      startSecond,
      endSecond,
      startDistanceMeters: distanceMeters,
      endDistanceMeters: distanceMeters,
      phase: "dwelling",
      motion: "dwelling",
      startSpeedMetersPerSecond: 0,
      startAccelerationMetersPerSecondSquared: 0,
      jerkMetersPerSecondCubed: 0,
    });
  }

  return endSecond;
}

function createJerkLimitedMotionPhases(
  distanceMeters: number,
  targetSpeedMetersPerSecond: number,
  maxAccelerationMetersPerSecondSquared: number,
  maxDecelerationMetersPerSecondSquared: number,
  maxJerkMetersPerSecondCubed: number,
): MotionPhaseDefinition[] {
  const peakSpeedMetersPerSecond = solvePeakSpeed(
    distanceMeters,
    targetSpeedMetersPerSecond,
    maxAccelerationMetersPerSecondSquared,
    maxDecelerationMetersPerSecondSquared,
    maxJerkMetersPerSecondCubed,
  );
  const accelerationRamp = createRampDurations(
    peakSpeedMetersPerSecond,
    maxAccelerationMetersPerSecondSquared,
    maxJerkMetersPerSecondCubed,
  );
  const brakingRamp = createRampDurations(
    peakSpeedMetersPerSecond,
    maxDecelerationMetersPerSecondSquared,
    maxJerkMetersPerSecondCubed,
  );
  const rampDistanceMeters =
    (peakSpeedMetersPerSecond *
      (accelerationRamp.totalDurationSeconds +
        brakingRamp.totalDurationSeconds)) /
    2;
  const cruiseDurationSeconds =
    peakSpeedMetersPerSecond > 0
      ? Math.max(0, distanceMeters - rampDistanceMeters) /
        peakSpeedMetersPerSecond
      : 0;

  return [
    createMotionPhase(
      accelerationRamp.jerkDurationSeconds,
      "accelerating",
      maxJerkMetersPerSecondCubed,
    ),
    createMotionPhase(
      accelerationRamp.constantAccelerationDurationSeconds,
      "accelerating",
      0,
    ),
    createMotionPhase(
      accelerationRamp.jerkDurationSeconds,
      "accelerating",
      -maxJerkMetersPerSecondCubed,
    ),
    createMotionPhase(cruiseDurationSeconds, "cruising", 0),
    createMotionPhase(
      brakingRamp.jerkDurationSeconds,
      "braking",
      -maxJerkMetersPerSecondCubed,
    ),
    createMotionPhase(
      brakingRamp.constantAccelerationDurationSeconds,
      "braking",
      0,
    ),
    createMotionPhase(
      brakingRamp.jerkDurationSeconds,
      "braking",
      maxJerkMetersPerSecondCubed,
    ),
  ].filter((phase) => phase.durationSeconds > Number.EPSILON);
}

function solvePeakSpeed(
  distanceMeters: number,
  targetSpeedMetersPerSecond: number,
  maxAccelerationMetersPerSecondSquared: number,
  maxDecelerationMetersPerSecondSquared: number,
  maxJerkMetersPerSecondCubed: number,
) {
  const getRampDistance = (speedMetersPerSecond: number) => {
    const accelerationRamp = createRampDurations(
      speedMetersPerSecond,
      maxAccelerationMetersPerSecondSquared,
      maxJerkMetersPerSecondCubed,
    );
    const brakingRamp = createRampDurations(
      speedMetersPerSecond,
      maxDecelerationMetersPerSecondSquared,
      maxJerkMetersPerSecondCubed,
    );

    return (
      (speedMetersPerSecond *
        (accelerationRamp.totalDurationSeconds +
          brakingRamp.totalDurationSeconds)) /
      2
    );
  };

  if (getRampDistance(targetSpeedMetersPerSecond) <= distanceMeters) {
    return targetSpeedMetersPerSecond;
  }

  let minimumSpeed = 0;
  let maximumSpeed = targetSpeedMetersPerSecond;

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const candidateSpeed = (minimumSpeed + maximumSpeed) / 2;

    if (getRampDistance(candidateSpeed) <= distanceMeters) {
      minimumSpeed = candidateSpeed;
    } else {
      maximumSpeed = candidateSpeed;
    }
  }

  return minimumSpeed;
}

function createRampDurations(
  targetSpeedMetersPerSecond: number,
  maxAccelerationMetersPerSecondSquared: number,
  maxJerkMetersPerSecondCubed: number,
) {
  const speedAtMaximumAcceleration =
    (maxAccelerationMetersPerSecondSquared ** 2) /
    maxJerkMetersPerSecondCubed;
  const jerkDurationSeconds =
    targetSpeedMetersPerSecond <= speedAtMaximumAcceleration
      ? Math.sqrt(
          targetSpeedMetersPerSecond / maxJerkMetersPerSecondCubed,
        )
      : maxAccelerationMetersPerSecondSquared /
        maxJerkMetersPerSecondCubed;
  const constantAccelerationDurationSeconds =
    targetSpeedMetersPerSecond <= speedAtMaximumAcceleration
      ? 0
      : targetSpeedMetersPerSecond /
          maxAccelerationMetersPerSecondSquared -
        jerkDurationSeconds;

  return {
    jerkDurationSeconds,
    constantAccelerationDurationSeconds,
    totalDurationSeconds:
      jerkDurationSeconds * 2 + constantAccelerationDurationSeconds,
  };
}

function createMotionPhase(
  durationSeconds: number,
  motion: MotionPhaseDefinition["motion"],
  jerkMetersPerSecondCubed: number,
): MotionPhaseDefinition {
  return { durationSeconds, motion, jerkMetersPerSecondCubed };
}

function appendMotionPhases(
  timeline: SimulationTimelineSegment[],
  phases: MotionPhaseDefinition[],
  startSecond: number,
  startDistanceMeters: number,
) {
  let currentSecond = startSecond;
  let state: KinematicState = {
    distanceMeters: startDistanceMeters,
    speedMetersPerSecond: 0,
    accelerationMetersPerSecondSquared: 0,
  };

  for (const phase of phases) {
    const availableDurationSeconds = SECONDS_PER_DAY - currentSecond;
    const durationSeconds = Math.min(
      phase.durationSeconds,
      availableDurationSeconds,
    );
    const endState = integrateKinematics(
      state,
      phase.jerkMetersPerSecondCubed,
      durationSeconds,
    );

    timeline.push({
      startSecond: currentSecond,
      endSecond: currentSecond + durationSeconds,
      startDistanceMeters: state.distanceMeters,
      endDistanceMeters: endState.distanceMeters,
      phase: "moving",
      motion: phase.motion,
      startSpeedMetersPerSecond: state.speedMetersPerSecond,
      startAccelerationMetersPerSecondSquared:
        state.accelerationMetersPerSecondSquared,
      jerkMetersPerSecondCubed: phase.jerkMetersPerSecondCubed,
    });
    currentSecond += durationSeconds;
    state = endState;

    if (durationSeconds < phase.durationSeconds) {
      return { endSecond: currentSecond, state, completed: false };
    }
  }

  return { endSecond: currentSecond, state, completed: true };
}

function sampleTimelineSegment(
  segment: SimulationTimelineSegment,
  elapsedSeconds: number,
): KinematicState {
  if (segment.phase === "dwelling") {
    return {
      distanceMeters: segment.startDistanceMeters,
      speedMetersPerSecond: 0,
      accelerationMetersPerSecondSquared: 0,
    };
  }

  return integrateKinematics(
    {
      distanceMeters: segment.startDistanceMeters,
      speedMetersPerSecond: segment.startSpeedMetersPerSecond,
      accelerationMetersPerSecondSquared:
        segment.startAccelerationMetersPerSecondSquared,
    },
    segment.jerkMetersPerSecondCubed,
    elapsedSeconds,
  );
}

function integrateKinematics(
  state: KinematicState,
  jerkMetersPerSecondCubed: number,
  elapsedSeconds: number,
): KinematicState {
  const elapsedSquared = elapsedSeconds ** 2;

  return {
    distanceMeters:
      state.distanceMeters +
      state.speedMetersPerSecond * elapsedSeconds +
      (state.accelerationMetersPerSecondSquared * elapsedSquared) / 2 +
      (jerkMetersPerSecondCubed * elapsedSeconds ** 3) / 6,
    speedMetersPerSecond:
      state.speedMetersPerSecond +
      state.accelerationMetersPerSecondSquared * elapsedSeconds +
      (jerkMetersPerSecondCubed * elapsedSquared) / 2,
    accelerationMetersPerSecondSquared:
      state.accelerationMetersPerSecondSquared +
      jerkMetersPerSecondCubed * elapsedSeconds,
  };
}

// 역 위치를 한 바퀴 경로 안으로 맞추고, 중복을 제거한 뒤 이동 순서대로 정렬한다.
function normalizeStops(stopDistances: number[], totalDistanceMeters: number) {
  const stops = Array.from(
    new Set(
      stopDistances.map((distanceMeters) =>
        Number(wrap(distanceMeters, totalDistanceMeters).toFixed(3)),
      ),
    ),
  ).sort((first, second) => first - second);

  return stops.length > 0 ? stops : [0];
}

// 사용할 수 없는 속도 설정을 제외하고 시간순으로 정렬한 뒤, 자정부터 설정되었는지 확인한다.
function normalizeSpeedProfile(speedProfile: SubwaySpeedProfileEntry[]) {
  const normalized = speedProfile
    .filter(
      (entry) =>
        entry.startMinute >= 0 &&
        entry.startMinute < 24 * 60 &&
        entry.speedMetersPerSecond > 0,
    )
    .sort((first, second) => first.startMinute - second.startMinute);

  if (normalized.length === 0 || normalized[0].startMinute !== 0) {
    throw new Error("A speed profile must start at minute 0");
  }

  return normalized;
}

// 주어진 시각에 적용해야 하는 열차의 운행 속도를 찾는다.
function getSpeedAtSecond(
  speedProfile: SubwaySpeedProfileEntry[],
  currentSecond: number,
) {
  const currentMinute = Math.floor(currentSecond / 60);

  return speedProfile.reduce(
    (speed, entry) =>
      entry.startMinute <= currentMinute
        ? entry.speedMetersPerSecond
        : speed,
    speedProfile[0].speedMetersPerSecond,
  );
}

// 순환 경로에서 현재 위치보다 앞에 있는 다음 역까지의 누적 거리를 계산한다.
function getNextStopDistance(
  stops: number[],
  nextStopIndex: number,
  currentDistanceMeters: number,
  totalDistanceMeters: number,
) {
  const wrappedCurrentDistance = wrap(
    currentDistanceMeters,
    totalDistanceMeters,
  );
  let targetDistance = stops[nextStopIndex];

  if (targetDistance <= wrappedCurrentDistance + 0.001) {
    targetDistance += totalDistanceMeters;
  }

  return (
    currentDistanceMeters - wrappedCurrentDistance + targetDistance
  );
}

// 하루 운행 시간표에서 주어진 시각이 포함된 이동 또는 정차 구간을 찾는다.
function findTimelineSegment(
  timeline: SimulationTimelineSegment[],
  currentSecond: number,
) {
  let lowerIndex = 0;
  let upperIndex = timeline.length - 1;

  while (lowerIndex <= upperIndex) {
    const middleIndex = Math.floor((lowerIndex + upperIndex) / 2);
    const segment = timeline[middleIndex];

    if (currentSecond < segment.startSecond) {
      upperIndex = middleIndex - 1;
    } else if (currentSecond >= segment.endSecond) {
      lowerIndex = middleIndex + 1;
    } else {
      return segment;
    }
  }

  return timeline.at(-1)!;
}

// 입력된 시각을 한국 기준으로 바꾸고, 자정부터 몇 초가 지났는지 반환한다.
function getKoreanSecondOfDay(timestampMs: number) {
  return wrap(
    timestampMs / 1_000 + KOREAN_UTC_OFFSET_SECONDS,
    SECONDS_PER_DAY,
  );
}

function validateMotionLimits(options: SubwayTrainSimulationOptions) {
  const limits = [
    options.maxAccelerationMetersPerSecondSquared ??
      DEFAULT_MAX_ACCELERATION_METERS_PER_SECOND_SQUARED,
    options.maxDecelerationMetersPerSecondSquared ??
      DEFAULT_MAX_DECELERATION_METERS_PER_SECOND_SQUARED,
    options.maxJerkMetersPerSecondCubed ??
      DEFAULT_MAX_JERK_METERS_PER_SECOND_CUBED,
  ];

  if (limits.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("Train motion limits must be positive finite numbers");
  }
}

// 거리나 시간이 범위를 넘어도 순환 경로나 하루 안의 값으로 되돌린다.
function wrap(value: number, maximum: number) {
  return ((value % maximum) + maximum) % maximum;
}
