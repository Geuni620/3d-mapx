import { use } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import {
  SUBWAY_LINE_COLORS,
  SUBWAY_LINES,
} from "../features/subway/subway-constants";
import {
  createSubwayRouteGeoJson,
  createSubwayStationGeoJson,
} from "../features/subway/subway-geojson";
import { fetchSeoulSubwayStations } from "../services/subway-station";

const subwayStationsPromise = fetchSeoulSubwayStations();

export function SeoulSubwayLayers() {
  const stations = use(subwayStationsPromise);
  const routeGeoJson = createSubwayRouteGeoJson(stations);
  const stationGeoJson = createSubwayStationGeoJson(stations);

  return (
    <>
      <Source id="seoul-subway-routes" type="geojson" data={routeGeoJson}>
        {SUBWAY_LINES.map((lineNumber) => (
          <Layer
            key={`subway-route-${lineNumber}`}
            id={`subway-route-${lineNumber}`}
            type="line"
            filter={["==", ["get", "lineNumber"], String(lineNumber)]}
            paint={{
              "line-color": SUBWAY_LINE_COLORS[lineNumber],
              "line-width": 4,
              "line-opacity": 0.9,
            }}
          />
        ))}
      </Source>

      <Source id="seoul-subway-stations" type="geojson" data={stationGeoJson}>
        {SUBWAY_LINES.map((lineNumber) => (
          <Layer
            key={`subway-station-${lineNumber}`}
            id={`subway-station-${lineNumber}`}
            type="circle"
            filter={["==", ["get", "lineNumber"], String(lineNumber)]}
            paint={{
              "circle-color": SUBWAY_LINE_COLORS[lineNumber],
              "circle-radius": 4,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1.5,
            }}
          />
        ))}
      </Source>
    </>
  );
}
