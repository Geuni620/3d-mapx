import timetableJson from "./data/line-2-timetable.json?raw";
import { SEOUL_SUBWAY_OSM_NETWORK } from "./osm-subway-network";
import {
  createScheduledLeg,
  type SubwayTrainCarPose,
  type SubwayTrainMotion,
  type SubwayTrainSimulation,
} from "./line-2-train-simulation";
import {
  createSubwayRouteSampler,
  sampleSubwayRouteChordPose,
  type SubwayRouteSampler,
} from "./subway-route-sampler";
import {
  SUBWAY_TRAIN_CAR_LENGTH_METERS,
  SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
  SUBWAY_TRAIN_CAR_SPACING_METERS,
} from "./subway-train-dimensions";
import { LINE_2_MAIN_CAR_COUNT } from "./subway-train-model";

type ServiceDay = "DAY" | "SAT" | "END";
type Direction = "inner-loop" | "outer-loop";

interface TimetableData {
  edition: string;
  source: string;
  sha256: string;
  stations: Record<Direction, string[]>;
  // 방향, 첫 역 인덱스, 다음 역까지 주행 초·그 역에서 정차 초의 반복
  patterns: [Direction, number, ...number[]][];
  days: Record<ServiceDay, [number: string, departureSecond: number, pattern: number][]>;
}

const data: TimetableData = JSON.parse(timetableJson);
export const LINE_2_TIMETABLE_EDITION = data.edition;
export const LINE_2_TIMETABLE_SOURCE = data.source;
const HOUR = 3_600_000,
  DAY = 24 * HOUR;

// 한국천문연구원 월력자료와 공휴일에 관한 법률(2026-05-11 시행). 임시 운영시간표는 별도다.
// https://astro.kasi.re.kr/kor/life/post/calendarData?year=2026
// https://astro.kasi.re.kr/kor/life/post/calendarData?year=2027
const holidays = new Set([
  "2026-01-01",
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-03-01",
  "2026-03-02",
  "2026-05-01",
  "2026-05-05",
  "2026-05-24",
  "2026-05-25",
  "2026-06-03",
  "2026-06-06",
  "2026-07-17",
  "2026-08-15",
  "2026-08-17",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-10-03",
  "2026-10-05",
  "2026-10-09",
  "2026-12-25",
  "2027-01-01",
  "2027-02-06",
  "2027-02-07",
  "2027-02-08",
  "2027-02-09",
  "2027-03-01",
  "2027-05-01",
  "2027-05-03",
  "2027-05-05",
  "2027-05-13",
  "2027-06-06",
  "2027-07-17",
  "2027-07-19",
  "2027-08-15",
  "2027-08-16",
  "2027-09-14",
  "2027-09-15",
  "2027-09-16",
  "2027-10-03",
  "2027-10-04",
  "2027-10-09",
  "2027-10-11",
  "2027-12-25",
  "2027-12-27",
]);

function serviceMidnight(timestampMs: number) {
  return Math.floor((timestampMs + 9 * HOUR - 3 * HOUR) / DAY) * DAY - 9 * HOUR;
}

export function getLine2ServiceDay(timestampMs: number): ServiceDay {
  const localDate = new Date(serviceMidnight(timestampMs) + 9 * HOUR);
  if (localDate.getUTCDay() === 0 || holidays.has(localDate.toISOString().slice(0, 10)))
    return "END";
  return localDate.getUTCDay() === 6 ? "SAT" : "DAY";
}

export interface ScheduledTrain extends SubwayTrainSimulation {
  id: string;
  number: string;
  direction: Direction;
  sampler: SubwayRouteSampler;
  departureMs: number;
  arrivalMs: number;
  origin: string;
  destination: string;
  getStopEvent(
    timestampMs: number,
  ): { station: string; arrivalMs: number | null; departureMs: number } | null;
}

function prepareRoute(direction: Direction) {
  const route = SEOUL_SUBWAY_OSM_NETWORK.serviceRoutes.find((r) => r.direction === direction);
  const sampler = route && createSubwayRouteSampler(route.path);
  const names = data.stations[direction];
  if (
    !route ||
    !sampler ||
    route.stops.length !== names.length ||
    route.stops.some((s, i) => s.name.split("(")[0].replaceAll(" ", "") !== names[i])
  ) {
    throw new Error(`시간표 정차 순서와 ${direction} 선형이 다릅니다. 시간표를 재생성해 주세요.`);
  }
  return {
    sampler,
    // 당산의 두 stop_position은 각 진행 방향의 승강장 끝에 있다. 모형 기준점은 선두차 중심이다.
    stops: route.stops.map(stop => stop.name === "당산"
      ? { ...stop, distanceMeters: stop.distanceMeters - SUBWAY_TRAIN_CAR_LENGTH_METERS / 2 }
      : stop),
  };
}

const routes = {
  "inner-loop": prepareRoute("inner-loop"),
  "outer-loop": prepareRoute("outer-loop"),
};
const legCache = new Map<string, ReturnType<typeof createScheduledLeg>>();

