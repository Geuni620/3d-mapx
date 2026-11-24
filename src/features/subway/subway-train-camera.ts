import type { Map as MapLibreMap } from "maplibre-gl";
import type { SubwayRouteSampler } from "./subway-route-sampler";
import { SUBWAY_TRAIN_CAR_SPACING_METERS } from "./subway-train-dimensions";
import { subwayCameraOffset } from "./subway-screen-projection";

interface TrainPosition {
  sampler: SubwayRouteSampler;
  frontDistanceMeters: number;
}

export function focusSubwayTrain(
  map: MapLibreMap,
  carCount: number,
  positionAt: (offsetMs: number) => TrainPosition,
  animate: boolean,
) {
  const duration = animate ? 780 : 0;
  const { sampler, frontDistanceMeters } = positionAt(duration);
  const distance = frontDistanceMeters - (carCount - 1) * SUBWAY_TRAIN_CAR_SPACING_METERS / 2;
  const middle = sampler.sample(distance);
  const fit = Math.min(1.2, Math.max(0.5, map.getContainer().clientWidth / 1024));
  const view = {
    zoom: Math.min(18.6, 17.8 + Math.log2(10 / carCount * fit)),
    pitch: 52,
    bearing: middle.headingRadians * 180 / Math.PI - 74,
  };
  map.easeTo({
    ...view,
    center: middle.coordinate,
    offset: subwayCameraOffset(map, middle.coordinate, sampler.elevationAt?.(distance) ?? 0, view),
    duration,
  });
}
