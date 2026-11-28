import { useEffect, useRef } from "react";
import { MercatorCoordinate } from "maplibre-gl";
import { useMap } from "react-map-gl/maplibre";
import { DANGSAN_ORIGIN } from "../dangsan/bridge-location";
import { detailBlend } from "../subway/line-2-main-simulation";
import { getScheduledFleet, type ScheduledTrain } from "../subway/line-2-timetable";
import type { SubwayCoordinate } from "../subway/osm-subway-network";
import { SUBWAY_LINE_COLORS, type SubwayLineNumber } from "../subway/subway-constants";
import type { createSubwayRoutePaths } from "../subway/subway-paths";
import { createSubwayScreenProjector } from "../subway/subway-screen-projection";
import type { SubwayStationMapPoint } from "../subway/subway-geojson";
import { sampleOverviewTrainIcon, type Pixel, type Viewport } from "../subway/subway-overview-icon";
import type { SubwayRouteSampler } from "../subway/subway-route-sampler";
import { getActiveSubwayTrips, getSubwayServiceSecond, sampleSubwayTrip, type TimetableTrip } from "../subway/subway-timetable";
import { LINE_2_MAIN_CAR_COUNT } from "../subway/subway-train-model";
import { createPulseSegmentClipper, type PulseClipPoint } from "./clip-pulse-segment";
import { useTrainClock } from "./train-clock";

const TRAIL_SECONDS = 150;
const TRAIL_STEP = 4;
const TRAIL_BANDS = 8;
const TAU = Math.PI * 2;
const tidyName = (name: string) => name.replace(/\s*\(.*$/, "").trim();
const inScreen = (p: Pixel, view: Viewport, pad = 48) =>
  p.x >= -pad && p.x <= view.width + pad && p.y >= -pad && p.y <= view.height + pad;

export interface PulseStationRegion {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

type Props = {
  onStationRegions: (regions: PulseStationRegion[]) => void;
  lines: readonly SubwayLineNumber[];
  stations: SubwayStationMapPoint[];
  routes: ReturnType<typeof createSubwayRoutePaths>;
  showRoutes: boolean;
  showStations: boolean;
  showTrains: boolean;
};

function groupHubs(stations: SubwayStationMapPoint[]) {
  const groups = new Map<string, { lines: Set<SubwayLineNumber>; x: number; y: number; n: number }>();
  for (const station of stations) {
    const name = tidyName(station.name);
    const group = groups.get(name) ?? { lines: new Set(), x: 0, y: 0, n: 0 };
    group.lines.add(station.lineNumber);
    group.x += station.longitude;
    group.y += station.latitude;
    group.n++;
    groups.set(name, group);
  }
  return [...groups].filter(([, group]) => group.lines.size >= 2).map(([name, group]) => ({
    name,
    lines: [...group.lines].sort((a, b) => a - b),
    coordinate: [group.x / group.n, group.y / group.n] as SubwayCoordinate,
  })).sort((a, b) => b.lines.length - a.lines.length);
}

function headSprite(color: string) {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const ctx = sprite.getContext("2d")!;
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, "#ffffff");
  glow.addColorStop(.10, "#fffffff4");
  glow.addColorStop(.29, color + "b8");
  glow.addColorStop(.60, color + "38");
  glow.addColorStop(1, color + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  return sprite;
}

function arc(ctx: CanvasRenderingContext2D, p: Pixel, radius: number, start = 0, end = TAU) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, start, end);
}

type Trail = { line: SubwayLineNumber; points: MercatorCoordinate[]; epoch: number; serviceDay: number };

