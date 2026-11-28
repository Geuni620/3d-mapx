import tracks from "./data/bridge-tracks.json";

export const origin: [number, number] = [126.90909, 37.54232];
const latitudeMeter = (Math.PI * 6371008.8) / 180;
const longitudeMeter = latitudeMeter * Math.cos((origin[1] * Math.PI) / 180);
export function localMeters(lng: number, lat: number) {
  return { east: (lng - origin[0]) * longitudeMeter, south: (origin[1] - lat) * latitudeMeter };
}
export function geographic(east: number, south: number): [number, number] {
  return [origin[0] + east / longitudeMeter, origin[1] - south / latitudeMeter];
}
export type Loop = keyof typeof tracks;
export function bridgeEnds(direction: Loop) {
  const points = tracks[direction].northToSouth;
  const north = points[0] as [number, number],
    south = points[points.length - 1] as [number, number];
  return direction === "inner-loop" ? { entry: south, exit: north } : { entry: north, exit: south };
}
// OSM 철교 way 261477607·640443224의 두 선로 사이를 남단부터 누적한다.
export const bridgeCenterline = tracks["inner-loop"].northToSouth
  .map((p, i) => {
    const q = tracks["outer-loop"].northToSouth[i];
    return localMeters((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
  })
  .reverse();
// OSM 183520272/640443223 are the Dangsan viaduct; 1032005336/7 end at the Hapjeong portal.
const middleOfTracks = (x: number, y: number, x2: number, y2: number) =>
  localMeters((x + x2) / 2, (y + y2) / 2);
const southApproach = [
  middleOfTracks(126.898336, 37.5294071, 126.8983743, 37.529386),
  middleOfTracks(126.9019028, 37.5339102, 126.9019362, 37.5338837),
];
const northApproach = [
  middleOfTracks(126.9123335, 37.5475063, 126.9123784, 37.5474894),
  middleOfTracks(126.9125588, 37.5479444, 126.9126053, 37.5479239),
  middleOfTracks(126.9128567, 37.5484123, 126.9129011, 37.5484015),
];
const points = [...southApproach, ...bridgeCenterline, ...northApproach];
let length = 0;
const pieces = points.slice(1).map((next, i) => {
  const start = points[i],
    dx = next.east - start.east,
    dz = next.south - start.south;
  const size = Math.hypot(dx, dz),
    offset = length;
  length += size;
  return { start, size, offset, x: dx / size, z: dz / size };
});
export const southPortal = -pieces[southApproach.length].offset;
for (const segment of pieces) segment.offset += southPortal;
export const bridgeLength = pieces[southApproach.length + bridgeCenterline.length - 1].offset;
export const northPortal = length + southPortal;
export function pointOnBridge(distance: number) {
  const s = pieces.find((seg) => distance < seg.offset + seg.size) ?? pieces[pieces.length - 1];
  return {
    east: s.start.east + (distance - s.offset) * s.x,
    south: s.start.south + (distance - s.offset) * s.z,
    bearing: Math.atan2(s.x, -s.z),
  };
}
export function nearestBridgePoint(lng: number, lat: number) {
  const p = localMeters(lng, lat);
  let closest = Infinity,
    along = 0,
    side = 0;
  for (const [i, s] of pieces.entries()) {
    const dx = p.east - s.start.east,
      dz = p.south - s.start.south;
    const projection = dx * s.x + dz * s.z;
    const clamped = Math.min(s.size, Math.max(0, projection));
    const d = Math.hypot(dx - clamped * s.x, dz - clamped * s.z);
    if (d < closest) {
      closest = d;
      side = -s.z * dx + s.x * dz;
      along =
        s.offset +
        ((i === 0 && projection < 0) || (i === pieces.length - 1 && projection > s.size)
          ? projection
          : clamped);
    }
  }
  return { distance: closest, along, side };
}
const middle = pointOnBridge(length / 2);
export const bridgeCenter = geographic(middle.east, middle.south);
