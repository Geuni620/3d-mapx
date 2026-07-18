import { useEffect, useRef, useState } from "react";
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  GridHelper,
  Group,
  Line,
  LineBasicMaterial,
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
import "./subway-train-heading-comparison.css";

const EARTH_METERS_PER_LATITUDE_DEGREE = 111_320;
const BASE_COORDINATE = [126.98, 37.56] as const;
const EARTH_METERS_PER_LONGITUDE_DEGREE =
  EARTH_METERS_PER_LATITUDE_DEGREE *
  Math.cos((BASE_COORDINATE[1] * Math.PI) / 180);
const ROUTE_POINTS_METERS = [
  [-90, 0],
  [0, 0],
  [0, 90],
  [80, 90],
  [80, -50],
  [-90, -50],
] as const;
const ROUTE_COORDINATES = ROUTE_POINTS_METERS.map(([east, north]) =>
  metersToCoordinate(east, north),
);
const ROUTE_SAMPLER = createSubwayRouteSampler(ROUTE_COORDINATES)!;
const CORNER_DISTANCE_METERS = ROUTE_SAMPLER.project(
  ROUTE_COORDINATES[1],
).distanceMeters;
const COMPARISON_LANE_OFFSET_METERS = 2.7;
const TRAIN_CAR_COUNT = 3;
const SIMULATION_SPEED_METERS_PER_SECOND = 14;
const SIMULATION_TRAIN_COUNT = 4;
const SIMULATION_ROUTE_POINTS_METERS = [
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
const SIMULATION_ROUTE_COORDINATES = SIMULATION_ROUTE_POINTS_METERS.map(
  ([east, north]) => metersToCoordinate(east, north),
);
const SIMULATION_ROUTE_SAMPLER = createSubwayRouteSampler(
  SIMULATION_ROUTE_COORDINATES,
)!;
const SIMULATION_HEADWAY_SECONDS =
  SIMULATION_ROUTE_SAMPLER.totalDistanceMeters /
  SIMULATION_TRAIN_COUNT /
  SIMULATION_SPEED_METERS_PER_SECOND;

interface ComparisonRuntime {
  beforeModel: SubwayTrainModel;
  afterModel: SubwayTrainModel;
}

export function SubwayTrainHeadingComparison() {
  const [cornerOffsetMeters, setCornerOffsetMeters] = useState(0);
  const distanceMeters = CORNER_DISTANCE_METERS + cornerOffsetMeters;
  const beforePose = ROUTE_SAMPLER.sample(distanceMeters);
  const afterPose = sampleComparisonChordPose(
    ROUTE_SAMPLER,
    distanceMeters,
  );
  const angleDeltaDegrees = getSmallestAngleDifferenceDegrees(
    beforePose.headingRadians,
    afterPose.headingRadians,
  );

  return (
    <main className="heading-lab">
      <header className="heading-lab__header">
        <div>
          <p className="heading-lab__eyebrow">TRAIN DYNAMICS / CURVE 01</p>
          <h1>실제 열차 모형 방향 비교</h1>
          <p className="heading-lab__summary">
            같은 선로와 같은 진행 위치에 기존·개선 편성을 나란히 놓았습니다.
            차이는 차량 회전 계산 방식뿐입니다.
          </p>
        </div>
        <div className="heading-lab__delta" aria-label="두 계산 방식의 각도 차이">
          <span>선두 차량 각도 차이</span>
          <strong>{angleDeltaDegrees.toFixed(1)}°</strong>
        </div>
      </header>

      <section className="heading-stage" aria-label="열차 모형 방향 비교 3D 장면">
        <div className="heading-stage__legend">
          <span className="heading-stage__badge heading-stage__badge--before">
            <i /> BEFORE · 구간 방향
          </span>
          <span className="heading-stage__badge heading-stage__badge--after">
            <i /> AFTER · 대차 chord 방향
          </span>
        </div>
        <div className="heading-stage__corner-note">
          <span>검증 지점</span>
          <strong>90° 경로 경계</strong>
        </div>
        <TrainComparisonScene cornerOffsetMeters={cornerOffsetMeters} />
        <p className="heading-stage__orbit-hint">드래그하여 시점 회전 · 휠로 확대</p>
      </section>

      <section className="heading-readout" aria-label="계산 방식별 방향 정보">
        <article className="heading-readout__item heading-readout__item--before">
          <span>BEFORE / 선두 차량</span>
          <strong>{radiansToDegrees(beforePose.headingRadians).toFixed(1)}°</strong>
          <p>중심이 다음 polyline 구간에 들어가는 순간 방향이 전환됩니다.</p>
        </article>
        <div className="heading-readout__divider" aria-hidden="true">
          <span>VS</span>
        </div>
        <article className="heading-readout__item heading-readout__item--after">
          <span>AFTER / 선두 차량</span>
          <strong>{radiansToDegrees(afterPose.headingRadians).toFixed(1)}°</strong>
          <p>앞·뒤 대차가 모서리를 나누어 지나는 동안 방향이 이어집니다.</p>
        </article>
      </section>

      <section className="heading-lab__controls" aria-label="열차 위치 조절">
        <div className="heading-lab__control-copy">
          <span>모서리 기준 위치</span>
          <strong>
            {cornerOffsetMeters > 0 ? "+" : ""}
            {cornerOffsetMeters.toFixed(1)} m
          </strong>
        </div>
        <input
          aria-label="모서리 기준 열차 위치"
          type="range"
          min="-12"
          max="12"
          step="0.1"
          value={cornerOffsetMeters}
          onChange={(event) =>
            setCornerOffsetMeters(Number(event.currentTarget.value))
          }
        />
        <div className="heading-lab__presets" aria-label="위치 프리셋">
          {[
            { label: "진입", value: -8 },
            { label: "차이 최대", value: 0 },
            { label: "이탈", value: 8 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              data-active={cornerOffsetMeters === preset.value}
              onClick={() => setCornerOffsetMeters(preset.value)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="heading-lab__hint">
          두 편성은 식별을 위해 선로 중심에서 좌우로 2.7m씩만 벌렸습니다.
          각 차량의 진행 거리와 경로는 동일합니다.
        </p>
      </section>
    </main>
  );
}

export function SubwayTrainHeadingSimulationComparison() {
  return (
    <main className="heading-lab heading-lab--simulation">
      <header className="heading-lab__header">
        <div>
          <p className="heading-lab__eyebrow">TRAIN DYNAMICS / LIVE LOOP</p>
          <h1>연속 주행 비교</h1>
          <p className="heading-lab__summary">
            같은 선로와 같은 시각을 기준으로 두 편성이 계속 주행합니다.
            곡선의 각 경계에서 차량이 방향을 이어가는 방식을 비교하세요.
          </p>
        </div>
        <div className="heading-lab__live">
          <i /> {SIMULATION_SPEED_METERS_PER_SECOND} M/S ·{" "}
          {SIMULATION_HEADWAY_SECONDS.toFixed(1)}S HEADWAY
        </div>
      </header>

      <section
        className="simulation-comparison"
        aria-label="기존 및 개선 방향 계산 연속 주행 비교"
      >
        <SimulationViewport
          calculation="before"
          label="BEFORE"
          title="구간 방향"
          description="차량 중심이 다음 경로 조각에 진입할 때 각도가 바뀝니다."
        />
        <SimulationViewport
          calculation="after"
          label="AFTER"
          title="대차 chord 방향"
          description="앞·뒤 대차가 경계를 나누어 지나며 각도가 연속적으로 바뀝니다."
        />
      </section>

      <footer className="simulation-comparison__note">
        <span>동일 조건</span>
        <p>
          3량 편성 · 4개 열차 균등 배차 · 동일 경로 · 동일 속도 · 동일 카메라
        </p>
      </footer>
    </main>
  );
}

function SimulationViewport({
  calculation,
  label,
  title,
  description,
}: {
  calculation: "before" | "after";
  label: string;
  title: string;
  description: string;
}) {
  return (
    <article className={`simulation-viewport simulation-viewport--${calculation}`}>
      <header className="simulation-viewport__header">
        <div>
          <span>{label}</span>
          <h2>{title}</h2>
        </div>
        <i aria-label="시뮬레이션 실행 중" />
      </header>
      <TrainSimulationScene calculation={calculation} />
      <p>{description}</p>
    </article>
  );
}

function TrainSimulationScene({
  calculation,
}: {
  calculation: "before" | "after";
}) {
  const canvasReference = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasReference.current;

    if (canvas === null) {
      return;
    }

    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    const scene = new Scene();
    const camera = new PerspectiveCamera(36, 1, 0.1, 500);
    const track = createLoopTrackScene(SIMULATION_ROUTE_POINTS_METERS);
    const models = Array.from({ length: SIMULATION_TRAIN_COUNT }, () =>
      createSubwayTrainModel({
        lineColor: calculation === "before" ? "#ff784e" : "#54f49f",
        bodyColor: calculation === "before" ? "#65696b" : "#d1dbd6",
        carCount: TRAIN_CAR_COUNT,
      }),
    );

    scene.background = new Color("#07110e");
    scene.fog = new Fog("#07110e", 150, 260);
    scene.add(new AmbientLight("#a7c6b7", 1.75));

    const keyLight = new DirectionalLight("#fff8e8", 3.3);
    const rimLight = new DirectionalLight(
      calculation === "before" ? "#ff784e" : "#54f49f",
      1.5,
    );

    keyLight.position.set(-55, -45, 95);
    rimLight.position.set(60, 70, 45);
    scene.add(
      keyLight,
      rimLight,
      track,
      ...models.map((model) => model.root),
    );

    camera.up.set(0, 0, 1);
    camera.position.set(0, -175, 175);
    camera.lookAt(0, 5, 0);

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
      const frontDistanceMeters =
        ((timestampMilliseconds / 1_000) *
          SIMULATION_SPEED_METERS_PER_SECOND) %
        SIMULATION_ROUTE_SAMPLER.totalDistanceMeters;

      models.forEach((model, trainIndex) => {
        const phaseDistanceMeters =
          (SIMULATION_ROUTE_SAMPLER.totalDistanceMeters /
            SIMULATION_TRAIN_COUNT) *
          trainIndex;

        updateTrainModel(
          model,
          SIMULATION_ROUTE_SAMPLER,
          frontDistanceMeters + phaseDistanceMeters,
          calculation,
          0,
        );
      });
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      disposeObject(track);
      models.forEach((model) => model.dispose());
      scene.clear();
      renderer.dispose();
    };
  }, [calculation]);

  return (
    <canvas
      ref={canvasReference}
      className="simulation-viewport__canvas"
      aria-label={`${calculation === "before" ? "기존" : "개선"} 방향 계산 열차 연속 주행`}
    />
  );
}

function TrainComparisonScene({
  cornerOffsetMeters,
}: {
  cornerOffsetMeters: number;
}) {
  const canvasReference = useRef<HTMLCanvasElement>(null);
  const runtimeReference = useRef<ComparisonRuntime | undefined>(undefined);

  useEffect(() => {
    const canvas = canvasReference.current;

    if (canvas === null) {
      return;
    }

    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    const scene = new Scene();
    const camera = new PerspectiveCamera(38, 1, 0.1, 500);
    const controls = new OrbitControls(camera, canvas);
    const track = createTrackScene();
    const beforeModel = createSubwayTrainModel({
      lineColor: "#ff784e",
      bodyColor: "#65696b",
      carCount: TRAIN_CAR_COUNT,
    });
    const afterModel = createSubwayTrainModel({
      lineColor: "#54f49f",
      bodyColor: "#d1dbd6",
      carCount: TRAIN_CAR_COUNT,
    });

    scene.background = new Color("#07110e");
    scene.fog = new Fog("#07110e", 110, 230);
    scene.add(new AmbientLight("#a7c6b7", 1.7));

    const keyLight = new DirectionalLight("#fff8e8", 3.4);
    const rimLight = new DirectionalLight("#62f7aa", 1.6);

    keyLight.position.set(-45, -30, 85);
    rimLight.position.set(55, 75, 40);
    scene.add(keyLight, rimLight, track, beforeModel.root, afterModel.root);

    camera.up.set(0, 0, 1);
    camera.position.set(75, -102, 82);
    controls.target.set(-6, 14, 0);
    controls.enableDamping = true;
    controls.minDistance = 55;
    controls.maxDistance = 210;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.update();

    runtimeReference.current = { beforeModel, afterModel };
    updateComparisonModels(
      runtimeReference.current,
      CORNER_DISTANCE_METERS,
    );

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
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      controls.dispose();
      disposeObject(track);
      beforeModel.dispose();
      afterModel.dispose();
      scene.clear();
      renderer.dispose();
      runtimeReference.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (runtimeReference.current === undefined) {
      return;
    }

    updateComparisonModels(
      runtimeReference.current,
      CORNER_DISTANCE_METERS + cornerOffsetMeters,
    );
  }, [cornerOffsetMeters]);

  return (
    <canvas
      ref={canvasReference}
      className="heading-stage__canvas"
      aria-label="같은 선로 위에 배치한 기존 및 개선 열차 모형"
    />
  );
}

function updateComparisonModels(
  runtime: ComparisonRuntime,
  frontDistanceMeters: number,
) {
  updateTrainModel(
    runtime.beforeModel,
    ROUTE_SAMPLER,
    frontDistanceMeters,
    "before",
    -COMPARISON_LANE_OFFSET_METERS,
  );
  updateTrainModel(
    runtime.afterModel,
    ROUTE_SAMPLER,
    frontDistanceMeters,
    "after",
    COMPARISON_LANE_OFFSET_METERS,
  );
}

function updateTrainModel(
  model: SubwayTrainModel,
  sampler: SubwayRouteSampler,
  frontDistanceMeters: number,
  calculation: "before" | "after",
  laneOffsetMeters: number,
) {
  model.cars.forEach((car, carIndex) => {
    const distanceMeters =
      frontDistanceMeters - carIndex * SUBWAY_TRAIN_CAR_SPACING_METERS;
    const pose =
      calculation === "before"
        ? sampler.sample(distanceMeters)
        : sampleComparisonChordPose(sampler, distanceMeters);
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

function createLoopTrackScene(
  routePointsMeters: ReadonlyArray<readonly [number, number]>,
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

  routePointsMeters.forEach((start, index) => {
    const end = routePointsMeters[(index + 1) % routePointsMeters.length];
    const deltaEast = end[0] - start[0];
    const deltaNorth = end[1] - start[1];
    const lengthMeters = Math.hypot(deltaEast, deltaNorth);
    const headingRadians = Math.atan2(deltaEast, deltaNorth);
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
        start[0] + deltaEast * progress,
        start[1] + deltaNorth * progress,
        0.05,
      );
      sleeper.rotation.z = -headingRadians;
      track.add(sleeper);
    }
  });

  const grid = new GridHelper(260, 26, "#1b352b", "#12241d");

  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.25;
  track.add(grid);
  return track;
}

function createTrackScene() {
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
  const routeMaterial = new LineBasicMaterial({ color: "#51655b" });
  const railGeometryHorizontal = new BoxGeometry(90, 0.15, 0.2);
  const railGeometryVertical = new BoxGeometry(0.15, 90, 0.2);
  const sleeperGeometryHorizontal = new BoxGeometry(0.65, 6.8, 0.24);
  const sleeperGeometryVertical = new BoxGeometry(6.8, 0.65, 0.24);

  for (const railOffset of [-1.18, 1.18]) {
    const incomingRail = new Mesh(railGeometryHorizontal, railMaterial);
    const outgoingRail = new Mesh(railGeometryVertical, railMaterial);

    incomingRail.position.set(-45, railOffset, 0.2);
    outgoingRail.position.set(railOffset, 45, 0.2);
    track.add(incomingRail, outgoingRail);
  }

  for (let distance = 3; distance < 90; distance += 4.5) {
    const incomingSleeper = new Mesh(
      sleeperGeometryHorizontal,
      sleeperMaterial,
    );
    const outgoingSleeper = new Mesh(
      sleeperGeometryVertical,
      sleeperMaterial,
    );

    incomingSleeper.position.set(-distance, 0, 0.05);
    outgoingSleeper.position.set(0, distance, 0.05);
    track.add(incomingSleeper, outgoingSleeper);
  }

  const routeLine = new Line(
    new BufferGeometry().setFromPoints([
      new Vector3(-90, 0, 0.32),
      new Vector3(0, 0, 0.32),
      new Vector3(0, 90, 0.32),
    ]),
    routeMaterial,
  );
  const grid = new GridHelper(240, 24, "#1b352b", "#12241d");

  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.25;
  track.add(routeLine, grid);
  return track;
}

function disposeObject(root: Group) {
  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof Line)) {
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

// 제품 커밋과 독립된 Storybook PR에서도 두 계산 방식을 비교할 수 있게 같은 원리를 재현한다.
function sampleComparisonChordPose(
  sampler: SubwayRouteSampler,
  centerDistanceMeters: number,
): SubwayRoutePose {
  const centerPose = sampler.sample(centerDistanceMeters);
  const rearPose = sampler.sample(
    centerDistanceMeters - SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
  );
  const frontPose = sampler.sample(
    centerDistanceMeters + SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
  );
  const rear = coordinateToLocalMeters(rearPose.coordinate);
  const front = coordinateToLocalMeters(frontPose.coordinate);
  const eastDelta = front.east - rear.east;
  const northDelta = front.north - rear.north;

  if (eastDelta === 0 && northDelta === 0) {
    return centerPose;
  }

  return {
    coordinate: centerPose.coordinate,
    headingRadians: Math.atan2(eastDelta, northDelta),
  };
}

function metersToCoordinate(east: number, north: number) {
  return [
    BASE_COORDINATE[0] + east / EARTH_METERS_PER_LONGITUDE_DEGREE,
    BASE_COORDINATE[1] + north / EARTH_METERS_PER_LATITUDE_DEGREE,
  ] as const;
}

function coordinateToLocalMeters(coordinate: readonly [number, number]) {
  return {
    east:
      (coordinate[0] - BASE_COORDINATE[0]) *
      EARTH_METERS_PER_LONGITUDE_DEGREE,
    north:
      (coordinate[1] - BASE_COORDINATE[1]) *
      EARTH_METERS_PER_LATITUDE_DEGREE,
  };
}

function radiansToDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function getSmallestAngleDifferenceDegrees(first: number, second: number) {
  return Math.abs(
    radiansToDegrees(
      Math.atan2(Math.sin(first - second), Math.cos(first - second)),
    ),
  );
}
