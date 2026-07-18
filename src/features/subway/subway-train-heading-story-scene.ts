import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  createSubwayRouteSampler,
  sampleSubwayRouteChordPose,
  type SubwayRoutePose,
  type SubwayRouteSampler,
} from "./subway-route-sampler";
import {
  SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
  SUBWAY_TRAIN_CAR_SPACING_METERS,
} from "./subway-train-dimensions";
import {
  createSubwayTrainModel,
  type SubwayTrainModel,
} from "./subway-train-model";

const METERS_PER_LATITUDE_DEGREE = 111_320;
const BASE_COORDINATE = [126.98, 37.56] as const;
const METERS_PER_LONGITUDE_DEGREE =
  METERS_PER_LATITUDE_DEGREE *
  Math.cos((BASE_COORDINATE[1] * Math.PI) / 180);
const TRAIN_CAR_COUNT = 3;
const TRAIN_SPEED_METERS_PER_SECOND = 14;
const SIMULATION_TRAIN_COUNT = 4;
const CORNER_LANE_OFFSET_METERS = 2.7;
const CORNER_ROUTE_POINTS = [
  [-90, 0],
  [0, 0],
  [0, 90],
] as const;
const LOOP_ROUTE_POINTS = [
  [-72, -28],
  [-44, -43],
  [-8, -48],
  [30, -43],
  [61, -26],
  [77, 2],
  [70, 34],
  [45, 57],
  [8, 67],
  [-32, 62],
  [-63, 43],
  [-79, 14],
] as const;
const CORNER_SAMPLER = createSampler(CORNER_ROUTE_POINTS);
const LOOP_SAMPLER = createSampler(LOOP_ROUTE_POINTS);
const CORNER_DISTANCE_METERS = CORNER_SAMPLER.project(
  metersToCoordinate(CORNER_ROUTE_POINTS[1]),
).distanceMeters;

export const TRAIN_SIMULATION_HEADWAY_SECONDS =
  LOOP_SAMPLER.totalDistanceMeters /
  SIMULATION_TRAIN_COUNT /
  TRAIN_SPEED_METERS_PER_SECOND;

export type TrainHeadingCalculation = "segment" | "bogie-chord";

export interface CornerComparisonScene {
  setOffsetMeters: (offsetMeters: number) => void;
  dispose: () => void;
}

interface Stage {
  scene: Scene;
  setFrameHandler: (handler: (timestampMilliseconds: number) => void) => void;
  dispose: () => void;
}

export function getCornerHeadingComparison(offsetMeters: number) {
  const distanceMeters = CORNER_DISTANCE_METERS + offsetMeters;

  return {
    beforeDegrees: radiansToDegrees(
      getPose(CORNER_SAMPLER, distanceMeters, "segment").headingRadians,
    ),
    afterDegrees: radiansToDegrees(
      getPose(CORNER_SAMPLER, distanceMeters, "bogie-chord").headingRadians,
    ),
  };
}

export function mountCornerComparisonScene(
  canvas: HTMLCanvasElement,
): CornerComparisonScene {
  const stage = createStage(canvas, CORNER_ROUTE_POINTS, {
    cameraPosition: new Vector3(75, -102, 82),
    cameraTarget: new Vector3(-6, 14, 0),
    isOrbitEnabled: true,
    isRouteClosed: false,
  });
  const beforeModel = createComparisonModel("segment");
  const afterModel = createComparisonModel("bogie-chord");

  stage.scene.add(beforeModel.root, afterModel.root);

  return {
    setOffsetMeters(offsetMeters) {
      const distanceMeters = CORNER_DISTANCE_METERS + offsetMeters;

      updateTrainModel(
        beforeModel,
        CORNER_SAMPLER,
        distanceMeters,
        "segment",
        -CORNER_LANE_OFFSET_METERS,
      );
      updateTrainModel(
        afterModel,
        CORNER_SAMPLER,
        distanceMeters,
        "bogie-chord",
        CORNER_LANE_OFFSET_METERS,
      );
    },
    dispose() {
      beforeModel.dispose();
      afterModel.dispose();
      stage.dispose();
    },
  };
}

