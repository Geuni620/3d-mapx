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
  Scene,
  WebGLRenderer,
} from "three";
import type { SeoulSubwayOsmServiceRoute } from "./osm-subway-network";
import { createSubwayRouteSampler } from "./subway-route-sampler";
import { SUBWAY_TRAIN_LAYER_ID } from "./subway-layer-ids";
import {
  createSubwayTrainSimulation,
  type SubwayTrainSimulation,
} from "./line-2-train-simulation";
import {
  createSubwayTrainModel,
  type SubwayTrainModel,
} from "./subway-train-model";
import { SUBWAY_TRAIN_CAR_SPACING_METERS } from "./subway-train-dimensions";

const LINE_2_COLOR = "#00a84d";
const TRAIN_DISPLAY_ALTITUDE_METERS = 0;
const TRAIN_CROSS_SECTION_SCALE = 1.55;
// 실제 운행 자료로 교체하기 전까지 시간대별 속도를 임의 값으로 사용한다.
const MOCK_SPEED_PROFILE = [
  { startMinute: 0, speedMetersPerSecond: 10 },
  { startMinute: 330, speedMetersPerSecond: 13.5 },
  { startMinute: 600, speedMetersPerSecond: 11 },
  { startMinute: 960, speedMetersPerSecond: 13 },
  { startMinute: 1_200, speedMetersPerSecond: 9.5 },
];

interface SubwayTrainCustomLayerOptions {
  serviceRoutes: SeoulSubwayOsmServiceRoute[];
  reducedMotion: boolean;
}

interface TrainRuntime {
  simulation: SubwayTrainSimulation;
  model: SubwayTrainModel;
}

// 열차 모형과 이동 시뮬레이션을 MapLibre가 그릴 수 있는 Three.js 레이어로 묶는다.
export function createSubwayTrainCustomLayer({
  serviceRoutes,
  reducedMotion,
}: SubwayTrainCustomLayerOptions): CustomLayerInterface {
  let map: MapLibreMap | undefined;
  let renderer: WebGLRenderer | undefined;
  let scene: Scene | undefined;
  let camera: Camera | undefined;
  let anchor: MercatorCoordinate | undefined;
  let trainRuntimes: TrainRuntime[] = [];
  let isContextAvailable = true;
  let frozenTimestamp = Date.now();

  // WebGL 작업 공간이 사라지면 그리기를 멈추고, 복구되면 현재 시점부터 다시 그린다.
  const handleContextLost = () => {
    isContextAvailable = false;
  };
  const handleContextRestored = () => {
    isContextAvailable = true;
    frozenTimestamp = Date.now();
    map?.triggerRepaint();
  };

  return {
    id: SUBWAY_TRAIN_LAYER_ID,
    type: "custom",
    renderingMode: "3d",
    // 레이어가 지도에 추가될 때 장면, 조명, 열차 모형과 시뮬레이션을 준비한다.
    onAdd(nextMap, gl) {
      map = nextMap;
      scene = new Scene();
      camera = new Camera();
      renderer = new WebGLRenderer({
        canvas: nextMap.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;

      const firstCoordinate = serviceRoutes[0]?.path[0];

      if (firstCoordinate === undefined) {
        return;
      }

      anchor = MercatorCoordinate.fromLngLat(
        { lng: firstCoordinate[0], lat: firstCoordinate[1] },
        TRAIN_DISPLAY_ALTITUDE_METERS,
      );
      scene.add(new AmbientLight("#b8d6dd", 1.8));

      const directionalLight = new DirectionalLight("#ffffff", 2.4);

      directionalLight.position.set(-30, -50, 90);
      scene.add(directionalLight);

      trainRuntimes = serviceRoutes.flatMap((serviceRoute, routeIndex) => {
        const sampler = createSubwayRouteSampler(serviceRoute.path);

        if (sampler === undefined) {
          return [];
        }

        const model = createSubwayTrainModel({
          lineColor: LINE_2_COLOR,
          carCount: 3,
        });
        const simulation = createSubwayTrainSimulation({
          id: `line-2-train-${serviceRoute.direction}`,
          sampler,
          stopDistancesMeters: serviceRoute.stops.map(
            (stop) => stop.distanceMeters,
          ),
          carCount: 3,
          carSpacingMeters: SUBWAY_TRAIN_CAR_SPACING_METERS,
          dwellSeconds: 20,
          phaseOffsetSeconds: routeIndex * 1_370,
          speedProfile: MOCK_SPEED_PROFILE,
        });

        scene?.add(model.root);

        return [{ simulation, model }];
      });

      nextMap
        .getCanvas()
        .addEventListener("webglcontextlost", handleContextLost);
      nextMap
        .getCanvas()
        .addEventListener("webglcontextrestored", handleContextRestored);
    },
    // 매 화면마다 계산된 위치를 열차 모형에 적용하고 지도 좌표에 맞춰 그린다.
    render(_gl, { defaultProjectionData }) {
      if (
        !isContextAvailable ||
        renderer === undefined ||
        scene === undefined ||
        camera === undefined ||
        anchor === undefined
      ) {
        return;
      }

      const timestamp = reducedMotion ? frozenTimestamp : Date.now();

      trainRuntimes.forEach(({ simulation, model }) => {
        const state = simulation.getState(timestamp);

        state.carPoses.forEach((pose, carIndex) => {
          const coordinate = MercatorCoordinate.fromLngLat(
            { lng: pose.coordinate[0], lat: pose.coordinate[1] },
            TRAIN_DISPLAY_ALTITUDE_METERS,
          );
          const meterScale = coordinate.meterInMercatorCoordinateUnits();
          const car = model.cars[carIndex];

          car.position.set(
            coordinate.x - anchor!.x,
            coordinate.y - anchor!.y,
            coordinate.z - anchor!.z,
          );
          car.rotation.set(0, 0, Math.PI + pose.headingRadians);
          car.scale.set(
            meterScale * TRAIN_CROSS_SECTION_SCALE,
            meterScale,
            meterScale,
          );
        });
      });

      camera.projectionMatrix
        .fromArray(defaultProjectionData.mainMatrix)
        .multiply(
          new Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z),
        );
      renderer.resetState();
      // 건물 depth만 비워 열차는 운영용 x-ray overlay로 보이면서 차량 내부 depth는 유지한다.
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.resetState();

      if (!reducedMotion) {
        map?.triggerRepaint();
      }
    },
    // 레이어가 지도에서 제거되면 이벤트와 Three.js GPU 자원을 함께 정리한다.
    onRemove(nextMap) {
      nextMap
        .getCanvas()
        .removeEventListener("webglcontextlost", handleContextLost);
      nextMap
        .getCanvas()
        .removeEventListener("webglcontextrestored", handleContextRestored);
      trainRuntimes.forEach(({ model }) => model.dispose());
      trainRuntimes = [];
      scene?.clear();
      renderer?.dispose();
      renderer = undefined;
      scene = undefined;
      camera = undefined;
      anchor = undefined;
      map = undefined;
    },
  };
}
