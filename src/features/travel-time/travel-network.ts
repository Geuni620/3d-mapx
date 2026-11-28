import { SUBWAY_LINE_COLORS, type SubwayLineNumber } from "../subway/subway-constants";
import {
  BASE_HEADWAY_ASSUMPTION,
  FUTURE_SERVICE,
  FUTURE_SERVICE_OVERRIDES,
  futureServiceKind,
  REGIONAL_SERVICE,
  type ParameterStatus,
  type ServiceGroupParameters,
  type ServiceTiming,
  TRAVEL_PARAMETERS,
  type TravelParameter,
} from "./travel-time-parameters";
import type { BaseGraph, Coordinate, FutureLine } from "./travel-time-data";
import type { TimeBand } from "./travel-bands";
import { REGIONAL_CSV_NAMES, type RegionalLine, type RegionalService, type RegionalTiming } from "./travel-regional";
import { isLineOpen, type TravelYear } from "./travel-years";

export { TIME_BANDS, type TimeBand } from "./travel-bands";

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
  /** 1~8호선 밖 기준망 노선 */
  regional?: boolean;
}

export interface ServiceGroupBasis {
  label: string;
  speed: TravelParameter;
  headway: TravelParameter;
  /** end-to-end 근거일 때 출처의 소요시간 */
  timing?: TravelParameter;
}

/** 기준망 노선의 차내시간·배차 근거. 시간표가 있으면 timetable, 없으면 노선별 출처값/가정값 */
export type RegionalBasis =
  | { kind: "timetable"; status: ParameterStatus; timing: RegionalTiming }
  | { kind: "parameters"; status: ParameterStatus; groups: ServiceGroupBasis[] };

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
  regionalLines: RegionalLine[];
  regionalParameters: Map<string, RegionalBasis>;
  /** 이 해에 계산에 쓴 장래선 표정속도 */
  futureSpeeds: Map<string, TravelParameter>;
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


/** 같은 이름의 역을 한 환승역으로 묶는 최대 거리(m). 경의중앙선 신촌(2호선 신촌과 약 690m, 환승역 아님)을 가른다. */
const SAME_NAME_COMPLEX_METERS = 600;

function distanceMeters(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
}

function resolveTiming(line: RegionalLine, timing: ServiceTiming | undefined, candidates: RegionalService[], fallback: TravelParameter) {
  if (!timing) return { speed: fallback };
  if (timing.basis === "speed") return { speed: timing.parameter };
  // 출처의 두 역 사이 소요시간을 OSM 선로 거리로 나눠 표정속도를 구한다.
  const runMeters = new Map(line.runs.map(run => [`${run.from}>${run.to}`, run.meters]));
  for (const service of candidates) {
    const start = service.stops.indexOf(`${line.id}:${timing.from}`);
    const end = service.stops.indexOf(`${line.id}:${timing.to}`);
    if (start < 0 || end <= start) continue;
    let meters = 0;
    for (let i = start; i < end; i++) meters += runMeters.get(`${service.stops[i]}>${service.stops[i + 1]}`) ?? 0;
    const kmh = Math.round((meters / (timing.parameter.value * 60)) * 3.6 * 10) / 10;
    return {
      timing: timing.parameter,
      speed: {
        ...timing.parameter,
        label: `${line.shortName} ${timing.from}–${timing.to} 표정속도`,
        value: kmh,
        unit: "km/h",
        note: `${timing.from}–${timing.to} ${timing.parameter.value}분 ÷ OSM 선로 ${(meters / 1000).toFixed(1)}km로 산출`,
      },
    };
  }
  return { speed: fallback };
}

function pathMeters(path: Coordinate[]) {
  return path.slice(1).reduce((sum, point, i) => sum + distanceMeters(path[i], point), 0);
}

/** 시간표에만 있는 급행 구간(정차역 건너뜀)의 선형: OSM 계통에서 두 역 사이를 잇는다. 없으면 직선. */
function composePath(line: RegionalLine, from: string, to: string): Coordinate[] {
  const runMeta = new Map(line.runs.map(run => [`${run.from}>${run.to}`, run.path]));
  for (const service of line.services) {
    const start = service.stops.indexOf(from);
    const end = service.stops.indexOf(to);
    if (start < 0 || end <= start) continue;
    const pieces = service.stops.slice(start, end).map((stop, i) => runMeta.get(`${stop}>${service.stops[start + i + 1]}`));
    if (pieces.every(Boolean)) return pieces.flatMap((piece, i) => (i === 0 ? piece! : piece!.slice(1)));
  }
  const coordinate = (id: string) => line.stations.find(station => station.id === id)!.coordinate;
  return [coordinate(from), coordinate(to)];
}

const STATUS_ORDER: ParameterStatus[] = ["출처", "문헌 가정", "가정값"];
function worstStatus(statuses: ParameterStatus[]) {
  return statuses.reduce((worst, status) => STATUS_ORDER.indexOf(status) > STATUS_ORDER.indexOf(worst) ? status : worst, "출처" as ParameterStatus);
}

