import type { SubwayCoordinate } from "./osm-subway-network";
import {
  sampleSubwayRouteChordPose,
  type SubwayRouteSampler,
} from "./subway-route-sampler";
import { SUBWAY_TRAIN_BOGIE_OFFSET_METERS } from "./subway-train-dimensions";

const SECONDS_PER_DAY = 24 * 60 * 60;
const KOREAN_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

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
  carPoses: SubwayTrainCarPose[];
}

export interface SubwayTrainSimulation {
  getState: (timestampMs: number) => SubwayTrainSimulationState;
}

interface SubwayTrainSimulationOptions {
  id: string;
  sampler: SubwayRouteSampler;
  stopDistancesMeters: number[];
  carCount: number;
  carSpacingMeters: number;
  dwellSeconds: number;
  phaseOffsetSeconds: number;
  speedProfile: SubwaySpeedProfileEntry[];
}

interface SimulationTimelineSegment {
  startSecond: number;
  endSecond: number;
  startDistanceMeters: number;
  endDistanceMeters: number;
  phase: "moving" | "dwelling";
  speedMetersPerSecond: number;
}

// 운행 조건을 바탕으로 하루 시간표를 만들고, 특정 시각의 열차 위치와 상태를 계산할 수 있게 한다.
export function createSubwayTrainSimulation(
  options: SubwayTrainSimulationOptions,
): SubwayTrainSimulation {
  const timeline = createDailyTimeline(options);

  return {
    getState(timestampMs) {
      const simulationSecond = wrap(
        getKoreanSecondOfDay(timestampMs) + options.phaseOffsetSeconds,
        SECONDS_PER_DAY,
      );
      const segment = findTimelineSegment(timeline, simulationSecond);
      const elapsedSeconds = simulationSecond - segment.startSecond;
      const frontDistanceMeters =
        segment.phase === "dwelling"
          ? segment.startDistanceMeters
          : segment.startDistanceMeters +
            elapsedSeconds * segment.speedMetersPerSecond;

      return {
        id: options.id,
        phase: segment.phase,
        frontDistanceMeters: wrap(
          frontDistanceMeters,
          options.sampler.totalDistanceMeters,
        ),
        speedMetersPerSecond: segment.speedMetersPerSecond,
        carPoses: Array.from({ length: options.carCount }, (_, carIndex) => {
          const distanceMeters = wrap(
            frontDistanceMeters - carIndex * options.carSpacingMeters,
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
    const speed = getSpeedAtSecond(speedProfile, currentSecond);
    const nextSpeedBoundary = getNextSpeedBoundary(
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
    const arrivalSecond = currentSecond + remainingDistanceMeters / speed;
    const endSecond = Math.min(
      arrivalSecond,
      nextSpeedBoundary,
      SECONDS_PER_DAY,
    );
    const endDistanceMeters =
      currentDistanceMeters + (endSecond - currentSecond) * speed;

    timeline.push({
      startSecond: currentSecond,
      endSecond,
      startDistanceMeters: currentDistanceMeters,
      endDistanceMeters,
      phase: "moving",
      speedMetersPerSecond: speed,
    });
    currentSecond = endSecond;
    currentDistanceMeters = endDistanceMeters;

    if (arrivalSecond <= endSecond + Number.EPSILON) {
      currentDistanceMeters = targetDistanceMeters;
      nextStopIndex = (nextStopIndex + 1) % stops.length;
      currentSecond = addDwellingSegment(
        timeline,
        currentSecond,
        currentDistanceMeters,
        options.dwellSeconds,
      );
    }
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
      speedMetersPerSecond: 0,
    });
  }

  return endSecond;
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

// 현재 시각 이후에 운행 속도가 바뀌는 다음 시각을 찾는다.
function getNextSpeedBoundary(
  speedProfile: SubwaySpeedProfileEntry[],
  currentSecond: number,
) {
  return (
    speedProfile.find((entry) => entry.startMinute * 60 > currentSecond)
      ?.startMinute ??
    24 * 60
  ) * 60;
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
  return (
    timeline.find(
      (segment) =>
        currentSecond >= segment.startSecond &&
        currentSecond < segment.endSecond,
    ) ?? timeline.at(-1)!
  );
}

// 입력된 시각을 한국 기준으로 바꾸고, 자정부터 몇 초가 지났는지 반환한다.
function getKoreanSecondOfDay(timestampMs: number) {
  const parts = Object.fromEntries(
    KOREAN_TIME_FORMATTER.formatToParts(timestampMs).map((part) => [
      part.type,
      part.value,
    ]),
  );

  return (
    Number(parts.hour) * 60 * 60 +
    Number(parts.minute) * 60 +
    Number(parts.second)
  );
}

// 거리나 시간이 범위를 넘어도 순환 경로나 하루 안의 값으로 되돌린다.
function wrap(value: number, maximum: number) {
  return ((value % maximum) + maximum) % maximum;
}
