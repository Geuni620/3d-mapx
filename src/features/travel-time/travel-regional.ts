import type { Coordinate } from "./travel-time-data";

// 1~8호선 밖 수도권 광역·도시철도. scripts/generate-regional-lines.py가 OSM route relation에서 만든다.

export interface RegionalStation {
  id: string;
  name: string;
  coordinate: Coordinate;
}

export interface RegionalService {
  id: string;
  osmRelationId: number;
  name: string;
  from?: string;
  to?: string;
  express: boolean;
  stops: string[];
}

export interface RegionalRun {
  from: string;
  to: string;
  meters: number;
  approx: boolean;
  path: Coordinate[];
}

export interface RegionalLine {
  id: string;
  name: string;
  shortName: string;
  group: "seoul-metro" | "korail" | "private" | "light";
  color: string;
  operator?: string;
  osm: { routeMasterIds: number[]; routeRelationIds: number[]; fetchedAt: string; license: string };
  stations: RegionalStation[];
  services: RegionalService[];
  runs: RegionalRun[];
  warnings: string[];
}

// 정렬 기준. 화면 칩도 이 순서를 따른다.
export const REGIONAL_ORDER = ["L9", "GJ", "GC", "SB", "GG", "SH", "AREX", "SBD", "GTXA", "UI", "SL", "GOLD", "UJB", "EVER", "IC1", "IC2"];

const files = import.meta.glob<string>("./data/regional/*.json", { query: "?raw", import: "default", eager: true });

export const REGIONAL_LINES: RegionalLine[] = Object.values(files)
  .map(raw => JSON.parse(raw) as RegionalLine)
  .sort((a, b) => REGIONAL_ORDER.indexOf(a.id) - REGIONAL_ORDER.indexOf(b.id));

/** 공표 시간표에서 구운 역→역 차내시간·시간대별 배차. scripts/generate-regional-timing.py */
export interface RegionalTiming {
  lineId: string;
  source: { title: string; url: string; dataDate: string; files: { name: string; sha256: string }[]; satFromHoliday: boolean };
  hours: [first: number, last: number];
  days: ("DAY" | "SAT" | "END")[];
  runs: [from: string, to: string, seconds: number, dwellSeconds: number, samples: number, hourlyProfile: [number, number, number]][];
  profiles: number[][];
  continuations: [string, string, string][];
  unmatchedStations: string[];
}

const timingFiles = import.meta.glob<string>("./data/regional-timing/*.json", { query: "?raw", import: "default", eager: true });

export const REGIONAL_TIMINGS: Record<string, RegionalTiming> = Object.fromEntries(
  Object.values(timingFiles).map(raw => {
    const timing = JSON.parse(raw) as RegionalTiming;
    return [timing.lineId, timing];
  }),
);

/** 서울교통공사 환승역거리 CSV가 노선을 부르는 이름 */
export const REGIONAL_CSV_NAMES: Record<string, string> = {
  L9: "9호선",
  GJ: "경의중앙선",
  GC: "경춘선",
  SB: "수인분당선",
  SH: "서해선",
  AREX: "공항철도",
  SBD: "신분당선",
  GTXA: "GTX-A",
  UI: "우이신설선",
  SL: "신림선",
  GOLD: "김포골드라인",
};
