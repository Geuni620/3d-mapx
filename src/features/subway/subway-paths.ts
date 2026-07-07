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

interface SubwayLineStrokeStyle {
  width: number;
  minWidth: number;
  maxWidth: number;
  alpha: number;
}

interface SubwayStationDotStyle {
  radius: number;
  minRadius: number;
  maxRadius: number;
  alpha: number;
}

interface SubwayRouteVisualStyle {
  glow: SubwayLineStrokeStyle;
  aura: SubwayLineStrokeStyle;
  body: SubwayLineStrokeStyle;
  highlight: SubwayLineStrokeStyle;
}

interface SubwayStationCircleVisualStyle {
  isVisible: boolean;
  glow: SubwayStationDotStyle;
  border: SubwayStationDotStyle;
  gap: SubwayStationDotStyle;
  core: SubwayStationDotStyle;
  highlight: SubwayStationDotStyle;
}

interface SubwayVisualStyle {
  route: SubwayRouteVisualStyle;
  stationCircle: SubwayStationCircleVisualStyle;
}

interface ProjectedSubwayTrackPoint {
  coordinate: SubwayCoordinate;
  distanceMeters: number;
  xMeters: number;
  yMeters: number;
}

export interface SubwayVisualLevel {
  id: "overview" | "network" | "station" | "inspection";
  label: string;
  zoomRangeLabel: string;
  stationCircleLabel: string;
}

export function createSubwayVisualLevel(zoom: number): SubwayVisualLevel {
  if (zoom <= 10.75) {
    return {
      id: "overview",
      label: "Overview",
      zoomRangeLabel: "10.75 이하",
      stationCircleLabel: "숨김",
    };
  }

  if (zoom <= 12.4) {
    return {
      id: "network",
      label: "Network",
      zoomRangeLabel: "10.75 - 12.4",
      stationCircleLabel: "숨김",
    };
  }

  if (zoom <= 14.5) {
    return {
      id: "station",
      label: "Station",
      zoomRangeLabel: "12.4 - 14.5",
      stationCircleLabel: "표시",
    };
  }

  return {
    id: "inspection",
    label: "Inspection",
    zoomRangeLabel: "14.5 초과",
    stationCircleLabel: "강조",
  };
}

export function createSubwayDeckLayers(
  selectedLineNumbers: SubwayLineNumber[],
  stations: SubwayStationMapPoint[],
  visualLevel: SubwayVisualLevel,
): LayersList {
  const visualStyle = createSubwayVisualStyle(visualLevel);

  return [
    ...createSubwayRoutePathLayers(selectedLineNumbers, visualStyle.route),
    ...createSubwayStationCircleLayers(stations, visualStyle.stationCircle),
  ];
}

export function createSubwayDisplayStations(
  stations: SubwayStationMapPoint[],
): SubwayStationMapPoint[] {
  const routePathsByLineNumber = createSubwayRoutePathsByLineNumber(stations);

  return stations.map((station) => {
    const displayCoordinate = createSubwayStationDisplayCoordinate(
      station,
      routePathsByLineNumber.get(station.lineNumber) ?? [],
    );

    if (displayCoordinate === undefined) {
      return station;
    }

    return {
      ...station,
      longitude: displayCoordinate[0],
      latitude: displayCoordinate[1],
    };
  });
}

