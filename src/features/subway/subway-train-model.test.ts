import { describe, expect, it, vi } from "vitest";
import { Mesh, MeshStandardMaterial } from "three";
import {
  createSubwayTrainModel,
  updateSubwayTrainGangways,
} from "./subway-train-model";

describe("createSubwayTrainModel", () => {
  it("creates three independently transformable cars with shared geometry", () => {
    const model = createSubwayTrainModel({
      lineColor: "#00a84d",
      carCount: 3,
    });

    expect(model.cars).toHaveLength(3);
    expect(model.root.children).toEqual([...model.cars, ...model.gangways]);
    expect(model.gangways).toHaveLength(2);

    const bodyMeshes = model.cars.map((car) =>
      car.getObjectByName("train-car-body"),
    );

    expect(bodyMeshes.every((mesh) => mesh instanceof Mesh)).toBe(true);
    expect((bodyMeshes[0] as Mesh).geometry).toBe(
      (bodyMeshes[1] as Mesh).geometry,
    );
    expect(model.cars[0].getObjectByName("train-headlights")).toBeDefined();
    expect(model.cars[2].getObjectByName("train-tail-lights")).toBeDefined();

    model.dispose();
  });

  it("connects adjacent car body ends with dynamically sized gangways", () => {
    const model = createSubwayTrainModel({
      lineColor: "#00a84d",
      carCount: 3,
    });

    model.cars.forEach((car, carIndex) => {
      car.position.y = -carIndex * 21;
    });
    updateSubwayTrainGangways(model);

    expect(model.gangways[0].position.y).toBeCloseTo(-10.5, 5);
    expect(model.gangways[0].scale.y).toBeCloseTo(1.5, 5);
    expect(model.gangways[1].position.y).toBeCloseTo(-31.5, 5);
    expect(model.root.getObjectByName("train-gangway")).toBeDefined();

    model.dispose();
  });

  it("disposes its shared GPU resources", () => {
    const model = createSubwayTrainModel({
      lineColor: "#00a84d",
      carCount: 3,
    });
    const body = model.cars[0].getObjectByName("train-car-body") as Mesh;
    const onDispose = vi.fn();

    body.geometry.addEventListener("dispose", onDispose);
    model.dispose();

    expect(onDispose).toHaveBeenCalledOnce();
  });

  it("applies a configurable body color and names auditable parts", () => {
    const model = createSubwayTrainModel({
      lineColor: "#00a84d",
      bodyColor: "#59636a",
      carCount: 3,
    });
    const body = model.cars[0].getObjectByName("train-car-body") as Mesh;
    const bodyMaterial = body.material as MeshStandardMaterial;

    expect(`#${bodyMaterial.color.getHexString()}`).toBe("#59636a");
    expect(model.root.getObjectByName("train-window")).toBeDefined();
    expect(model.root.getObjectByName("train-door")).toBeDefined();
    expect(model.root.getObjectByName("train-roof-equipment")).toBeDefined();
    expect(model.root.getObjectByName("train-bogie")).toBeDefined();
    expect(model.root.getObjectByName("train-line-accent")).toBeDefined();

    model.dispose();
  });
});
