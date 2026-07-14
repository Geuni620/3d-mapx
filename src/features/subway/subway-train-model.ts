import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Vector3,
  type BufferGeometry,
} from "three";
import { createSubwayTrainMaterials } from "./subway-train-materials";
import {
  SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
  SUBWAY_TRAIN_CAR_LENGTH_METERS,
} from "./subway-train-dimensions";

const GANGWAY_CENTER_HEIGHT_METERS = 2.2;

export interface CreateSubwayTrainModelOptions {
  lineColor: string;
  bodyColor?: string;
  carCount: number;
  variant?: SubwayTrainModelVariant;
}

export type SubwayTrainModelVariant =
  | "classic"
  | "streamline"
  | "panorama"
  | "compact"
  | "industrial"
  | "slim";

interface SubwayTrainVariantSpec {
  carLength: number;
  bodyWidth: number;
  bodyHeight: number;
  noseDepth: number;
  roofWidthScale: number;
  windowHeight: number;
  windowWidth: number;
  windowPositions: number[];
}

const SUBWAY_TRAIN_VARIANTS: Record<
  SubwayTrainModelVariant,
  SubwayTrainVariantSpec
> = {
  classic: {
    carLength: SUBWAY_TRAIN_CAR_LENGTH_METERS,
    bodyWidth: 3.15,
    bodyHeight: 3.4,
    noseDepth: 0.12,
    roofWidthScale: 0.88,
    windowHeight: 1.05,
    windowWidth: 1.85,
    windowPositions: [-7.15, -4.85, -1.15, 1.15, 4.85, 7.15],
  },
  streamline: {
    carLength: 20,
    bodyWidth: 3.05,
    bodyHeight: 3.2,
    noseDepth: 1.35,
    roofWidthScale: 0.72,
    windowHeight: 0.9,
    windowWidth: 2.1,
    windowPositions: [-7.1, -4.6, -1.3, 1.3, 4.6, 7.1],
  },
  panorama: {
    carLength: 19.5,
    bodyWidth: 3.25,
    bodyHeight: 3.15,
    noseDepth: 0.5,
    roofWidthScale: 0.95,
    windowHeight: 1.35,
    windowWidth: 2.6,
    windowPositions: [-6.8, -3.8, 0, 3.8, 6.8],
  },
  compact: {
    carLength: 17.4,
    bodyWidth: 3,
    bodyHeight: 3.25,
    noseDepth: 0.7,
    roofWidthScale: 0.82,
    windowHeight: 1,
    windowWidth: 1.65,
    windowPositions: [-6, -3.9, -1, 1, 3.9, 6],
  },
  industrial: {
    carLength: 20,
    bodyWidth: 3.38,
    bodyHeight: 3.75,
    noseDepth: 0.3,
    roofWidthScale: 0.98,
    windowHeight: 0.82,
    windowWidth: 1.55,
    windowPositions: [-7.3, -5.2, -1.25, 1.25, 5.2, 7.3],
  },
  slim: {
    carLength: 19,
    bodyWidth: 2.78,
    bodyHeight: 3.55,
    noseDepth: 0.95,
    roofWidthScale: 0.68,
    windowHeight: 1.18,
    windowWidth: 1.45,
    windowPositions: [-6.9, -5.05, -1.05, 1.05, 5.05, 6.9],
  },
};

export interface SubwayTrainModel {
  root: Group;
  cars: Group[];
  gangways: Mesh[];
  carLengthMeters: number;
  dispose: () => void;
}

