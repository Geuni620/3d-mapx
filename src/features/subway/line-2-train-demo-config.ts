import type { SubwayServiceDirection } from "./osm-subway-network";

export const LINE_2_TRAIN_CRUISE_SPEED_METERS_PER_SECOND = 12;
export const LINE_2_TRAIN_DWELL_SECONDS = 20;
export const LINE_2_TRAIN_SIMULATION_EPOCH_MS = Date.UTC(
  2026,
  0,
  1,
  0,
  0,
  0,
);

const PHASE_OFFSET_SECONDS_BY_DIRECTION: Partial<
  Record<SubwayServiceDirection, number>
> = {
  "outer-loop": 0,
  "inner-loop": 1_370,
};

export function getLine2TrainPhaseOffsetSeconds(
  direction: SubwayServiceDirection,
) {
  return PHASE_OFFSET_SECONDS_BY_DIRECTION[direction] ?? 0;
}
