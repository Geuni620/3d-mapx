import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { SUBWAY_LINE_COLORS, type SubwayLineNumber } from "../features/subway/subway-constants";
import {
  getActiveSubwayTrips,
  getSubwayServiceSecond,
  sampleSubwayTrip,
} from "../features/subway/subway-timetable";
import { trainFrameTimestamp } from "../features/subway/line-2-main-simulation";
import { drawOverviewTrainIcon, sampleOverviewTrainIcon, type Project, type Viewport } from "../features/subway/subway-overview-icon";

export default function SubwayFleetOverview({ selectedLines }: { selectedLines: readonly SubwayLineNumber[] }) {
  const { current: mapRef } = useMap();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lines = useRef(selectedLines);

  useEffect(() => {
    lines.current = selectedLines;
  }, [selectedLines]);

  useEffect(() => {
    const map = mapRef?.getMap();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!map || !canvas || !context) return;

    let frame = 0;
    let viewport: Viewport = { width: 0, height: 0 };
    const project: Project = coordinate => map.project(coordinate);
    let lastSecond = -1;
    let lastLines: readonly SubwayLineNumber[] = [];
    let trips: ReturnType<typeof getActiveSubwayTrips> = [];
    const resize = () => {
      viewport = { width: map.getCanvas().clientWidth, height: map.getCanvas().clientHeight };
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(viewport.width * ratio);
      canvas.height = Math.round(viewport.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = () => {
      const timestamp = trainFrameTimestamp();
      const second = Math.floor(timestamp / 1000);
      if (second !== lastSecond || lastLines !== lines.current) {
        lastSecond = second;
        lastLines = lines.current;
        trips = getActiveSubwayTrips(timestamp, lastLines);
        const counts = new Map<number, number>();
        for (const [line] of trips) counts.set(line, (counts.get(line) ?? 0) + 1);
        canvas.dataset.activeTrains = JSON.stringify(Object.fromEntries(counts));
      }
      context.clearRect(0, 0, viewport.width, viewport.height);
      const seconds = getSubwayServiceSecond(timestamp);
      const zoom = map.getZoom();
      for (const trip of trips) {
        const pose = sampleSubwayTrip(trip, seconds);
        if (!pose) continue;
        const icon = sampleOverviewTrainIcon(
          pose.sampler, pose.frontDistanceMeters, pose.carCount, project, viewport, zoom, pose.front,
        );
        if (icon) drawOverviewTrainIcon(context, icon, {
          color: SUBWAY_LINE_COLORS[pose.line], dwelling: pose.dwelling,
        });
      }
      frame = requestAnimationFrame(draw);
    };
    resize();
    frame = requestAnimationFrame(draw);
    map.on("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      map.off("resize", resize);
    };
  }, [mapRef]);

  return (
    <canvas ref={canvasRef} role="img" aria-label="시간표 기준 열차 위치"
      className="pointer-events-none absolute inset-0 z-2 h-full w-full" />
  );
}
