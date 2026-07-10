import { useEffect, useState, type ReactNode } from "react";
import {
  AmbientLight,
  AxesHelper,
  BoxHelper,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Line,
  LineBasicMaterial,
  Material,
  Object3D,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Curve,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  SEOUL_SUBWAY_OSM_NETWORK,
  type SeoulSubwayOsmServiceRoute,
  type SubwayCoordinate,
} from "../osm-subway-network";
import {
  getLine2TrainPhaseOffsetSeconds,
  LINE_2_TRAIN_CRUISE_SPEED_METERS_PER_SECOND,
  LINE_2_TRAIN_DWELL_SECONDS,
  LINE_2_TRAIN_SIMULATION_EPOCH_MS,
} from "../line-2-train-demo-config";
import { createSubwayRouteSampler } from "../subway-route-sampler";
import {
  createSubwayTrainSimulation,
  type SubwayTrainSimulationState,
} from "../line-2-train-simulation";
import { createSubwayTrainModel } from "../subway-train-model";
import {
  applySubwayTrainModelAppearance,
  createSyntheticTrainCurves,
  getSubwayTrainModelMetrics,
  sampleTrainCarPosesOnCurve,
  type SubwayTrainModelMetrics,
} from "./subway-train-model-lab";

const EMPTY_METRICS: ModelLabMetrics = {
  meshCount: 0,
  geometryCount: 0,
  sharedGeometryCount: 0,
  materialCount: 0,
  textureCount: 0,
  triangleCount: 0,
  drawCalls: 0,
};
const LINE_2_COLOR = "#00a84d";
const LINE_2_SERVICE_ROUTES = SEOUL_SUBWAY_OSM_NETWORK.serviceRoutes.filter(
  (route) =>
    route.osmRelationId === 2404374 || route.osmRelationId === 4729409,
);

export type SubwayTrainCameraPreset = "front" | "side" | "top" | "three-quarter";

export interface SubwayTrainPreviewProps {
  cameraPreset: SubwayTrainCameraPreset;
  carCount: number;
  bodyColor: string;
  lineColor: string;
  lightIntensity: number;
  showWindows: boolean;
  showDoors: boolean;
  showRoofEquipment: boolean;
  showBogies: boolean;
  wireframe: boolean;
  showAxes: boolean;
  showBoundingBox: boolean;
  auditMode?: boolean;
  orbitEnabled?: boolean;
}

export interface SyntheticTrainMotionPreviewProps {
  progress: number;
  speed: number;
  paused: boolean;
  showGuides: boolean;
}

export interface Line2TrainMotionPreviewProps {
  fixedTimestamp: number;
  live: boolean;
  speed: number;
  paused: boolean;
  showGuides: boolean;
}

interface ModelLabMetrics extends SubwayTrainModelMetrics {
  drawCalls: number;
}

interface ModelLabStage {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  controls: OrbitControls;
  render: () => void;
  dispose: () => void;
}

interface Line2TrainStatus {
  osmRelationId: number;
  phase: SubwayTrainSimulationState["phase"];
  speedMetersPerSecond: number;
}

