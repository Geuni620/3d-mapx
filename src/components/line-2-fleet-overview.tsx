import { useTrainClock } from "../features/night-pulse/train-clock";
import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { createSubwayScreenProjector } from "../features/subway/subway-screen-projection";
import type { ScheduledTrain } from "../features/subway/line-2-timetable";
import {
  drawOverviewTrainIcon, sampleOverviewTrainIcon,
  type OverviewTrainIcon, type Pixel, type Viewport,
} from "../features/subway/subway-overview-icon";
import { LINE_2_MAIN_CAR_COUNT } from "../features/subway/subway-train-model";

interface Props {
  trains: readonly ScheduledTrain[];
  selectedId: string | null;
}

const COLORS = { "outer-loop": "#b4f395", "inner-loop": "#74e1cb" };
const DEPARTURE_GLOW_MS = 900;

interface VisibleTrain {
  train: ScheduledTrain;
  icon: OverviewTrainIcon;
  dwelling: boolean;
  departureGlow: number;
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

export function Line2FleetOverview({ trains, selectedId }: Props) {
  const now = useTrainClock();
  const { current: mapRef } = useMap();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef({ trains, selectedId });
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    state.current = { trains, selectedId };
    repaint.current?.();
  }, [trains, selectedId]);

  useEffect(() => {
    const map = mapRef?.getMap();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!map || !canvas || !context) return;

    let frame = 0;
    let viewport: Viewport = { width: 0, height: 0 };
    const lastDwell = new WeakMap<ScheduledTrain, number>();
    const project = createSubwayScreenProjector(map);
    const draw = () => {
      const timestamp = now();
      const zoom = map.getZoom();
      context.clearRect(0, 0, viewport.width, viewport.height);
      let selection: VisibleTrain | undefined;
      for (const train of state.current.trains) {
        const motion = train.getMotion(timestamp);
        const icon = sampleOverviewTrainIcon(
          train.sampler, motion.frontDistanceMeters, LINE_2_MAIN_CAR_COUNT, project, viewport, zoom,
        );
        if (!icon) continue;
        const dwelling = motion.phase === "dwelling";
        if (dwelling) lastDwell.set(train, timestamp);
        const sinceStop = timestamp - (lastDwell.get(train) ?? train.departureMs);
        const departureGlow = !dwelling && frozenTimestamp === null && sinceStop >= 0
          ? Math.max(0, 1 - sinceStop / DEPARTURE_GLOW_MS) : 0;
        const item = { train, icon, dwelling, departureGlow };
        if (train.id === state.current.selectedId) selection = item;
        else drawOverviewTrainIcon(context, icon, { color: COLORS[train.direction], dwelling, departureGlow });
      }
      if (selection) {
        const { train, icon, dwelling, departureGlow } = selection;
        drawOverviewTrainIcon(context, icon, { color: COLORS[train.direction], dwelling, departureGlow, selected: true });
        const anchor = [icon.front, icon.rear].find(point =>
          point.x >= 0 && point.y >= 0 && point.x <= viewport.width && point.y <= viewport.height,
        );
        if (anchor) drawNumber(context, anchor, train, viewport);
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
    resize();
    repaint.current = draw;
    map.on("resize", resize);
    if (frozenTimestamp === null) frame = requestAnimationFrame(animate);
    else map.on("move", draw);
    return () => {
      repaint.current = null;
      cancelAnimationFrame(frame);
      map.off("resize", resize);
      map.off("move", draw);
    };
  }, [mapRef, now]);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="line-2-fleet-overview"
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}
