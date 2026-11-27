import { LngLat, type Map as MapLibreMap } from "maplibre-gl";
import { SEOUL_CENTER } from "../../app/map-config";
import { getSubwayTrainFraming } from "../subway/subway-train-camera";
import { SUBWAY_TRAIN_CAR_LENGTH_METERS } from "../subway/subway-train-dimensions";
import { CINEMA_ORBIT_MS, isMorningPeak, type CinemaShot } from "./cinema-sequence";

export type CinemaView = ReturnType<typeof readCinemaView>;

export function readCinemaView(map: MapLibreMap) {
  return {
    center: map.getCenter(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    elevation: map.getCenterElevation(),
    roll: map.getRoll(),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const angularDelta = (a: number, b: number) => ((b - a + 540) % 360) - 180;

export function blendCinemaView(from: CinemaView, to: CinemaView, t: number): CinemaView {
  return {
    center: new LngLat(
      from.center.lng + angularDelta(from.center.lng, to.center.lng) * t,
      lerp(from.center.lat, to.center.lat, t),
    ),
    zoom: lerp(from.zoom, to.zoom, t),
    pitch: lerp(from.pitch, to.pitch, t),
    bearing: from.bearing + angularDelta(from.bearing, to.bearing) * t,
    elevation: lerp(from.elevation, to.elevation, t),
    roll: lerp(from.roll, to.roll, t),
  };
}

export function getCinemaView(map: MapLibreMap, shot: CinemaShot, time: number, elapsed: number, entryBearing: number): CinemaView | undefined {
  const width = map.getContainer().clientWidth;
  if (shot.kind === "orbit") {
    const latitude = isMorningPeak(time) ? 37.539 : SEOUL_CENTER.latitude;
    return {
      center: new LngLat(SEOUL_CENTER.longitude, latitude),
      zoom: width < 600 ? 10.25 : 11.1,
      pitch: 52,
      bearing: (entryBearing + 360 * elapsed / CINEMA_ORBIT_MS) % 360,
      elevation: 0,
      roll: 0,
    };
  }

  const pose = shot.train.sample(time);
  if (!pose) return;
  if (shot.kind === "front") {
    const { sampler, frontDistanceMeters } = pose;
    const nose = frontDistanceMeters + SUBWAY_TRAIN_CAR_LENGTH_METERS / 2 + 1;
    const cab = sampler.sample(nose).coordinate;
    const ahead = sampler.sample(nose + 55).coordinate;
    // 지하 공간을 렌더링하지 않는 베이스맵에서는 선두의 주행 방향을 지표에서 보여준다.
    const eye = Math.max(0, sampler.elevationAt?.(nose) ?? 0) + 4;
    const target = Math.min(eye - 5.5, Math.max(0, sampler.elevationAt?.(nose + 55) ?? 0));
    const camera = map.calculateCameraOptionsFromTo(LngLat.convert(cab), eye, LngLat.convert(ahead), target);
    return {
      center: LngLat.convert(camera.center!),
      zoom: camera.zoom!,
      pitch: camera.pitch!,
      bearing: camera.bearing!,
      elevation: camera.elevation!,
      roll: 0,
    };
  }

  const view = getSubwayTrainFraming(width, shot.train.carCount, pose);
  return {
    ...view,
    center: LngLat.convert(view.center),
    elevation: Math.max(0, view.elevation),
    zoom: shot.kind === "transfer" ? Math.min(view.zoom, 16.7) : view.zoom,
    roll: 0,
  };
}
