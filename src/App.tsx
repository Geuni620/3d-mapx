import { Suspense, use, useMemo } from "react";
import Map, { Layer, Source } from "react-map-gl/maplibre";
import {
  fetchSeoulSubwayStations,
  type SeoulSubwayStation,
  type SubwayLineNumber,
} from "./services/subway-station";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";

const SEOUL_CENTER = {
  longitude: 126.978,
  latitude: 37.5665,
};

const INITIAL_VIEW_STATE = {
  ...SEOUL_CENTER,
  zoom: 11,
  pitch: 45,
  bearing: 0,
};

const SUBWAY_LINES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const SUBWAY_LINE_COLORS: Record<SubwayLineNumber, string> = {
  1: "#0052A4",
  2: "#00A84D",
  3: "#EF7C1C",
  4: "#00A5DE",
  5: "#996CAC",
  6: "#CD7C2F",
  7: "#747F00",
  8: "#E6186C",
};

const subwayStationsPromise = fetchSeoulSubwayStations();

export function App() {
  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle="https://tiles.openfreemap.org/styles/bright"
      style={{ width: "100vw", height: "100vh" }}
    >
      <Suspense fallback={null}>
        <SeoulSubwayLayers />
      </Suspense>
    </Map>
  );
}

function SeoulSubwayLayers() {
  const stations = use(subwayStationsPromise);

  const routeGeoJson = useMemo(
    () => createSubwayRouteGeoJson(stations),
    [stations],
  );

  const stationGeoJson = useMemo(
    () => createSubwayStationGeoJson(stations),
    [stations],
  );

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

function createSubwayRouteGeoJson(stations: SeoulSubwayStation[]) {
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

function createSubwayStationGeoJson(stations: SeoulSubwayStation[]) {
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
