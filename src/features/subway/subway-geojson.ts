import type { SeoulSubwayStation } from "../../services/subway-station";
import { SUBWAY_LINES } from "./subway-constants";

export function createSubwayRouteGeoJson(stations: SeoulSubwayStation[]) {
  return {
    type: "FeatureCollection",
    features: SUBWAY_LINES.map((lineNumber) => {
      const lineStations = stations.filter(
        (station) => station.lineNumber === lineNumber,
      );

      return {
        type: "Feature",
        properties: {
          lineNumber: String(lineNumber),
        },
        geometry: {
          type: "LineString",
          coordinates: lineStations.map((station) => [
            station.longitude,
            station.latitude,
          ]),
        },
      };
    }),
  };
}

export function createSubwayStationGeoJson(stations: SeoulSubwayStation[]) {
  return {
    type: "FeatureCollection",
    features: stations.map((station) => ({
      type: "Feature",
      properties: {
        id: station.id,
        lineNumber: String(station.lineNumber),
        sequence: station.sequence,
        name: station.name,
      },
      geometry: {
        type: "Point",
        coordinates: [station.longitude, station.latitude],
      },
    })),
  };
}
