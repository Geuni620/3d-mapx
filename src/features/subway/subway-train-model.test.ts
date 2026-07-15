import { describe, expect, it, vi } from "vitest";
import { Mesh, MeshStandardMaterial } from "three";
import { createSubwayTrainModel } from "./subway-train-model";

describe("createSubwayTrainModel", () => {
  it("3량 열차를 만들면 각 차량이 같은 geometry를 공유하면서 독립적으로 이동할 수 있다", () => {
    const model = createSubwayTrainModel({
      lineColor: "#00a84d",
      carCount: 3,
    });

    expect(model.cars).toHaveLength(3);
    expect(model.root.children).toEqual(model.cars);

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

  it("열차 모형을 제거하면 공유하던 GPU 자원을 함께 해제한다", () => {
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

  it("차체 색상을 지정해 열차를 만들면 점검할 수 있는 이름으로 각 부품을 구성한다", () => {
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
