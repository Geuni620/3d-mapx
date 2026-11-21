import { Group, Mesh, type BufferGeometry, type Material, type Object3D } from "three";
import { createSubwayTrainMaterials } from "./subway-train-materials";
import { createCabNose, createDoorLamps, createSideSkin } from "./subway-train-shell";
import { createCarBody, createPantograph, createRunningGear } from "./subway-train-equipment";

export interface CreateSubwayTrainModelOptions {
  lineColor: string;
  bodyColor?: string;
  carCount: number;
  onTextureLoad?: () => void;
}

export interface SubwayTrainModel {
  root: Group;
  cars: Group[];
  dispose: () => void;
}

const MAIN_FORMATION = ["Tc", "M", "M'", "T", "M'", "T1", "T", "M", "M'", "Tc"];
export const LINE_2_MAIN_CAR_COUNT = MAIN_FORMATION.length;

const controlsByCar = new WeakMap<Object3D, { leaves: Mesh; lamps: Mesh }>();

export function applyTrainDoors(
  car: Object3D,
  open: number,
  light: number | boolean,
  side: "left" | "right",
  closing = false,
) {
  let controls = controlsByCar.get(car);
  if (!controls) {
    const leaves = car.getObjectByName("train-door-window-skin");
    const lamps = car.getObjectByName("train-door-lamps");
    if (!(leaves instanceof Mesh) || !(lamps instanceof Mesh)) return;
    controls = { leaves, lamps };
    controlsByCar.set(car, controls);
  }
  const leafWeights = controls.leaves.morphTargetInfluences!;
  const lampWeights = controls.lamps.morphTargetInfluences!;
  // 후미 운전실은 차체만 반대로 조립하므로 같은 승강장을 향하려면 로컬 좌우를 바꾼다.
  const index = (side === "right") !== Boolean(car.userData.reversedCab) ? 0 : 1;
  leafWeights[index] = Math.max(0, Math.min(1, open));
  leafWeights[1 - index] = 0;
  const colorChannel = index + (closing ? 2 : 0);
  const intensity = Math.max(0, Math.min(1, Number(light)));
  lampWeights.fill(0);
  lampWeights[colorChannel] = intensity;
  controls.lamps.visible = intensity > 0;
}

function carType(count: number, index: number) {
  if (count === MAIN_FORMATION.length) return MAIN_FORMATION[index];
  if (index === 0 || index === count - 1) return "Tc";
  if (count === 6) return ["M", "M'", "T", "M'"][index - 1];
  return count === 4 ? "M'" : "M";
}

export function createSubwayTrainModel({
  lineColor,
  bodyColor,
  carCount,
  onTextureLoad,
}: CreateSubwayTrainModelOptions): SubwayTrainModel {
  const materials = createSubwayTrainMaterials(lineColor, bodyColor, onTextureLoad);
  const geometries = new Map<string, BufferGeometry>();
  function part(name: string, key: string, build: () => BufferGeometry, material: Material) {
    const geometry = geometries.get(key) ?? build();
    geometries.set(key, geometry);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    return mesh;
  }

  const root = new Group();
  root.name = "subway-train";
  const cars = Array.from({ length: carCount }, (_, index) => {
    const type = carType(carCount, index);
    const cab = type === "Tc",
      tail = cab && index > 0;
    const car = new Group(),
      shell = new Group();
    car.name = `train-car-${index + 1}`;
    car.userData.carType = type;
    car.userData.reversedCab = tail;
    if (tail) shell.rotation.z = Math.PI;
    const powered = type.startsWith("M");
    shell.add(
      part(
        "train-car-body",
        `body-${cab}-${powered}`,
        () => createCarBody(cab, powered),
        materials.body,
      ),
    );
    shell.add(
      part("train-door-window-skin", `side-${cab}`, () => createSideSkin(cab), materials.skin),
    );
    const lamps = part(
      "train-door-lamps",
      `lamps-${cab}`,
      () => createDoorLamps(cab),
      materials.doorLight,
    );
    lamps.visible = false;
    shell.add(lamps);
    if (cab) {
      shell.add(
        part(
          tail ? "train-tail-lights" : "train-headlights",
          tail ? "tail" : "head",
          () => createCabNose(tail),
          materials.skin,
        ),
      );
    }
    if (type === "M'")
      shell.add(part("train-pantograph", "pantograph", createPantograph, materials.body));
    car.add(shell, part("train-bogie", "bogies", createRunningGear, materials.body));
    return car;
  });
  root.add(...cars);
  return {
    root,
    cars,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.dispose();
      root.clear();
    },
  };
}
