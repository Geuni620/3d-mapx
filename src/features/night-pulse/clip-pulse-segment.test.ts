import { expect, it } from "vitest";
import { createPulseSegmentClipper } from "./clip-pulse-segment";

it("양 끝점이 화면 밖에 있어도 화면을 가로지르는 선로는 남긴다", () => {
  const clip = createPulseSegmentClipper(100, 100, 0);
  expect(clip([-2, .5, 1], [2, .5, 1])).toEqual([[-1, .5, 1], [1, .5, 1]]);
});

it("지평선 뒤의 선로를 제외하고 앞에 걸친 구간은 원근 나눗셈 전에 자른다", () => {
  const clip = createPulseSegmentClipper(100, 100, 0);
  expect(clip([0, .5, -1], [0, 0, -2])).toBeUndefined();
  const visible = clip([0, 1, -1], [0, 0, 1])!;
  expect(visible[0][1]).toBeCloseTo(visible[0][2]);
  expect(visible[0][2]).toBeGreaterThan(0);
  expect(visible[1]).toEqual([0, 0, 1]);
});
