import type { SubwayCoordinate } from "./osm-subway-network";

const EARTH_RADIUS_METERS = 6_371_008.8;
const DEGREES_TO_RADIANS = Math.PI / 180;

interface RouteSegment {
  start: SubwayCoordinate;
  end: SubwayCoordinate;
  startDistanceMeters: number;
  lengthMeters: number;
  headingRadians: number;
}

export interface SubwayRoutePose {
  coordinate: SubwayCoordinate;
  headingRadians: number;
}

export interface SubwayRouteProjection extends SubwayRoutePose {
  distanceMeters: number;
  offsetMeters: number;
}

export interface SubwayRouteSampler {
  totalDistanceMeters: number;
  sample: (distanceMeters: number) => SubwayRoutePose;
  project: (coordinate: SubwayCoordinate) => SubwayRouteProjection;
}

export function createSubwayRouteSampler(
  path: ReadonlyArray<readonly [number, number]>,
): SubwayRouteSampler | undefined {
  if (path.length < 2) {
    return undefined;
  }

  const coordinates = path.map(
    ([longitude, latitude]): SubwayCoordinate => [longitude, latitude],
  );
  const firstCoordinate = coordinates[0];
  const lastCoordinate = coordinates.at(-1);

  if (!coordinatesEqual(firstCoordinate, lastCoordinate)) {
    coordinates.push([...firstCoordinate]);
  }

  const segments: RouteSegment[] = [];
  let totalDistanceMeters = 0;

  coordinates.slice(0, -1).forEach((start, index) => {
    const end = coordinates[index + 1];
    const lengthMeters = calculateCoordinateDistanceMeters(start, end);

    if (lengthMeters === 0) {
      return;
    }

    segments.push({
      start,
      end,
      startDistanceMeters: totalDistanceMeters,
      lengthMeters,
      headingRadians: calculateHeadingRadians(start, end),
    });
    totalDistanceMeters += lengthMeters;
  });

  if (segments.length === 0 || totalDistanceMeters === 0) {
    return undefined;
  }

  return {
    totalDistanceMeters,
    sample(distanceMeters) {
      const wrappedDistanceMeters = wrapDistance(
        distanceMeters,
        totalDistanceMeters,
      );
      const segment =
        segments.find(
          (candidate) =>
            wrappedDistanceMeters <
            candidate.startDistanceMeters + candidate.lengthMeters,
        ) ?? segments.at(-1)!;
      const segmentProgress =
        (wrappedDistanceMeters - segment.startDistanceMeters) /
        segment.lengthMeters;

      return {
        coordinate: interpolateCoordinate(
          segment.start,
          segment.end,
          segmentProgress,
        ),
        headingRadians: segment.headingRadians,
      };
    },
    project(coordinate) {
      return segments.reduce<SubwayRouteProjection>(
        (closestProjection, segment) => {
          const projection = projectCoordinateToSegment(coordinate, segment);

          return projection.offsetMeters < closestProjection.offsetMeters
            ? projection
            : closestProjection;
        },
        {
          coordinate: segments[0].start,
          distanceMeters: 0,
          offsetMeters: Number.POSITIVE_INFINITY,
          headingRadians: segments[0].headingRadians,
        },
      );
    },
  };
}

function projectCoordinateToSegment(
  coordinate: SubwayCoordinate,
  segment: RouteSegment,
): SubwayRouteProjection {
  const latitudeRadians = coordinate[1] * DEGREES_TO_RADIANS;
  const longitudeMetersPerDegree =
    (Math.PI * EARTH_RADIUS_METERS * Math.cos(latitudeRadians)) / 180;
  const latitudeMetersPerDegree = (Math.PI * EARTH_RADIUS_METERS) / 180;
  const startX =
    (segment.start[0] - coordinate[0]) * longitudeMetersPerDegree;
  const startY =
    (segment.start[1] - coordinate[1]) * latitudeMetersPerDegree;
  const endX = (segment.end[0] - coordinate[0]) * longitudeMetersPerDegree;
  const endY = (segment.end[1] - coordinate[1]) * latitudeMetersPerDegree;
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const ratio =
    segmentLengthSquared === 0
      ? 0
      : clamp(
          -(startX * segmentX + startY * segmentY) / segmentLengthSquared,
          0,
          1,
        );
  const projectedX = startX + segmentX * ratio;
  const projectedY = startY + segmentY * ratio;

  return {
    coordinate: interpolateCoordinate(segment.start, segment.end, ratio),
    distanceMeters:
      segment.startDistanceMeters + segment.lengthMeters * ratio,
    offsetMeters: Math.hypot(projectedX, projectedY),
    headingRadians: segment.headingRadians,
  };
}

function calculateCoordinateDistanceMeters(
  start: SubwayCoordinate,
  end: SubwayCoordinate,
): number {
  const startLatitude = start[1] * DEGREES_TO_RADIANS;
  const endLatitude = end[1] * DEGREES_TO_RADIANS;
  const latitudeDelta = endLatitude - startLatitude;
  const longitudeDelta = (end[0] - start[0]) * DEGREES_TO_RADIANS;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function calculateHeadingRadians(
  start: SubwayCoordinate,
  end: SubwayCoordinate,
): number {
  const latitudeRadians =
    ((start[1] + end[1]) / 2) * DEGREES_TO_RADIANS;
  const eastMeters =
    (end[0] - start[0]) *
    Math.cos(latitudeRadians) *
    EARTH_RADIUS_METERS *
    DEGREES_TO_RADIANS;
  const northMeters =
    (end[1] - start[1]) * EARTH_RADIUS_METERS * DEGREES_TO_RADIANS;

  return Math.atan2(eastMeters, northMeters);
}

function interpolateCoordinate(
  start: SubwayCoordinate,
  end: SubwayCoordinate,
  progress: number,
): SubwayCoordinate {
  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress,
  ];
}

function wrapDistance(distanceMeters: number, totalDistanceMeters: number) {
  return (
    ((distanceMeters % totalDistanceMeters) + totalDistanceMeters) %
    totalDistanceMeters
  );
}

function coordinatesEqual(
  first: SubwayCoordinate,
  second: SubwayCoordinate | undefined,
) {
  return first[0] === second?.[0] && first[1] === second[1];
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

