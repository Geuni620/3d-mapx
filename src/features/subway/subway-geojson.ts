import { getLine1SectionLabel, LINE_1_SECTIONS, line1StationName } from "./line-1-sections";
import type { SubwayLineNumber } from "./subway-constants";

export interface SubwayStationMapPoint {
  id: number | string;
  lineNumber: SubwayLineNumber;
  sequence: number;
  name: string;
  latitude: number;
  longitude: number;
}

export function createSubwayStationGeoJson(stations: SubwayStationMapPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: stations.map((station) => ({
      type: "Feature" as const,
      properties: {
        id: station.id,
        lineNumber: String(station.lineNumber),
        sequence: station.sequence,
        name: station.name,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [station.longitude, station.latitude],
      },
    })),
  };
}


export function createLine1SectionLabelGeoJson(stations: SubwayStationMapPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: LINE_1_SECTIONS.flatMap(section => {
      const station = stations.find(item => item.lineNumber === 1 && line1StationName(item.name) === section.labelAt);
      if (!station) return [];
      return [{
        type: "Feature" as const,
        properties: { name: getLine1SectionLabel(section.id) },
        geometry: { type: "Point" as const, coordinates: [station.longitude, station.latitude] },
      }];
    }),
  };
}
