import { SUBWAY_LINE_COLORS, type SubwayLineNumber } from "../subway/subway-constants";
import {
  BASE_HEADWAY_ASSUMPTION,
  FUTURE_SERVICE,
  FUTURE_SERVICE_OVERRIDES,
  futureServiceKind,
  TRAVEL_PARAMETERS,
  type TravelParameter,
} from "./travel-time-parameters";
import type { BaseGraph, Coordinate, FutureLine, ServiceDay } from "./travel-time-data";
import { isLineOpen, type TravelYear } from "./travel-years";

export interface TimeBand {
  id: string;
  label: string;
  day: ServiceDay;
  hour: number;
}

export const TIME_BANDS: TimeBand[] = [
  { id: "day08", label: "평일 08시", day: "DAY", hour: 8 },
  { id: "day13", label: "평일 13시", day: "DAY", hour: 13 },
  { id: "day18", label: "평일 18시", day: "DAY", hour: 18 },
  { id: "sat13", label: "토요일 13시", day: "SAT", hour: 13 },
  { id: "end13", label: "휴일 13시", day: "END", hour: 13 },
];

export interface StationComplex {
  id: string;
  name: string;
  coordinate: Coordinate;
  platforms: string[];
  /** 이 해에 새로 생긴 장래선 승강장이 있으면 그 노선 id */
  futureLines: string[];
  /** 장래선 역만으로 이뤄진 신설역 */
  isNew: boolean;
}

export interface Platform {
  id: string;
  name: string;
  complex: string;
  service: string;
  coordinate: Coordinate;
}

export interface ServiceInfo {
  id: string;
  label: string;
  color: string;
  future: boolean;
}

export interface ServiceRun {
  index: number;
  service: string;
  from: string;
  to: string;
  seconds: number;
  dwellSeconds: number;
  headwaySeconds: number;
  meters: number;
  approxMeters: number;
  path: Coordinate[];
}

export type TransferRule = "csv" | "csv-reverse" | "fallback" | "future" | "same" | "same-csv";

// 환승역거리 CSV의 노선 이름과 장래선 id 대응. GTX-A 서울역·수서는 이미 운행 중이라 실측값이 있다.
const EXTERNAL_LINE_NAMES: Record<string, string> = { GTXA_LINK: "GTX-A" };

export interface TravelNetwork {
  year: TravelYear;
  band: TimeBand;
  complexes: Map<string, StationComplex>;
  platforms: Map<string, Platform>;
  services: Map<string, ServiceInfo>;
  runs: ServiceRun[];
  runsFrom: Map<string, number[]>;
  continuations: Map<number, number[]>;
  transfers: Map<string, { to: string; seconds: number; rule: TransferRule }[]>;
  /** 같은 승강장 id에서 다른 계통으로 갈아탈 때 보행(초) */
  sameStationSeconds: Map<string, number>;
  openFutureLines: FutureLine[];
  assumptions: { metroSpeed: TravelParameter; metroHeadway: TravelParameter };
}

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** 1~8호선 전체 표정속도(정차 포함, 운행 표본 가중). 신설 도시·광역철도 가정값의 근거다. */
export function baseScheduledSpeedKmh(graph: BaseGraph) {
  let meters = 0;
  let seconds = 0;
  for (const [, , , run, dwell, samples, segment] of graph.runs) {
    meters += graph.segmentMeters[segment] * samples;
    seconds += (run + dwell) * samples;
  }
  return (meters / seconds) * 3.6;
}

/** 해당 시간대에 운행이 있는 1~8호선 구간 배차의 중앙값(분). */
export function baseMedianHeadwayMinutes(graph: BaseGraph, band: TimeBand) {
  const headways = graph.runs
    .map(run => trainsPerHour(graph, run[8], band))
    .filter(count => count > 0)
    .map(count => 60 / count);
  return median(headways);
}

function trainsPerHour(graph: BaseGraph, profiles: [number, number, number], band: TimeBand) {
  const profile = graph.profiles[profiles[graph.days.indexOf(band.day)]];
  return profile[band.hour - graph.hours[0]] ?? 0;
}


