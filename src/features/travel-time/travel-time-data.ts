import graphJson from "./data/subway-travel-graph.json?raw";
import futureJson from "./data/future-lines.json?raw";

export type Coordinate = [longitude: number, latitude: number];
export type ServiceDay = "DAY" | "SAT" | "END";

export interface BaseStation {
  id: string;
  name: string;
  complex: string;
  line: number;
  coordinate: Coordinate;
}

// [line, from, to, seconds, dwellSeconds, samples, segment, reversed, hourlyProfile(DAY,SAT,END)]
export type BaseRun = [
  line: number, from: number, to: number, seconds: number, dwellSeconds: number,
  samples: number, segment: number, reversed: 0 | 1, hourlyProfile: [number, number, number],
];

export interface BaseGraph {
  edition: string;
  source: string;
  transferSource: string | null;
  hours: [first: number, last: number];
  days: ServiceDay[];
  stations: BaseStation[];
  runs: BaseRun[];
  profiles: number[][];
  continuations: [from: number, via: number, to: number][];
  transfers: [from: number, to: number, meters: number | null, basis: "csv" | "csv-reverse" | null][];
  /** 같은 역·같은 호선 계통 변경 환승거리(성수·신도림·강동) */
  sameLineTransfers: [station: number, meters: number][];
  /** 기준망 밖 노선으로의 실측 환승거리(이미 역이 있는 GTX-A) */
  externalTransfers: [station: number, line: string, meters: number][];
  segments: Coordinate[][];
  segmentMeters: number[];
}

export type LineStage = "착공" | "기본계획" | "예타";
export type OpeningConfidence = "A" | "B" | "C" | "미정";

export interface FutureStation {
  id: string;
  name: string;
  kind: string;
  coordinate: Coordinate | null;
  coordSource?: string;
  transferTo: string[];
}

export interface FutureSegment {
  from: string;
  to: string;
  meters: number;
  approxMeters: number;
  path: Coordinate[];
}

export interface FutureLine {
  id: string;
  name: string;
  shortName: string;
  color: string;
  lineType: string;
  stage: LineStage;
  statusNote: string;
  included: boolean;
  approval: { kind: string; notice?: string; date?: string; url?: string; note?: string };
  opening: { year: number | null; kind: string; confidence: OpeningConfidence; reportedYear?: number };
  milestones: { year: number; label: string }[];
  length?: { value: string; src: string };
  geometryNote?: string;
  hiddenParts: string[];
  geometry: Coordinate[][];
  stations: FutureStation[];
  routing:
    | { enabled: false; reason: string }
    | {
      enabled: true;
      order: string[];
      segments: FutureSegment[];
      excluded: { station: string; reason: string }[];
      through?: { line: number; junction: string; before: string };
    };
  sources: { org: string; title: string; date: string; url: string; tier: string }[];
  conflicts: string[];
}

export interface FutureLineData {
  source: string;
  sourceGenerated: string;
  sourceSha256: string;
  osmAttribution: string;
  rules: string[];
  pending: { noCoordinates: string[]; noOfficialYear: string[]; excluded: { name: string; why: string }[] };
  lines: FutureLine[];
}

export const BASE_GRAPH: BaseGraph = JSON.parse(graphJson);
export const FUTURE_LINES: FutureLineData = JSON.parse(futureJson);
