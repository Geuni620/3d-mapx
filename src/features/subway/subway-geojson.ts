import type {
  SeoulSubwayStation,
  SubwayLineNumber,
} from "../../services/subway-station";
import { SUBWAY_LINES } from "./subway-constants";

export interface SubwayStationMapPoint {
  id: number | string;
  lineNumber: SubwayLineNumber;
  sequence: number;
  name: string;
  latitude: number;
  longitude: number;
}

export function createSubwayRouteGeoJson(stations: SeoulSubwayStation[]) {
  return {
    type: "FeatureCollection" as const,
    features: SUBWAY_LINES.map((lineNumber) => {
      const lineStations = stations.filter(
        (station) => station.lineNumber === lineNumber,
      );

      return {
        type: "Feature" as const,
        properties: {
          lineNumber: String(lineNumber),
        },
        geometry: {
          type: "LineString" as const,
          coordinates: lineStations.map((station) => [
            station.longitude,
            station.latitude,
          ]),
        },
      };
    }),
  };
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
