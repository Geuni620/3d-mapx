import { describe, expect, it } from "vitest";
import { Mesh, MeshStandardMaterial } from "three";
import { createSubwayTrainModel } from "../subway-train-model";
import {
  applySubwayTrainModelAppearance,
  createSyntheticTrainCurves,
  getSubwayTrainModelMetrics,
  sampleTrainCarPosesOnCurve,
} from "./subway-train-model-lab";

describe("subway train Model Lab", () => {
  it("audits shared procedural resources without external textures", () => {
    const model = createSubwayTrainModel({
      lineColor: "#00a84d",
      carCount: 3,
    });

    const metrics = getSubwayTrainModelMetrics(model.root);

    expect(metrics.meshCount).toBeGreaterThan(40);
    expect(metrics.geometryCount).toBeLessThan(metrics.meshCount);
    expect(metrics.sharedGeometryCount).toBeGreaterThan(0);
    expect(metrics.materialCount).toBeGreaterThan(4);
    expect(metrics.textureCount).toBe(0);
    expect(metrics.triangleCount).toBeGreaterThan(0);

    model.dispose();
  });

  it("applies audit visibility and wireframe controls by named part", () => {
    const model = createSubwayTrainModel({
      lineColor: "#00a84d",
      carCount: 3,
    });

    applySubwayTrainModelAppearance(model.root, {
      showWindows: false,
      showDoors: false,
      showRoofEquipment: false,
      showBogies: false,
      wireframe: true,
    });

    expect(model.root.getObjectByName("train-window")?.visible).toBe(false);
    expect(model.root.getObjectByName("train-door")?.visible).toBe(false);
    expect(model.root.getObjectByName("train-roof-equipment")?.visible).toBe(
      false,
    );
    expect(model.root.getObjectByName("train-bogie")?.visible).toBe(false);

    const body = model.root.getObjectByName("train-car-body") as Mesh;

    expect((body.material as MeshStandardMaterial).wireframe).toBe(true);
    model.dispose();
  });

  it("samples two three-car trains in opposite directions on parallel curves", () => {
    const [outboundCurve, inboundCurve] = createSyntheticTrainCurves();
    const outbound = sampleTrainCarPosesOnCurve({
      curve: outboundCurve,
      progress: 0.42,
      direction: 1,
      carCount: 3,
      carSpacing: 21,
    });
    const inbound = sampleTrainCarPosesOnCurve({
      curve: inboundCurve,
      progress: 0.58,
      direction: -1,
      carCount: 3,
      carSpacing: 21,
    });

    expect(outbound).toHaveLength(3);
    expect(inbound).toHaveLength(3);
    expect(new Set(outbound.map((pose) => pose.headingRadians)).size).toBe(3);
    expect(Math.cos(outbound[0].headingRadians - inbound[0].headingRadians)).toBeLessThan(
      -0.8,
    );
  });
});
