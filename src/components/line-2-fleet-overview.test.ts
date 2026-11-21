import { describe, expect, it } from "vitest";
import line2Network from "../features/subway/data/osm-subway-line-2.json";
import type { SeoulSubwayOsmServiceRoute, SubwayCoordinate } from "../features/subway/osm-subway-network";
import { createSubwayRouteSampler } from "../features/subway/subway-route-sampler";
import { sampleOverviewCarriages } from "../features/subway/line-2-overview-carriages";

const zoom = 11.90;
const worldSize = 512 * 2 ** zoom;
const routes = line2Network.serviceRoutes as SeoulSubwayOsmServiceRoute[];

function project([longitude, latitude]: SubwayCoordinate) {
  const radians = (latitude * Math.PI) / 180;
  return {
    x: worldSize * (0.5 + longitude / 360),
    y: worldSize * (0.5 - Math.asinh(Math.tan(radians)) / (2 * Math.PI)),
  };
}

function unproject(x: number, y: number): SubwayCoordinate {
  return [
    (x / worldSize - 0.5) * 360,
    (Math.atan(Math.sinh(Math.PI * (1 - 2 * y / worldSize))) * 180) / Math.PI,
  ];
}

describe("줌 11.90 본선 열차 기호", () => {
  it.each([
    { direction: "outer-loop", section: "문래→신도림", leadDistance: 11_000 },
    { direction: "inner-loop", section: "홍대입구→신촌", leadDistance: 44_480 },
  ])("$section 곡선에서 차량 연결점이 실제 선형을 따라 선두 뒤로 휜다", ({ direction, leadDistance }) => {
    const route = routes.find((item) => item.direction === direction)!;
    const sampler = createSubwayRouteSampler(route.path)!;
    const lead = project(sampler.sample(leadDistance).coordinate);
    const points = sampleOverviewCarriages(sampler, leadDistance, zoom, project);
    expect(points.length).toBeGreaterThanOrEqual(4);
    expect(points[0].x).toBeCloseTo(lead.x, 6);
    expect(points[0].y).toBeCloseTo(lead.y, 6);

    const tail = points[points.length - 1];
    const dx = tail.x - lead.x;
    const dy = tail.y - lead.y;
    const length = Math.hypot(dx, dy);
    let lastDistance = leadDistance;
    let deviation = 0;
    for (const point of points.slice(1)) {
      const projection = sampler.project(unproject(point.x, point.y));
      expect(projection.offsetMeters).toBeLessThan(0.1);
      expect(projection.distanceMeters).toBeLessThan(lastDistance);
      lastDistance = projection.distanceMeters;
      const area = dx * (point.y - lead.y) - dy * (point.x - lead.x);
      deviation = Math.max(deviation, Math.abs(area) / length);
    }
    // 하나의 직선 기호를 노선 접선 방향으로 회전하기만 하면 이 편차는 0이다.
    expect(deviation).toBeGreaterThan(1);
  });
});