/** 장래선 출처 소요시간(두 역 사이)을 선형 거리로 나눈 표정속도 */
function futureTimingSpeed(line: FutureLine, timing: { parameter: TravelParameter; from: string; to: string } | undefined): TravelParameter | undefined {
  if (!timing || !line.routing.enabled) return undefined;
  const order = line.routing.order.map(id => id.split(":").at(-1));
  const start = order.indexOf(timing.from);
  const end = order.indexOf(timing.to);
  if (start < 0 || end < 0) return undefined;
  const [lo, hi] = start < end ? [start, end] : [end, start];
  const meters = line.routing.segments.slice(lo, hi).reduce((sum, segment) => sum + segment.meters, 0);
  return {
    ...timing.parameter,
    label: `${line.shortName} 표정속도`,
    value: Math.round((meters / (timing.parameter.value * 60)) * 3.6 * 10) / 10,
    unit: "km/h",
    note: `${timing.from}–${timing.to} ${timing.parameter.value}분 ÷ 선형 ${(meters / 1000).toFixed(1)}km로 산출`,
  };
}

export function buildTravelNetwork(
  graph: BaseGraph,
  futureLines: FutureLine[],
  year: TravelYear,
  band: TimeBand,
  regionalLines: RegionalLine[] = [],
  regionalTimings: Record<string, RegionalTiming> = {},
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
  const metroSpeed: TravelParameter = {
    ...FUTURE_SERVICE.metro.speed,
    value: Math.round(baseScheduledSpeedKmh(graph) * 10) / 10,
  };
  const metroHeadway: TravelParameter = {
    ...BASE_HEADWAY_ASSUMPTION,
    value: Math.round(baseMedianHeadwayMinutes(graph, band) * 10) / 10,
  };

  // 1~8호선 밖 기준망 노선(2026 현재 운행)
  const regionalParameters = new Map<string, RegionalBasis>();
  const externalCsvMeters = new Map(graph.externalTransfers.map(([station, line, meters]) => [
    `${graph.stations[station].id}>${line}`, meters,
  ]));
  for (const line of regionalLines) {
    services.set(line.id, { id: line.id, label: line.shortName, color: line.color, future: false, regional: true });
    for (const station of line.stations) {
      const named = complexes.get(station.name);
      const complexId = !named || distanceMeters(named.coordinate, station.coordinate) <= SAME_NAME_COMPLEX_METERS
        ? station.name
        : station.id;
      platforms.set(station.id, { id: station.id, name: station.name, complex: complexId, service: line.id, coordinate: station.coordinate });
      const complex = complexes.get(complexId);
      if (complex) complex.platforms.push(station.id);
      else complexes.set(complexId, { id: complexId, name: station.name, coordinate: station.coordinate, platforms: [station.id], futureLines: [], isNew: false });
    }
    const runMeta = new Map(line.runs.map(run => [`${run.from}>${run.to}`, run]));
    const timetable = regionalTimings[line.id];
    if (timetable) {
      regionalParameters.set(line.id, { kind: "timetable", status: "출처", timing: timetable });
      addTimetableRuns(line, timetable, runMeta);
    } else {
      const groups = addParameterRuns(line, runMeta);
      regionalParameters.set(line.id, { kind: "parameters", status: worstStatus(groups.flatMap(group => [group.speed.status, group.headway.status])), groups });
    }
  }

  function addTimetableRuns(line: RegionalLine, timetable: RegionalTiming, runMeta: Map<string, RegionalLine["runs"][number]>) {
    const dayIndex = timetable.days.indexOf(band.day);
    const index = new Map<string, number>();
    for (const [from, to, seconds, dwellSeconds, , profiles] of timetable.runs) {
      const count = timetable.profiles[profiles[dayIndex]][band.hour - timetable.hours[0]] ?? 0;
      if (count === 0) continue;
      const meta = runMeta.get(`${from}>${to}`);
      const path = meta?.path ?? composePath(line, from, to);
      index.set(`${from}>${to}`, addRun({
        service: line.id,
        from,
        to,
        seconds,
        dwellSeconds,
        headwaySeconds: 3600 / count,
        meters: meta?.meters ?? pathMeters(path),
        approxMeters: meta?.approx ? meta.meters : 0,
        path,
      }));
    }
    for (const [a, b, c] of timetable.continuations) {
      const first = index.get(`${a}>${b}`);
      const second = index.get(`${b}>${c}`);
      if (first !== undefined && second !== undefined) addContinuation(first, second);
    }
  }

  function addParameterRuns(line: RegionalLine, runMeta: Map<string, RegionalLine["runs"][number]>): ServiceGroupBasis[] {
    const config = REGIONAL_SERVICE[line.id] ?? {};
    const groups: { label: string; services: RegionalService[]; config: ServiceGroupParameters }[] = [];
    if (config.byStation) {
      for (const [station, groupConfig] of Object.entries(config.byStation)) {
        groups.push({ label: `${station} 계통`, services: line.services.filter(service => service.stops.includes(`${line.id}:${station}`)), config: groupConfig });
      }
    } else {
      groups.push({ label: "완행", services: line.services.filter(service => !service.express), config });
      const express = line.services.filter(service => service.express);
      if (express.length) groups.push({ label: "급행", services: express, config: config.express ?? config });
    }
    return groups.map(group => {
      const fallbackSpeed: TravelParameter = { ...metroSpeed, label: `${line.shortName} 표정속도` };
      const fallbackHeadway: TravelParameter = { ...metroHeadway, label: `${line.shortName} 배차간격` };
      const resolved = resolveTiming(line, group.config.timing, group.services, fallbackSpeed);
      const headway = group.config.headway?.(band) ?? fallbackHeadway;
      const index = new Map<string, number>();
      for (const service of group.services) {
        const chain = service.stops.slice(1).map((stop, i) => {
          const key = `${service.stops[i]}>${stop}`;
          if (index.has(key)) return index.get(key);
          const meta = runMeta.get(key);
          if (!meta) return undefined;
          const run = addRun({
            service: line.id,
            from: meta.from,
            to: meta.to,
            seconds: meta.meters / (resolved.speed.value / 3.6),
            dwellSeconds: 0,
            headwaySeconds: headway.value * 60,
            meters: meta.meters,
            approxMeters: meta.approx ? meta.meters : 0,
            path: meta.path,
          });
          index.set(key, run);
          return run;
        });
        chain.slice(1).forEach((run, i) => {
          const previous = chain[i];
          if (previous !== undefined && run !== undefined && !(continuations.get(previous) ?? []).includes(run)) addContinuation(previous, run);
        });
      }
      return { label: group.label, speed: resolved.speed, headway, timing: resolved.timing };
    });
  }

  const openFutureLines = futureLines.filter(line => line.routing.enabled && isLineOpen(line, year));
  const futureSpeeds = new Map<string, TravelParameter>();
  for (const line of openFutureLines) {
    if (!line.routing.enabled) continue;
    const kind = futureServiceKind(line.lineType);
    const override = FUTURE_SERVICE_OVERRIDES[line.id];
    const speed = override?.speed ?? futureTimingSpeed(line, override?.timing) ?? (kind === "gtx" ? FUTURE_SERVICE.gtx.speed : metroSpeed);
    futureSpeeds.set(line.id, speed);
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
    // 직결 운행: 기존 노선의 끝 역(junction)을 갈아타지 않고 지난다. 되돌아가는 조합은 막는다.
    for (const junction of through?.junctions ?? []) {
      const own = [...forward, ...backward];
      for (const run of runs) {
        if (run.service !== through!.service) continue;
        if (run.to === junction) {
          for (const next of own) if (runs[next].from === junction && runs[next].to !== run.from) addContinuation(run.index, next);
        }
        if (run.from === junction) {
          for (const previous of own) if (runs[previous].to === junction && runs[previous].from !== run.to) addContinuation(previous, run.index);
        }
      }
    }
  }

  // 같은 역 안의 나머지 환승. 1~8호선끼리는 위에서 넣었다.
  for (const complex of complexes.values()) {
    for (const from of complex.platforms) {
      for (const to of complex.platforms) {
        if (from === to) continue;
        const fromService = services.get(platforms.get(from)!.service)!;
        const toService = services.get(platforms.get(to)!.service)!;
        const fromFuture = fromService.future;
        const toFuture = toService.future;
        if (!fromFuture && !toFuture) {
          if (!fromService.regional && !toService.regional) continue;
          // 1~8호선↔광역: 서울교통공사 CSV(1~8호선 → 그 노선). 광역→1~8호선은 반대 방향 값을 쓴다.
          const [basePlatform, regional, rule] = !fromService.regional
            ? [from, toService.id, "csv" as const]
            : !toService.regional ? [to, fromService.id, "csv-reverse" as const] : [null, null, null];
          const meters = basePlatform && regional ? externalCsvMeters.get(`${basePlatform}>${REGIONAL_CSV_NAMES[regional]}`) : undefined;
          if (meters && rule) addTransfer(from, to, meters / walkSpeed.value, rule);
          else addTransfer(from, to, transferFallback.value, "fallback");
          continue;
        }
        // 기존 승강장↔GTX-A처럼 실측 거리가 있으면 그 값을 쓴다. 반대 방향도 같은 거리로 본다.
        const [basePlatform, futurePlatform] = fromFuture ? [to, from] : [from, to];
        const line = EXTERNAL_LINE_NAMES[platforms.get(futurePlatform)!.service];
        const meters = !fromFuture || !toFuture ? externalCsvMeters.get(`${basePlatform}>${line}`) : undefined;
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
    regionalLines,
    regionalParameters,
    futureSpeeds,
    assumptions: { metroSpeed, metroHeadway },
  };
}