export function NightPulseLayer({ lines, stations, routes, showRoutes, showStations, showTrains, onStationRegions }: Props) {
  const { current: mapRef } = useMap();
  const now = useTrainClock();
  const routeSurface = useRef<HTMLCanvasElement>(null);
  const trailSurface = useRef<HTMLCanvasElement>(null);
  const trainSurface = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const map = mapRef?.getMap();
    const route = routeSurface.current?.getContext("2d");
    const trails = trailSurface.current?.getContext("2d");
    const trains = trainSurface.current?.getContext("2d");
    if (!map || !route || !trails || !trains) return;

    const routePoints = routes.map(({ lineNumber, elevatedPath }) => ({
      lineNumber,
      path: elevatedPath.map(([lng, lat, altitude]) => MercatorCoordinate.fromLngLat({ lng, lat }, altitude)),
    }));
    const hubs = showStations ? groupHubs(stations) : [];
    const transferNames = new Set(hubs.map(hub => hub.name));
    const localStations = showStations ? stations.filter(s => s.lineNumber === 2 && !transferNames.has(tidyName(s.name))) : [];
    const sprites = new Map(lines.map(line => [line, headSprite(SUBWAY_LINE_COLORS[line])]));
    const history = new Map<TimetableTrip | ScheduledTrain, Trail>();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let viewport = { width: 0, height: 0 };
    let matrix: ArrayLike<number>;
    let clipSegment: ReturnType<typeof createPulseSegmentClipper>;
    let frame = 0;
    let dirty = true;
    let trailDirty = true;
    let lastEpoch = -1;
    let lastSecond = -1;
    let lastPaint = -Infinity;
    let trips: TimetableTrip[] = [];
    let main: ScheduledTrain[] = [];
    let previousDetail = -1;
    const placed: { x: number; y: number; width: number; height: number }[] = [];
    const popped = new Set<string>();

    const project = createSubwayScreenProjector(map);
    const projectToClip = ({ x, y, z }: MercatorCoordinate): PulseClipPoint => [
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15],
    ];
    const toScreen = ([x, y, w]: PulseClipPoint) => ({
      x: (1 + x / w) * viewport.width / 2,
      y: (1 - y / w) * viewport.height / 2,
    });
    const visiblePoint = (projected: PulseClipPoint) => {
      if (projected[2] <= 0) return;
      const point = toScreen(projected);
      if (inScreen(point, viewport)) return point;
    };
    const clipped = (coordinate: SubwayCoordinate) =>
      visiblePoint(projectToClip(MercatorCoordinate.fromLngLat(coordinate)));
    const trackPoint = (sampler: SubwayRouteSampler, distance: number, coordinate = sampler.sample(distance).coordinate) =>
      MercatorCoordinate.fromLngLat(coordinate, sampler.elevationAt?.(distance) ?? 0);

    function label(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, color: string) {
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      const width = ctx.measureText(name).width + 14;
      const rect = { x: x - width / 2, y: y - 10, width, height: 20 };
      if (rect.x < 0 || rect.y < 0 || rect.x + width > viewport.width || rect.y + rect.height > viewport.height ||
          placed.some(a => a.x < rect.x + width && a.x + a.width > rect.x &&
            a.y < rect.y + rect.height && a.y + a.height > rect.y)) return false;
      placed.push(rect);
      ctx.fillStyle = "#071016ee";
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, width, rect.height, 10);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#fff8ec";
      ctx.fillText(name, x, y);
      return true;
    }

    function drawRoutes(zoom: number) {
      route!.clearRect(0, 0, viewport.width, viewport.height);
      const width = Math.min(4, Math.max(1, (zoom - 9.5) * .8));
      if (showRoutes) {
        const paths = routePoints.map(({ lineNumber, path: points }) => {
          const path = new Path2D();
          let previous = projectToClip(points[0]);
          let previousEnd: PulseClipPoint | undefined;
          for (let i = 1; i < points.length; i++) {
            const next = projectToClip(points[i]);
            const visible = clipSegment(previous, next);
            previous = next;
            if (!visible) { previousEnd = undefined; continue; }
            const [start, end] = visible;
            if (start !== previousEnd) {
              const p = toScreen(start);
              path.moveTo(p.x, p.y);
            }
            const p = toScreen(end);
            path.lineTo(p.x, p.y);
            previousEnd = end;
          }
          return { path, color: SUBWAY_LINE_COLORS[lineNumber] };
        });
        route!.lineJoin = route!.lineCap = "round";
        for (const [scale, alpha, mode] of [
          [9, .035, "source-over"], [4.2, .07, "source-over"],
          [1.8, .16, "lighter"], [.55, .42, "lighter"],
        ] as const) {
          route!.globalCompositeOperation = mode;
          route!.globalAlpha = alpha;
          route!.lineWidth = width * scale;
          for (const { path, color } of paths) { route!.strokeStyle = color; route!.stroke(path); }
        }
        route!.globalAlpha = 1;
        route!.globalCompositeOperation = "source-over";
      }
      placed.length = 0;
      const regions: PulseStationRegion[] = [];
      const hubLabels: { name: string; point: Pixel; radius: number; line2: boolean }[] = [];
      if (zoom >= 12.4) for (const station of localStations) {
        const point = clipped([station.longitude, station.latitude]);
        if (!point) continue;
        arc(route!, point, 3.5);
        route!.fillStyle = "#c3e5d6";
        route!.fill();
        route!.lineWidth = 1.5;
        route!.strokeStyle = SUBWAY_LINE_COLORS[2];
        route!.stroke();
        regions.push({ name: station.name, x: point.x - 9, y: point.y - 9, width: 18, height: 18 });
      }
      for (const hub of hubs) {
        const p = clipped(hub.coordinate);
        if (!p) continue;
        const r = Math.max(2.8, width * 1.55) * (1 + .10 * hub.lines.length);
        const glow = route!.createRadialGradient(p.x, p.y, r, p.x, p.y, r * 3);
        glow.addColorStop(0, "#ffda9c38");
        glow.addColorStop(1, "#ffda9c00");
        route!.fillStyle = glow;
        arc(route!, p, r * 3);
        route!.fill();
        route!.fillStyle = "#071014";
        arc(route!, p, r);
        route!.fill();
        const step = TAU / hub.lines.length;
        hub.lines.forEach((line, i) => {
          route!.strokeStyle = SUBWAY_LINE_COLORS[line];
          route!.lineWidth = Math.max(1.4, r * .32);
          arc(route!, p, r, i * step - Math.PI / 2 + .13, (i + 1) * step - Math.PI / 2 - .13);
          route!.stroke();
        });
        route!.fillStyle = "#fff4de";
        arc(route!, p, r * .24);
        route!.fill();
        const clearance = r + 3;
        const region = { x: p.x - clearance, y: p.y - clearance, width: 2 * clearance, height: 2 * clearance };
        placed.push(region);
        const line2 = hub.lines.includes(2);
        if (line2) regions.push({ ...region, name: hub.name });
        if (hub.lines.length >= 3 && zoom >= 10.6 && zoom < 12.4)
          hubLabels.push({ name: hub.name, point: p, radius: clearance, line2 });
      }
      // 주변 링을 모두 예약한 뒤 이름을 배치해야 그리기 순서와 무관하게 겹침을 피한다.
      for (const { name, point, radius, line2 } of hubLabels) {
        route!.font = "600 12px system-ui, sans-serif";
        const side = radius + route!.measureText(name).width / 2 + 10;
        placement: for (const extra of [0, 12, 24, 36, 48]) {
          const horizontal = side + extra;
          const vertical = radius + 12 + extra;
          for (const [dx, dy] of [[horizontal, 0], [-horizontal, 0], [0, -vertical], [0, vertical],
            [side / 2, -vertical], [-side / 2, -vertical], [side / 2, vertical], [-side / 2, vertical]]) {
            if (!label(route!, name, point.x + dx, point.y + dy, "#304649")) continue;
            if (line2) regions.push({ ...placed.at(-1)!, name });
            break placement;
          }
        }
      }
      const bridge = zoom >= 12.6 && clipped(DANGSAN_ORIGIN);
      if (bridge) label(route!, "당산철교", bridge.x + 35, bridge.y + 18, "#876844");
      onStationRegions(regions);
    }

    function refreshTrails(epoch: number, time: number, interval: number) {
      const serviceDay = time - getSubwayServiceSecond(time) * 1000;
      const remember = (key: TimetableTrip | ScheduledTrain, line: SubwayLineNumber, sample: (ago: number) => MercatorCoordinate | undefined) => {
        let trail = history.get(key);
        if (!trail) { trail = { line, points: [], epoch: -1, serviceDay: 0 }; history.set(key, trail); }
        if (trail.epoch === epoch && trail.serviceDay === serviceDay) return;
        trail.epoch = epoch;
        trail.serviceDay = serviceDay;
        trail.points.length = 0;
        for (let ago = 0; ago <= TRAIL_SECONDS; ago += interval) {
          const coordinate = sample(ago);
          if (!coordinate) break;
          trail.points.push(coordinate);
        }
      };
      const seconds = (time - serviceDay) / 1000;
      for (const trip of trips) remember(trip, trip[0], ago => {
        const pose = sampleSubwayTrip(trip, seconds - ago);
        return pose && trackPoint(pose.sampler, pose.frontDistanceMeters, pose.front);
      });
      for (const train of main) remember(train, 2, ago => {
        const sampleTime = time - ago * 1000;
        if (sampleTime < train.departureMs) return;
        return trackPoint(train.sampler, train.getMotion(sampleTime).frontDistanceMeters);
      });
      for (const [key, trail] of history) if (trail.epoch !== epoch || trail.serviceDay !== serviceDay) history.delete(key);
    }

    function drawTrails(width: number, interval: number) {
      trails!.clearRect(0, 0, viewport.width, viewport.height);
      const batches = new Map(lines.map(line => [line, Array.from({ length: TRAIL_BANDS }, () => new Path2D())]));
      for (const { line, points } of history.values()) {
        const paths = batches.get(line);
        if (!paths || points.length < 2) continue;
        let previous = projectToClip(points[0]);
        for (let i = 1; i < points.length; i++) {
          const next = projectToClip(points[i]);
          const visible = clipSegment(previous, next);
          previous = next;
          if (!visible) continue;
          const start = toScreen(visible[0]);
          const end = toScreen(visible[1]);
          const band = Math.min(TRAIL_BANDS - 1, Math.floor(i * interval * TRAIL_BANDS / TRAIL_SECONDS));
          paths[band].moveTo(start.x, start.y);
          paths[band].lineTo(end.x, end.y);
        }
      }
      trails!.lineCap = "round";
      for (const bloom of [true, false]) {
        trails!.globalCompositeOperation = bloom ? "lighter" : "source-over";
        for (const [line, paths] of batches) {
          const color = SUBWAY_LINE_COLORS[line];
          for (let i = paths.length - 1; i >= 0; i--) {
            const alpha = (1 - (i + .35) / paths.length) ** 1.8;
            trails!.globalAlpha = (bloom ? .22 : .88) * alpha;
            trails!.lineWidth = width * (bloom ? 3.4 : 1.1) * (.48 + alpha);
            trails!.strokeStyle = !bloom && i === 0 ? `color-mix(in srgb, ${color}, white 49%)` : color;
            trails!.stroke(paths[i]);
          }
        }
      }
      trails!.globalAlpha = 1;
    }

    function stationName(line: SubwayLineNumber, coordinate: SubwayCoordinate) {
      let distance = .0035 ** 2;
      let name: string | undefined;
      for (const station of stations) {
        if (station.lineNumber !== line) continue;
        const d = ((station.longitude - coordinate[0]) * .79) ** 2 + (station.latitude - coordinate[1]) ** 2;
        if (d < distance) { distance = d; name = tidyName(station.name); }
      }
      return name;
    }

    const resize = () => {
      viewport = { width: map.getCanvas().clientWidth, height: map.getCanvas().clientHeight };
      const ratio = Math.min(devicePixelRatio || 1, viewport.width <= 560 ? 1.5 : 2);
      for (const ctx of [route, trails, trains]) {
        ctx.canvas.width = Math.round(viewport.width * ratio);
        ctx.canvas.height = Math.round(viewport.height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }
      dirty = true;
    };
    const move = () => { dirty = true; };
    const draw = (realTime: number) => {
      frame = requestAnimationFrame(draw);
      if (document.hidden || (reduced.matches && !dirty && realTime - lastPaint < 160)) return;
      lastPaint = realTime;
      const time = now();
      const zoom = map.getZoom();
      const mobile = viewport.width <= 560;
      const detail = detailBlend(zoom, true);
      const carOpacity = 1 - detail;
      if (previousDetail !== detail) {
        previousDetail = detail;
        // 3D 차량으로 전환해도 노선색 잔광과 정차 표시는 남긴다.
        trails.canvas.style.opacity = String(showTrains ? 1 - .35 * detail : 0);
        trains.canvas.style.opacity = String(showTrains ? 1 - .25 * detail : 0);
      }
      if (dirty) {
        matrix = map.transform.getProjectionDataForCustomLayer(false).mainMatrix;
        clipSegment = createPulseSegmentClipper(viewport.width, viewport.height);
        drawRoutes(zoom);
        trailDirty = true;
        dirty = false;
      }
      if (!showTrains) return;
      const seconds = getSubwayServiceSecond(time);
      const second = Math.floor(time / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        trips = getActiveSubwayTrips(time, lines);
        main = lines.includes(2) ? getScheduledFleet(time) : [];
      }
      const interval = zoom < 10 ? TRAIL_STEP * 2 : TRAIL_STEP;
      const epoch = Math.floor(time / (interval * 1000)) * interval * 1000;
      const width = Math.min(3.8, Math.max(1.25, (zoom - 9.5) * .8));
      if (epoch !== lastEpoch || trailDirty) {
        lastEpoch = epoch;
        trailDirty = false;
        refreshTrails(epoch, Math.max(epoch, time - seconds * 1000), interval);
        drawTrails(width, interval);
      }
      trains.clearRect(0, 0, viewport.width, viewport.height);
      placed.length = 0;
      popped.clear();
      const drawTrain = (
        key: TimetableTrip | ScheduledTrain, line: SubwayLineNumber, coord: SubwayCoordinate,
        sampler: SubwayRouteSampler, distance: number, cars: number, speed: number, elapsed = -1, dwell = 0, name?: string,
      ) => {
        const projected = projectToClip(trackPoint(sampler, distance, coord));
        const head = visiblePoint(projected);
        if (!head) return;
        const color = SUBWAY_LINE_COLORS[line];
        const intensity = .55 + .45 * Math.min(1, speed / 20);
        const radius = Math.min(8, Math.max(3.1, (zoom - 9.5) * 1.25)) * (mobile ? .75 : 1);
        const first = history.get(key)?.points[0];
        const neck = first && clipSegment(projectToClip(first), projected);
        if (neck) {
          const start = toScreen(neck[0]);
          trains.strokeStyle = color;
          trains.lineWidth = width * 1.1;
          trains.beginPath();
          trains.moveTo(start.x, start.y);
          trains.lineTo(head.x, head.y);
          trains.stroke();
        }
        if (zoom >= 13.6 && carOpacity > 0) {
          trains.globalAlpha = carOpacity;
          const icon = sampleOverviewTrainIcon(sampler, distance, cars, project, viewport, zoom, coord, { physical: true });
          for (const car of icon?.cars ?? []) {
            if (!inScreen(car.front, viewport) || !inScreen(car.rear, viewport)) continue;
            trains.beginPath();
            trains.moveTo(car.rear.x, car.rear.y);
            trains.lineTo(car.front.x, car.front.y);
            trains.lineWidth = width + 2;
            trains.strokeStyle = "#070f14";
            trains.stroke();
            trains.lineWidth = width;
            trains.strokeStyle = color;
            trains.stroke();
          }
        }
        const sprite = sprites.get(line)!;
        trains.globalCompositeOperation = "lighter";
        trains.globalAlpha = intensity;
        trains.drawImage(sprite, head.x - 2.6 * radius, head.y - 2.6 * radius, radius * 5.2, radius * 5.2);
        trains.globalCompositeOperation = "source-over";
        trains.globalAlpha = 1;
        if (elapsed < 0 || dwell <= 0) return;
        trains.lineWidth = 1.3;
        trains.strokeStyle = color + "67";
        arc(trains, head, radius * 2);
        trains.stroke();
        trains.strokeStyle = "#ffe5b2";
        arc(trains, head, radius * 2, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, elapsed / dwell));
        trains.stroke();
        if (elapsed < 1.6 && !reduced.matches) {
          trains.globalAlpha = (1 - elapsed / 1.6) * .55;
          arc(trains, head, radius * (2 + elapsed * 1.5));
          trains.stroke();
          trains.globalAlpha = 1;
        }
        if (zoom >= 13.4 && popped.size < (mobile ? 4 : 10)) {
          const station = name ? tidyName(name) : stationName(line, coord);
          if (station && !popped.has(station) && label(trains, station, head.x, head.y - radius * 2 - 13, color)) popped.add(station);
        }
      };
      for (const trip of trips) {
        const pose = sampleSubwayTrip(trip, seconds);
        if (pose) drawTrain(trip, pose.line, pose.front, pose.sampler, pose.frontDistanceMeters, pose.carCount,
          pose.speedMetersPerSecond, pose.dwelling ? pose.dwellElapsedSeconds : -1, pose.dwellSeconds);
      }
      for (const train of main) {
        const motion = train.getMotion(time);
        const coordinate = train.sampler.sample(motion.frontDistanceMeters).coordinate;
        const stop = motion.phase === "dwelling" ? train.getStopEvent(time) : null;
        const arrival = stop?.arrivalMs;
        drawTrain(train, 2, coordinate, train.sampler, motion.frontDistanceMeters, LINE_2_MAIN_CAR_COUNT,
          motion.speedMetersPerSecond, arrival != null ? (time - arrival) / 1000 : -1,
          stop && arrival != null ? (stop.departureMs - arrival) / 1000 : 0, stop?.station);
      }
    };

    resize();
    map.on("resize", resize);
    map.on("move", move);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      map.off("resize", resize);
      map.off("move", move);
      onStationRegions([]);
    };
  }, [mapRef, now, lines, stations, routes, showRoutes, showStations, showTrains, onStationRegions]);

  return <>
    <canvas ref={routeSurface} className="night-pulse-surface night-pulse-routes" aria-hidden="true" />
    <canvas ref={trailSurface} className="night-pulse-surface night-pulse-trails" aria-hidden="true" />
    <canvas ref={trainSurface} className="night-pulse-surface night-pulse-trains" aria-hidden="true" />
  </>;
}