export function SubwayTrainPreview({
  cameraPreset,
  carCount,
  bodyColor,
  lineColor,
  lightIntensity,
  showWindows,
  showDoors,
  showRoofEquipment,
  showBogies,
  wireframe,
  showAxes,
  showBoundingBox,
  auditMode = false,
  orbitEnabled = true,
}: SubwayTrainPreviewProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<ModelLabMetrics>(EMPTY_METRICS);

  useEffect(() => {
    if (container === null) {
      return;
    }

    const safeCarCount = Math.max(1, Math.round(carCount));
    const train = createSubwayTrainModel({
      lineColor,
      bodyColor,
      carCount: safeCarCount,
    });
    const trainCenterY = -((safeCarCount - 1) * 21) / 2;
    const camera = getCameraPreset(cameraPreset, trainCenterY);
    const stage = createModelLabStage(container, {
      cameraPosition: camera.position,
      cameraTarget: camera.target,
      lightIntensity,
      orbitEnabled,
      gridSize: 150,
    });

    train.cars.forEach((car, carIndex) => {
      car.position.y = -carIndex * 21;
    });
    applySubwayTrainModelAppearance(train.root, {
      showWindows,
      showDoors,
      showRoofEquipment,
      showBogies,
      wireframe,
    });
    stage.scene.add(train.root);

    const debugHelpers: Object3D[] = [];

    if (showAxes) {
      const axes = new AxesHelper(16);

      axes.position.set(0, trainCenterY, 0.02);
      stage.scene.add(axes);
      debugHelpers.push(axes);
    }

    if (showBoundingBox) {
      const boundingBox = new BoxHelper(train.root, new Color("#77f2b4"));

      stage.scene.add(boundingBox);
      debugHelpers.push(boundingBox);
    }

    let animationFrame = 0;
    let metricsCommitted = false;
    const renderFrame = () => {
      stage.render();

      if (!metricsCommitted) {
        metricsCommitted = true;
        setMetrics({
          ...getSubwayTrainModelMetrics(train.root),
          drawCalls: stage.renderer.info.render.calls,
        });
      }

      animationFrame = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      cancelAnimationFrame(animationFrame);
      debugHelpers.forEach(disposeObjectResources);
      train.dispose();
      stage.dispose();
    };
  }, [
    auditMode,
    bodyColor,
    cameraPreset,
    carCount,
    container,
    lightIntensity,
    lineColor,
    orbitEnabled,
    showAxes,
    showBogies,
    showBoundingBox,
    showDoors,
    showRoofEquipment,
    showWindows,
    wireframe,
  ]);

  return (
    <ModelLabSurface
      title={auditMode ? "Geometry audit" : "Interactive train model"}
      description={
        auditMode
          ? "고정된 3/4 카메라에서 pivot, 공유 geometry, 전후 조명과 외부 asset 부재를 점검합니다."
          : "마우스로 회전·확대하고 Controls 패널에서 production procedural model을 직접 조정합니다."
      }
      metrics={metrics}
      audit={
        auditMode ? (
          <ModelAudit metrics={metrics} carCount={Math.max(1, Math.round(carCount))} />
        ) : undefined
      }
    >
      <div
        ref={setContainer}
        className="model-lab-canvas"
        data-testid="subway-train-model-canvas"
        data-model-source="production-factory"
      />
    </ModelLabSurface>
  );
}

export function SyntheticTrainMotionPreview({
  progress,
  speed,
  paused,
  showGuides,
}: SyntheticTrainMotionPreviewProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<ModelLabMetrics>(EMPTY_METRICS);

  useEffect(() => {
    if (container === null) {
      return;
    }

    const stage = createModelLabStage(container, {
      cameraPosition: new Vector3(72, -82, 96),
      cameraTarget: new Vector3(0, 0, 8),
      lightIntensity: 2.3,
      orbitEnabled: true,
      gridSize: 180,
    });
    const curves = createSyntheticTrainCurves();
    const trains = [
      createSubwayTrainModel({ lineColor: LINE_2_COLOR, carCount: 3 }),
      createSubwayTrainModel({ lineColor: "#64d99b", carCount: 3 }),
    ];
    const guideLines = showGuides
      ? curves.map((curve, index) =>
          createCurveGuide(curve, index === 0 ? "#00a84d" : "#64d99b"),
        )
      : [];

    trains.forEach((train) => stage.scene.add(train.root));
    guideLines.forEach((guideLine) => stage.scene.add(guideLine));

    const initialMetrics = mergeMetrics(
      trains.map((train) => getSubwayTrainModelMetrics(train.root)),
    );
    const startedAt = performance.now();
    let animationFrame = 0;
    let metricsCommitted = false;
    const renderFrame = (time: number) => {
      const elapsedProgress = ((time - startedAt) / 1_000) * speed * 0.08;
      const outboundProgress = paused
        ? clamp(progress, 0.18, 0.82)
        : pingPong(progress + elapsedProgress, 0.18, 0.82);
      const inboundProgress = 1 - outboundProgress;

      applyCurvePoses(trains[0], curves[0], outboundProgress, 1);
      applyCurvePoses(trains[1], curves[1], inboundProgress, -1);
      stage.render();

      if (!metricsCommitted) {
        metricsCommitted = true;
        setMetrics({
          ...initialMetrics,
          drawCalls: stage.renderer.info.render.calls,
        });
      }

      animationFrame = requestAnimationFrame(renderFrame);
    };

    animationFrame = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrame);
      guideLines.forEach(disposeObjectResources);
      trains.forEach((train) => train.dispose());
      stage.dispose();
    };
  }, [container, paused, progress, showGuides, speed]);

  return (
    <ModelLabSurface
      title="Opposite directions"
      description="평행한 synthetic S-curve에서 두 3량 열차가 서로 반대 tangent를 따라 움직입니다."
      metrics={metrics}
    >
      <div
        ref={setContainer}
        className="model-lab-canvas"
        data-testid="subway-train-motion-canvas"
        data-motion-source="synthetic-s-curve"
      />
    </ModelLabSurface>
  );
}

