import stationElevations from "./data/subway-station-elevations.json";
import { bridgeLength, geographic, northPortal, pointOnBridge } from "../dangsan/bridge-alignment";
import { railHeightAt } from "../dangsan/bridge-location";
import { SEOUL_SUBWAY_OSM_NETWORK, type SubwayCoordinate } from "./osm-subway-network";
import type { SubwayLineNumber } from "./subway-constants";
import {
  calculateCoordinateDistanceMeters, createSubwayRouteSampler, type SubwayRouteSampler,
} from "./subway-route-sampler";
import { SUBWAY_TRAIN_BOGIE_OFFSET_METERS } from "./subway-train-dimensions";

export type ElevatedSubwayCoordinate = [longitude: number, latitude: number, altitude: number];

const measuredAltitudes: Readonly<Record<string, number | undefined>> = stationElevations.stations;
const MAX_STATION_OFFSET_METERS = 110;
const surfaceAltitude = 0;

interface ElevationAnchor {
  distance: number;
  altitude: number;
  offset: number;
}

// 역 고도 사이에서도 당산철교는 지면 위를 달린다. 교량의 높이와 경사는 근사값이다.
const bridgeAnchors = [0, 290, bridgeLength - 300, bridgeLength, northPortal].map(along => {
  const { east, south } = pointOnBridge(along);
  return { coordinate: geographic(east, south), altitude: railHeightAt(along) };
});

export function getSubwayStationAltitude(stationId: string | number) {
  return measuredAltitudes[stationId];
}

export function getSubwayCarElevation(sampler: SubwayRouteSampler, distance: number) {
  const heightAt = sampler.elevationAt;
  if (!heightAt) return { altitude: surfaceAltitude, pitch: 0 };
  const offset = SUBWAY_TRAIN_BOGIE_OFFSET_METERS;
  return {
    altitude: heightAt(distance),
    pitch: Math.atan2(heightAt(distance + offset) - heightAt(distance - offset), 2 * offset),
  };
}

export function createElevatedSubwayRoute(
  line: SubwayLineNumber,
  path: SubwayCoordinate[],
  closed: boolean,
) {
  const sampler = createSubwayRouteSampler(path, { closed });
  if (!sampler) return undefined;
  const projectedStations = SEOUL_SUBWAY_OSM_NETWORK.stations.filter(station => station.lineNumber === line).flatMap(station => {
    const { distanceMeters, offsetMeters } = sampler.project([station.longitude, station.latitude]);
    return offsetMeters <= MAX_STATION_OFFSET_METERS
      ? [{ distance: distanceMeters, offset: offsetMeters, altitude: getSubwayStationAltitude(station.id) }]
      : [];
  });
  const measured = projectedStations.filter((station): station is ElevationAnchor => station.altitude !== undefined);
  const anchors = [...measured];
  if (measured.length && !closed) {
    const first = Math.min(...measured.map(station => station.distance));
    const last = Math.max(...measured.map(station => station.distance));
    const before = projectedStations.filter(station => station.distance < first).sort((a, b) => b.distance - a.distance)[0];
    const after = projectedStations.filter(station => station.distance > last).sort((a, b) => a.distance - b.distance)[0];
    // 관측이 없는 연장 구간은 가장 가까운 미측정 역에서 중립 높이로 이어준다.
    for (const end of [before, after]) {
      if (end) anchors.push({ ...end, altitude: surfaceAltitude });
    }
  }
  if (line === 2) {
    for (const { coordinate, altitude } of bridgeAnchors) {
      const { distanceMeters, offsetMeters } = sampler.project(coordinate);
      if (offsetMeters <= 24) anchors.push({ distance: distanceMeters, altitude, offset: offsetMeters });
    }
  }

  const length = sampler.totalDistanceMeters;
  const controls = anchors.map(anchor => closed && anchor.distance === length
    ? { ...anchor, distance: 0 } : anchor).sort((a, b) => a.distance - b.distance || a.offset - b.offset)
    .filter((anchor, i, sorted) => i === 0 || anchor.distance !== sorted[i - 1].distance);
  const first = controls[0];
  const last = controls.at(-1);
  const interpolation = closed && first && last ? [
    { ...last, distance: last.distance - length }, ...controls,
    { ...first, distance: first.distance + length },
  ] : controls;

  function elevationAt(distance: number) {
    if (!first || !last) return surfaceAltitude;
    const along = closed ? ((distance % length) + length) % length : distance;
    if (!closed && along <= first.distance) return first.altitude;
    if (!closed && along >= last.distance) return last.altitude;

    let low = 0;
    let high = interpolation.length - 1;
    while (high - low > 1) {
      const at = (low + high) >>> 1;
      if (interpolation[at].distance <= along) low = at;
      else high = at;
    }
    const a = interpolation[low];
    const b = interpolation[high];
    const progress = (along - a.distance) / (b.distance - a.distance);
    return a.altitude + (b.altitude - a.altitude) * progress;
  }

  return { ...sampler, elevationAt, controls };
}

export function elevateSubwayPath(line: SubwayLineNumber, path: SubwayCoordinate[]): ElevatedSubwayCoordinate[] {
  const first = path[0];
  const last = path.at(-1);
  const closed = first?.[0] === last?.[0] && first?.[1] === last?.[1];
  const route = createElevatedSubwayRoute(line, path, closed);
  if (!route) return path.map(([lng, lat]) => [lng, lat, surfaceAltitude]);
  // 역·교량 제어점을 선의 꼭짓점으로 추가해 차량과 선에 동일한 경사를 적용한다.
  const distances = new Set(route.controls.map(anchor => anchor.distance));
  let distance = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) distance += calculateCoordinateDistanceMeters(path[i - 1], path[i]);
    distances.add(distance);
  }
  return [...distances].sort((a, b) => a - b).map(at => [
    ...route.sample(at).coordinate, route.elevationAt(at),
  ]);
}
