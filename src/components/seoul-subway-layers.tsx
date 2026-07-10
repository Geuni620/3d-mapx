import { Layer, Source } from "react-map-gl/maplibre";
import { SUBWAY_STATION_LABEL_LAYER_ID } from "../features/subway/subway-layer-ids";
import {
  createSubwayStationGeoJson,
  type SubwayStationMapPoint,
} from "../features/subway/subway-geojson";

interface SeoulSubwayLayersProps {
  stations: SubwayStationMapPoint[];
}

export function SeoulSubwayLayers({ stations }: SeoulSubwayLayersProps) {
  const stationGeoJson = createSubwayStationGeoJson(stations);

  return (
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
          "text-color": "#d8efe8",
          "text-halo-color": "#020403",
          "text-halo-width": 1.2,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 13, 1],
        }}
      />
    </Source>
  );
}
