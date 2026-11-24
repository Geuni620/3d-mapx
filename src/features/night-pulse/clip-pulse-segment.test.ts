import { expect, it } from "vitest";
import { createPulseSegmentClipper } from "./clip-pulse-segment";

it("양 끝점이 화면 밖에 있어도 화면을 가로지르는 선로는 남긴다", () => {
  const clip = createPulseSegmentClipper([[0, 2], [2, 2], [2, 0], [0, 0]]);
  expect(clip([-2, 1], [4, 1])).toEqual([[0, 1], [2, 1]]);
});

it("기울인 뷰의 실제 지면 사각형을 사용해 바깥 선로를 제외한다", () => {
  const clip = createPulseSegmentClipper([[-1, 2], [3, 2], [2, 0], [0, 0]]);
  expect(clip([-1, 0.5], [-0.5, 0.5])).toBeUndefined();
  expect(clip([-1, 1], [3, 1])).toEqual([[-0.5, 1], [2.5, 1]]);
});
