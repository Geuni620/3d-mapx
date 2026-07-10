import type { SubwayCoordinate } from "./osm-subway-network";
import type { SubwayRouteSampler } from "./subway-route-sampler";

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
          const pose = options.sampler.sample(distanceMeters);

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

export function getKoreanMinuteOfDay(timestampMs: number) {
  return Math.floor(getKoreanSecondOfDay(timestampMs) / 60);
}

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

function wrap(value: number, maximum: number) {
  return ((value % maximum) + maximum) % maximum;
}

