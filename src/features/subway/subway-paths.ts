import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { LayersList } from "@deck.gl/core";
import {
  SEOUL_SUBWAY_OSM_NETWORK,
  type SubwayCoordinate,
} from "./osm-subway-network";
import { SUBWAY_STATION_LABEL_LAYER_ID } from "./subway-layer-ids";
import type { SubwayStationMapPoint } from "./subway-geojson";
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

interface SubwayStationCircle {
  id: number | string;
  lineNumber: SubwayLineNumber;
  longitude: number;
  latitude: number;
  color: [red: number, green: number, blue: number];
}

interface SubwayStationCircleLayerProps {
  beforeId?: string;
}

export function createSubwayDeckLayers(
  selectedLineNumbers: SubwayLineNumber[],
  stations: SubwayStationMapPoint[],
): LayersList {
  return [
    ...createSubwayRoutePathLayers(selectedLineNumbers),
    ...createSubwayStationCircleLayers(stations),
  ];
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
      id: "seoul-subway-route-glow",
      beforeId: SUBWAY_STATION_LABEL_LAYER_ID,
      data: routePaths,
      getPath: (route) => route.path,
      getColor: (route) => withAlpha(route.color, 24),
      getWidth: 16,
      widthUnits: "pixels",
      widthMinPixels: 5,
      widthMaxPixels: 18,
      capRounded: true,
      jointRounded: true,
      billboard: true,
      positionFormat: "XY",
      pickable: false,
      parameters: lineParameters,
    }),
    new PathLayer<SubwayRoutePath, SubwayRouteLayerProps>({
      id: "seoul-subway-route-aura",
      beforeId: SUBWAY_STATION_LABEL_LAYER_ID,
      data: routePaths,
      getPath: (route) => route.path,
      getColor: (route) => withAlpha(route.color, 74),
      getWidth: 9,
      widthUnits: "pixels",
      widthMinPixels: 3,
      widthMaxPixels: 11,
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
      getColor: (route) => withAlpha(route.color, 230),
      getWidth: 4.8,
      widthUnits: "pixels",
      widthMinPixels: 2.4,
      widthMaxPixels: 5.4,
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
      getColor: (route) => withAlpha(route.highlightColor, 210),
      getWidth: 1.2,
      widthUnits: "pixels",
      widthMinPixels: 0.7,
      widthMaxPixels: 1.8,
      capRounded: true,
      jointRounded: true,
      billboard: true,
      positionFormat: "XY",
      pickable: false,
      parameters: lineParameters,
    }),
  ];
}

function createSubwayStationCircleLayers(
  stations: SubwayStationMapPoint[],
): LayersList {
  const stationCircles = stations.map(
    (station): SubwayStationCircle => ({
      id: station.id,
      lineNumber: station.lineNumber,
      longitude: station.longitude,
      latitude: station.latitude,
      color: hexToRgb(SUBWAY_LINE_COLORS[station.lineNumber]),
    }),
  );

  const circleParameters = {
    depthWriteEnabled: false,
    depthCompare: "always" as const,
  };

  return [
    new ScatterplotLayer<SubwayStationCircle, SubwayStationCircleLayerProps>({
      id: "seoul-subway-station-glow",
      beforeId: SUBWAY_STATION_LABEL_LAYER_ID,
      data: stationCircles,
      getPosition: (station) => [station.longitude, station.latitude],
      getFillColor: (station) => withAlpha(station.color, 28),
      getRadius: 5.7,
      radiusUnits: "pixels",
      radiusMinPixels: 2.8,
      radiusMaxPixels: 6.4,
      stroked: false,
      filled: true,
      pickable: false,
      parameters: circleParameters,
    }),
    new ScatterplotLayer<SubwayStationCircle, SubwayStationCircleLayerProps>({
      id: "seoul-subway-station-border",
      beforeId: SUBWAY_STATION_LABEL_LAYER_ID,
      data: stationCircles,
      getPosition: (station) => [station.longitude, station.latitude],
      getFillColor: (station) => withAlpha(station.color, 235),
      getRadius: 4.4,
      radiusUnits: "pixels",
      radiusMinPixels: 2.4,
      radiusMaxPixels: 5,
      stroked: false,
      filled: true,
      pickable: false,
      parameters: circleParameters,
    }),
    new ScatterplotLayer<SubwayStationCircle, SubwayStationCircleLayerProps>({
      id: "seoul-subway-station-gap",
      beforeId: SUBWAY_STATION_LABEL_LAYER_ID,
      data: stationCircles,
      getPosition: (station) => [station.longitude, station.latitude],
      getFillColor: [3, 16, 10, 248],
      getRadius: 3.35,
      radiusUnits: "pixels",
      radiusMinPixels: 1.8,
      radiusMaxPixels: 3.85,
      stroked: false,
      filled: true,
      pickable: false,
      parameters: circleParameters,
    }),
    new ScatterplotLayer<SubwayStationCircle, SubwayStationCircleLayerProps>({
      id: "seoul-subway-station-core",
      beforeId: SUBWAY_STATION_LABEL_LAYER_ID,
      data: stationCircles,
      getPosition: (station) => [station.longitude, station.latitude],
      getFillColor: [245, 255, 249, 252],
      getRadius: 2.2,
      radiusUnits: "pixels",
      radiusMinPixels: 1.1,
      radiusMaxPixels: 2.65,
      stroked: false,
      filled: true,
      pickable: false,
      parameters: circleParameters,
    }),
    new ScatterplotLayer<SubwayStationCircle, SubwayStationCircleLayerProps>({
      id: "seoul-subway-station-highlight",
      beforeId: SUBWAY_STATION_LABEL_LAYER_ID,
      data: stationCircles,
      getPosition: (station) => [station.longitude, station.latitude],
      getFillColor: [255, 255, 255, 220],
      getRadius: 0.85,
      radiusUnits: "pixels",
      radiusMinPixels: 0.42,
      radiusMaxPixels: 1.05,
      stroked: false,
      filled: true,
      pickable: false,
      parameters: circleParameters,
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
