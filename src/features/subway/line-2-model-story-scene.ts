import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import network from "./data/osm-subway-line-2.json";
import {
  createSubwayRouteSampler,
  sampleSubwayRouteChordPose,
  type SubwayRouteSampler,
} from "./subway-route-sampler";
import {
  applyTrainDoors,
  createSubwayTrainModel,
  LINE_2_MAIN_CAR_COUNT,
} from "./subway-train-model";
import { getScheduledFleet } from "./line-2-timetable";
import { getDoorCycle } from "./line-2-door-cycle";
import { getPlatformSide } from "./line-2-platform-side";
import {
  SUBWAY_TRAIN_CAR_SPACING_METERS,
  SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
} from "./subway-train-dimensions";

export type TrainView = "closeup" | "curve";
const route = network.serviceRoutes.find((route) => route.direction === "outer-loop")!;
const inspectionSampler = createSubwayRouteSampler(route.path.map(([x, y]) => [x, y]))!;
// 문래에서 신도림으로 진입하는 본선 선형. 주변 구조물은 모델을 읽기 위한 스튜디오 배경이다.
const inspectionCenter = inspectionSampler.project([126.8897, 37.5116]).distanceMeters;

function createSection(sampler: SubwayRouteSampler, center: number) {
  const origin = sampler.sample(center).coordinate;
  const meter = (Math.PI * 6371008.8) / 180;
  const longitudeMeter = meter * Math.cos((origin[1] * Math.PI) / 180);
  function local([x, y]: readonly number[]) {
    return new Vector3((x - origin[0]) * longitudeMeter, (y - origin[1]) * meter, 0);
  }
  function trackPoint(distance: number, lateral = 0, height = 0) {
    const pose = sampler.sample(distance);
    return local(pose.coordinate).add(
      new Vector3(
        lateral * Math.cos(pose.headingRadians),
        -lateral * Math.sin(pose.headingRadians),
        height,
      ),
    );
  }
  return { local, trackPoint, sampler, center };
}