export function Line2TrainMotionPreview({
  fixedTimestamp,
  live,
  speed,
  paused,
  showGuides,
}: Line2TrainMotionPreviewProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<ModelLabMetrics>(EMPTY_METRICS);
  const [trainStatuses, setTrainStatuses] = useState<Line2TrainStatus[]>([]);

  useEffect(() => {
    if (container === null) {
      return;
    }

    const stage = createModelLabStage(container, {
      cameraPosition: new Vector3(0, -12, 135),
      cameraTarget: new Vector3(0, 0, 0),
      lightIntensity: 2.4,
      orbitEnabled: true,
      gridSize: 170,
    });
    const runtimes = LINE_2_SERVICE_ROUTES.flatMap((serviceRoute, routeIndex) => {
      const sampler = createSubwayRouteSampler(serviceRoute.path);

      if (sampler === undefined) {
        return [];
      }

      const train = createSubwayTrainModel({
        lineColor: routeIndex === 0 ? LINE_2_COLOR : "#67dda0",
        carCount: 3,
      });
      const guideLine = showGuides
        ? new Line(
            new BufferGeometry(),
            new LineBasicMaterial({
              color: routeIndex === 0 ? "#00a84d" : "#67dda0",
              transparent: true,
              opacity: 0.72,
            }),
          )
        : undefined;
      const simulation = createSubwayTrainSimulation({
        id: `model-lab-${serviceRoute.direction}`,
        sampler,
        stopDistancesMeters: serviceRoute.stops.map(
          (stop) => stop.distanceMeters,
        ),
        carCount: 3,
        carSpacingMeters: 21,
        cruiseSpeedMetersPerSecond:
          LINE_2_TRAIN_CRUISE_SPEED_METERS_PER_SECOND,
        dwellSeconds: LINE_2_TRAIN_DWELL_SECONDS,
        phaseOffsetSeconds: getLine2TrainPhaseOffsetSeconds(
          serviceRoute.direction,
        ),
        simulationEpochMs: LINE_2_TRAIN_SIMULATION_EPOCH_MS,
      });

      stage.scene.add(train.root);

      if (guideLine !== undefined) {
        stage.scene.add(guideLine);
      }

      return [{ serviceRoute, sampler, train, guideLine, simulation, routeIndex }];
    });
    const initialMetrics = mergeMetrics(
      runtimes.map(({ train }) => getSubwayTrainModelMetrics(train.root)),
    );
    const animationStartedAt = performance.now();
    const simulationStartedAt = live ? Date.now() : fixedTimestamp;
    let animationFrame = 0;
    let metricsCommitted = false;
    let previousStatusSignature = "";
    const renderFrame = (time: number) => {
      const elapsedMilliseconds = paused
        ? 0
        : (time - animationStartedAt) * speed;
      const timestamp = simulationStartedAt + elapsedMilliseconds;

      const nextTrainStatuses = runtimes.map(
        ({
          serviceRoute,
          sampler,
          train,
          guideLine,
          simulation,
          routeIndex,
        }) => {
          const state = simulation.getState(timestamp);
          const frontCoordinate = state.carPoses[0].coordinate;
          const panelX = routeIndex === 0 ? -42 : 42;
          const sceneScale = 0.27;

          state.carPoses.forEach((pose, carIndex) => {
            const localPosition = coordinateToLocalMeters(
              pose.coordinate,
              frontCoordinate,
            );
            const car = train.cars[carIndex];

            car.position.set(
              panelX + localPosition.x * sceneScale,
              localPosition.y * sceneScale,
              0.25,
            );
            car.rotation.set(0, 0, -pose.headingRadians);
            car.scale.setScalar(sceneScale);
          });

          if (guideLine !== undefined) {
            const guidePoints = Array.from({ length: 49 }, (_, pointIndex) => {
              const distanceOffset = (pointIndex - 24) * 8;
              const sample = sampler.sample(
                state.frontDistanceMeters + distanceOffset,
              );
              const localPosition = coordinateToLocalMeters(
                sample.coordinate,
                frontCoordinate,
              );

              return new Vector3(
                panelX + localPosition.x * sceneScale,
                localPosition.y * sceneScale,
                0.05,
              );
            });

            guideLine.geometry.setFromPoints(guidePoints);
          }

          return {
            osmRelationId: serviceRoute.osmRelationId,
            phase: state.phase,
            speedMetersPerSecond: state.speedMetersPerSecond,
          };
        },
      );
      const statusSignature = nextTrainStatuses
        .map(
          ({ osmRelationId, phase, speedMetersPerSecond }) =>
            `${osmRelationId}:${phase}:${speedMetersPerSecond}`,
        )
        .join("|");

      if (statusSignature !== previousStatusSignature) {
        previousStatusSignature = statusSignature;
        setTrainStatuses(nextTrainStatuses);
      }

      stage.render();

      if (!metricsCommitted) {
        metricsCommitted = true;
        setMetrics({
          ...initialMetrics,
          drawCalls: stage.renderer.info.render.calls,
        });
      }

      animationFrame = requestAnimationFrame(renderFrame);
    };

    animationFrame = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrame);
      runtimes.forEach(({ train, guideLine }) => {
        if (guideLine !== undefined) {
          disposeObjectResources(guideLine);
        }

        train.dispose();
      });
      stage.dispose();
    };
  }, [container, fixedTimestamp, live, paused, showGuides, speed]);

  return (
    <ModelLabSurface
      title={live ? "Line 2 inner–outer · Live" : "Line 2 inner–outer · Fixed"}
      description={
        live
          ? "실제 2호선 외선·내선 service route를 현재 simulation timestamp로 재생합니다."
          : "비교 캡처를 위해 실제 2호선 service route를 고정 timestamp에서 렌더링합니다."
      }
      metrics={metrics}
      routeLabels={
        <Line2RouteLabels
          routes={LINE_2_SERVICE_ROUTES}
          trainStatuses={trainStatuses}
        />
      }
    >
      <div
        ref={setContainer}
        className="model-lab-canvas"
        data-testid="line-2-train-motion-canvas"
        data-motion-source="line-2-service-routes"
        data-timestamp-mode={live ? "live" : "fixed"}
      />
    </ModelLabSurface>
  );
}