export function createSubwayTrainModel({
  lineColor,
  bodyColor,
  carCount,
  variant = "classic",
}: CreateSubwayTrainModelOptions): SubwayTrainModel {
  const variantSpec = SUBWAY_TRAIN_VARIANTS[variant];
  const materials = createSubwayTrainMaterials(lineColor, bodyColor);
  const geometries = createSharedTrainGeometries(variantSpec);
  const root = new Group();
  const cars = Array.from({ length: carCount }, (_, carIndex) =>
    createTrainCar({
      carIndex,
      carCount,
      geometries,
      materials,
      variantSpec,
    }),
  );
  const gangways = Array.from({ length: Math.max(0, carCount - 1) }, () => {
    const gangway = new Mesh(geometries.gangway, materials.undercarriage);

    gangway.name = "train-gangway";
    return gangway;
  });

  root.name = "subway-train";
  root.add(...cars, ...gangways);

  return {
    root,
    cars,
    gangways,
    carLengthMeters: variantSpec.carLength,
    dispose() {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      materials.dispose();
      root.clear();
    },
  };
}

type TrainGeometries = ReturnType<typeof createSharedTrainGeometries>;
type TrainMaterials = ReturnType<typeof createSubwayTrainMaterials>;

function createSharedTrainGeometries(spec: SubwayTrainVariantSpec) {
  return {
    body: new BoxGeometry(
      spec.bodyWidth,
      spec.carLength,
      spec.bodyHeight,
      1,
      1,
      1,
    ),
    roof: new BoxGeometry(spec.bodyWidth * spec.roofWidthScale, 5.6, 0.28),
    roofLine: new BoxGeometry(0.68, spec.carLength * 0.88, 0.1),
    window: new BoxGeometry(0.08, spec.windowWidth, spec.windowHeight),
    door: new BoxGeometry(0.09, 1.7, 2.28),
    line: new BoxGeometry(0.1, spec.carLength * 0.93, 0.24),
    bogie: new BoxGeometry(spec.bodyWidth * 0.72, 2.2, 0.48),
    coupler: new BoxGeometry(0.7, 0.65, 0.45),
    gangway: new BoxGeometry(spec.bodyWidth * 0.72, 1, 2.75),
    cabWindow: new BoxGeometry(spec.bodyWidth * 0.62, 0.09, 1.08),
    nose: new BoxGeometry(
      spec.bodyWidth * 0.84,
      Math.max(0.08, spec.noseDepth),
      spec.bodyHeight * 0.74,
    ),
    skirt: new BoxGeometry(spec.bodyWidth * 0.94, spec.carLength * 0.9, 0.32),
    light: new CylinderGeometry(0.16, 0.16, 0.12, 10),
  } satisfies Record<string, BufferGeometry>;
}

// 인접 차량의 차체 끝점을 연결해 곡선에서도 편성이 시각적으로 끊어지지 않게 한다.
export function updateSubwayTrainGangways(model: SubwayTrainModel) {
  model.gangways.forEach((gangway, connectionIndex) => {
    const leadingCar = model.cars[connectionIndex];
    const trailingCar = model.cars[connectionIndex + 1];
    const leadingForward = getCarForwardVector(leadingCar.rotation.z);
    const trailingForward = getCarForwardVector(trailingCar.rotation.z);
    const leadingRear = leadingCar.position
      .clone()
      .addScaledVector(
        leadingForward,
        -(model.carLengthMeters / 2) * leadingCar.scale.y,
      );
    const trailingFront = trailingCar.position
      .clone()
      .addScaledVector(
        trailingForward,
        (model.carLengthMeters / 2) * trailingCar.scale.y,
      );
    const connection = trailingFront.clone().sub(leadingRear);
    const connectionLength = Math.hypot(connection.x, connection.y);
    const crossSectionScale =
      (leadingCar.scale.x + trailingCar.scale.x) / 2;
    const heightScale = (leadingCar.scale.z + trailingCar.scale.z) / 2;

    gangway.visible = connectionLength > 0;
    gangway.position.copy(leadingRear).lerp(trailingFront, 0.5);
    gangway.position.z =
      (leadingCar.position.z + trailingCar.position.z) / 2 +
      GANGWAY_CENTER_HEIGHT_METERS * heightScale;
    gangway.rotation.set(0, 0, -Math.atan2(connection.x, connection.y));
    gangway.scale.set(crossSectionScale, connectionLength, heightScale);
  });
}

