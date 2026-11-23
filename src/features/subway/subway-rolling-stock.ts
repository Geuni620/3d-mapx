import { MercatorCoordinate, type Map as MapLibreMap } from "maplibre-gl";
import {
  BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Vector3, type Scene,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { SubwayLineNumber } from "./subway-constants";
import { getActiveSubwayTrips, getSubwayServiceSecond, sampleSubwayTrip } from "./subway-timetable";
import { sampleSubwayRouteChordPose } from "./subway-route-sampler";
import { SUBWAY_TRAIN_BOGIE_OFFSET_METERS, SUBWAY_TRAIN_CAR_SPACING_METERS } from "./subway-train-dimensions";
import { createRunningGear } from "./subway-train-equipment";
import { getDoorCycle } from "./line-2-door-cycle";
import type { PlatformSide } from "./line-2-platform-side";
import type { TrainLayerContent } from "./subway-train-custom-layer";

type CarPart = "cab" | "trailer";
type LampCoordinate = [number, number, number];
interface CarAsset {
  meshes: { instance: InstancedMesh; side?: PlatformSide; slide: number }[];
  lamps: Record<PlatformSide, LampCoordinate[]>;
}
const INITIAL_INSTANCES = 64;

function createCarInstances(source: Mesh, count: number) {
  const mesh = new InstancedMesh(source.geometry, source.material, count);
  mesh.name = source.name;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

export function createSubwayRollingStock(
  scene: Scene,
  map: MapLibreMap,
  selectedLines: () => readonly SubwayLineNumber[],
  readyLines: Set<SubwayLineNumber>,
): TrainLayerContent {
  const models = new Map<SubwayLineNumber, Record<CarPart, CarAsset>>();
  const requested = new Set<SubwayLineNumber>();
  const loader = new GLTFLoader();
  const matrix = new Matrix4();
  const attachment = new Matrix4();
  const translation = new Matrix4();
  const scale = new Vector3();
  const upright = new Matrix4().makeRotationX(Math.PI / 2);
  const bogieGeometry = createRunningGear();
  const bogieMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  let bogies = createCarInstances(new Mesh(bogieGeometry, bogieMaterial), INITIAL_INSTANCES);
  const lampGeometry = new BoxGeometry(0.085, 0.10, 0.36);
  const lampMaterial = new MeshBasicMaterial({ toneMapped: false });
  let lamps = createCarInstances(new Mesh(lampGeometry, lampMaterial), 512);
  lamps.name = "subway-door-indicators";
  const lampColor = new Color();
  const openColor = new Color("#62ff7f");
  const closeColor = new Color("#ffb23e");
  scene.add(bogies, lamps);
  let disposed = false;
  let lastSecond = -1;
  let lastLines: readonly SubwayLineNumber[] = [];
  let trips: ReturnType<typeof getActiveSubwayTrips> = [];

  function load(line: SubwayLineNumber) {
    if (requested.has(line)) return;
    requested.add(line);
    loader.load(`${import.meta.env.BASE_URL}rolling-stock/line-${line}.glb`, ({ scene: asset }) => {
      const parts: Record<CarPart, CarAsset> = {
        cab: { meshes: [], lamps: { left: [], right: [] } },
        trailer: { meshes: [], lamps: { left: [], right: [] } },
      };
      for (const part of ["cab", "trailer"] as const) {
        const root = asset.getObjectByName(part);
        if (!root) continue;
        parts[part].lamps = root.userData.doorIndicators ?? parts[part].lamps;
        root.traverse(child => {
          if (!(child instanceof Mesh)) return;
          if (disposed) return;
          child.geometry.computeVertexNormals();
          const mesh = createCarInstances(child, INITIAL_INSTANCES);
          parts[part].meshes.push({
            instance: mesh,
            side: child.userData.doorSide,
            slide: child.userData.doorSlide ?? 0,
          });
          scene.add(mesh);
        });
      }
      if (disposed || !parts.cab.meshes.length || !parts.trailer.meshes.length) {
        asset.traverse(child => {
          if (child instanceof Mesh) disposeMesh(child);
        });
        return;
      }
      models.set(line, parts);
      readyLines.add(line);
      map.triggerRepaint();
    }, undefined, error => console.error(`${line}호선 차체를 불러오지 못했습니다.`, error));
  }

  function append(mesh: InstancedMesh, transformation: Matrix4, color?: Color) {
    if (mesh.count === mesh.instanceMatrix.count) {
      const larger = createCarInstances(mesh, mesh.count * 2);
      larger.instanceMatrix.array.set(mesh.instanceMatrix.array);
      larger.count = mesh.count;
      if (mesh.instanceColor) {
        const previous = new Color();
        for (let i = 0; i < mesh.count; i++) {
          mesh.getColorAt(i, previous);
          larger.setColorAt(i, previous);
        }
      }
      scene.remove(mesh);
      mesh.dispose();
      scene.add(larger);
      mesh = larger;
    }
    const index = mesh.count++;
    mesh.setMatrixAt(index, transformation);
    if (color) {
      mesh.setColorAt(index, color);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  return {
    update(timestamp, origin, { south, north, west, east }) {
      const second = Math.floor(timestamp / 1000);
      const lines = selectedLines();
      if (second !== lastSecond || lastLines !== lines) {
        lastSecond = second;
        lastLines = lines;
        trips = getActiveSubwayTrips(timestamp, lines);
      }
      bogies.count = 0;
      lamps.count = 0;
      for (const model of models.values()) {
        for (const part of [...model.cab.meshes, ...model.trailer.meshes]) part.instance.count = 0;
      }
      let visible = false;
      const seconds = getSubwayServiceSecond(timestamp);
      for (const trip of trips) {
        const train = sampleSubwayTrip(trip, seconds);
        if (!train) continue;
        const [lng, lat] = train.front;
        if (lat < south || lat > north || lng < west || lng > east) continue;
        const model = models.get(train.line);
        if (!model) {
          load(train.line);
          continue;
        }
        const cycle = getDoorCycle(train.dwellElapsedSeconds * 1000,
          train.dwelling ? { arrivalMs: 0, departureMs: train.dwellSeconds * 1000 } : null);
        lampColor.copy(cycle.closing ? closeColor : openColor).multiplyScalar(cycle.light);
        for (let i = 0; i < train.carCount; i++) {
          const distance = train.frontDistanceMeters - i * SUBWAY_TRAIN_CAR_SPACING_METERS;
          if (distance < 0) break;
          const pose = sampleSubwayRouteChordPose(train.sampler, distance, SUBWAY_TRAIN_BOGIE_OFFSET_METERS);
          const [lng, lat] = pose.coordinate;
          const point = MercatorCoordinate.fromLngLat({ lng, lat });
          const angle = -pose.headingRadians + (i === train.carCount - 1 ? Math.PI : 0);
          matrix.makeRotationZ(angle).scale(scale.setScalar(point.meterInMercatorCoordinateUnits()))
            .setPosition(point.x - origin.x, origin.y - point.y, point.z - origin.z);
          bogies = append(bogies, matrix);
          matrix.multiply(upright);
          const parts = i === 0 || i === train.carCount - 1 ? model.cab : model.trailer;
          // 승강장 방향 데이터가 없는 편성은 진행 방향 오른쪽을 시연한다.
          const side = i === train.carCount - 1 ? "left" : "right";
          for (const part of parts.meshes) {
            if (part.side === side && cycle.open > 0) {
              const inset = (side === "right" ? -0.055 : 0.055) * cycle.open;
              attachment.copy(matrix).multiply(translation.makeTranslation(inset, 0, part.slide * cycle.open));
              part.instance = append(part.instance, attachment);
            } else {
              part.instance = append(part.instance, matrix);
            }
          }
          if (cycle.light > 0) {
            for (const placement of parts.lamps[side]) {
              attachment.copy(matrix).multiply(translation.makeTranslation(...placement));
              lamps = append(lamps, attachment, lampColor);
            }
          }
          visible = true;
        }
      }
      return visible;
    },
    dispose() {
      disposed = true;
      readyLines.clear();
      for (const { cab, trailer } of models.values()) {
        for (const { instance } of [...cab.meshes, ...trailer.meshes]) {
          disposeMesh(instance);
          instance.dispose();
        }
      }
      bogies.dispose();
      bogieGeometry.dispose();
      bogieMaterial.dispose();
      lamps.dispose();
      lampGeometry.dispose();
      lampMaterial.dispose();
    },
  };
}

function disposeMesh(mesh: Mesh) {
  mesh.geometry.dispose();
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    if (material instanceof MeshStandardMaterial) material.map?.dispose();
    material.dispose();
  }
}
