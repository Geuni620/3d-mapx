import { bridgeLength, nearestBridgePoint, northPortal, origin, southPortal } from "./bridge-alignment";
// 지도의 수평 좌표는 동·남, 고도는 레일 윗면 기준 미터다.
export const DANGSAN_ORIGIN = origin;
export const DANGSAN_BEARING = 0.60285;
export const DANGSAN_RAIL_HEIGHT = 18;
export const PASSING_TIME = Date.parse("2026-11-21T17:16:15+09:00");
export const BRIDGE_MIN_ZOOM = 14;
const m = (Math.PI * 6371008.8) / 180;
const eastMeter = m * Math.cos((DANGSAN_ORIGIN[1] * Math.PI) / 180);
const sin = Math.sin(DANGSAN_BEARING),
  cos = Math.cos(DANGSAN_BEARING);
export function bridgeOffset(lng: number, lat: number) {
  const east = (lng - DANGSAN_ORIGIN[0]) * eastMeter,
    north = (lat - DANGSAN_ORIGIN[1]) * m;
  return { along: east * sin + north * cos, across: east * cos - north * sin };
}
function smooth(t: number) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}
// Horizontal limits follow the OSM viaduct and portals. Vertical control points are visual estimates.
const profile = [[southPortal, 0], [-240, 10], [0, 10], [290, DANGSAN_RAIL_HEIGHT],
  [bridgeLength - 300, DANGSAN_RAIL_HEIGHT], [bridgeLength, 6], [northPortal, 0]] as const;
export function railHeightAt(along: number) {
  if (along <= southPortal || along >= northPortal) return 0;
  for (let i = 1; i < profile.length; i++) {
    const [end, next] = profile[i];
    if (along <= end) {
      const [start, prev] = profile[i - 1];
      return prev + (next - prev) * smooth((along - start) / (end - start));
    }
  }
  return 0;
}
export function inBridgeArea(lng: number, lat: number) {
  return lng > 126.897 && lng < 126.914 && lat > 37.528 && lat < 37.550;
}
export function bridgeRailHeight(coord: readonly number[]) {
  if (!inBridgeArea(coord[0], coord[1])) return 0;
  const p = nearestBridgePoint(coord[0], coord[1]);
  return p.distance < 22 ? railHeightAt(p.along) : 0;
}
export function railPose(coord: readonly number[], heading: number) {
  const height = bridgeRailHeight(coord);
  if (!height) return { height: 0, pitch: 0 };
  const dx = Math.sin(heading) * 6.9 / eastMeter, dy = Math.cos(heading) * 6.9 / m;
  const front = bridgeRailHeight([coord[0] + dx, coord[1] + dy]);
  const rear = bridgeRailHeight([coord[0] - dx, coord[1] - dy]);
  return { height: (front + rear) / 2, pitch: Math.atan2(front - rear, 13.8) };
}
export function isBridgeTrain(coord: readonly number[]) {
  const { along, across } = bridgeOffset(coord[0], coord[1]);
  return Math.abs(across) < 28 && Math.abs(along) < 1015;
}
export function bridgeViewWeight(lng: number, lat: number, zoom: number) {
  const d = nearestBridgePoint(lng, lat).distance;
  return smooth((zoom - 13.5) / 1.4) * (1 - smooth((d - 640) / 850));
}
export function lngLatFromLocal(east: number, south: number): [number, number] {
  return [DANGSAN_ORIGIN[0] + east / eastMeter, DANGSAN_ORIGIN[1] - south / m];
}
