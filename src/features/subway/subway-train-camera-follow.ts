import type { SubwayCoordinate } from "./osm-subway-network";

const DEFAULT_HALF_LIFE_MILLISECONDS = 120;
const SNAP_DISTANCE_DEGREES = 1e-9;

export interface SubwayTrainCameraFollower {
  next: (
    target: SubwayCoordinate,
    timestampMilliseconds: number,
  ) => SubwayCoordinate;
  reset: () => void;
}

// 프레임 간격이 달라도 같은 속도로 목표 좌표에 수렴하도록 지수 감쇠를 적용한다.
export function createSubwayTrainCameraFollower(
  halfLifeMilliseconds = DEFAULT_HALF_LIFE_MILLISECONDS,
): SubwayTrainCameraFollower {
  let coordinate: SubwayCoordinate | undefined;
  let previousTimestampMilliseconds: number | undefined;

  return {
    next(target, timestampMilliseconds) {
      if (
        coordinate === undefined ||
        previousTimestampMilliseconds === undefined
      ) {
        coordinate = [...target];
        previousTimestampMilliseconds = timestampMilliseconds;
        return coordinate;
      }

      const deltaMilliseconds = Math.max(
        0,
        timestampMilliseconds - previousTimestampMilliseconds,
      );
      const alpha =
        halfLifeMilliseconds <= 0
          ? 1
          : 1 - 2 ** (-deltaMilliseconds / halfLifeMilliseconds);

      coordinate = [
        dampValue(coordinate[0], target[0], alpha),
        dampValue(coordinate[1], target[1], alpha),
      ];
      previousTimestampMilliseconds = timestampMilliseconds;
      return coordinate;
    },
    reset() {
      coordinate = undefined;
      previousTimestampMilliseconds = undefined;
    },
  };
}

function dampValue(current: number, target: number, alpha: number) {
  return Math.abs(target - current) <= SNAP_DISTANCE_DEGREES
    ? target
    : current + (target - current) * alpha;
}
