import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  type BufferGeometry,
} from "three";
import { createSubwayTrainMaterials } from "./subway-train-materials";
import { SUBWAY_TRAIN_CAR_LENGTH_METERS } from "./subway-train-dimensions";

const CAR_WIDTH_METERS = 3.15;
const CAR_BODY_HEIGHT_METERS = 3.4;

export interface CreateSubwayTrainModelOptions {
  lineColor: string;
  bodyColor?: string;
  carCount: number;
}

export interface SubwayTrainModel {
  root: Group;
  cars: Group[];
  dispose: () => void;
}

// 여러 차량을 하나의 열차로 묶고, 모든 차량이 같은 도형과 재질을 함께 쓰도록 만든다.
export function createSubwayTrainModel({
  lineColor,
  bodyColor,
  carCount,
}: CreateSubwayTrainModelOptions): SubwayTrainModel {
  const materials = createSubwayTrainMaterials(lineColor, bodyColor);
  const geometries = createSharedTrainGeometries();
  const root = new Group();
  const cars = Array.from({ length: carCount }, (_, carIndex) =>
    createTrainCar({
      carIndex,
      carCount,
      geometries,
      materials,
    }),
  );

  root.name = "subway-train";
  root.add(...cars);

  return {
    root,
    cars,
    dispose() {
      // 여러 차량이 함께 사용하던 도형과 재질을 GPU 메모리에서 해제한다.
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      materials.dispose();
      root.clear();
    },
  };
}

type TrainGeometries = ReturnType<typeof createSharedTrainGeometries>;
type TrainMaterials = ReturnType<typeof createSubwayTrainMaterials>;

// 각 차량에서 반복해서 사용하는 차체, 창문, 문 등의 기본 도형을 한 번만 만든다.
function createSharedTrainGeometries() {
  return {
    body: new BoxGeometry(
      CAR_WIDTH_METERS,
      SUBWAY_TRAIN_CAR_LENGTH_METERS,
      CAR_BODY_HEIGHT_METERS,
      1,
      1,
      1,
    ),
    roof: new BoxGeometry(CAR_WIDTH_METERS * 0.88, 5.6, 0.28),
    roofLine: new BoxGeometry(
      0.68,
      SUBWAY_TRAIN_CAR_LENGTH_METERS * 0.88,
      0.1,
    ),
    window: new BoxGeometry(0.08, 1.85, 1.05),
    door: new BoxGeometry(0.09, 1.7, 2.28),
    line: new BoxGeometry(
      0.1,
      SUBWAY_TRAIN_CAR_LENGTH_METERS * 0.93,
      0.24,
    ),
    bogie: new BoxGeometry(CAR_WIDTH_METERS * 0.72, 2.2, 0.48),
    coupler: new BoxGeometry(0.7, 0.65, 0.45),
    cabWindow: new BoxGeometry(CAR_WIDTH_METERS * 0.62, 0.09, 1.08),
    light: new CylinderGeometry(0.16, 0.16, 0.12, 10),
  } satisfies Record<string, BufferGeometry>;
}

// 열차 한 칸을 만들고, 첫 칸과 마지막 칸에만 앞뒤 운전석과 조명을 붙인다.
function createTrainCar({
  carIndex,
  carCount,
  geometries,
  materials,
}: {
  carIndex: number;
  carCount: number;
  geometries: TrainGeometries;
  materials: TrainMaterials;
}) {
  const car = new Group();
  const body = new Mesh(geometries.body, materials.body);

  car.name = `train-car-${carIndex + 1}`;
  body.name = "train-car-body";
  body.position.z = 2.25;
  car.add(body);

  addSideDetails(car, geometries, materials);
  addRoofAndUndercarriage(car, geometries, materials);

  if (carIndex === 0) {
    addCabFace(car, "front", geometries, materials);
  }

  if (carIndex === carCount - 1) {
    addCabFace(car, "rear", geometries, materials);
  }

  if (carIndex > 0) {
    const coupler = new Mesh(geometries.coupler, materials.undercarriage);

    coupler.position.set(
      0,
      SUBWAY_TRAIN_CAR_LENGTH_METERS / 2 + 0.3,
      1.05,
    );
    car.add(coupler);
  }

  return car;
}

// 차량 양쪽 옆면에 노선 색상 띠, 창문과 출입문을 붙인다.
function addSideDetails(
  car: Group,
  geometries: TrainGeometries,
  materials: TrainMaterials,
) {
  const windowPositions = [-7.15, -4.85, -1.15, 1.15, 4.85, 7.15];
  const doorPositions = [-3, 3];

  for (const side of [-1, 1]) {
    const x = side * (CAR_WIDTH_METERS / 2 + 0.055);
    const line = new Mesh(geometries.line, materials.line);

    line.name = "train-line-accent";
    line.position.set(x, 0, 1.48);
    car.add(line);

    windowPositions.forEach((y) => {
      const window = new Mesh(geometries.window, materials.window);

      window.name = "train-window";
      window.position.set(x + side * 0.01, y, 2.68);
      car.add(window);
    });

    doorPositions.forEach((y) => {
      const door = new Mesh(geometries.door, materials.roof);

      door.name = "train-door";
      door.position.set(x + side * 0.015, y, 2.05);
      car.add(door);
    });
  }
}

// 차량 위에는 지붕 장치를, 아래에는 주행 장치 모형을 붙인다.
function addRoofAndUndercarriage(
  car: Group,
  geometries: TrainGeometries,
  materials: TrainMaterials,
) {
  const roofLine = new Mesh(geometries.roofLine, materials.line);

  roofLine.name = "train-line-accent";
  roofLine.position.set(0, 0, 4.27);
  car.add(roofLine);

  for (const y of [-4.5, 4.5]) {
    const roofUnit = new Mesh(geometries.roof, materials.roof);

    roofUnit.name = "train-roof-equipment";
    roofUnit.position.set(0, y, 4.08);
    car.add(roofUnit);

    const bogie = new Mesh(geometries.bogie, materials.undercarriage);

    bogie.name = "train-bogie";
    bogie.position.set(0, y, 0.45);
    car.add(bogie);
  }
}

// 열차의 앞뒤 면에 운전석 창문과 전조등 또는 후미등을 붙인다.
function addCabFace(
  car: Group,
  face: "front" | "rear",
  geometries: TrainGeometries,
  materials: TrainMaterials,
) {
  const direction = face === "front" ? 1 : -1;
  const cabWindow = new Mesh(geometries.cabWindow, materials.window);
  const lightGroup = new Group();

  cabWindow.position.set(
    0,
    direction * (SUBWAY_TRAIN_CAR_LENGTH_METERS / 2 + 0.05),
    2.72,
  );
  car.add(cabWindow);

  lightGroup.name = face === "front" ? "train-headlights" : "train-tail-lights";

  for (const x of [-0.88, 0.88]) {
    const light = new Mesh(
      geometries.light,
      face === "front" ? materials.headlight : materials.tailLight,
    );

    light.rotation.x = Math.PI / 2;
    light.position.set(
      x,
      direction * (SUBWAY_TRAIN_CAR_LENGTH_METERS / 2 + 0.12),
      1.65,
    );
    lightGroup.add(light);
  }

  car.add(lightGroup);
}
