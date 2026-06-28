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
    </Source>
  );
}
