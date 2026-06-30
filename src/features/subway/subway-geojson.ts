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
