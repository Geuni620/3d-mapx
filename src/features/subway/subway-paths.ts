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

interface ProjectedSubwayTrackPoint {
  coordinate: SubwayCoordinate;
  distanceMeters: number;
  xMeters: number;
  yMeters: number;
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