export function mountContinuousTrainScene(
  canvas: HTMLCanvasElement,
  calculation: TrainHeadingCalculation,
) {
  const stage = createStage(canvas, LOOP_ROUTE_POINTS, {
    cameraPosition: new Vector3(0, -175, 175),
    cameraTarget: new Vector3(0, 5, 0),
    isOrbitEnabled: false,
    isRouteClosed: true,
  });
  const models = Array.from({ length: SIMULATION_TRAIN_COUNT }, () =>
    createComparisonModel(calculation),
  );

  stage.scene.add(...models.map((model) => model.root));
  stage.setFrameHandler((timestampMilliseconds) => {
    const leadDistanceMeters =
      ((timestampMilliseconds / 1_000) * TRAIN_SPEED_METERS_PER_SECOND) %
      LOOP_SAMPLER.totalDistanceMeters;

    models.forEach((model, trainIndex) => {
      const phaseDistanceMeters =
        (LOOP_SAMPLER.totalDistanceMeters / SIMULATION_TRAIN_COUNT) *
        trainIndex;

      updateTrainModel(
        model,
        LOOP_SAMPLER,
        leadDistanceMeters + phaseDistanceMeters,
        calculation,
        0,
      );
    });
  });

  return () => {
    models.forEach((model) => model.dispose());
    stage.dispose();
  };
}

function createStage(
  canvas: HTMLCanvasElement,
  routePoints: ReadonlyArray<readonly [number, number]>,
  options: {
    cameraPosition: Vector3;
    cameraTarget: Vector3;
    isOrbitEnabled: boolean;
    isRouteClosed: boolean;
  },
): Stage {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 500);
  const track = createTrack(routePoints, options.isRouteClosed);
  const controls = options.isOrbitEnabled
    ? new OrbitControls(camera, canvas)
    : undefined;
  let frameHandler: ((timestampMilliseconds: number) => void) | undefined;

  scene.background = new Color("#07110e");
  scene.fog = new Fog("#07110e", 145, 260);
  scene.add(new AmbientLight("#a7c6b7", 1.75));

  const keyLight = new DirectionalLight("#fff8e8", 3.3);
  const rimLight = new DirectionalLight("#54f49f", 1.4);

  keyLight.position.set(-55, -45, 95);
  rimLight.position.set(60, 70, 45);
  scene.add(keyLight, rimLight, track);

  camera.up.set(0, 0, 1);
  camera.position.copy(options.cameraPosition);
  camera.lookAt(options.cameraTarget);

  if (controls !== undefined) {
    controls.target.copy(options.cameraTarget);
    controls.enableDamping = true;
    controls.minDistance = 55;
    controls.maxDistance = 210;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.update();
  }

  const resizeObserver = new ResizeObserver(() => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(canvas);

  let animationFrame = 0;
  const render = (timestampMilliseconds: number) => {
    frameHandler?.(timestampMilliseconds);
    controls?.update();
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(render);
  };
  animationFrame = requestAnimationFrame(render);

  return {
    scene,
    setFrameHandler(handler) {
      frameHandler = handler;
    },
    dispose() {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls?.dispose();
      disposeObject(track);
      scene.clear();
      renderer.dispose();
    },
  };
}

function createComparisonModel(calculation: TrainHeadingCalculation) {
  return createSubwayTrainModel({
    lineColor: calculation === "segment" ? "#ff784e" : "#54f49f",
    bodyColor: calculation === "segment" ? "#65696b" : "#d1dbd6",
    carCount: TRAIN_CAR_COUNT,
  });
}

