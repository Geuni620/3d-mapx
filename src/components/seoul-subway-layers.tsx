import { Layer, Source } from "react-map-gl/maplibre";
import {
  SUBWAY_LINE_COLORS,
  SUBWAY_LINES,
} from "../features/subway/subway-constants";
import { createSubwayStationGeoJson } from "../features/subway/subway-geojson";
import type { SeoulSubwayStation } from "../services/subway-station";

type SeoulSubwayLayersProps = {
  stations: SeoulSubwayStation[];
};

export function SeoulSubwayLayers({ stations }: SeoulSubwayLayersProps) {
  const stationGeoJson = createSubwayStationGeoJson(stations);

  return (
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
            "circle-stroke-width": 0.5,
          }}
        />
      ))}

      <Layer
        id="subway-station-label"
        type="symbol"
        minzoom={12.5}
        layout={{
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 15, 13],
          "text-offset": [0.8, -0.8],
          "text-anchor": "left",
          "text-allow-overlap": false,
          "text-ignore-placement": false,
        }}
        paint={{
          "text-color": "#d8efe8",
          "text-halo-color": "#020403",
          "text-halo-width": 1.2,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 1],
        }}
      />
    </Source>
  );
}
