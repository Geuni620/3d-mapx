import {
  CatmullRomCurve3,
  Material,
  Mesh,
  Object3D,
  Texture,
  Vector3,
  type BufferGeometry,
  type Curve,
} from "three";
import { SUBWAY_TRAIN_BOGIE_OFFSET_METERS } from "../subway-train-dimensions";

export interface SubwayTrainModelLabAppearance {
  showWindows: boolean;
  showDoors: boolean;
  showRoofEquipment: boolean;
  showBogies: boolean;
  wireframe: boolean;
}

export interface SubwayTrainModelMetrics {
  meshCount: number;
  geometryCount: number;
  sharedGeometryCount: number;
  materialCount: number;
  textureCount: number;
  triangleCount: number;
}

export interface ModelLabTrainCarPose {
  carIndex: number;
  position: Vector3;
  headingRadians: number;
}

interface SampleTrainCarPosesOptions {
  curve: Curve<Vector3>;
  progress: number;
  direction: 1 | -1;
  carCount: number;
  carSpacing: number;
}

const PART_VISIBILITY_BY_NAME: Record<
  string,
  keyof Omit<SubwayTrainModelLabAppearance, "wireframe">
> = {
  "train-window": "showWindows",
  "train-door": "showDoors",
  "train-roof-equipment": "showRoofEquipment",
  "train-bogie": "showBogies",
};

export function applySubwayTrainModelAppearance(
  root: Object3D,
  appearance: SubwayTrainModelLabAppearance,
) {
  const materials = new Set<Material>();

  root.traverse((object) => {
    const visibilityKey = PART_VISIBILITY_BY_NAME[object.name];

    if (visibilityKey !== undefined) {
      object.visible = appearance[visibilityKey];
    }

    if (!(object instanceof Mesh)) {
      return;
    }

    for (const material of toMaterialArray(object.material)) {
      materials.add(material);
    }
  });

  materials.forEach((material) => {
    if ("wireframe" in material && typeof material.wireframe === "boolean") {
      material.wireframe = appearance.wireframe;
      material.needsUpdate = true;
    }
  });
}

export function getSubwayTrainModelMetrics(
  root: Object3D,
): SubwayTrainModelMetrics {
  const geometryUseCount = new Map<BufferGeometry, number>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  let meshCount = 0;
  let triangleCount = 0;

  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }

    meshCount += 1;
    geometryUseCount.set(
      object.geometry,
      (geometryUseCount.get(object.geometry) ?? 0) + 1,
    );
    triangleCount += getGeometryTriangleCount(object.geometry);

    for (const material of toMaterialArray(object.material)) {
      materials.add(material);

      Object.values(material).forEach((value) => {
        if (value instanceof Texture) {
          textures.add(value);
        }
      });
    }
  });

  return {
    meshCount,
    geometryCount: geometryUseCount.size,
    sharedGeometryCount: Array.from(geometryUseCount.values()).filter(
      (useCount) => useCount > 1,
    ).length,
    materialCount: materials.size,
    textureCount: textures.size,
    triangleCount,
  };
}

export function createSyntheticTrainCurves(): [
  CatmullRomCurve3,
  CatmullRomCurve3,
];
export function createSyntheticTrainCurves(
  laneOffsets: number[],
): CatmullRomCurve3[];
export function createSyntheticTrainCurves(
  laneOffsets = [-3.4, 3.4],
): CatmullRomCurve3[] {
  const createCurve = (laneOffset: number) =>
    new CatmullRomCurve3(
      [
        new Vector3(-4 + laneOffset, -62, 0),
        new Vector3(9 + laneOffset, -34, 0),
        new Vector3(7 + laneOffset, -8, 0),
        new Vector3(-9 + laneOffset, 18, 0),
        new Vector3(-7 + laneOffset, 42, 0),
        new Vector3(5 + laneOffset, 64, 0),
      ],
      false,
      "catmullrom",
      0.35,
    );

  return laneOffsets.map(createCurve);
}

export function sampleTrainCarPosesOnCurve({
  curve,
  progress,
  direction,
  carCount,
  carSpacing,
}: SampleTrainCarPosesOptions): ModelLabTrainCarPose[] {
  const curveLength = curve.getLength();
  const spacingProgress = carSpacing / curveLength;
  const bogieProgress = SUBWAY_TRAIN_BOGIE_OFFSET_METERS / curveLength;

  return Array.from({ length: carCount }, (_, carIndex) => {
    const carProgress = clamp(
      progress - direction * carIndex * spacingProgress,
      0,
      1,
    );
    const rearBogie = curve.getPointAt(
      clamp(carProgress - direction * bogieProgress, 0, 1),
    );
    const frontBogie = curve.getPointAt(
      clamp(carProgress + direction * bogieProgress, 0, 1),
    );
    const position = rearBogie.clone().lerp(frontBogie, 0.5);
    const bogieChord = frontBogie.clone().sub(rearBogie);

    return {
      carIndex,
      position,
      headingRadians: -Math.atan2(bogieChord.x, bogieChord.y),
    };
  });
}

export function getTrainCurveProgressBounds(
  curve: Curve<Vector3>,
  carCount: number,
  carSpacing: number,
) {
  const curveLength = curve.getLength();
  const trailingDistance = Math.max(0, carCount - 1) * carSpacing;

  return {
    minimum:
      (trailingDistance + SUBWAY_TRAIN_BOGIE_OFFSET_METERS) / curveLength,
    maximum: 1 - SUBWAY_TRAIN_BOGIE_OFFSET_METERS / curveLength,
  };
}

function getGeometryTriangleCount(geometry: BufferGeometry) {
  if (geometry.index !== null) {
    return geometry.index.count / 3;
  }

  return (geometry.getAttribute("position")?.count ?? 0) / 3;
}

function toMaterialArray(material: Material | Material[]) {
  return Array.isArray(material) ? material : [material];
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
