import { PathLayer } from "@deck.gl/layers";
import type { LayersList } from "@deck.gl/core";
import type {
  SeoulSubwayStation,
  SubwayLineNumber,
} from "../../services/subway-station";
import { SUBWAY_LINE_COLORS, SUBWAY_LINES } from "./subway-constants";

type RgbColor = [red: number, green: number, blue: number];
type RgbaColor = [red: number, green: number, blue: number, alpha: number];

type SubwayRoutePath = {
  lineNumber: SubwayLineNumber;
  path: [longitude: number, latitude: number][];
  color: RgbColor;
  highlightColor: RgbColor;
};

export function createSubwayRoutePathLayers(
  stations: SeoulSubwayStation[],
): LayersList {
  const routePaths = createSubwayRoutePaths(stations);

  const lineParameters = {
    depthWriteEnabled: false,
    depthCompare: "always" as const,
  };

  return [
    new PathLayer<SubwayRoutePath>({
      id: "seoul-subway-route-aura",
      data: routePaths,
      getPath: (route) => route.path,
      getColor: (route) => withAlpha(route.color, 44),
      getWidth: 10,
      widthUnits: "pixels",
      widthMinPixels: 2,
      widthMaxPixels: 10,
      capRounded: true,
      jointRounded: true,
      billboard: true,
      positionFormat: "XY",
      pickable: false,
      parameters: lineParameters,
    }),
    new PathLayer<SubwayRoutePath>({
      id: "seoul-subway-route-body",
      data: routePaths,
      getPath: (route) => route.path,
      getColor: (route) => withAlpha(route.color, 210),
      getWidth: 4,
      widthUnits: "pixels",
      widthMinPixels: 1.5,
      widthMaxPixels: 5,
      capRounded: true,
      jointRounded: true,
      billboard: true,
      positionFormat: "XY",
      pickable: false,
      parameters: lineParameters,
    }),
    new PathLayer<SubwayRoutePath>({
      id: "seoul-subway-route-highlight",
      data: routePaths,
      getPath: (route) => route.path,
      getColor: (route) => withAlpha(route.highlightColor, 180),
      getWidth: 1.5,
      widthUnits: "pixels",
      widthMinPixels: 0.8,
      widthMaxPixels: 2,
      capRounded: true,
      jointRounded: true,
      billboard: true,
      positionFormat: "XY",
      pickable: false,
      parameters: lineParameters,
    }),
  ];
}

function createSubwayRoutePaths(
  stations: SeoulSubwayStation[],
): SubwayRoutePath[] {
  return SUBWAY_LINES.flatMap((lineNumber) => {
    const lineStations = stations.filter(
      (station) => station.lineNumber === lineNumber,
    );

    if (lineStations.length < 2) {
      return [];
    }

    const color = hexToRgb(SUBWAY_LINE_COLORS[lineNumber]);

    return {
      lineNumber,
      path: lineStations.map((station) => [
        station.longitude,
        station.latitude,
      ]),
      color,
      highlightColor: brightenRgb(color, 72),
    };
  });
}

function hexToRgb(hexColor: string): RgbColor {
  const normalizedColor = hexColor.replace("#", "");

  return [
    Number.parseInt(normalizedColor.slice(0, 2), 16),
    Number.parseInt(normalizedColor.slice(2, 4), 16),
    Number.parseInt(normalizedColor.slice(4, 6), 16),
  ];
}

function brightenRgb(color: RgbColor, amount: number): RgbColor {
  return color.map((channel) => Math.min(channel + amount, 255)) as RgbColor;
}

function withAlpha(color: RgbColor, alpha: number): RgbaColor {
  return [...color, alpha];
}
