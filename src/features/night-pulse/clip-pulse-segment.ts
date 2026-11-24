import type { SubwayCoordinate } from "../subway/osm-subway-network";

export function createPulseSegmentClipper(corners: readonly SubwayCoordinate[]) {
  const west = Math.min(...corners.map(([x]) => x));
  const east = Math.max(...corners.map(([x]) => x));
  const south = Math.min(...corners.map(([, y]) => y));
  const north = Math.max(...corners.map(([, y]) => y));
  const [a, b, c] = corners;
  const winding = Math.sign((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]));
  const edges = corners.map(([x, y], i) => {
    const [nextX, nextY] = corners[(i + 1) % corners.length];
    return { x, y, dx: (nextX - x) * winding, dy: (nextY - y) * winding };
  });

  // 투영 전에 보이는 지면 사각형으로 자르면 지평선 뒤의 점을 연결하지 않는다.
  return (from: SubwayCoordinate, to: SubwayCoordinate): [SubwayCoordinate, SubwayCoordinate] | undefined => {
    if ((from[0] < west && to[0] < west) || (from[0] > east && to[0] > east) ||
        (from[1] < south && to[1] < south) || (from[1] > north && to[1] > north)) return;

    let enter = 0;
    let leave = 1;
    for (const { x, y, dx, dy } of edges) {
      const start = dx * (from[1] - y) - dy * (from[0] - x);
      const end = dx * (to[1] - y) - dy * (to[0] - x);
      if (start < 0 && end < 0) return;
      if (start < 0) enter = Math.max(enter, start / (start - end));
      else if (end < 0) leave = Math.min(leave, start / (start - end));
      if (enter >= leave) return;
    }

    const sample = (t: number): SubwayCoordinate => [
      from[0] + t * (to[0] - from[0]),
      from[1] + t * (to[1] - from[1]),
    ];
    return [enter === 0 ? from : sample(enter), leave === 1 ? to : sample(leave)];
  };
}
