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
            key={`subway-route-glow-${lineNumber}`}
            id={`subway-route-glow-${lineNumber}`}
            type="line"
            filter={["==", ["get", "lineNumber"], String(lineNumber)]}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
            paint={{
              "line-color": SUBWAY_LINE_COLORS[lineNumber],
              "line-width": 12,
              "line-blur": 8,
              "line-opacity": 0.42,
            }}
          />
        ))}

        {SUBWAY_LINES.map((lineNumber) => (
          <Layer
            key={`subway-route-core-${lineNumber}`}
            id={`subway-route-core-${lineNumber}`}
            type="line"
            filter={["==", ["get", "lineNumber"], String(lineNumber)]}
            layout={{
              "line-cap": "round",
              "line-join": "round",
            }}
            paint={{
              "line-color": SUBWAY_LINE_COLORS[lineNumber],
              "line-width": 3.5,
              "line-opacity": 0.96,
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
              "circle-color": "#050807",
              "circle-radius": 3.8,
              "circle-stroke-color": SUBWAY_LINE_COLORS[lineNumber],
              "circle-stroke-width": 1.8,
            }}
          />
        ))}
      </Source>
    </>
  );
}