export function buildTravelNetwork(
  graph: BaseGraph,
  futureLines: FutureLine[],
  year: TravelYear,
  band: TimeBand,
): TravelNetwork {
  const complexes = new Map<string, StationComplex>();
  const platforms = new Map<string, Platform>();
  const services = new Map<string, ServiceInfo>();
  const runs: ServiceRun[] = [];
  const runsFrom = new Map<string, number[]>();
  const continuations = new Map<number, number[]>();
  const transfers = new Map<string, { to: string; seconds: number; rule: TransferRule }[]>();
  const { walkSpeed, transferFallback, futureTransfer } = TRAVEL_PARAMETERS;

  const addRun = (run: Omit<ServiceRun, "index">) => {
    const index = runs.push({ ...run, index: runs.length }) - 1;
    runsFrom.set(run.from, [...runsFrom.get(run.from) ?? [], index]);
    return index;
  };
  const addContinuation = (from: number, to: number) => {
    continuations.set(from, [...continuations.get(from) ?? [], to]);
  };
  const addTransfer = (from: string, to: string, seconds: number, rule: TransferRule) => {
    transfers.set(from, [...transfers.get(from) ?? [], { to, seconds, rule }]);
  };

  for (const station of graph.stations) {
    platforms.set(station.id, {
      id: station.id,
      name: station.name,
      complex: station.complex,
      service: String(station.line),
      coordinate: station.coordinate,
    });
    const complex = complexes.get(station.complex);
    const plainName = station.name.split("(")[0];
    if (complex) {
      complex.platforms.push(station.id);
      // 총신대입구(4호선)·이수(7호선)처럼 호선마다 역명이 다른 환승역
      if (!complex.name.split("·").includes(plainName)) complex.name = `${complex.name}·${plainName}`;
    } else complexes.set(station.complex, {
      id: station.complex,
      name: plainName,
      coordinate: station.coordinate,
      platforms: [station.id],
      futureLines: [],
      isNew: false,
    });
  }
  for (const line of new Set(graph.stations.map(station => station.line))) {
    services.set(String(line), {
      id: String(line),
      label: `${line}호선`,
      color: SUBWAY_LINE_COLORS[line as SubwayLineNumber] ?? "#888",
      future: false,
    });
  }

  // 기존선 구간: 해당 시간대 운행이 없는 구간은 탈 수 없다.
  const baseRunIndex = new Map<string, number>();
  for (const [line, from, to, seconds, dwellSeconds, , segment, reversed, profiles] of graph.runs) {
    const count = trainsPerHour(graph, profiles, band);
    if (count === 0) continue;
    const path = graph.segments[segment];
    const index = addRun({
      service: String(line),
      from: graph.stations[from].id,
      to: graph.stations[to].id,
      seconds,
      dwellSeconds,
      headwaySeconds: 3600 / count,
      meters: graph.segmentMeters[segment],
      approxMeters: 0,
      path: reversed ? path.toReversed() : path,
    });
    baseRunIndex.set(`${from}>${to}`, index);
  }
  for (const [from, via, to] of graph.continuations) {
    const first = baseRunIndex.get(`${from}>${via}`);
    const second = baseRunIndex.get(`${via}>${to}`);
    if (first !== undefined && second !== undefined) addContinuation(first, second);
  }
  for (const [from, to, meters, basis] of graph.transfers) {
    const seconds = meters === null ? transferFallback.value : meters / walkSpeed.value;
    addTransfer(graph.stations[from].id, graph.stations[to].id, seconds, basis ?? "fallback");
  }
  const sameStationSeconds = new Map(graph.sameLineTransfers.map(([station, meters]) => [
    graph.stations[station].id, meters / walkSpeed.value,
  ]));
  const externalMeters = new Map(graph.externalTransfers.map(([station, line, meters]) => [
    `${graph.stations[station].id}>${line}`, meters,
  ]));

  const metroSpeed: TravelParameter = {
    ...FUTURE_SERVICE.metro.speed,
    value: Math.round(baseScheduledSpeedKmh(graph) * 10) / 10,
  };
  const metroHeadway: TravelParameter = {
    ...BASE_HEADWAY_ASSUMPTION,
    value: Math.round(baseMedianHeadwayMinutes(graph, band) * 10) / 10,
  };

  const openFutureLines = futureLines.filter(line => line.routing.enabled && isLineOpen(line, year));
  for (const line of openFutureLines) {
    if (!line.routing.enabled) continue;
    const kind = futureServiceKind(line.lineType);
    const speed = FUTURE_SERVICE_OVERRIDES[line.id]?.speed ?? (kind === "gtx" ? FUTURE_SERVICE.gtx.speed : metroSpeed);
    const headway = FUTURE_SERVICE[kind].headway === "base-median" ? metroHeadway : FUTURE_SERVICE[kind].headway as TravelParameter;
    services.set(line.id, { id: line.id, label: line.shortName, color: line.color, future: true });

    for (const station of line.stations) {
      if (!station.coordinate || !line.routing.order.includes(station.id)) continue;
      const baseComplex = station.transferTo.map(id => platforms.get(id)?.complex).find(Boolean);
      const complexId = baseComplex ?? station.id;
      platforms.set(station.id, {
        id: station.id,
        name: station.name,
        complex: complexId,
        service: line.id,
        coordinate: station.coordinate,
      });
      const complex = complexes.get(complexId);
      if (complex) {
        complex.platforms.push(station.id);
        complex.futureLines.push(line.id);
      } else {
        complexes.set(complexId, {
          id: complexId,
          name: station.name,
          coordinate: station.coordinate,
          platforms: [station.id],
          futureLines: [line.id],
          isNew: true,
        });
      }
    }

    const forward: number[] = [];
    const backward: number[] = [];
    for (const segment of line.routing.segments) {
      const seconds = segment.meters / (speed.value / 3.6);
      const common = { service: line.id, seconds, dwellSeconds: 0, headwaySeconds: headway.value * 60, meters: segment.meters, approxMeters: segment.approxMeters };
      forward.push(addRun({ ...common, from: segment.from, to: segment.to, path: segment.path }));
      backward.unshift(addRun({ ...common, from: segment.to, to: segment.from, path: segment.path.toReversed() }));
    }
    for (const chain of [forward, backward]) {
      chain.slice(1).forEach((run, i) => addContinuation(chain[i], run));
    }
    const through = line.routing.through;
    if (through) {
      // 직결 운행: 기존 호선 종점을 갈아타지 않고 지난다.
      const into = baseRunIndex.get(`${graph.stations.findIndex(s => s.id === through.before)}>${graph.stations.findIndex(s => s.id === through.junction)}`);
      const outOf = baseRunIndex.get(`${graph.stations.findIndex(s => s.id === through.junction)}>${graph.stations.findIndex(s => s.id === through.before)}`);
      const first = forward.find(index => runs[index].from === through.junction);
      const last = backward.find(index => runs[index].to === through.junction);
      if (into !== undefined && first !== undefined) addContinuation(into, first);
      if (outOf !== undefined && last !== undefined) addContinuation(last, outOf);
    }
  }

  // 장래 승강장이 낀 같은 역 안 환승은 설계 기준 상한 가정값을 쓴다.
  for (const complex of complexes.values()) {
    for (const from of complex.platforms) {
      for (const to of complex.platforms) {
        if (from === to) continue;
        const fromFuture = services.get(platforms.get(from)!.service)!.future;
        const toFuture = services.get(platforms.get(to)!.service)!.future;
        if (!fromFuture && !toFuture) continue;
        // 기존 승강장↔GTX-A처럼 실측 거리가 있으면 그 값을 쓴다. 반대 방향도 같은 거리로 본다.
        const [basePlatform, futurePlatform] = fromFuture ? [to, from] : [from, to];
        const line = EXTERNAL_LINE_NAMES[platforms.get(futurePlatform)!.service];
        const meters = !fromFuture || !toFuture ? externalMeters.get(`${basePlatform}>${line}`) : undefined;
        if (meters) addTransfer(from, to, meters / walkSpeed.value, "csv");
        else addTransfer(from, to, futureTransfer.value, "future");
      }
    }
  }

  return {
    year,
    band,
    complexes,
    platforms,
    services,
    runs,
    runsFrom,
    continuations,
    transfers,
    sameStationSeconds,
    openFutureLines,
    assumptions: { metroSpeed, metroHeadway },
  };
}
