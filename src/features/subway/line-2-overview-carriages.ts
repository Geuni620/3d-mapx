import type { SubwayCoordinate } from "./osm-subway-network";
import type { SubwayRouteSampler } from "./subway-route-sampler";
import { SUBWAY_TRAIN_CAR_SPACING_METERS } from "./subway-train-dimensions";

export type Pixel = { x: number; y: number };
export type Viewport = { width: number; height: number };
export type Project = (coordinate: SubwayCoordinate) => Pixel;

const OVERVIEW_CAR_PIXELS = 8;
const OFFSCREEN_PADDING = 68;

// 선두는 추정 좌표에 고정한다. 축소 시에는 칸 사이의 표시 간격만 늘려 실제 곡선의 방향 변화를 읽을 수 있게 한다.
export function sampleOverviewCarriages(
  sampler: SubwayRouteSampler,
  frontDistanceMeters: number,
  zoom: number,
  project: Project,
  viewport?: Viewport,
): Pixel[] {
  const head = sampler.sample(frontDistanceMeters).coordinate;
  const nose = project(head);
  const metersPerPixel = 40_075_016.686 * Math.cos(head[1] * Math.PI / 180) / (512 * 2 ** zoom);
  const pitch = Math.max(SUBWAY_TRAIN_CAR_SPACING_METERS, OVERVIEW_CAR_PIXELS * metersPerPixel);
  const count = Math.max(3, Math.min(10, Math.round(10 * SUBWAY_TRAIN_CAR_SPACING_METERS / pitch)));
  // 선두가 화면 밖에 있어도 뒤 칸이 남아 있는 동안 함께 그린다.
  const margin = Math.max(OFFSCREEN_PADDING, 2 * count * pitch / metersPerPixel);
  if (viewport && (
    nose.x < -margin || nose.y < -margin ||
    nose.x > viewport.width + margin || nose.y > viewport.height + margin
  )) return [];
  const points = [nose];
  for (let i = 1; i <= count; i++) {
    points.push(project(sampler.sample(frontDistanceMeters - i * pitch).coordinate));
  }
  return points;
}
