import { describe, expect, it } from "vitest";
import { createSubwayRouteSampler } from "./subway-route-sampler";

const TEST_LOOP = [
  [126.97, 37.56],
  [126.971, 37.56],
  [126.971, 37.561],
  [126.97, 37.561],
] as const;

describe("createSubwayRouteSampler", () => {
  it("returns undefined when a path cannot form a route", () => {
    expect(createSubwayRouteSampler([])).toBeUndefined();
    expect(createSubwayRouteSampler([[126.97, 37.56]])).toBeUndefined();
  });

  it("samples a closed route by cumulative meter distance", () => {
    const sampler = createSubwayRouteSampler(TEST_LOOP);

    expect(sampler).toBeDefined();
    expect(sampler?.totalDistanceMeters).toBeGreaterThan(300);
    expect(sampler?.sample(0).coordinate).toEqual(TEST_LOOP[0]);
  });

  it("wraps distances that pass the end of a loop", () => {
    const sampler = createSubwayRouteSampler(TEST_LOOP);

    expect(sampler).toBeDefined();

    const firstLap = sampler!.sample(20);
    const secondLap = sampler!.sample(sampler!.totalDistanceMeters + 20);

    expect(secondLap.coordinate[0]).toBeCloseTo(firstLap.coordinate[0], 7);
    expect(secondLap.coordinate[1]).toBeCloseTo(firstLap.coordinate[1], 7);
    expect(secondLap.headingRadians).toBeCloseTo(
      firstLap.headingRadians,
      7,
    );
  });

  it("projects a nearby point onto the closest route segment", () => {
    const sampler = createSubwayRouteSampler(TEST_LOOP);

    expect(sampler).toBeDefined();

    const projection = sampler!.project([126.9705, 37.56005]);

    expect(projection.distanceMeters).toBeGreaterThan(30);
    expect(projection.offsetMeters).toBeLessThan(10);
  });
});
