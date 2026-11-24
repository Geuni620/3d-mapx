import type { LayerSpecification, Map as MapLibreMap } from "maplibre-gl";
import { SUBWAY_STATION_LABEL_LAYER_ID } from "../subway/subway-layer-ids";

// 창불은 장식이다. 실제 조명 데이터가 아니라 건물 높이 해시로 고른 합성 색이다.
const height = ["number", ["get", "render_height"], 12];
const paint = [
  ["background", "background-color", "#020406"],
  ["landuse", "fill-color", "#04080a"],
  ["park", "fill-color", "#04100b"],
  ["water", "fill-color", "#03121b"],
  ["waterway", "line-color", "#0c3644"],
  ["road-major", "line-color", "#1b2629"],
  ["road-minor", "line-color", "#10171a"],
  ["rail", "line-color", "#2a3438"],
  ["building", "fill-extrusion-color", ["case",
    ["==", ["%", ["round", ["*", height, 7.3]], 7], 0],
    ["interpolate", ["linear"], height, 0, "#1d1c18", 40, "#3a3123", 120, "#544430"],
    ["interpolate", ["linear"], height, 0, "#0b1216", 30, "#142029", 90, "#20354a", 200, "#33557a"]]],
  ["building", "fill-extrusion-opacity", 0.9],
  ["building", "fill-extrusion-vertical-gradient", true],
  [SUBWAY_STATION_LABEL_LAYER_ID, "text-color", "#9fb4ab"],
  [SUBWAY_STATION_LABEL_LAYER_ID, "text-halo-color", "#020406"],
] as const;

// 수면 광택도 물가의 형상에 얹는 합성 장식이다.
const layers: LayerSpecification[] = [
  { id: "pulse-water-wide", type: "line", source: "openmaptiles", "source-layer": "water",
    paint: { "line-color": "#1f6f86", "line-opacity": 0.22, "line-blur": 6,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 15, 16],
      "line-offset": ["interpolate", ["linear"], ["zoom"], 10, 1, 15, 8] } },
  { id: "pulse-water-edge", type: "line", source: "openmaptiles", "source-layer": "water",
    paint: { "line-color": "#62c4d8", "line-opacity": 0.35, "line-blur": 0.6,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 15, 1.4] } },
  { id: "pulse-road-bridge", type: "line", source: "openmaptiles", "source-layer": "transportation",
    filter: ["all", ["==", ["get", "brunnel"], "bridge"], ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary"], true, false]],
    paint: { "line-color": "#e0a85c", "line-opacity": 0.32, "line-blur": 1.2,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 6] } },
  { id: "pulse-rail-bridge", type: "line", source: "openmaptiles", "source-layer": "transportation",
    filter: ["all", ["==", ["get", "brunnel"], "bridge"], ["==", ["get", "class"], "rail"]],
    paint: { "line-color": "#ffe2b8", "line-opacity": 0.7, "line-blur": 1,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 16, 4] } },
];

export function attachNightPulseStyle(map: MapLibreMap) {
  const previous = new Map<typeof paint[number], unknown>();
  let style = map.style;
  const samePaint = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const apply = () => {
    if (style !== map.style) {
      previous.clear();
      style = map.style;
    }
    if (!map.getLayer("building")) return;
    for (const item of paint) {
      const [id, property, value] = item;
      if (!map.getLayer(id)) continue;
      if (!previous.has(item)) previous.set(item, map.getPaintProperty(id, property));
      if (!samePaint(map.getPaintProperty(id, property), value)) map.setPaintProperty(id, property, value);
    }
    for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer, "building");
  };
  apply();
  map.on("style.load", apply);
  map.on("styledata", apply);
  return () => {
    map.off("style.load", apply);
    map.off("styledata", apply);
    for (const layer of layers) if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    for (const [[id, property, pulse], value] of previous) {
      if (map.getLayer(id) && samePaint(map.getPaintProperty(id, property), pulse))
        map.setPaintProperty(id, property, value ?? null);
    }
  };
}
