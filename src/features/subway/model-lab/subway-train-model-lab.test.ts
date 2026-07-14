import { describe, expect, it } from "vitest";
import { Mesh, MeshStandardMaterial } from "three";
import { createSubwayTrainModel } from "../subway-train-model";
import {
  createSubwayTrainRibbonModel,
  getSubwayTrainRibbonProgressBounds,
} from "../subway-train-ribbon-model";
import {
  applySubwayTrainModelAppearance,
  createSyntheticTrainCurves,
  getTrainCurveProgressBounds,
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

  it("keeps every car and bogie inside the synthetic curve travel bounds", () => {
    const [curve] = createSyntheticTrainCurves();
    const bounds = getTrainCurveProgressBounds(curve, 3, 21);
    const poses = sampleTrainCarPosesOnCurve({
      curve,
      progress: bounds.minimum,
      direction: 1,
      carCount: 3,
      carSpacing: 21,
    });

    expect(bounds.minimum).toBeGreaterThan(0.18);
    expect(bounds.maximum).toBeLessThan(1);
    expect(
      new Set(
        poses.map((pose) =>
          [pose.position.x, pose.position.y, pose.position.z].join(","),
        ),
    ).size,
    ).toBe(3);
  });

  it("deforms a continuous low-detail body along the sampled curve", () => {
    const [curve] = createSyntheticTrainCurves();
    const model = createSubwayTrainRibbonModel({
      bodyColor: "#34393b",
      lineColor: "#00a84d",
      lengthMeters: 60,
      segmentCount: 24,
    });
    const bounds = getSubwayTrainRibbonProgressBounds(
      curve,
      model.lengthMeters,
    );

    model.update(curve, bounds.minimum + 0.1);

    const body = model.root.getObjectByName("train-ribbon-body") as Mesh;
    const positions = body.geometry.getAttribute("position");
    const firstRing = [positions.getX(0), positions.getY(0)];
    const middleRingIndex = 12 * 4;
    const middleRing = [
      positions.getX(middleRingIndex),
      positions.getY(middleRingIndex),
    ];

    expect(model.root.getObjectByName("train-ribbon-line-accent")).toBeDefined();
    expect(firstRing).not.toEqual(middleRing);
    expect(positions.count).toBe((24 + 1) * 4);
    expect(bounds.minimum).toBeGreaterThan(0);
    model.dispose();
  });

  it("adds subway cues without splitting the flexible body into rigid cars", () => {
    const [curve] = createSyntheticTrainCurves();
    const model = createSubwayTrainRibbonModel({
      appearance: "metro",
      bodyColor: "#d7dedf",
      lineColor: "#00a84d",
      lengthMeters: 60,
      segmentCount: 24,
    });

    model.update(curve, 0.7);

    expect(model.root.getObjectByName("train-ribbon-body")).toBeDefined();
    expect(model.root.getObjectByName("train-ribbon-window-band-1")).toBeDefined();
    expect(model.root.getObjectByName("train-ribbon-window-band-2")).toBeDefined();
    expect(model.root.getObjectByName("train-ribbon-side-accent-1")).toBeDefined();
    expect(model.root.getObjectByName("train-ribbon-cab-window-1")).toBeDefined();
    expect(model.root.getObjectByName("train-car-body")).toBeUndefined();
    model.dispose();
  });
});
