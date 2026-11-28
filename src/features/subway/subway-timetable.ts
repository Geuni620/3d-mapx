import timetableJson from "./data/subway-timetable.json?raw";
import { getLine2ServiceDay, getSubwayServiceMidnight } from "./line-2-timetable";
import { createScheduledLeg } from "./line-2-train-simulation";
import type { SubwayCoordinate } from "./osm-subway-network";
import type { SubwayLineNumber } from "./subway-constants";
import type { SubwayRouteSampler } from "./subway-route-sampler";
import { createElevatedSubwayRoute } from "./subway-elevation";

type ServiceDay = ReturnType<typeof getLine2ServiceDay>;
export type TimetableTrip = [
  line: SubwayLineNumber, start: number, end: number, pattern: number, carCount: 4 | 6 | 8 | 10,
  journey: number,
];
type TimetableLeg = [leg: number, travel: number, dwell: number, passesStation: 0 | 1];

interface Timetable {
  paths: SubwayCoordinate[][];
  legs: [path: number, fromMeters: number, toMeters: number][];
  patterns: TimetableLeg[][];
  journeys: [origin: string, destination: string][];
  days: Record<ServiceDay, TimetableTrip[]>;
}

const timetable: Timetable = JSON.parse(timetableJson);
const samplers = new Map<number, SubwayRouteSampler>();
const scheduledLegs = new Map<string, ReturnType<typeof createScheduledLeg>>();

export function getSubwayServiceSecond(timestampMs: number): number {
  return (timestampMs - getSubwayServiceMidnight(timestampMs)) / 1000;
}

export function getSubwayTripJourney(trip: TimetableTrip) {
  const [origin, destination] = timetable.journeys[trip[5]];
  return { origin, destination };
}

export function getActiveSubwayTrips(
  timestampMs: number,
  selectedLines: readonly SubwayLineNumber[],
): TimetableTrip[] {
  const seconds = getSubwayServiceSecond(timestampMs);
  return timetable.days[getLine2ServiceDay(timestampMs)].filter(
    ([line, start, end]) => selectedLines.includes(line) && start <= seconds && seconds < end,
  );
}

export function sampleSubwayTrip(
  [line, start, end, pattern, carCount]: TimetableTrip,
  seconds: number,
) {
  if (seconds < start || seconds >= end) return undefined;
  let elapsed = seconds - start;
  const legs = timetable.patterns[pattern];
  for (let index = 0; index < legs.length; index++) {
    const [leg, travel, dwell] = legs[index];
    if (elapsed < travel + dwell) {
      const [path, fromMeters] = timetable.legs[leg];
      let sampler = samplers.get(path);
      if (!sampler) {
        sampler = createElevatedSubwayRoute(line, timetable.paths[path], false);
        if (!sampler) return undefined;
        samplers.set(path, sampler);
      }
      const motion = sampleLegMotion(legs, index, elapsed);
      const distance = fromMeters + motion.distanceMeters;
      return {
        line,
        carCount,
        sampler,
        frontDistanceMeters: distance,
        front: sampler.sample(distance).coordinate,
        speedMetersPerSecond: motion.speedMetersPerSecond,
        dwelling: elapsed >= travel,
        dwellElapsedSeconds: Math.max(0, elapsed - travel),
        dwellSeconds: elapsed >= travel ? dwell : 0,
      };
    }
    elapsed -= travel + dwell;
  }
}

function averageLegSpeed([leg, travel]: TimetableLeg) {
  const [, start, end] = timetable.legs[leg];
  return (end - start) / travel;
}

function sampleLegMotion(legs: TimetableLeg[], index: number, elapsed: number) {
  const [leg, travel, , passesStation] = legs[index];
  const [, start, end] = timetable.legs[leg];
  const distance = end - start;
  if (elapsed >= travel) return { distanceMeters: distance, speedMetersPerSecond: 0 };

  const previous = legs[index - 1];
  const passesPreviousStation = Boolean(previous?.[3]);
  if (!passesStation && !passesPreviousStation) {
    const key = `${leg}:${travel}`;
    let sample = scheduledLegs.get(key);
    if (!sample) {
      sample = createScheduledLeg(distance, travel);
      scheduledLegs.set(key, sample);
    }
    return sample(elapsed);
  }

  // 통과 지점 양쪽에 같은 속도를 적용한다. 각 구간의 평균 속도 이하인 기울기는 역주행을 막는다.
  const average = distance / travel;
  const startSpeed = passesPreviousStation ? Math.min(average, averageLegSpeed(previous)) : 0;
  const endSpeed = passesStation ? Math.min(average, averageLegSpeed(legs[index + 1])) : 0;
  const t = elapsed / travel;
  const a = travel * (startSpeed + endSpeed) - 2 * distance;
  const b = 3 * distance - travel * (2 * startSpeed + endSpeed);
  return {
    distanceMeters: ((a * t + b) * t + travel * startSpeed) * t,
    speedMetersPerSecond: (3 * a * t * t + 2 * b * t) / travel + startSpeed,
  };
}
