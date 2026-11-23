import { describe, expect, it } from "vitest";
import { createSubwayRouteSampler } from "./subway-route-sampler";
import { sampleOverviewTrainIcon, type CarSegment } from "./subway-overview-icon";
import { LINE_2_MAIN_CAR_COUNT } from "./subway-train-model";
import { DETAIL_START } from "./line-2-main-simulation";

const sampler = createSubwayRouteSampler([
  [126.97, 37.56], [126.99, 37.56],
], { closed: false })!;
const viewport = { width: 400, height: 300 };

describe("지도 2D 열차 아이콘", () => {
  it("줌과 호선에 상관없이 10량 편성은 같은 크기다", () => {
    const fromProjection = (count: number, scale: number) => sampleOverviewTrainIcon(
      sampler, 400, count, ([lng]) => ({ x: 40 + (lng - 126.97) * scale, y: 120 }), viewport,
    );
    expect(fromProjection(LINE_2_MAIN_CAR_COUNT, 10_000)?.bodyLength).toBe(24);
    expect(fromProjection(10, 15_000)?.bodyLength).toBe(24);
    expect([4, 6, 8, 10].map(count => fromProjection(count, 10_000)?.bodyLength))
      .toEqual([12, 16, 20, 24]);
  });

  it("3D가 나타나기 시작할 때 2D 차체 길이가 투영된 차량 편성과 일치한다", () => {
    const distance = 500;
    const project = ([lng, lat]: [number, number]) => ({
      x: 120 + (lng - 126.975) * 82_000,
      y: 120 - (lat - 37.56) * 105_000,
    });
    const before = sampleOverviewTrainIcon(sampler, distance, 10, project, viewport, 15);
    const at = sampleOverviewTrainIcon(sampler, distance, 10, project, viewport, DETAIL_START);
    const front = project(sampler.sample(distance + 9.5).coordinate);
    const tail = project(sampler.sample(distance - 9 * 19.5 - 9.5).coordinate);
    expect(before?.bodyLength).toBeGreaterThan(24);
    expect(at?.bodyLength).toBeCloseTo(front.x - tail.x, 4);
  });

  it("중간 줌에서 곡선 앞뒤의 차량 방향이 서로 다르다", () => {
    const corner = createSubwayRouteSampler([
      [126.97, 37.56], [126.98, 37.56], [126.98, 37.57],
    ], { closed: false })!;
    const icon = sampleOverviewTrainIcon(
      corner, 970, 10, ([lng, lat]) => ({
        x: 200 + (lng - 126.98) * 50_000,
        y: 200 - (lat - 37.56) * 62_000,
      }), viewport, 15.7,
    );
    expect(icon?.cars).toHaveLength(10);
    const heading = ({ front, rear }: CarSegment) =>
      Math.atan2(front.y - rear.y, front.x - rear.x);
    const [lead, ...rest] = icon!.cars!;
    expect(Math.abs(heading(lead) - heading(rest.at(-1)!))).toBeGreaterThan(0.6);
  });
});
