import type { StyleSpecification } from "maplibre-gl";

const OPENMAPTILES_SOURCE = "openmaptiles";

// MapLibre 스타일 객체입니다. 어두운 베이스맵, 폰트/아이콘 리소스,
// OpenFreeMap 벡터 타일 소스, 기본 지도 레이어를 여기서 제어합니다.
// 지하철 노선과 역은 React <Source>/<Layer>로 별도 추가합니다.
export const SEOUL_TRANSIT_DARK_STYLE = {
  version: 8,
  name: "Seoul Transit Dark",
  // 지도 라벨처럼 symbol layer의 텍스트를 그릴 때 쓰는 글자 모양 데이터입니다.
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  // 지도 아이콘을 그릴 때 쓰는 sprite 리소스입니다.
  sprite: "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
  sources: {
    [OPENMAPTILES_SOURCE]: {
      // 아래 레이어들이 참조하는 OpenFreeMap 벡터 타일 소스입니다.
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#020403" },
    },
    {
      id: "landuse",
      type: "fill",
      source: OPENMAPTILES_SOURCE,
      "source-layer": "landuse",
      paint: { "fill-color": "#050806", "fill-opacity": 0.54 },
    },
    {
      id: "park",
      type: "fill",
      source: OPENMAPTILES_SOURCE,
      "source-layer": "park",
      paint: { "fill-color": "#07120d", "fill-opacity": 0.56 },
    },
    {
      id: "water",
      type: "fill",
      source: OPENMAPTILES_SOURCE,
      "source-layer": "water",
      paint: { "fill-color": "#01080a" },
    },
    {
      id: "waterway",
      type: "line",
      source: OPENMAPTILES_SOURCE,
      "source-layer": "waterway",
      paint: {
        "line-color": "#0a2528",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.4, 16, 2.4],
      },
    },
    {
      id: "road-minor",
      type: "line",
      source: OPENMAPTILES_SOURCE,
      "source-layer": "transportation",
      filter: [
        "match",
        ["get", "class"],
        ["minor", "service", "track"],
        true,
        false,
      ],
      paint: {
        "line-color": "#15191a",
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 11, 0, 14, 0.42],
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.3, 17, 2],
      },
    },
    {
      id: "road-major",
      type: "line",
      source: OPENMAPTILES_SOURCE,
      "source-layer": "transportation",
      filter: [
        "match",
        ["get", "class"],
        ["primary", "secondary", "tertiary", "trunk", "motorway"],
        true,
        false,
      ],
      paint: {
        "line-color": "#232827",
        "line-opacity": 0.52,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 16, 4],
      },
    },
    {
      id: "rail",
      type: "line",
      source: OPENMAPTILES_SOURCE,
      "source-layer": "transportation",
      filter: ["==", ["get", "class"], "rail"],
      paint: {
        "line-color": "#343b3d",
        "line-opacity": 0.36,
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.4, 17, 1.8],
      },
    },
    {
      id: "building",
      type: "fill-extrusion",
      source: OPENMAPTILES_SOURCE,
      "source-layer": "building",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": "#111619",
        "fill-extrusion-height": [
          "coalesce",
          ["get", "render_height"],
          ["get", "height"],
          12,
        ],
        "fill-extrusion-base": [
          "coalesce",
          ["get", "render_min_height"],
          ["get", "min_height"],
          0,
        ],
        "fill-extrusion-opacity": 0.5,
      },
    },
  ],
} satisfies StyleSpecification;