export function createSubwayRoutePathLayers(
  selectedLineNumbers: SubwayLineNumber[],
  visualStyle: SubwayRouteVisualStyle,
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
      getColor: (route) => withAlpha(route.color, visualStyle.glow.alpha),
      getWidth: visualStyle.glow.width,
      widthUnits: "pixels",
      widthMinPixels: visualStyle.glow.minWidth,
      widthMaxPixels: visualStyle.glow.maxWidth,
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
      getColor: (route) => withAlpha(route.color, visualStyle.aura.alpha),
      getWidth: visualStyle.aura.width,
      widthUnits: "pixels",
      widthMinPixels: visualStyle.aura.minWidth,
      widthMaxPixels: visualStyle.aura.maxWidth,
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
      getColor: (route) => withAlpha(route.color, visualStyle.body.alpha),
      getWidth: visualStyle.body.width,
      widthUnits: "pixels",
      widthMinPixels: visualStyle.body.minWidth,
      widthMaxPixels: visualStyle.body.maxWidth,
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
      getColor: (route) =>
        withAlpha(route.highlightColor, visualStyle.highlight.alpha),
      getWidth: visualStyle.highlight.width,
      widthUnits: "pixels",
      widthMinPixels: visualStyle.highlight.minWidth,
      widthMaxPixels: visualStyle.highlight.maxWidth,
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
  visualStyle: SubwayStationCircleVisualStyle,
): LayersList {
  if (!visualStyle.isVisible) {
    return [];
  }

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
      getFillColor: (station) =>
        withAlpha(station.color, visualStyle.glow.alpha),
      getRadius: visualStyle.glow.radius,
      radiusUnits: "pixels",
      radiusMinPixels: visualStyle.glow.minRadius,
      radiusMaxPixels: visualStyle.glow.maxRadius,
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
      getFillColor: (station) =>
        withAlpha(station.color, visualStyle.border.alpha),
      getRadius: visualStyle.border.radius,
      radiusUnits: "pixels",
      radiusMinPixels: visualStyle.border.minRadius,
      radiusMaxPixels: visualStyle.border.maxRadius,
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
      getFillColor: [3, 16, 10, visualStyle.gap.alpha],
      getRadius: visualStyle.gap.radius,
      radiusUnits: "pixels",
      radiusMinPixels: visualStyle.gap.minRadius,
      radiusMaxPixels: visualStyle.gap.maxRadius,
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
      getFillColor: [245, 255, 249, visualStyle.core.alpha],
      getRadius: visualStyle.core.radius,
      radiusUnits: "pixels",
      radiusMinPixels: visualStyle.core.minRadius,
      radiusMaxPixels: visualStyle.core.maxRadius,
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
      getFillColor: [255, 255, 255, visualStyle.highlight.alpha],
      getRadius: visualStyle.highlight.radius,
      radiusUnits: "pixels",
      radiusMinPixels: visualStyle.highlight.minRadius,
      radiusMaxPixels: visualStyle.highlight.maxRadius,
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

function createSubwayRoutePathsByLineNumber(
  stations: SubwayStationMapPoint[],
): Map<SubwayLineNumber, SubwayRoutePath[]> {
  const routePathsByLineNumber = new Map<
    SubwayLineNumber,
    SubwayRoutePath[]
  >();

  stations.forEach((station) => {
    if (routePathsByLineNumber.has(station.lineNumber)) {
      return;
    }

    routePathsByLineNumber.set(
      station.lineNumber,
      createSubwayRoutePaths([station.lineNumber]),
    );
  });

  return routePathsByLineNumber;
}

function createSubwayStationDisplayCoordinate(
  station: SubwayStationMapPoint,
  routePaths: SubwayRoutePath[],
): SubwayCoordinate | undefined {
  const projectedTrackPoints = findNearbyProjectedTrackPoints(
    station,
    routePaths,
  );

  if (projectedTrackPoints.length < 2) {
    return undefined;
  }

  const displayEndpoints = findFarthestProjectedTrackPointPair(
    projectedTrackPoints,
  );

  if (displayEndpoints === undefined) {
    return undefined;
  }

  return createCoordinateMidpoint(
    displayEndpoints[0].coordinate,
    displayEndpoints[1].coordinate,
  );
}

function findNearbyProjectedTrackPoints(
  station: SubwayStationMapPoint,
  routePaths: SubwayRoutePath[],
): ProjectedSubwayTrackPoint[] {
  const projectedTrackPoints = routePaths
    .map((routePath) => findClosestProjectedTrackPoint(station, routePath.path))
    .filter(
      (
        projectedTrackPoint,
      ): projectedTrackPoint is ProjectedSubwayTrackPoint =>
        projectedTrackPoint !== undefined,
    )
    .filter(
      (projectedTrackPoint) =>
        projectedTrackPoint.distanceMeters <=
        STATION_DISPLAY_SEARCH_RADIUS_METERS,
    )
    .sort(
      (firstProjectedTrackPoint, secondProjectedTrackPoint) =>
        firstProjectedTrackPoint.distanceMeters -
        secondProjectedTrackPoint.distanceMeters,
    );

  return projectedTrackPoints.reduce<ProjectedSubwayTrackPoint[]>(
    (distinctProjectedTrackPoints, projectedTrackPoint) => {
      const hasDuplicate = distinctProjectedTrackPoints.some(
        (distinctProjectedTrackPoint) =>
          calculateProjectedPointDistanceMeters(
            projectedTrackPoint,
            distinctProjectedTrackPoint,
          ) < STATION_DISPLAY_POINT_MERGE_DISTANCE_METERS,
      );

      if (hasDuplicate) {
        return distinctProjectedTrackPoints;
      }

      return [...distinctProjectedTrackPoints, projectedTrackPoint];
    },
    [],
  );
}

function findClosestProjectedTrackPoint(
  station: SubwayStationMapPoint,
  path: SubwayCoordinate[],
): ProjectedSubwayTrackPoint | undefined {
  return path.slice(0, -1).reduce<ProjectedSubwayTrackPoint | undefined>(
    (closestProjectedTrackPoint, coordinate, index) => {
      const projectedTrackPoint = projectStationToSegment(
        station,
        coordinate,
        path[index + 1],
      );

      if (
        closestProjectedTrackPoint !== undefined &&
        closestProjectedTrackPoint.distanceMeters <=
          projectedTrackPoint.distanceMeters
      ) {
        return closestProjectedTrackPoint;
      }

      return projectedTrackPoint;
    },
    undefined,
  );
}

function projectStationToSegment(
  station: SubwayStationMapPoint,
  startCoordinate: SubwayCoordinate,
  endCoordinate: SubwayCoordinate,
): ProjectedSubwayTrackPoint {
  const startPoint = projectCoordinateToStationMeters(startCoordinate, station);
  const endPoint = projectCoordinateToStationMeters(endCoordinate, station);
  const segmentX = endPoint.xMeters - startPoint.xMeters;
  const segmentY = endPoint.yMeters - startPoint.yMeters;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSquared === 0) {
    return {
      coordinate: startCoordinate,
      distanceMeters: Math.hypot(startPoint.xMeters, startPoint.yMeters),
      xMeters: startPoint.xMeters,
      yMeters: startPoint.yMeters,
    };
  }

  const projectionRatio = Math.max(
    0,
    Math.min(
      1,
      -(startPoint.xMeters * segmentX + startPoint.yMeters * segmentY) /
        segmentLengthSquared,
    ),
  );
  const xMeters = startPoint.xMeters + segmentX * projectionRatio;
  const yMeters = startPoint.yMeters + segmentY * projectionRatio;

  return {
    coordinate: unprojectStationMetersToCoordinate(xMeters, yMeters, station),
    distanceMeters: Math.hypot(xMeters, yMeters),
    xMeters,
    yMeters,
  };
}