function buildTrack(
  { sampler, center, trackPoint }: ReturnType<typeof createSection>,
  platformSide?: "left" | "right",
) {
  const group = new Group();
  const start = center - 510,
    end = center + 530;
  function ribbon(
    left: number,
    right: number,
    z: number,
    color: string,
    zRight = z,
    from = start,
    to = end,
  ) {
    const points: number[] = [],
      indices: number[] = [];
    for (let d = from; d <= to; d += 2) {
      const i = points.length / 3;
      points.push(...trackPoint(d, left, z).toArray(), ...trackPoint(d, right, zRight).toArray());
      if (i > 0) indices.push(i - 2, i - 1, i, i, i - 1, i + 1);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(points, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    group.add(new Mesh(g, new MeshStandardMaterial({ color, roughness: 0.78 })));
  }
  ribbon(-2.25, 2.25, -0.32, "#596168");
  ribbon(-2.66, -2.25, -0.8, "#474f55", -0.32);
  ribbon(2.25, 2.66, -0.32, "#474f55", -0.8);
  for (const side of [-1, 1]) {
    const rail = side * 0.7525;
    ribbon(rail - 0.045, rail + 0.045, 0.0, "#c0ccd2");
    ribbon(rail - 0.045, rail - 0.038, -0.15, "#655854", 0);
    ribbon(rail + 0.038, rail + 0.045, 0, "#655854", -0.15);
  }
  const sleeperCount = Math.floor((end - start) / 0.72);
  const sleepers = new InstancedMesh(
    new BoxGeometry(2.5, 0.23, 0.15),
    new MeshStandardMaterial({ color: "#827f7a", roughness: 0.92 }),
    sleeperCount,
  );
  const transform = new Object3D();
  for (let i = 0; i < sleeperCount; i++) {
    const d = start + i * 0.72;
    transform.position.copy(trackPoint(d, 0, -0.215));
    transform.rotation.z = -sampler.sample(d).headingRadians;
    transform.updateMatrix();
    sleepers.setMatrixAt(i, transform.matrix);
  }
  group.add(sleepers);
  if (platformSide) {
    const sign = platformSide === "right" ? 1 : -1;
    const top = 1.1,
      from = center - 193,
      to = center + 15;
    const edge = sign * 1.7,
      outside = sign * 6.5;
    ribbon(Math.min(edge, outside), Math.max(edge, outside), top, "#92999d", top, from, to);
    const strip = sign * 2.14;
    ribbon(strip - 0.14, strip + 0.14, top + 0.008, "#dcb94c", top + 0.008, from, to);
  }
  const floor = new Mesh(
    new PlaneGeometry(4000, 4000),
    new MeshStandardMaterial({ color: "#333d47", roughness: 1 }),
  );
  floor.position.z = -0.81;
  group.add(floor);
  return group;
}

export const STATION_SAMPLE = {
  station: "왕십리",
  trainNumber: "2004",
  arrivalMs: Date.parse("2026-11-20T05:51:30+09:00"),
};

function stationPlayback() {
  const { trainNumber, station, arrivalMs } = STATION_SAMPLE;
  const train = getScheduledFleet(arrivalMs).find(
    (trip) => trip.number === trainNumber && trip.direction === "inner-loop",
  );
  const event = train?.getStopEvent(arrivalMs);
  const side = getPlatformSide(station, "inner-loop");
  if (!train || !event || event.station !== station || event.arrivalMs !== arrivalMs || !side) {
    throw new Error("왕십리 정차 시연에 필요한 시간표 또는 승강장 정보를 확인해 주세요.");
  }
  const start = arrivalMs - 5_000;
  const duration = event.departureMs + 12_000 - start;
  return {
    train,
    event,
    side,
    start,
    duration,
    center: train.getMotion(arrivalMs).frontDistanceMeters,
  };
}

export interface StationPlaybackStatus {
  elapsed: number;
  duration: number;
  timestamp: number;
  speed: number;
  playing: boolean;
}

export function mountLine2ModelStory(
  canvas: HTMLCanvasElement,
  initialView: TrainView | "station",
  onStationFrame?: (status: StationPlaybackStatus) => void,
) {
  const station = initialView === "station" ? stationPlayback() : null;
  const section = createSection(
    station?.train.sampler ?? inspectionSampler,
    station?.center ?? inspectionCenter,
  );
  const { center, sampler, local, trackPoint } = section;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const scene = new Scene();
  scene.background = new Color("#374550");
  scene.fog = new Fog("#374550", 210, 580);
  scene.add(new HemisphereLight("#f1f5fa", "#70818c", 1.55), new AmbientLight("#f8f4ee", 0.48));
  const key = new DirectionalLight("#fff1df", 2.2);
  key.position.set(-60, 70, 85);
  scene.add(key);
  const rim = new DirectionalLight("#d9eaff", 1.65);
  rim.position.set(45, -60, 32);
  scene.add(rim);
  const track = buildTrack(section, station?.side);
  const model = createSubwayTrainModel({ lineColor: "#00a84d", carCount: LINE_2_MAIN_CAR_COUNT });
  scene.add(track, model.root);
  let triangles = 0,
    meshes = 0;
  model.root.traverse((part) => {
    if (part instanceof Mesh) {
      meshes++;
      triangles += (part.geometry.index?.count ?? part.geometry.getAttribute("position").count) / 3;
    }
  });
  canvas.dataset.trainTriangles = String(triangles);
  canvas.dataset.trainMeshes = String(meshes);
  const camera = new PerspectiveCamera(37, 1, 0.1, 1800);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 250;
  controls.maxPolarAngle = Math.PI * 0.493;
  let view = initialView,
    setCamera = true;
  let front = center + 56;
  let playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let elapsed = station && !playing ? STATION_SAMPLE.arrivalMs - station.start + 4_000 : 0;
  let clockRefresh = -Infinity;
  let reportedElapsed = -1,
    reportedPlaying = playing;
  const previousTarget = new Vector3();
  function positionScene() {
    const timestamp = station ? station.start + elapsed : 0;
    if (station) front = station.train.getMotion(timestamp).frontDistanceMeters;
    const cycle = station ? getDoorCycle(timestamp, station.event) : null;
    model.cars.forEach((car, index) => {
      const pose = sampleSubwayRouteChordPose(
        sampler,
        front - index * SUBWAY_TRAIN_CAR_SPACING_METERS,
        SUBWAY_TRAIN_BOGIE_OFFSET_METERS,
      );
      car.position.copy(local(pose.coordinate));
      car.rotation.z = -pose.headingRadians;
      if (cycle && station)
        applyTrainDoors(car, cycle.open, cycle.light, station.side, cycle.closing);
    });
    const wide = view === "curve";
    const target = station
      ? trackPoint(center - 1.2, 0, 1.85)
      : wide
        ? model.cars[0].position
            .clone()
            .lerp(model.cars[model.cars.length - 1].position, 0.5)
            .add(new Vector3(0, 0, 1.4))
        : trackPoint(front + 3.5, 0, 1.8);
    if (setCamera) {
      const nose = sampler.sample(station ? center : wide ? front - 85 : front);
      const right = new Vector3(Math.cos(nose.headingRadians), -Math.sin(nose.headingRadians), 0);
      const forward = new Vector3(Math.sin(nose.headingRadians), Math.cos(nose.headingRadians), 0);
      const aspectDistance = Math.max(1, (station ? 1.15 : 1.52) / camera.aspect);
      const side = station?.side === "left" ? -1 : 1;
      camera.position
        .copy(target)
        .addScaledVector(right, side * (station ? 8.5 : wide ? 170 : 10.5) * aspectDistance)
        .addScaledVector(forward, (station ? 7 : wide ? 110 : 20.5) * aspectDistance);
      camera.position.z = station ? 2.65 : wide ? 72 * aspectDistance : 4.25 * aspectDistance;
      setCamera = false;
    } else if (!station) camera.position.add(target.clone().sub(previousTarget));
    previousTarget.copy(target);
    controls.target.copy(target);
    controls.update();
  }
  const resize = new ResizeObserver(() => {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    setCamera = true;
  });
  resize.observe(canvas);
  let frame = 0,
    last = 0,
    frames = 0;
  let sampleStart = 0;
  function render(now: number) {
    const deltaMs = last ? now - last : 0;
    last = now;
    if (playing && station) {
      elapsed = Math.min(station.duration, elapsed + deltaMs);
      if (elapsed === station.duration) playing = false;
    } else if (playing) front += Math.min(deltaMs / 1000, 0.1) * 6.5;
    if (!station && front > center + 200) {
      front = center + 34;
      setCamera = true;
    }
    positionScene();
    renderer.render(scene, camera);
    if (
      station &&
      (elapsed !== reportedElapsed || playing !== reportedPlaying) &&
      now - clockRefresh >= 100
    ) {
      const timestamp = station.start + elapsed;
      onStationFrame?.({
        elapsed,
        timestamp,
        duration: station.duration,
        playing,
        speed: station.train.getMotion(timestamp).speedMetersPerSecond * 3.6,
      });
      clockRefresh = now;
      reportedElapsed = elapsed;
      reportedPlaying = playing;
    }
    frames++;
    if (!sampleStart) sampleStart = now;
    if (now - sampleStart >= 1000) {
      canvas.dataset.frames = String(frames);
      canvas.dataset.frameTime = String(now);
      canvas.dataset.distance = String(front);
      sampleStart = now;
    }
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);
  function resetClock() {
    last = 0;
  }
  document.addEventListener("visibilitychange", resetClock);
  return {
    playing,
    setPlaying(value: boolean) {
      if (station && value && elapsed === station.duration) elapsed = 0;
      resetClock();
      playing = value;
    },
    seek(ms: number) {
      if (station) elapsed = Math.max(0, Math.min(station.duration, ms));
      resetClock();
      clockRefresh = -Infinity;
    },
    setView(next: TrainView) {
      view = next;
      front = center + 56;
      setCamera = true;
    },
    dispose() {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", resetClock);
      resize.disconnect();
      controls.dispose();
      model.dispose();
      track.traverse((part) => {
        if (part instanceof Mesh) {
          if (part instanceof InstancedMesh) part.dispose();
          part.geometry.dispose();
          part.material.dispose();
        }
      });
      scene.clear();
      renderer.dispose();
    },
  };
}
