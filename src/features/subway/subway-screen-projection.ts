import { LngLat, MercatorCoordinate, type Map as MapLibreMap } from "maplibre-gl";
import type { SubwayCoordinate } from "./osm-subway-network";
import type { Project } from "./subway-overview-icon";

type Transform = MapLibreMap["transform"];

function projectElevation(
  coordinate: SubwayCoordinate,
  altitude: number,
  transform: Transform,
  matrix: ArrayLike<number>,
) {
  const { x, y, z } = MercatorCoordinate.fromLngLat(coordinate, altitude);
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const clipX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  const clipY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  return {
    x: (1 + clipX / w) * transform.width / 2,
    y: (1 - clipY / w) * transform.height / 2,
  };
}

export function createSubwayScreenProjector(map: MapLibreMap): Project {
  let viewMatrix: Transform["modelViewProjectionMatrix"] | undefined;
  let matrix: ArrayLike<number> | undefined;
  return (coordinate, altitude = 0) => {
    if (!altitude) return map.project(coordinate);
    const transform = map.transform;
    const view = transform.modelViewProjectionMatrix;
    // Three.js의 사용자 레이어와 같은 투영을 쓰고 카메라가 바뀔 때만 갱신한다.
    if (!matrix || viewMatrix !== view) {
      viewMatrix = view;
      matrix = transform.getProjectionDataForCustomLayer(false).mainMatrix;
    }
    return projectElevation(coordinate, altitude, transform, matrix);
  };
}

export function subwayCameraOffset(
  map: MapLibreMap,
  coordinate: SubwayCoordinate,
  altitude: number,
  { zoom, pitch, bearing }: { zoom: number; pitch: number; bearing: number },
): [number, number] {
  if (!altitude) return [0, 0];
  const transform = map.transform.clone();
  const center = LngLat.convert(coordinate);
  transform.setZoom(zoom);
  transform.setPitch(pitch);
  transform.setBearing(bearing);
  // 높이가 있는 목표를 지나도록 카메라 시선을 지표까지 연장한다.
  const target = MercatorCoordinate.fromLngLat(center, altitude);
  const setback = target.z * Math.tan(transform.pitchInRadians);
  const bearingRadians = transform.bearingInRadians;
  const groundCenter = new MercatorCoordinate(
    target.x + Math.sin(bearingRadians) * setback,
    target.y - Math.cos(bearingRadians) * setback,
  );
  transform.setCenter(groundCenter.toLngLat());
  const ground = transform.locationToScreenPoint(center);
  return [ground.x - transform.centerPoint.x, ground.y - transform.centerPoint.y];
}
