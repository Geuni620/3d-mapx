import { describe, expect, it } from "vitest";
import { createSubwayRouteSampler } from "./subway-route-sampler";
import {
  createSubwayTrainSimulation,
  getKoreanMinuteOfDay,
} from "./line-2-train-simulation";

const TEST_LOOP = [
  [126.97, 37.56],
  [126.971, 37.56],
  [126.971, 37.561],
  [126.97, 37.561],
] as const;

const KOREAN_MIDNIGHT = Date.UTC(2026, 6, 9, 15, 0, 0);

describe("getKoreanMinuteOfDay", () => {
  it("uses Asia/Seoul instead of the runtime timezone", () => {
    expect(getKoreanMinuteOfDay(KOREAN_MIDNIGHT)).toBe(0);
    expect(getKoreanMinuteOfDay(KOREAN_MIDNIGHT + 6 * 60 * 60 * 1000)).toBe(
      360,
    );
  });
});

describe("createSubwayTrainSimulation", () => {
  it("returns the same state for the same timestamp", () => {
    const simulation = createTestSimulation();
    const timestamp = KOREAN_MIDNIGHT + 12_345;

    expect(simulation.getState(timestamp)).toEqual(
      simulation.getState(timestamp),
    );
  });

  it("dwells at a stop before moving", () => {
    const simulation = createTestSimulation();

    const dwelling = simulation.getState(KOREAN_MIDNIGHT + 1_000);
    const moving = simulation.getState(KOREAN_MIDNIGHT + 3_000);

    expect(dwelling.phase).toBe("dwelling");
    expect(dwelling.speedMetersPerSecond).toBe(0);
    expect(moving.phase).toBe("moving");
    expect(moving.speedMetersPerSecond).toBe(10);
    expect(moving.frontDistanceMeters).toBeGreaterThan(0);
  });

  it("returns a separate pose for every car", () => {
    const simulation = createTestSimulation();
    const state = simulation.getState(KOREAN_MIDNIGHT + 15_000);

    expect(state.carPoses).toHaveLength(3);
    expect(new Set(state.carPoses.map((pose) => pose.distanceMeters)).size).toBe(
      3,
    );
    expect(new Set(state.carPoses.map((pose) => pose.headingRadians)).size).toBeGreaterThan(
      1,
    );
  });

  it("changes the active mock speed profile by Korean time", () => {
    const simulation = createTestSimulation();

    const normal = simulation.getState(KOREAN_MIDNIGHT + 3_000);
    const slower = simulation.getState(
      KOREAN_MIDNIGHT + 6 * 60 * 60 * 1000 + 3_000,
    );

    expect(normal.speedMetersPerSecond).toBe(10);
    expect(slower.speedMetersPerSecond).toBe(5);
  });
});

function createTestSimulation() {
  const sampler = createSubwayRouteSampler(TEST_LOOP);

  if (sampler === undefined) {
    throw new Error("Expected the test route to be valid");
  }

  return createSubwayTrainSimulation({
    id: "test-train",
    sampler,
    stopDistancesMeters: [0, sampler.totalDistanceMeters / 2],
    carCount: 3,
    carSpacingMeters: 24,
    dwellSeconds: 2,
    phaseOffsetSeconds: 0,
    speedProfile: [
      { startMinute: 0, speedMetersPerSecond: 10 },
      { startMinute: 360, speedMetersPerSecond: 5 },
      { startMinute: 420, speedMetersPerSecond: 10 },
    ],
  });
}
