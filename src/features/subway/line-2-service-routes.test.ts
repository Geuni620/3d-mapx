import { describe, expect, it } from "vitest";
import line2Network from "./data/osm-subway-line-2.json";
import type { SeoulSubwayOsmServiceRoute } from "./osm-subway-network";
import {
  getLine2TrainPhaseOffsetSeconds,
  LINE_2_TRAIN_CRUISE_SPEED_METERS_PER_SECOND,
  LINE_2_TRAIN_DWELL_SECONDS,
  LINE_2_TRAIN_SIMULATION_EPOCH_MS,
} from "./line-2-train-demo-config";
import { createSubwayTrainSimulation } from "./line-2-train-simulation";
import { createSubwayRouteSampler } from "./subway-route-sampler";

const serviceRoutes = line2Network.serviceRoutes as SeoulSubwayOsmServiceRoute[];
const mainRoutes = serviceRoutes.filter(
  (route) =>
    route.direction === "outer-loop" || route.direction === "inner-loop",
);

describe("2호선 OSM 운행 경로", () => {
  it("2호선 내선과 외선 경로를 불러오면 각 방향에 해당하는 OSM 고유 번호를 유지한다", () => {
    expect(
      mainRoutes.map((route) => [route.osmRelationId, route.direction]),
    ).toEqual([
      [2404374, "outer-loop"],
      [4729409, "inner-loop"],
    ]);
  });

  it("2호선 내선과 외선 경로를 불러오면 출발점과 도착점이 연결되고 정차역이 이동 순서대로 배치된다", () => {
    mainRoutes.forEach((route) => {
      expect(route.path.at(-1)).toEqual(route.path[0]);
      expect(
        route.stops.every(
          (stop, index) =>
            index === 0 ||
            stop.distanceMeters > route.stops[index - 1].distanceMeters,
        ),
      ).toBe(true);
    });
  });

  it("2호선 내선과 외선 경로에서 출발점 이후 위치를 확인하면 서로 반대 방향으로 진행한다", () => {
    const headings = mainRoutes.map((route) => {
      const sampler = createSubwayRouteSampler(route.path);

      if (sampler === undefined) {
        throw new Error(`Invalid service route: ${route.id}`);
      }

      return sampler.sample(100).headingRadians;
    });
    const headingDifference = Math.abs(
      Math.atan2(
        Math.sin(headings[0] - headings[1]),
        Math.cos(headings[0] - headings[1]),
      ),
    );

    expect(headingDifference).toBeGreaterThan(Math.PI / 2);
  });

  it("지선처럼 순환하지 않는 경로를 불러오면 출발점과 도착점을 임의로 연결하지 않는다", () => {
    serviceRoutes
      .filter((route) => !route.direction.endsWith("loop"))
      .forEach((route) => {
        expect(route.path.at(-1)).not.toEqual(route.path[0]);
      });
  });

  it("dwells on an actual outer-loop stop before moving at demo cruise speed", () => {
    const outerRoute = mainRoutes.find(
      (route) => route.direction === "outer-loop",
    );

    if (outerRoute === undefined) {
      throw new Error("Expected the outer-loop route");
    }

    const sampler = createSubwayRouteSampler(outerRoute.path);

    if (sampler === undefined) {
      throw new Error("Expected the outer-loop route to be valid");
    }

    const simulation = createSubwayTrainSimulation({
      id: "line-2-outer-loop-integration",
      sampler,
      stopDistancesMeters: outerRoute.stops.map(
        (stop) => stop.distanceMeters,
      ),
      carCount: 3,
      carSpacingMeters: 21,
      cruiseSpeedMetersPerSecond:
        LINE_2_TRAIN_CRUISE_SPEED_METERS_PER_SECOND,
      dwellSeconds: LINE_2_TRAIN_DWELL_SECONDS,
      phaseOffsetSeconds: getLine2TrainPhaseOffsetSeconds(
        outerRoute.direction,
      ),
      simulationEpochMs: LINE_2_TRAIN_SIMULATION_EPOCH_MS,
    });
    const dwellingState = simulation.getState(
      LINE_2_TRAIN_SIMULATION_EPOCH_MS + 10_000,
    );
    const movingState = simulation.getState(
      LINE_2_TRAIN_SIMULATION_EPOCH_MS + 30_000,
    );

    expect(dwellingState.phase).toBe("dwelling");
    expect(dwellingState.speedMetersPerSecond).toBe(0);
    expect(dwellingState.frontDistanceMeters).toBeCloseTo(
      outerRoute.stops[0].distanceMeters,
      3,
    );
    expect(movingState.phase).toBe("moving");
    expect(movingState.speedMetersPerSecond).toBe(
      LINE_2_TRAIN_CRUISE_SPEED_METERS_PER_SECOND,
    );
    expect(movingState.frontDistanceMeters).toBeCloseTo(
      outerRoute.stops[0].distanceMeters +
        LINE_2_TRAIN_CRUISE_SPEED_METERS_PER_SECOND * 10,
      3,
    );
  });

  it("uses direction-specific phase offsets", () => {
    expect(getLine2TrainPhaseOffsetSeconds("outer-loop")).toBe(0);
    expect(getLine2TrainPhaseOffsetSeconds("inner-loop")).toBe(1_370);
    expect(getLine2TrainPhaseOffsetSeconds("outbound")).toBe(0);
  });
});