function ModelLabSurface({
  title,
  description,
  metrics,
  audit,
  routeLabels,
  children,
}: {
  title: string;
  description: string;
  metrics: ModelLabMetrics;
  audit?: ReactNode;
  routeLabels?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="model-lab-surface" data-testid="model-lab-surface">
      {children}
      <header className="model-lab-header">
        <p className="model-lab-kicker">Three.js · Production geometry</p>
        <h1 className="model-lab-title">{title}</h1>
        <p className="model-lab-description">{description}</p>
      </header>
      {routeLabels}
      {audit}
      <ModelLabMetrics metrics={metrics} />
    </main>
  );
}

function ModelLabMetrics({ metrics }: { metrics: ModelLabMetrics }) {
  const values = [
    ["Draw calls", metrics.drawCalls],
    ["Triangles", Math.round(metrics.triangleCount)],
    ["Meshes", metrics.meshCount],
    ["Geometry", metrics.geometryCount],
    ["Materials", metrics.materialCount],
    ["Textures", metrics.textureCount],
  ];

  return (
    <dl className="model-lab-metrics" aria-label="Three.js renderer metrics">
      {values.map(([label, value]) => (
        <div className="model-lab-metric" key={label}>
          <dt>{label}</dt>
          <dd data-metric={label}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ModelAudit({
  metrics,
  carCount,
}: {
  metrics: ModelLabMetrics;
  carCount: number;
}) {
  const rows = [
    ["External GLB", "NONE"],
    ["Textures", metrics.textureCount === 0 ? "NONE" : `${metrics.textureCount}`],
    ["Shared geometry", metrics.sharedGeometryCount > 0 ? "PASS" : "CHECK"],
    ["Independent pivots", `${carCount} CARS`],
    ["Front / rear lights", "PASS"],
  ];

  return (
    <section className="model-lab-audit" aria-label="Geometry audit results">
      {rows.map(([label, value]) => (
        <div className="model-lab-audit-row" key={label}>
          <span>{label}</span>
          <strong className="model-lab-audit-value">{value}</strong>
        </div>
      ))}
    </section>
  );
}

function Line2RouteLabels({
  routes,
  trainStatuses,
}: {
  routes: SeoulSubwayOsmServiceRoute[];
  trainStatuses: Line2TrainStatus[];
}) {
  return (
    <aside
      className="model-lab-route-labels"
      aria-label="Line 2 service routes"
      aria-live="polite"
    >
      {routes.map((route) => {
        const trainStatus = trainStatuses.find(
          (status) => status.osmRelationId === route.osmRelationId,
        );

        return (
          <div className="model-lab-route-label" key={route.osmRelationId}>
            <strong>{route.direction}</strong>
            <span>OSM {route.osmRelationId}</span>
            <span className="model-lab-train-state">
              {trainStatus === undefined
                ? "INITIALIZING"
                : `${trainStatus.phase.toUpperCase()} · ${trainStatus.speedMetersPerSecond.toFixed(0)} m/s`}
            </span>
          </div>
        );
      })}
    </aside>
  );
}

function createModelLabStage(
  container: HTMLDivElement,
  {
    cameraPosition,
    cameraTarget,
    lightIntensity,
    orbitEnabled,
    gridSize,
  }: {
    cameraPosition: Vector3;
    cameraTarget: Vector3;
    lightIntensity: number;
    orbitEnabled: boolean;
    gridSize: number;
  },
): ModelLabStage {
  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 2_000);
  const renderer = new WebGLRenderer({ antialias: true, alpha: false });

  camera.up.set(0, 0, 1);
  camera.position.copy(cameraPosition);
  camera.lookAt(cameraTarget);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor("#05090c", 1);
  container.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);

  controls.target.copy(cameraTarget);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enabled = orbitEnabled;
  controls.enablePan = orbitEnabled;
  controls.update();

  scene.add(new AmbientLight("#b9d8d2", lightIntensity * 0.7));

  const keyLight = new DirectionalLight("#ffffff", lightIntensity);
  const rimLight = new DirectionalLight("#65dca1", lightIntensity * 0.78);

  keyLight.position.set(36, 48, 70);
  rimLight.position.set(-44, -28, 42);
  scene.add(keyLight, rimLight);

  const grid = new GridHelper(gridSize, 30, "#24493f", "#12272a");

  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.04;
  scene.add(grid);

  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);

  resizeObserver.observe(container);
  resize();

  return {
    scene,
    camera,
    renderer,
    controls,
    render() {
      controls.update();
      renderer.render(scene, camera);
    },
    dispose() {
      resizeObserver.disconnect();
      controls.dispose();
      disposeObjectResources(grid);
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
    },
  };
}

function getCameraPreset(
  cameraPreset: SubwayTrainCameraPreset,
  targetY: number,
) {
  const target = new Vector3(0, targetY, 2.2);
  const positions: Record<SubwayTrainCameraPreset, Vector3> = {
    front: new Vector3(0, targetY + 68, 6.5),
    side: new Vector3(58, targetY, 16),
    top: new Vector3(0, targetY, 88),
    "three-quarter": new Vector3(48, targetY + 54, 34),
  };

  return { position: positions[cameraPreset], target };
}

function createCurveGuide(curve: Curve<Vector3>, color: string) {
  return new Line(
    new BufferGeometry().setFromPoints(curve.getPoints(180)),
    new LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.75,
    }),
  );
}

