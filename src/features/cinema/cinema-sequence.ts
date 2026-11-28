import { SEOUL_CENTER } from "../../app/map-config";
import { geographic, pointOnBridge, bridgeLength } from "../dangsan/bridge-alignment";
import { formatSeoulClock } from "../night-pulse/train-clock";
import { getScheduledFleet, getUpcomingStops } from "../subway/line-2-timetable";
import type { SubwayCoordinate } from "../subway/osm-subway-network";
import { SUBWAY_LINES, type SubwayLineNumber } from "../subway/subway-constants";
import { calculateCoordinateDistanceMeters, type SubwayRouteSampler } from "../subway/subway-route-sampler";
import { getActiveSubwayTrips, getSubwayServiceSecond, sampleSubwayTrip } from "../subway/subway-timetable";
import { LINE_2_MAIN_CAR_COUNT } from "../subway/subway-train-model";

export const CINEMA_IDLE_MS = 20_000;
export const CINEMA_ORBIT_MS = 24_000;
const SIDE_MS = 9_000;

const midBridge = pointOnBridge(bridgeLength / 2);
const bridgeCenter = geographic(midBridge.east, midBridge.south);
const downtown: SubwayCoordinate = [126.982, 37.564];
const gangnam: SubwayCoordinate = [127.035, 37.503];

type TrainPose = { sampler: SubwayRouteSampler; frontDistanceMeters: number };
export interface CinemaTrain {
  line: SubwayLineNumber;
  carCount: number;
  arrival: number;
  sample: (at: number) => TrainPose | undefined;
}
export type CinemaShot =
  | { kind: "orbit" }
  | { kind: "side"; train: CinemaTrain; bridge: boolean }
  | { kind: "front"; train: CinemaTrain }
  | { kind: "transfer"; train: CinemaTrain };

export function readCinemaOptions(search: URLSearchParams) {
  return { direct: search.get("cinema") === "1", clean: search.get("clean") === "1" };
}

export function shouldStartCinema(idleMs: number, reducedMotion: boolean, visible: boolean) {
  return idleMs >= CINEMA_IDLE_MS && !reducedMotion && visible;
}

export function isMorningPeak(at: number) {
  const local = formatSeoulClock(at);
  return local >= "07:30" && local < "09:30";
}

export function selectTrainShot(at: number): CinemaShot {
  const peak = isMorningPeak(at);
  let best: { score: number; shot: CinemaShot } | undefined;
  for (const train of getScheduledFleet(at)) {
    const [next] = getUpcomingStops(train, at, 1);
    if (!next || next.arrivalMs - at < SIDE_MS + 6_000) continue;
    const motion = train.getMotion(at);
    if (motion.speedMetersPerSecond < 2) continue;

    const front = train.sampler.sample(motion.frontDistanceMeters).coordinate;
    const previous = train.scheduledStops[train.scheduledStops.indexOf(next) - 1];
    const bridge = (previous.station === "당산" && next.station === "합정") ||
      (previous.station === "합정" && next.station === "당산");
    const distanceToBridge = calculateCoordinateDistanceMeters(front, bridgeCenter);
    const bridgeShot = bridge && distanceToBridge < 720;
    const distanceToCenter = Math.min(
      calculateCoordinateDistanceMeters(front, gangnam),
      calculateCoordinateDistanceMeters(front, downtown),
    );
    const score = peak
      ? distanceToCenter
      : bridgeShot ? distanceToBridge : 10_000 + distanceToBridge;
    if (best && best.score <= score) continue;

    best = {
      score,
      shot: {
        kind: "side",
        bridge: bridgeShot,
        train: {
          line: 2,
          carCount: LINE_2_MAIN_CAR_COUNT,
          arrival: next.arrivalMs,
          sample: (time) => time >= train.departureMs && time < train.arrivalMs
            ? { sampler: train.sampler, frontDistanceMeters: train.getMotion(time).frontDistanceMeters }
            : undefined,
        },
      },
    };
  }
  return best?.shot ?? selectTransferShot(at, 2, [SEOUL_CENTER.longitude, SEOUL_CENTER.latitude]);
}

export function selectTransferShot(at: number, previousLine: SubwayLineNumber, near: SubwayCoordinate): CinemaShot {
  const second = getSubwayServiceSecond(at);
  let best: { distance: number; train: CinemaTrain } | undefined;
  for (const trip of getActiveSubwayTrips(at, SUBWAY_LINES)) {
    if (trip[0] === previousLine || trip[0] === 2 || trip[2] - second < 11) continue;
    const pose = sampleSubwayTrip(trip, second);
    if (!pose || pose.speedMetersPerSecond < 2) continue;
    const distance = calculateCoordinateDistanceMeters(near, pose.front);
    if (best && best.distance <= distance) continue;

    const serviceMidnight = at - second * 1000;
    best = {
      distance,
      train: {
        line: pose.line,
        carCount: pose.carCount,
        arrival: serviceMidnight + trip[2] * 1000,
        sample: (time) => sampleSubwayTrip(trip, (time - serviceMidnight) / 1000),
      },
    };
  }
  return best ? { kind: "transfer", train: best.train } : { kind: "orbit" };
}

export function nextCinemaShot(shot: CinemaShot, elapsed: number, time: number, near: SubwayCoordinate, playing = true) {
  switch (shot.kind) {
    case "orbit":
      return elapsed >= CINEMA_ORBIT_MS ? selectTrainShot(time) : shot;
    case "side":
      if (time >= shot.train.arrival) return selectTransferShot(time, shot.train.line, near);
      return elapsed >= SIDE_MS ? { kind: "front", train: shot.train } as const : shot;
    case "front":
      return time >= shot.train.arrival || (!playing && elapsed >= SIDE_MS)
        ? selectTransferShot(time, shot.train.line, near) : shot;
    case "transfer":
      return elapsed >= 11_000 || time >= shot.train.arrival ? { kind: "orbit" } as const : shot;
  }
}