function preparePattern([direction, first, ...durations]: TimetableData["patterns"][number]) {
  const route = routes[direction];
  const { totalDistanceMeters } = route.sampler;
  let departure = 0;
  const legs = [];
  for (let i = 0; i < durations.length; i += 2) {
    const station = (first + i / 2) % route.stops.length;
    const from = route.stops[station].distanceMeters;
    const to = route.stops[(station + 1) % route.stops.length].distanceMeters;
    const distance = to > from ? to - from : totalDistanceMeters - from + to;
    const travel = durations[i];
    const key = `${direction}:${station}:${travel}`;
    let sample = legCache.get(key);
    if (!sample) {
      sample = createScheduledLeg(distance, travel);
      legCache.set(key, sample);
    }
    const arrival = departure + travel;
    legs.push({ departure, arrival, from, to, sample });
    departure = arrival + durations[i + 1];
  }
  return { direction, first, route, legs, duration: departure };
}

const patterns = new Map<number, ReturnType<typeof preparePattern>>();
function getPattern(index: number) {
  let pattern = patterns.get(index);
  if (!pattern) {
    pattern = preparePattern(data.patterns[index]);
    patterns.set(index, pattern);
  }
  return pattern;
}

function createTrain(
  dayStart: number,
  row: TimetableData["days"][ServiceDay][number],
): ScheduledTrain {
  const [number, departure, patternIndex] = row;
  const { direction, first, route, legs, duration } = getPattern(patternIndex);
  const departureMs = dayStart + departure * 1_000;
  const arrivalMs = departureMs + duration * 1_000;
  const id = `${dayStart}/${direction}/${number}`;

  function findLegIndex(elapsed: number) {
    let low = 0,
      high = legs.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (legs[mid].departure <= elapsed) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  function getMotion(time: number): SubwayTrainMotion {
    const elapsed = (time - departureMs) / 1_000;
    const leg = legs[findLegIndex(elapsed)];
    if (elapsed < 0 || elapsed >= leg.arrival) {
      return {
        id,
        phase: "dwelling",
        motion: "dwelling",
        frontDistanceMeters: elapsed < 0 ? leg.from : leg.to,
        speedMetersPerSecond: 0,
        accelerationMetersPerSecondSquared: 0,
      };
    }
    const state = leg.sample(elapsed - leg.departure);
    return {
      id,
      phase: "moving",
      motion: state.motion,
      frontDistanceMeters: (leg.from + state.distanceMeters) % route.sampler.totalDistanceMeters,
      speedMetersPerSecond: state.speedMetersPerSecond,
      accelerationMetersPerSecondSquared: state.accelerationMetersPerSecondSquared,
    };
  }

  function getStopEvent(time: number) {
    if (time < departureMs || time >= arrivalMs) return null;
    const elapsed = (time - departureMs) / 1_000;
    const legIndex = findLegIndex(elapsed);
    const leg = legs[legIndex];
    // 역 사이에서는 현재 구간의 출발역, 정차 중에는 다음 구간의 출발역을 가리킨다.
    const stopIndex = elapsed >= leg.arrival ? legIndex + 1 : legIndex;
    const leaving = legs[stopIndex].departure;
    if (elapsed > leaving + 4) return null;
    return {
      station: data.stations[direction][(first + stopIndex) % route.stops.length],
      arrivalMs: stopIndex === 0 ? null : departureMs + legs[stopIndex - 1].arrival * 1_000,
      departureMs: departureMs + leaving * 1_000,
    };
  }

  function getCarPose(front: number, carIndex: number): SubwayTrainCarPose {
    const length = route.sampler.totalDistanceMeters;
    const distanceMeters = (front - SUBWAY_TRAIN_CAR_SPACING_METERS * carIndex + length) % length;
    return {
      carIndex,
      distanceMeters,
      ...sampleSubwayRouteChordPose(
        route.sampler,
        distanceMeters,
        SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
      ),
    };
  }

  return {
    id,
    number,
    departureMs,
    arrivalMs,
    direction,
    sampler: route.sampler,
    origin: data.stations[direction][first],
    destination: data.stations[direction][(first + legs.length) % route.stops.length],
    getMotion,
    getStopEvent,
    getLeadPose(time) {
      const state = getMotion(time);
      return { ...state, lead: getCarPose(state.frontDistanceMeters, 0) };
    },
    getState(time) {
      const state = getMotion(time);
      return {
        ...state,
        carPoses: Array.from({ length: LINE_2_MAIN_CAR_COUNT }, (_, i) =>
          getCarPose(state.frontDistanceMeters, i),
        ),
      };
    },
  };
}

let cachedMidnight = NaN,
  fleet: ScheduledTrain[] = [],
  active: ScheduledTrain[] = [];
let activeSince = Infinity,
  activeUntil = -Infinity;

// 영업일 안에서 동일한 차량 객체를 유지하고, 실제 시·종착 시각을 지날 때만 목록을 변경한다.
export function getScheduledFleet(timestampMs: number): ScheduledTrain[] {
  const midnight = serviceMidnight(timestampMs);
  if (midnight !== cachedMidnight) {
    cachedMidnight = midnight;
    fleet = data.days[getLine2ServiceDay(timestampMs)].map((row) => createTrain(midnight, row));
    activeSince = Infinity;
  }
  if (timestampMs >= activeSince && timestampMs < activeUntil) return active;
  active = [];
  activeSince = midnight + 3 * HOUR;
  activeUntil = activeSince + DAY;
  for (const train of fleet) {
    if (train.departureMs <= timestampMs && timestampMs < train.arrivalMs) active.push(train);
    for (const boundary of [train.departureMs, train.arrivalMs]) {
      if (boundary > timestampMs) activeUntil = Math.min(activeUntil, boundary);
      else activeSince = Math.max(activeSince, boundary);
    }
  }
  return active;
}
