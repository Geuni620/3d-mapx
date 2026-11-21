import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { MapMouseEvent } from "maplibre-gl";
import { trainFrameTimestamp } from "../features/subway/line-2-main-simulation";
import type { ScheduledTrain } from "../features/subway/line-2-timetable";
import { sampleOverviewCarriages, type Pixel, type Project, type Viewport } from "../features/subway/line-2-overview-carriages";

interface Props {
  trains: readonly ScheduledTrain[];
  selectedId: string | null;
  onInspect: (train: ScheduledTrain) => void;
  frozenTimestamp: number | null;
}

const COLORS = { "outer-loop": "#b4f395", "inner-loop": "#74e1cb" };
const DEPARTURE_GLOW_MS = 900;

interface VisibleTrain {
  train: ScheduledTrain;
  points: Pixel[];
  dwelling: boolean;
  departureGlow: number;
}

function drawCarriages(
  context: CanvasRenderingContext2D, { points, train, dwelling, departureGlow }: VisibleTrain, selected: boolean,
) {
  const color = COLORS[train.direction];
  const width = selected ? 4.3 : 3.2;
  // 어두운 외곽선으로 배경 색을 끊어서, 인접한 내·외선 선로 위에서도 차량이 묻히지 않게 한다.
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
  context.strokeStyle = selected ? "#486b50" : "#112c28";
  context.lineWidth = width + (selected ? 3.5 : 2.2);
  context.stroke();

  context.beginPath();
  for (let i = 1; i < points.length; i++) {
    const front = points[i - 1], rear = points[i];
    const dx = rear.x - front.x, dy = rear.y - front.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.15) continue;
    const gap = Math.min(length * 0.34, width / 2 + 0.6) / length;
    context.moveTo(front.x + dx * gap, front.y + dy * gap);
    context.lineTo(rear.x - dx * gap, rear.y - dy * gap);
  }
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();

  const head = points[0];
  context.beginPath();
  context.arc(head.x, head.y, (selected ? 2.7 : 2) + departureGlow * 1.4, 0, 2 * Math.PI);
  context.fillStyle = "#fff9d4";
  context.fill();

  if (dwelling) {
    const x = head.x + 4, y = head.y + 1;
    context.fillStyle = "#301f12";
    context.beginPath();
    context.roundRect(x, y, 10, 10, 3);
    context.fill();
    context.fillStyle = "#ffbd70";
    context.fillRect(x + 2.5, y + 2, 1.8, 6);
    context.fillRect(x + 5.8, y + 2, 1.8, 6);
  }
}

function drawNumber(context: CanvasRenderingContext2D, head: Pixel, train: ScheduledTrain, viewport: Viewport) {
  const label = `${train.direction === "inner-loop" ? "내선" : "외선"} ${train.number}`;
  context.font = '600 12px system-ui, sans-serif';
  const width = Math.ceil(context.measureText(label).width) + 12;
  const left = Math.max(2, Math.min(viewport.width - width - 2, head.x - width / 2));
  const aboveOrBelow = head.y >= 31 ? head.y - 29 : head.y + 8;
  const top = Math.max(2, Math.min(viewport.height - 21, aboveOrBelow));
  context.beginPath();
  context.roundRect(left, top, width, 19, 5);
  context.fillStyle = "#10231ff0";
  context.fill();
  context.fillStyle = "#e8f6e8";
  context.textBaseline = "middle";
  context.fillText(label, left + 6, top + 9.5);
}

function distanceToCar(point: Pixel, front: Pixel, rear: Pixel) {
  const dx = rear.x - front.x, dy = rear.y - front.y;
  const lengthSquared = dx * dx + dy * dy;
  const projection = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - front.x) * dx + (point.y - front.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - front.x - projection * dx, point.y - front.y - projection * dy);
}

export function Line2FleetOverview({ trains, selectedId, onInspect, frozenTimestamp }: Props) {
  const { current: mapRef } = useMap();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ trains, selectedId, onInspect });
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    state.current = { trains, selectedId, onInspect };
    repaint.current?.();
  }, [trains, selectedId, onInspect]);

  useEffect(() => {
    const map = mapRef?.getMap();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!map || !canvas || !context) return;

    let frame = 0;
    let viewport: Viewport = { width: 0, height: 0 };
    const visible: VisibleTrain[] = [];
    const lastDwell = new WeakMap<ScheduledTrain, number>();
    const project: Project = coordinate => map.project(coordinate);
    const draw = () => {
      const timestamp = frozenTimestamp ?? trainFrameTimestamp();
      const zoom = map.getZoom();
      context.clearRect(0, 0, viewport.width, viewport.height);
      visible.length = 0;
      let selection: VisibleTrain | undefined;
      for (const train of state.current.trains) {
        const motion = train.getMotion(timestamp);
        const points = sampleOverviewCarriages(train.sampler, motion.frontDistanceMeters, zoom, project, viewport);
        if (points.length === 0) continue;
        const dwelling = motion.phase === "dwelling";
        if (dwelling) lastDwell.set(train, timestamp);
        const sinceStop = timestamp - (lastDwell.get(train) ?? train.departureMs);
        const departureGlow = !dwelling && frozenTimestamp === null && sinceStop >= 0
          ? Math.max(0, 1 - sinceStop / DEPARTURE_GLOW_MS) : 0;
        const item = { train, points, dwelling, departureGlow };
        visible.push(item);
        if (train.id === state.current.selectedId) selection = item;
        else drawCarriages(context, item, false);
      }
      if (selection) {
        drawCarriages(context, selection, true);
        const anchor = selection.points.find(point =>
          point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height,
        );
        if (anchor) drawNumber(context, anchor, selection.train, viewport);
      }
    };
    const resize = () => {
      viewport = { width: map.getCanvas().clientWidth, height: map.getCanvas().clientHeight };
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(viewport.width * ratio);
      canvas.height = Math.round(viewport.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    const animate = () => {
      draw();
      frame = requestAnimationFrame(animate);
    };
    const inspect = (event: MapMouseEvent) => {
      let nearest: ScheduledTrain | undefined;
      let radius = 13;
      for (const { train, points } of visible) {
        for (let i = 1; i < points.length; i++) {
          const distance = distanceToCar(event.point, points[i - 1], points[i]);
          if (distance < radius) { nearest = train; radius = distance; }
        }
      }
      if (nearest) state.current.onInspect(nearest);
    };
    resize();
    repaint.current = draw;
    map.on("resize", resize);
    map.on("click", inspect);
    if (frozenTimestamp === null) frame = requestAnimationFrame(animate);
    else map.on("move", draw);
    return () => {
      repaint.current = null;
      cancelAnimationFrame(frame);
      map.off("resize", resize);
      map.off("move", draw);
      map.off("click", inspect);
    };
  }, [mapRef, frozenTimestamp]);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="line-2-fleet-overview"
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}