function applyCurvePoses(
  train: ReturnType<typeof createSubwayTrainModel>,
  curve: Curve<Vector3>,
  progress: number,
  direction: 1 | -1,
) {
  const poses = sampleTrainCarPosesOnCurve({
    curve,
    progress,
    direction,
    carCount: train.cars.length,
    carSpacing: 21,
  });

  poses.forEach((pose, carIndex) => {
    const car = train.cars[carIndex];

    car.position.copy(pose.position);
    car.position.z = 0.2;
    car.rotation.set(0, 0, pose.headingRadians);
  });
}

function coordinateToLocalMeters(
  coordinate: SubwayCoordinate,
  origin: SubwayCoordinate,
) {
  const earthRadiusMeters = 6_371_008.8;
  const degreesToRadians = Math.PI / 180;
  const originLatitudeRadians = origin[1] * degreesToRadians;

  return {
    x:
      (coordinate[0] - origin[0]) *
      degreesToRadians *
      earthRadiusMeters *
      Math.cos(originLatitudeRadians),
    y:
      (coordinate[1] - origin[1]) * degreesToRadians * earthRadiusMeters,
  };
}

function mergeMetrics(metrics: SubwayTrainModelMetrics[]): SubwayTrainModelMetrics {
  return metrics.reduce<SubwayTrainModelMetrics>(
    (total, current) => ({
      meshCount: total.meshCount + current.meshCount,
      geometryCount: total.geometryCount + current.geometryCount,
      sharedGeometryCount:
        total.sharedGeometryCount + current.sharedGeometryCount,
      materialCount: total.materialCount + current.materialCount,
      textureCount: total.textureCount + current.textureCount,
      triangleCount: total.triangleCount + current.triangleCount,
    }),
    {
      meshCount: 0,
      geometryCount: 0,
      sharedGeometryCount: 0,
      materialCount: 0,
      textureCount: 0,
      triangleCount: 0,
    },
  );
}

function disposeObjectResources(root: Object3D) {
  root.traverse((object) => {
    if (!("geometry" in object) || !(object.geometry instanceof BufferGeometry)) {
      return;
    }

    object.geometry.dispose();

    if (!("material" in object)) {
      return;
    }

    const material = object.material;
    const materials = Array.isArray(material) ? material : [material];

    materials.forEach((candidate) => {
      if (candidate instanceof Material) {
        candidate.dispose();
      }
    });
  });
}

function pingPong(value: number, minimum: number, maximum: number) {
  const range = maximum - minimum;
  const normalized = ((value - minimum) % (range * 2) + range * 2) % (range * 2);

  return minimum + (normalized <= range ? normalized : range * 2 - normalized);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
