import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type Map as MapLibreMap,
} from "maplibre-gl";
import {
  AmbientLight,
  Camera,
  DirectionalLight,
  Matrix4,
  Group,
  Scene,
  WebGLRenderer,
} from "three";
import type { ScheduledTrain } from "./line-2-timetable";
import { detailBlend, trainFrameTimestamp } from "./line-2-main-simulation";
import { SUBWAY_TRAIN_LAYER_ID } from "./subway-layer-ids";
import { getPlatformSide } from "./line-2-platform-side";
import { getDoorCycle } from "./line-2-door-cycle";
import {
  createSubwayTrainModel,
  applyTrainDoors,
  LINE_2_MAIN_CAR_COUNT,
  type SubwayTrainModel,
} from "./subway-train-model";

const LINE_2_COLOR = "#00a84d";
const TRAIN_DISPLAY_ALTITUDE_METERS = 0;
export interface TrainLayerBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface TrainLayerContent {
  update(timestamp: number, origin: MercatorCoordinate, bounds: TrainLayerBounds): boolean;
  dispose(): void;
}

interface SubwayTrainCustomLayerOptions {
  id?: string;
  getTrains?: () => readonly ScheduledTrain[];
  createContent?: (scene: Scene, map: MapLibreMap) => TrainLayerContent;
  frozenTimestamp: number | null;
}