function updateTrainModel(
  model: SubwayTrainModel,
  sampler: SubwayRouteSampler,
  frontDistanceMeters: number,
  calculation: TrainHeadingCalculation,
  laneOffsetMeters: number,
) {
  model.cars.forEach((car, carIndex) => {
    const distanceMeters =
      frontDistanceMeters - carIndex * SUBWAY_TRAIN_CAR_SPACING_METERS;
    const pose = getPose(sampler, distanceMeters, calculation);
    const coordinate = coordinateToLocalMeters(pose.coordinate);
    const laneOffset = getRightNormalOffset(pose, laneOffsetMeters);

    car.position.set(
      coordinate.east + laneOffset.east,
      coordinate.north + laneOffset.north,
      0.35,
    );
    car.rotation.set(0, 0, -pose.headingRadians);
  });
}

function getPose(
  sampler: SubwayRouteSampler,
  distanceMeters: number,
  calculation: TrainHeadingCalculation,
) {
  return calculation === "segment"
    ? sampler.sample(distanceMeters)
    : sampleSubwayRouteChordPose(
        sampler,
        distanceMeters,
        SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
      );
}

function createTrack(
  routePoints: ReadonlyArray<readonly [number, number]>,
  isClosed: boolean,
) {
  const track = new Group();
  const railMaterial = new MeshStandardMaterial({
    color: "#77847e",
    metalness: 0.86,
    roughness: 0.22,
  });
  const sleeperMaterial = new MeshStandardMaterial({
    color: "#26332e",
    metalness: 0.15,
    roughness: 0.82,
  });
  const sleeperGeometry = new BoxGeometry(6.8, 0.65, 0.24);
  const segmentCount = isClosed ? routePoints.length : routePoints.length - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const start = routePoints[index];
    const end = routePoints[(index + 1) % routePoints.length];
    const eastDelta = end[0] - start[0];
    const northDelta = end[1] - start[1];
    const lengthMeters = Math.hypot(eastDelta, northDelta);
    const headingRadians = Math.atan2(eastDelta, northDelta);
    const middleEast = (start[0] + end[0]) / 2;
    const middleNorth = (start[1] + end[1]) / 2;
    const normalEast = Math.cos(headingRadians);
    const normalNorth = -Math.sin(headingRadians);

    for (const railOffset of [-1.18, 1.18]) {
      const rail = new Mesh(
        new BoxGeometry(0.15, lengthMeters, 0.2),
        railMaterial,
      );

      rail.position.set(
        middleEast + normalEast * railOffset,
        middleNorth + normalNorth * railOffset,
        0.2,
      );
      rail.rotation.z = -headingRadians;
      track.add(rail);
    }

    for (let distance = 2.25; distance < lengthMeters; distance += 4.5) {
      const progress = distance / lengthMeters;
      const sleeper = new Mesh(sleeperGeometry, sleeperMaterial);

      sleeper.position.set(
        start[0] + eastDelta * progress,
        start[1] + northDelta * progress,
        0.05,
      );
      sleeper.rotation.z = -headingRadians;
      track.add(sleeper);
    }
  }

  const grid = new GridHelper(260, 26, "#1b352b", "#12241d");

  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.25;
  track.add(grid);
  return track;
}

function disposeObject(root: Group) {
  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof GridHelper)) {
      return;
    }

    object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((material: Material) => material.dispose());
  });
}

function getRightNormalOffset(pose: SubwayRoutePose, distanceMeters: number) {
  return {
    east: Math.cos(pose.headingRadians) * distanceMeters,
    north: -Math.sin(pose.headingRadians) * distanceMeters,
  };
}

function createSampler(routePoints: ReadonlyArray<readonly [number, number]>) {
  return createSubwayRouteSampler(routePoints.map(metersToCoordinate))!;
}

function metersToCoordinate([east, north]: readonly [number, number]) {
  return [
    BASE_COORDINATE[0] + east / METERS_PER_LONGITUDE_DEGREE,
    BASE_COORDINATE[1] + north / METERS_PER_LATITUDE_DEGREE,
  ] as const;
}

function coordinateToLocalMeters(coordinate: readonly [number, number]) {
  return {
    east:
      (coordinate[0] - BASE_COORDINATE[0]) * METERS_PER_LONGITUDE_DEGREE,
    north:
      (coordinate[1] - BASE_COORDINATE[1]) * METERS_PER_LATITUDE_DEGREE,
  };
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}