function getCarForwardVector(rotationRadians: number) {
  return new Vector3(
    -Math.sin(rotationRadians),
    Math.cos(rotationRadians),
    0,
  );
}

function createTrainCar({
  carIndex,
  carCount,
  geometries,
  materials,
  variantSpec,
}: {
  carIndex: number;
  carCount: number;
  geometries: TrainGeometries;
  materials: TrainMaterials;
  variantSpec: SubwayTrainVariantSpec;
}) {
  const car = new Group();
  const body = new Mesh(geometries.body, materials.body);

  car.name = `train-car-${carIndex + 1}`;
  body.name = "train-car-body";
  body.position.z = 0.55 + variantSpec.bodyHeight / 2;
  const skirt = new Mesh(geometries.skirt, materials.undercarriage);

  skirt.name = "train-skirt";
  skirt.position.z = 0.62;
  car.add(body, skirt);

  addSideDetails(car, geometries, materials, variantSpec);
  addRoofAndUndercarriage(car, geometries, materials, variantSpec);

  if (carIndex === 0) {
    addCabFace(car, "front", geometries, materials, variantSpec);
  }

  if (carIndex === carCount - 1) {
    addCabFace(car, "rear", geometries, materials, variantSpec);
  }

  if (carIndex > 0) {
    const coupler = new Mesh(geometries.coupler, materials.undercarriage);

    coupler.position.set(0, variantSpec.carLength / 2 + 0.3, 1.05);
    car.add(coupler);
  }

  return car;
}

function addSideDetails(
  car: Group,
  geometries: TrainGeometries,
  materials: TrainMaterials,
  spec: SubwayTrainVariantSpec,
) {
  const windowPositions = spec.windowPositions;
  const doorPositions = [-3, 3];

  for (const side of [-1, 1]) {
    const x = side * (spec.bodyWidth / 2 + 0.055);
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

function addRoofAndUndercarriage(
  car: Group,
  geometries: TrainGeometries,
  materials: TrainMaterials,
  spec: SubwayTrainVariantSpec,
) {
  const roofLine = new Mesh(geometries.roofLine, materials.line);

  roofLine.name = "train-line-accent";
  roofLine.position.set(0, 0, 0.7 + spec.bodyHeight);
  car.add(roofLine);

  for (const y of [
    -SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
    SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
  ]) {
    const roofUnit = new Mesh(geometries.roof, materials.roof);

    roofUnit.name = "train-roof-equipment";
    roofUnit.position.set(0, y, 0.58 + spec.bodyHeight);
    car.add(roofUnit);

    const bogie = new Mesh(geometries.bogie, materials.undercarriage);

    bogie.name = "train-bogie";
    bogie.position.set(0, y, 0.45);
    car.add(bogie);
  }
}

function addCabFace(
  car: Group,
  face: "front" | "rear",
  geometries: TrainGeometries,
  materials: TrainMaterials,
  spec: SubwayTrainVariantSpec,
) {
  const direction = face === "front" ? 1 : -1;
  const cabWindow = new Mesh(geometries.cabWindow, materials.window);
  const nose = new Mesh(geometries.nose, materials.body);
  const lightGroup = new Group();

  cabWindow.position.set(
    0,
    direction * (spec.carLength / 2 + spec.noseDepth + 0.03),
    0.62 + spec.bodyHeight * 0.67,
  );
  nose.name = "train-cab-nose";
  nose.position.set(
    0,
    direction * (spec.carLength / 2 + spec.noseDepth / 2),
    0.55 + spec.bodyHeight / 2,
  );
  car.add(nose, cabWindow);

  lightGroup.name = face === "front" ? "train-headlights" : "train-tail-lights";

  for (const x of [-0.88, 0.88]) {
    const light = new Mesh(
      geometries.light,
      face === "front" ? materials.headlight : materials.tailLight,
    );

    light.rotation.x = Math.PI / 2;
    light.position.set(
      x,
      direction * (spec.carLength / 2 + spec.noseDepth + 0.08),
      1.65,
    );
    lightGroup.add(light);
  }

  car.add(lightGroup);
}