function projectCoordinateToStationMeters(
  coordinate: SubwayCoordinate,
  station: SubwayStationMapPoint,
): { xMeters: number; yMeters: number } {
  return {
    xMeters:
      (coordinate[0] - station.longitude) *
      getLongitudeDegreeMeters(station.latitude),
    yMeters: (coordinate[1] - station.latitude) * LATITUDE_DEGREE_METERS,
  };
}

function unprojectStationMetersToCoordinate(
  xMeters: number,
  yMeters: number,
  station: SubwayStationMapPoint,
): SubwayCoordinate {
  return [
    station.longitude + xMeters / getLongitudeDegreeMeters(station.latitude),
    station.latitude + yMeters / LATITUDE_DEGREE_METERS,
  ];
}

function getLongitudeDegreeMeters(latitude: number): number {
  return LATITUDE_DEGREE_METERS * Math.cos((latitude * Math.PI) / 180);
}

function findFarthestProjectedTrackPointPair(
  projectedTrackPoints: ProjectedSubwayTrackPoint[],
): [ProjectedSubwayTrackPoint, ProjectedSubwayTrackPoint] | undefined {
  let farthestProjectedTrackPointPair:
    | [ProjectedSubwayTrackPoint, ProjectedSubwayTrackPoint]
    | undefined;
  let farthestDistanceMeters = 0;

  projectedTrackPoints.forEach((firstProjectedTrackPoint, firstIndex) => {
    projectedTrackPoints
      .slice(firstIndex + 1)
      .forEach((secondProjectedTrackPoint) => {
        const distanceMeters = calculateProjectedPointDistanceMeters(
          firstProjectedTrackPoint,
          secondProjectedTrackPoint,
        );

        if (distanceMeters > farthestDistanceMeters) {
          farthestDistanceMeters = distanceMeters;
          farthestProjectedTrackPointPair = [
            firstProjectedTrackPoint,
            secondProjectedTrackPoint,
          ];
        }
      });
  });

  if (
    farthestDistanceMeters < STATION_DISPLAY_MIN_TRACK_GAP_METERS ||
    farthestDistanceMeters > STATION_DISPLAY_MAX_TRACK_GAP_METERS
  ) {
    return undefined;
  }

  return farthestProjectedTrackPointPair;
}

function calculateProjectedPointDistanceMeters(
  firstProjectedTrackPoint: ProjectedSubwayTrackPoint,
  secondProjectedTrackPoint: ProjectedSubwayTrackPoint,
): number {
  return Math.hypot(
    firstProjectedTrackPoint.xMeters - secondProjectedTrackPoint.xMeters,
    firstProjectedTrackPoint.yMeters - secondProjectedTrackPoint.yMeters,
  );
}

