import { describe, expect, it, vi } from "vitest";
import { Mesh, MeshStandardMaterial } from "three";
import { applyTrainDoors, createSubwayTrainModel } from "./subway-train-model";

describe("createSubwayTrainModel", () => {
  it("3량 열차를 만들면 각 차량이 같은 geometry를 공유하면서 독립적으로 이동할 수 있다", () => {
    const model = createSubwayTrainModel({
      lineColor: "#00a84d",
      carCount: 3,
    });

    expect(model.cars).toHaveLength(3);
    expect(model.root.children).toEqual(model.cars);

    const bodyMeshes = model.cars.map((car) => car.getObjectByName("train-car-body"));

    expect(bodyMeshes.every((mesh) => mesh instanceof Mesh)).toBe(true);
    expect((bodyMeshes[0] as Mesh).geometry).toBe((bodyMeshes[2] as Mesh).geometry);
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
    expect(model.root.getObjectByName("train-door-window-skin")).toBeDefined();
    expect(model.root.getObjectByName("train-bogie")).toBeDefined();

    model.dispose();
  });

  it("본선 10량은 팬터그래프 배치와 편성당 상세 모델 예산을 지킨다", () => {
    const model = createSubwayTrainModel({ lineColor: "#00a84d", carCount: 10 });
    expect(
      model.cars.flatMap((car, i) => (car.getObjectByName("train-pantograph") ? [i + 1] : [])),
    ).toEqual([3, 5, 9]);
    let triangles = 0;
    model.cars.forEach((car) => {
      let meshes = 0;
      car.traverse((part) => {
        if (!(part instanceof Mesh)) return;
        triangles += (part.geometry.index?.count ?? part.geometry.attributes.position.count) / 3;
        meshes++;
      });
      expect(meshes).toBeLessThanOrEqual(6);
    });
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(60_000);
    model.dispose();
  });

  it("한쪽 네 양개문이 서로 벌어지고 고정 패널과 반대편 문은 같은 좌표를 유지한다", () => {
    const model = createSubwayTrainModel({ lineColor: "#00a84d", carCount: 3 });
    for (const car of model.cars.slice(0, 2)) {
      const skin = car.getObjectByName("train-door-window-skin") as Mesh;
      const positions = skin.geometry.getAttribute("position");
      const [right, left] = skin.geometry.morphAttributes.position!;
      // 문 네 곳 × 좌우 문짝 × 면당 네 꼭짓점.
      const moving = Array.from({ length: positions.count }, (_, i) => i).filter(
        (i) => right.getY(i) !== 0,
      );
      expect(moving).toHaveLength(32);
      expect(moving.filter((i) => right.getY(i) > 0)).toHaveLength(16);
      for (const i of moving) {
        expect(positions.getX(i)).toBeGreaterThan(1.5);
        expect(right.getX(i)).toBeLessThan(0);
        expect(Math.abs(right.getY(i))).toBeCloseTo(0.65);
        expect(left.getY(i)).toBe(0);
      }
    }
    model.dispose();
  });

  it("차량을 복제해도 문과 점등 상태가 독립적이고 후미 운전실은 같은 승강장으로 열린다", () => {
    const model = createSubwayTrainModel({ lineColor: "#00a84d", carCount: 3 });
    const head = model.cars[0].clone(),
      tail = model.cars[2].clone();
    const weights = (car: typeof head, name: string) =>
      (car.getObjectByName(name) as Mesh).morphTargetInfluences;
    applyTrainDoors(head, 0.7, 1, "right");
    applyTrainDoors(tail, 0.7, 1, "right");
    expect(weights(head, "train-door-window-skin")).toEqual([0.7, 0]);
    expect(weights(tail, "train-door-window-skin")).toEqual([0, 0.7]);
    expect(weights(head, "train-door-lamps")).toEqual([1, 0, 0, 0]);
    expect(weights(tail, "train-door-lamps")).toEqual([0, 1, 0, 0]);
    expect(weights(model.cars[0], "train-door-window-skin")).toEqual([0, 0]);
    expect(model.cars[0].getObjectByName("train-door-lamps")?.visible).toBe(false);
    applyTrainDoors(head, 0.35, 0.9, "right", true);
    expect(weights(head, "train-door-lamps")).toEqual([0, 0, 0.9, 0]);
    applyTrainDoors(head, 0, false, "left");
    expect(head.getObjectByName("train-door-lamps")?.visible).toBe(false);
    expect(weights(head, "train-door-window-skin")).toEqual([0, 0]);
    model.dispose();
  });
});
