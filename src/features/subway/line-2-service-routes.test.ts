import { describe, expect, it } from "vitest";
import line2Network from "./data/osm-subway-line-2.json";
import type { SeoulSubwayOsmServiceRoute } from "./osm-subway-network";
import { createSubwayRouteSampler } from "./subway-route-sampler";

const serviceRoutes = line2Network.serviceRoutes as SeoulSubwayOsmServiceRoute[];
const mainRoutes = serviceRoutes.filter(
  (route) =>
    route.direction === "outer-loop" || route.direction === "inner-loop",
);

describe("Line 2 OSM service routes", () => {
  it("preserves the expected inner and outer loop relations", () => {
    expect(
      mainRoutes.map((route) => [route.osmRelationId, route.direction]),
    ).toEqual([
      [2404374, "outer-loop"],
      [4729409, "inner-loop"],
    ]);
  });

  it("keeps both main paths closed with monotonically ordered stops", () => {
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

  it("starts the inner and outer loop in opposite directions", () => {
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

  it("does not close branch routes with an artificial return segment", () => {
    serviceRoutes
      .filter((route) => !route.direction.endsWith("loop"))
      .forEach((route) => {
        expect(route.path.at(-1)).not.toEqual(route.path[0]);
      });
  });
});
