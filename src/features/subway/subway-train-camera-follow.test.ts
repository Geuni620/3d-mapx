import { describe, expect, it } from "vitest";
import { createSubwayTrainCameraFollower } from "./subway-train-camera-follow";

describe("2호선 열차 카메라 추적", () => {
  it("서로 다른 프레임 주기에서도 같은 시간이 지나면 목표 좌표에 비슷하게 수렴한다", () => {
    const at30Fps = sampleFollower(1_000 / 30);
    const at60Fps = sampleFollower(1_000 / 60);
    const at120Fps = sampleFollower(1_000 / 120);

    expect(at30Fps[0]).toBeCloseTo(at60Fps[0], 6);
    expect(at60Fps[0]).toBeCloseTo(at120Fps[0], 6);
    expect(at30Fps[1]).toBeCloseTo(at120Fps[1], 6);
  });

  it("추적 상태를 초기화하면 다음 좌표에서 지연 없이 다시 시작한다", () => {
    const follower = createSubwayTrainCameraFollower();

    follower.next([126.97, 37.56], 0);
    follower.next([127, 37.6], 16);
    follower.reset();

    expect(follower.next([127.1, 37.7], 32)).toEqual([127.1, 37.7]);
  });
});

function sampleFollower(frameDurationMilliseconds: number) {
  const follower = createSubwayTrainCameraFollower(120);
  const target = [127, 37.6] as const;

  follower.next([126.9, 37.5], 0);

  let timestampMilliseconds = 0;
  let coordinate = follower.next(target, timestampMilliseconds);

  while (timestampMilliseconds < 1_000) {
    timestampMilliseconds = Math.min(
      1_000,
      timestampMilliseconds + frameDurationMilliseconds,
    );
    coordinate = follower.next(target, timestampMilliseconds);
  }

  return coordinate;
}
