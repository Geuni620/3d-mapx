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

// 열차의 가감속이 아니라, 카메라가 열차 위치를 부드럽게 따라가도록 좌표를 보정한다.
// 남은 거리 오차가 halfLifeMilliseconds마다 절반으로 줄어 프레임 속도가 달라도 동일하게 수렴한다.
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
      // 지난 프레임 이후 흐른 시간만큼 이번 프레임에서 이동할 비율을 구한다.
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
