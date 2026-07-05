import { Layer, Source } from "react-map-gl/maplibre";
import {
  SUBWAY_STATION_CIRCLE_BORDER_LAYER_ID_PREFIX,
  SUBWAY_STATION_CIRCLE_CORE_LAYER_ID_PREFIX,
  SUBWAY_STATION_CIRCLE_GAP_LAYER_ID_PREFIX,
  SUBWAY_STATION_CIRCLE_HIGHLIGHT_LAYER_ID_PREFIX,
  SUBWAY_STATION_CIRCLE_LAYER_ID_PREFIX,
  SUBWAY_STATION_LABEL_LAYER_ID,
} from "../features/subway/subway-layer-ids";
import {
  SUBWAY_LINE_COLORS,
  SUBWAY_LINES,
} from "../features/subway/subway-constants";
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
      {SUBWAY_LINES.map((lineNumber) => (
        <Layer
          key={`${SUBWAY_STATION_CIRCLE_LAYER_ID_PREFIX}-${lineNumber}`}
          id={`${SUBWAY_STATION_CIRCLE_LAYER_ID_PREFIX}-${lineNumber}`}
          type="circle"
          filter={["==", ["get", "lineNumber"], String(lineNumber)]}
          paint={{
            "circle-blur": 0.65,
            "circle-color": SUBWAY_LINE_COLORS[lineNumber],
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.12,
              13,
              0.26,
              15,
              0.36,
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              4.2,
              13,
              7.2,
              15,
              8.8,
            ],
          }}
        />
      ))}

      {SUBWAY_LINES.map((lineNumber) => (
        <Layer
          key={`${SUBWAY_STATION_CIRCLE_BORDER_LAYER_ID_PREFIX}-${lineNumber}`}
          id={`${SUBWAY_STATION_CIRCLE_BORDER_LAYER_ID_PREFIX}-${lineNumber}`}
          type="circle"
          filter={["==", ["get", "lineNumber"], String(lineNumber)]}
          paint={{
            "circle-color": SUBWAY_LINE_COLORS[lineNumber],
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.8,
              13,
              0.94,
              15,
              1,
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              3.1,
              13,
              4.8,
              15,
              5.5,
            ],
          }}
        />
      ))}

      {SUBWAY_LINES.map((lineNumber) => (
        <Layer
          key={`${SUBWAY_STATION_CIRCLE_GAP_LAYER_ID_PREFIX}-${lineNumber}`}
          id={`${SUBWAY_STATION_CIRCLE_GAP_LAYER_ID_PREFIX}-${lineNumber}`}
          type="circle"
          filter={["==", ["get", "lineNumber"], String(lineNumber)]}
          paint={{
            "circle-color": "#03100a",
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.78,
              13,
              0.9,
              15,
              0.96,
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              2.45,
              13,
              3.75,
              15,
              4.3,
            ],
          }}
        />
      ))}

      {SUBWAY_LINES.map((lineNumber) => (
        <Layer
          key={`${SUBWAY_STATION_CIRCLE_CORE_LAYER_ID_PREFIX}-${lineNumber}`}
          id={`${SUBWAY_STATION_CIRCLE_CORE_LAYER_ID_PREFIX}-${lineNumber}`}
          type="circle"
          filter={["==", ["get", "lineNumber"], String(lineNumber)]}
          paint={{
            "circle-color": "#f5fff9",
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.88,
              13,
              0.94,
              15,
              0.98,
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              1.65,
              13,
              2.65,
              15,
              3.05,
            ],
          }}
        />
      ))}

      {SUBWAY_LINES.map((lineNumber) => (
        <Layer
          key={`${SUBWAY_STATION_CIRCLE_HIGHLIGHT_LAYER_ID_PREFIX}-${lineNumber}`}
          id={`${SUBWAY_STATION_CIRCLE_HIGHLIGHT_LAYER_ID_PREFIX}-${lineNumber}`}
          type="circle"
          filter={["==", ["get", "lineNumber"], String(lineNumber)]}
          paint={{
            "circle-color": "#ffffff",
            "circle-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.68,
              13,
              0.82,
              15,
              0.92,
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              0.75,
              13,
              1.3,
              15,
              1.55,
            ],
          }}
        />
      ))}

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