function createCoordinateMidpoint(
  firstCoordinate: SubwayCoordinate,
  secondCoordinate: SubwayCoordinate,
): SubwayCoordinate {
  return [
    (firstCoordinate[0] + secondCoordinate[0]) / 2,
    (firstCoordinate[1] + secondCoordinate[1]) / 2,
  ];
}

function createSubwayVisualStyle(
  visualLevel: SubwayVisualLevel,
): SubwayVisualStyle {
  switch (visualLevel.id) {
    case "overview":
      return {
        route: {
          glow: { width: 4.2, minWidth: 1, maxWidth: 5, alpha: 14 },
          aura: { width: 3, minWidth: 0.8, maxWidth: 3.6, alpha: 42 },
          body: { width: 1.45, minWidth: 0.6, maxWidth: 1.8, alpha: 205 },
          highlight: {
            width: 0.35,
            minWidth: 0.15,
            maxWidth: 0.45,
            alpha: 120,
          },
        },
        stationCircle: createHiddenStationCircleStyle(),
      };

    case "network":
      return {
        route: {
          glow: { width: 5.2, minWidth: 1.1, maxWidth: 5.8, alpha: 16 },
          aura: { width: 3.5, minWidth: 0.9, maxWidth: 4.1, alpha: 48 },
          body: { width: 1.75, minWidth: 0.75, maxWidth: 2.15, alpha: 216 },
          highlight: { width: 0.4, minWidth: 0.18, maxWidth: 0.52, alpha: 135 },
        },
        stationCircle: createHiddenStationCircleStyle(),
      };

    case "station":
      return {
        route: {
          glow: { width: 4.8, minWidth: 1.2, maxWidth: 5.6, alpha: 14 },
          aura: { width: 3.6, minWidth: 1, maxWidth: 4.2, alpha: 48 },
          body: { width: 1.95, minWidth: 0.85, maxWidth: 2.35, alpha: 214 },
          highlight: {
            width: 0.45,
            minWidth: 0.2,
            maxWidth: 0.58,
            alpha: 138,
          },
        },
        stationCircle: {
          isVisible: true,
          glow: { radius: 5.7, minRadius: 2.8, maxRadius: 6.4, alpha: 28 },
          border: { radius: 4.4, minRadius: 2.4, maxRadius: 5, alpha: 235 },
          gap: { radius: 3.35, minRadius: 1.8, maxRadius: 3.85, alpha: 248 },
          core: { radius: 2.2, minRadius: 1.1, maxRadius: 2.65, alpha: 252 },
          highlight: {
            radius: 0.85,
            minRadius: 0.42,
            maxRadius: 1.05,
            alpha: 220,
          },
        },
      };

    case "inspection":
      return {
        route: {
          glow: { width: 2.2, minWidth: 0.8, maxWidth: 2.8, alpha: 6 },
          aura: { width: 1.8, minWidth: 0.65, maxWidth: 2.3, alpha: 22 },
          body: { width: 0.95, minWidth: 0.45, maxWidth: 1.25, alpha: 178 },
          highlight: {
            width: 0.18,
            minWidth: 0.08,
            maxWidth: 0.28,
            alpha: 78,
          },
        },
        stationCircle: {
          isVisible: true,
          glow: { radius: 6.3, minRadius: 3.6, maxRadius: 7, alpha: 18 },
          border: { radius: 5.4, minRadius: 3, maxRadius: 6.1, alpha: 238 },
          gap: { radius: 4.25, minRadius: 2.4, maxRadius: 4.85, alpha: 250 },
          core: { radius: 2.65, minRadius: 1.45, maxRadius: 3.15, alpha: 252 },
          highlight: {
            radius: 0.95,
            minRadius: 0.5,
            maxRadius: 1.15,
            alpha: 218,
          },
        },
      };
  }
}

function createHiddenStationCircleStyle(): SubwayStationCircleVisualStyle {
  return {
    isVisible: false,
    glow: { radius: 0, minRadius: 0, maxRadius: 0, alpha: 0 },
    border: { radius: 0, minRadius: 0, maxRadius: 0, alpha: 0 },
    gap: { radius: 0, minRadius: 0, maxRadius: 0, alpha: 0 },
    core: { radius: 0, minRadius: 0, maxRadius: 0, alpha: 0 },
    highlight: { radius: 0, minRadius: 0, maxRadius: 0, alpha: 0 },
  };
}

const LATITUDE_DEGREE_METERS = 111_320;
const STATION_DISPLAY_SEARCH_RADIUS_METERS = 95;
const STATION_DISPLAY_MIN_TRACK_GAP_METERS = 2;
const STATION_DISPLAY_MAX_TRACK_GAP_METERS = 180;
const STATION_DISPLAY_POINT_MERGE_DISTANCE_METERS = 1;

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
