import data from "./data/line-1-sections.json";
import { SEOUL_SUBWAY_OSM_NETWORK, type SubwayCoordinate } from "./osm-subway-network";
import { SUBWAY_LINE_COLORS } from "./subway-constants";
import { calculateCoordinateDistanceMeters } from "./subway-route-sampler";
import { getSubwayTripJourney, type TimetableTrip } from "./subway-timetable";

type Line1SectionId = "metro" | "gyeongbu" | "gyeongin" | "gyeongwon" | "janghang"
  | "byeongjeom" | "gwangmyeong" | "korail" | "unknown";
type Line1Operator = "서울교통공사" | "코레일";
type SectionRow = [Line1SectionId, Line1Operator, string, string, string, string];
type TrackRange = [end: number, section: Line1SectionId];

export const LINE_1_SECTIONS = (data.sections as SectionRow[]).map(
  ([id, operator, name, from, to, labelAt]) => ({ id, operator, name, from, to, labelAt }),
);

export const LINE_1_OPERATOR_COLORS = {
  metro: SUBWAY_LINE_COLORS[1],
  korail: "#318cdd",
  unknown: "#7185a3",
};

export function getLine1SectionLabel(sectionId: Line1SectionId) {
  if (sectionId === "metro") return "서울교통공사 구간";
  if (sectionId === "unknown") return "구간 미확인";
  const section = LINE_1_SECTIONS.find(({ id }) => id === sectionId);
  return section ? `코레일 · ${section.name}` : "코레일 구간";
}

export function getLine1SectionColor(section: Line1SectionId) {
  if (section === "metro" || section === "unknown") return LINE_1_OPERATOR_COLORS[section];
  return LINE_1_OPERATOR_COLORS.korail;
}

export const line1StationName = (name: string) => name.split("(")[0].replace(/[\s·]/g, "");

const line1Stations = SEOUL_SUBWAY_OSM_NETWORK.stations.filter(({ lineNumber }) => lineNumber === 1);
const operatorsByStation = new Map(line1Stations.map(station => {
  const ref = Number(station.ref);
  const operator: Line1Operator = ref >= 124 && ref <= 133 ? "서울교통공사" : "코레일";
  return [line1StationName(station.name), operator];
}));

export function getLine1StationOperator(name: string) {
  return operatorsByStation.get(line1StationName(name));
}

export function splitLine1Path(path: SubwayCoordinate[], index: number) {
  const ranges: TrackRange[] = (data.paths as TrackRange[][])[index] ?? [];
  if (ranges.at(-1)?.[0] !== path.length - 1) return [{ path, section: "unknown" as const }];

  let start = 0;
  return ranges.map(([end, section]) => {
    const sectionPath = path.slice(start, end + 1);
    start = end;
    return { path: sectionPath, section };
  });
}

const edgeKey = (a: SubwayCoordinate, b: SubwayCoordinate) =>
  a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? `${a}/${b}` : `${b}/${a}`;
const sectionByEdge = new Map<string, Line1SectionId>();
const route = SEOUL_SUBWAY_OSM_NETWORK.routes.find(({ lineNumber }) => lineNumber === 1);
route?.pathSegments.forEach((path, index) => {
  for (const part of splitLine1Path(path, index)) {
    for (let i = 1; i < part.path.length; i++) {
      sectionByEdge.set(edgeKey(part.path[i - 1], part.path[i]), part.section);
    }
  }
});

const trackSections = new WeakMap<SubwayCoordinate[], { end: number; section: Line1SectionId }[]>();

export function getLine1TrackSection(path: SubwayCoordinate[], distance: number): Line1SectionId {
  let ranges = trackSections.get(path);
  if (!ranges) {
    let end = 0;
    ranges = [];
    for (let i = 1; i < path.length; i++) {
      end += calculateCoordinateDistanceMeters(path[i - 1], path[i]);
      const section = sectionByEdge.get(edgeKey(path[i - 1], path[i])) ?? "unknown";
      const last = ranges.at(-1);
      if (last?.section === section) last.end = end;
      else ranges.push({ end, section });
    }
    trackSections.set(path, ranges);
  }
  return (ranges.find(range => distance < range.end) ?? ranges.at(-1))?.section ?? "unknown";
}

export type Line1Service = "급행" | "완행";

const serviceByPattern = new Map<number, Line1Service>([
  ...data.patternServices.local.map(pattern => [pattern, "완행"] as const),
  ...data.patternServices.express.map(pattern => [pattern, "급행"] as const),
]);

export function classifyLine1Service(pattern: number) {
  return serviceByPattern.get(pattern);
}

export function formatLine1Headsign(destination: string, service?: Line1Service) {
  return service ? `${destination}행 · ${service}` : `${destination}행`;
}

export function getLine1TripPresentation(trip: TimetableTrip) {
  const journey = getSubwayTripJourney(trip);
  const service = classifyLine1Service(trip[3]);
  return { ...journey, service, headsign: formatLine1Headsign(journey.destination, service) };
}

export const line1LegStations: Readonly<Partial<Record<number, readonly (string | null)[]>>> =
  data.legStations;
