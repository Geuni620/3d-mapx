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
import {
  getLine2TrainPhaseOffsetSeconds,
  LINE_2_TRAIN_CRUISE_SPEED_METERS_PER_SECOND,
  LINE_2_TRAIN_DWELL_SECONDS,
  LINE_2_TRAIN_SIMULATION_EPOCH_MS,
} from "./line-2-train-demo-config";
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

const LINE_2_COLOR = "#00a84d";
const TRAIN_DISPLAY_ALTITUDE_METERS = 3.5;
const TRAIN_CROSS_SECTION_SCALE = 1.55;
const CAR_SPACING_METERS = 21;

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

      trainRuntimes = serviceRoutes.flatMap((serviceRoute) => {
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
          carSpacingMeters: CAR_SPACING_METERS,
          cruiseSpeedMetersPerSecond:
            LINE_2_TRAIN_CRUISE_SPEED_METERS_PER_SECOND,
          dwellSeconds: LINE_2_TRAIN_DWELL_SECONDS,
          phaseOffsetSeconds: getLine2TrainPhaseOffsetSeconds(
            serviceRoute.direction,
          ),
          simulationEpochMs: LINE_2_TRAIN_SIMULATION_EPOCH_MS,
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
            meterScale * TRAIN_CROSS_SECTION_SCALE,
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
