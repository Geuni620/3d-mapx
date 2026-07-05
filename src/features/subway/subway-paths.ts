import { PathLayer } from "@deck.gl/layers";
import type { LayersList } from "@deck.gl/core";
import {
  SEOUL_SUBWAY_OSM_NETWORK,
  type SubwayCoordinate,
} from "./osm-subway-network";
import { SUBWAY_STATION_LABEL_LAYER_ID } from "./subway-layer-ids";
import { SUBWAY_LINE_COLORS, type SubwayLineNumber } from "./subway-constants";

interface SubwayRoutePath {
  id: string;
  lineNumber: SubwayLineNumber;
  path: SubwayCoordinate[];
  color: [red: number, green: number, blue: number];
  highlightColor: [red: number, green: number, blue: number];
}

interface SubwayRouteLayerProps {
  beforeId?: string;
}

export function createSubwayRoutePathLayers(
  selectedLineNumbers: SubwayLineNumber[],
): LayersList {
  const routePaths = createSubwayRoutePaths(selectedLineNumbers);

  const lineParameters = {
    depthWriteEnabled: false,
    depthCompare: "always" as const,
  };

  return [
    new PathLayer<SubwayRoutePath, SubwayRouteLayerProps>({
      id: "seoul-subway-route-aura",
      beforeId: SUBWAY_STATION_LABEL_LAYER_ID,
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
    new PathLayer<SubwayRoutePath, SubwayRouteLayerProps>({
      id: "seoul-subway-route-body",
      beforeId: SUBWAY_STATION_LABEL_LAYER_ID,
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
    new PathLayer<SubwayRoutePath, SubwayRouteLayerProps>({
      id: "seoul-subway-route-highlight",
      beforeId: SUBWAY_STATION_LABEL_LAYER_ID,
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
  selectedLineNumbers: SubwayLineNumber[],
): SubwayRoutePath[] {
  return selectedLineNumbers.flatMap((lineNumber) => {
    const color = hexToRgb(SUBWAY_LINE_COLORS[lineNumber]);
    const osmRoutes = SEOUL_SUBWAY_OSM_NETWORK.routes.filter(
      (route) => route.lineNumber === lineNumber,
    );

    return osmRoutes.flatMap((route) =>
      route.pathSegments.map((pathSegment, index) => ({
        id: `${route.id}-${index}`,
        lineNumber,
        path: pathSegment,
        color,
        highlightColor: brightenRgb(color, 72),
      })),
    );
  });
}

function hexToRgb(hexColor: string): SubwayRoutePath["color"] {
  const normalizedColor = hexColor.replace("#", "");

  return [
    Number.parseInt(normalizedColor.slice(0, 2), 16),
    Number.parseInt(normalizedColor.slice(2, 4), 16),
    Number.parseInt(normalizedColor.slice(4, 6), 16),
  ];
}

function brightenRgb(
  color: SubwayRoutePath["color"],
  amount: number,
): SubwayRoutePath["color"] {
  return color.map((channel) =>
    Math.min(channel + amount, 255),
  ) as SubwayRoutePath["color"];
}

function withAlpha(
  color: SubwayRoutePath["color"],
  alpha: number,
): [red: number, green: number, blue: number, alpha: number] {
  return [...color, alpha];
}
