import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { MapTheme } from "../app/seoul-daylight";
import { SUBWAY_STATION_LABEL_LAYER_ID } from "../features/subway/subway-layer-ids";
import {
  createSubwayStationGeoJson,
  createLine1SectionLabelGeoJson,
  type SubwayStationMapPoint,
} from "../features/subway/subway-geojson";

interface SeoulSubwayLayersProps {
  stations: SubwayStationMapPoint[];
  theme: MapTheme;
  showRouteLabels: boolean;
}

export function SeoulSubwayLayers({ stations, theme, showRouteLabels }: SeoulSubwayLayersProps) {
  const stationGeoJson = useMemo(() => createSubwayStationGeoJson(stations), [stations]);

  const sectionLabels = useMemo(() => createLine1SectionLabelGeoJson(stations), [stations]);

  return <>
    <Source id="seoul-subway-stations" type="geojson" data={stationGeoJson}>
      <Layer
        id={SUBWAY_STATION_LABEL_LAYER_ID}
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
          "text-color": theme === "light" ? "#25352f" : "#d8efe8",
          "text-halo-color": theme === "light" ? "#fffdf3" : "#020403",
          "text-halo-width": 1.2,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 1],
        }}
      />
    </Source>
    {showRouteLabels && sectionLabels.features.length > 0 &&
      <Source id="line-1-section-labels" type="geojson" data={sectionLabels}>
        <Layer id="line-1-section-label" type="symbol" minzoom={10.75} layout={{
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-offset": [0, 1],
          "text-anchor": "top",
        }} paint={{
          "text-color": theme === "light" ? "#083c76" : "#cae6ff",
          "text-halo-color": theme === "light" ? "#f5faff" : "#071b35",
          "text-halo-width": 2,
        }} />
      </Source>}
  </>;
}