// 열차 모형과 이동 시뮬레이션을 MapLibre가 그릴 수 있는 Three.js 레이어로 묶는다.
export function createSubwayTrainCustomLayer({
  id = SUBWAY_TRAIN_LAYER_ID,
  getTrains,
  createContent,
  frozenTimestamp,
}: SubwayTrainCustomLayerOptions): CustomLayerInterface {
  let map: MapLibreMap | undefined;
  let renderer: WebGLRenderer | undefined;
  let prototype: SubwayTrainModel | undefined;
  let content: TrainLayerContent | undefined;
  const scene = new Scene(),
    camera = new Camera();
  const pool: Group[] = [];
  const localToMercator = new Matrix4();
  let anchor: MercatorCoordinate | undefined;
  let south = 0,
    north = 0,
    west = 0,
    east = 0;
  let detailOpacity = 0;
  let projectionReady = false,
    contextAvailable = true,
    previouslyVisible = false;
  let frame = 0,
    width = 0,
    height = 0;
  function draw() {
    const origin = anchor;
    if (
      !detailOpacity ||
      !renderer ||
      !origin ||
      !projectionReady ||
      !contextAvailable ||
      document.hidden
    )
      return;
    const timestamp = frozenTimestamp ?? trainFrameTimestamp();
    if (content) {
      const visible = content.update(timestamp, origin, { south, north, west, east });
      if (visible || previouslyVisible) renderer.render(scene, camera);
      previouslyVisible = visible;
      return;
    }
    if (!prototype || !getTrains) return;
    let visible = 0;
    for (const train of getTrains()) {
      const motion = train.getMotion(timestamp);
      const [lng, lat] = train.sampler.sample(motion.frontDistanceMeters).coordinate;
      // 열차 길이보다 넓게 여유를 둬 선두가 화면 밖에 있어도 마지막 칸까지 유지한다.
      if (lat < south || lat > north || lng < west || lng > east) continue;
      let root = pool[visible++];
      if (!root) {
        root = prototype.root.clone();
        pool.push(root);
        scene.add(root);
      }
      root.visible = true;
      root.userData.trainId = train.id;
      const state = train.getState(timestamp);
      const event = train.getStopEvent(timestamp);
      const side = event && getPlatformSide(event.station, train.direction);
      const doors = getDoorCycle(timestamp, side ? event : null);
      state.carPoses.forEach((pose, carIndex) => {
        const coordinate = MercatorCoordinate.fromLngLat(
          { lng: pose.coordinate[0], lat: pose.coordinate[1] },
          TRAIN_DISPLAY_ALTITUDE_METERS,
        );
        const meterScale = coordinate.meterInMercatorCoordinateUnits();
        const car = root.children[carIndex];
        // 확인한 승강장 쪽만 열고, 풀에서 재사용한 칸은 알 수 없는 역에서도 반드시 닫는다.
        applyTrainDoors(car, doors.open, doors.light, side ?? "right", doors.closing);

        car.position.set(coordinate.x - origin.x, origin.y - coordinate.y, coordinate.z - origin.z);
        car.rotation.set(0, 0, -pose.headingRadians);
        car.scale.setScalar(meterScale);
      });
    }
    for (let i = visible; i < pool.length; i++) pool[i].visible = false;

    if (visible || previouslyVisible) renderer.render(scene, camera);
    previouslyVisible = visible > 0;
  }

  function scheduleFrame() {
    if (
      !detailOpacity ||
      frame ||
      !map ||
      !projectionReady ||
      !contextAvailable ||
      document.hidden ||
      frozenTimestamp !== null
    )
      return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!map?.isMoving()) draw();
      scheduleFrame();
    });
  }
  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  function visibilityChanged() {
    if (document.hidden) pause();
    else {
      draw();
      scheduleFrame();
    }
  }
  function lost() {
    contextAvailable = false;
    pause();
  }
  function restored() {
    contextAvailable = true;
    map?.triggerRepaint();
  }

  return {
    id,
    type: "custom",
    renderingMode: "3d",
    onAdd(nextMap) {
      map = nextMap;
      // 타일·라벨·건물이 정지한 동안에는 투명 열차 캔버스만 갱신한다.
      const overlay = document.createElement("canvas");
      overlay.className = "line2-train-surface";
      overlay.dataset.trainLayer = id;
      overlay.setAttribute("aria-hidden", "true");
      renderer = new WebGLRenderer({ canvas: overlay, alpha: true, antialias: true });
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      nextMap.getCanvas().after(overlay);
      anchor = MercatorCoordinate.fromLngLat(nextMap.getCenter(), TRAIN_DISPLAY_ALTITUDE_METERS);
      localToMercator.makeScale(1, -1, 1).setPosition(anchor.x, anchor.y, anchor.z);
      const key = new DirectionalLight("#ffffff", 2.4);
      key.position.set(-30, -50, 90);
      scene.add(new AmbientLight("#b8d6dd", 1.8), key);
      if (createContent) {
        content = createContent(scene, nextMap);
      } else {
        prototype = createSubwayTrainModel({
          lineColor: LINE_2_COLOR,
          carCount: LINE_2_MAIN_CAR_COUNT,
          onTextureLoad: () => map?.triggerRepaint(),
        });
      }
      overlay.addEventListener("webglcontextlost", lost);
      overlay.addEventListener("webglcontextrestored", restored);
      document.addEventListener("visibilitychange", visibilityChanged);
    },
    render(_gl, { defaultProjectionData }) {
      if (!map || !renderer) return;
      detailOpacity = detailBlend(map.getZoom());
      renderer.domElement.style.opacity = String(detailOpacity);
      if (!detailOpacity) {
        pause();
        return;
      }
      const canvas = map.getCanvas();
      if (width !== canvas.clientWidth || height !== canvas.clientHeight) {
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        renderer.setSize(width, height, false);
      }
      const bounds = map.getBounds();
      south = bounds.getSouth() - 0.0022;
      north = bounds.getNorth() + 0.0022;
      west = bounds.getWest() - 0.0028;
      east = bounds.getEast() + 0.0028;
      camera.projectionMatrix.fromArray(defaultProjectionData.mainMatrix).multiply(localToMercator);
      projectionReady = true;
      // 고정된 카메라에서는 단 하나의 RAF가 열차를 그린다. 타일 로드 알림에 중복 그리지 않는다.
      if (!frame || map.isMoving() || frozenTimestamp !== null) draw();
      scheduleFrame();
    },
    onRemove() {
      pause();
      content?.dispose();
      content = undefined;
      document.removeEventListener("visibilitychange", visibilityChanged);
      if (renderer) {
        const canvas = renderer.domElement;
        canvas.removeEventListener("webglcontextlost", lost);
        canvas.removeEventListener("webglcontextrestored", restored);
        canvas.remove();
        prototype?.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      }
      scene.clear();
      pool.length = 0;
      renderer = undefined;
      prototype = undefined;
      map = undefined;
      projectionReady = false;
    },
  };
}
