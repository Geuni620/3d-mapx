import type { RefObject } from "react";
import type { CinemaTrainInput } from "../features/cinema/cinema-tour";
import { useTrainClock } from "../features/night-pulse/train-clock";
import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { SUBWAY_LINE_COLORS, type SubwayLineNumber } from "../features/subway/subway-constants";
import {
  getActiveSubwayTrips,
  getSubwayServiceSecond,
  sampleSubwayTrip,
} from "../features/subway/subway-timetable";
import { DETAIL_START, PULSE_DETAIL_START, detailBlend } from "../features/subway/line-2-main-simulation";
import { SUBWAY_STATION_LABEL_LAYER_ID, SUBWAY_TRAIN_LAYER_ID } from "../features/subway/subway-layer-ids";
import { createSubwayTrainCustomLayer } from "../features/subway/subway-train-custom-layer";
import { getScheduledFleet } from "../features/subway/line-2-timetable";
import { createSubwayRollingStock } from "../features/subway/subway-rolling-stock";
import { drawOverviewTrainIcon, sampleOverviewTrainIcon, type Viewport } from "../features/subway/subway-overview-icon";
import { createSubwayScreenProjector } from "../features/subway/subway-screen-projection";
import { SubwayTrainHover } from "./subway-train-hover";

export default function SubwayFleetOverview({ cinemaInput, selectedLines, onLine2Focus, pulse }: {
  cinemaInput: RefObject<CinemaTrainInput>;
  selectedLines: readonly SubwayLineNumber[];
  onLine2Focus: (train: { id: string | null }) => void;
  pulse: boolean;
}) {
  const now = useTrainClock();
  const { current: mapRef } = useMap();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lines = useRef(selectedLines);
  const ready = useRef(new Set<SubwayLineNumber>());

  useEffect(() => {
    lines.current = selectedLines;
    mapRef?.getMap().triggerRepaint();
  }, [selectedLines, mapRef]);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    const attach = () => {
      if (map.getZoom() < (pulse ? PULSE_DETAIL_START : DETAIL_START) || map.getLayer(SUBWAY_TRAIN_LAYER_ID) ||
          !map.getLayer(SUBWAY_STATION_LABEL_LAYER_ID)) return;
      try {
        map.addLayer(createSubwayTrainCustomLayer({
          now, pulse,
          getLine2: (frameTime) => {
            if (!lines.current.includes(2)) return null;
            return { trains: getScheduledFleet(frameTime), timestamp: frameTime };
          },
          createContent: (scene, instance) =>
            createSubwayRollingStock(scene, instance, () => lines.current, ready.current),
        }), SUBWAY_STATION_LABEL_LAYER_ID);
      } catch (error) {
        console.error("Three.js 열차 레이어를 초기화하지 못했습니다.", error);
      }
    };
    map.on("zoom", attach);
    map.on("styledata", attach);
    attach();
    return () => {
      map.off("zoom", attach);
      map.off("styledata", attach);
      if (map.getLayer(SUBWAY_TRAIN_LAYER_ID)) map.removeLayer(SUBWAY_TRAIN_LAYER_ID);
    };
  }, [mapRef, now, pulse]);

  useEffect(() => {
    const map = mapRef?.getMap();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (pulse || !map || !canvas || !context) return;

    let frame = 0;
    let viewport: Viewport = { width: 0, height: 0 };
    const project = createSubwayScreenProjector(map);
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
      const timestamp = now();
      const second = Math.floor(timestamp / 1000);
      if (second !== lastSecond || lastLines !== lines.current) {
        lastSecond = second;
        lastLines = lines.current;
        trips = getActiveSubwayTrips(timestamp, lastLines);
        const counts = new Map<number, number>();
        for (const [line] of trips) counts.set(line, (counts.get(line) ?? 0) + 1);
        canvas.dataset.activeTrains = JSON.stringify(Object.fromEntries(counts));
        canvas.dataset.rollingStock = [...ready.current].sort().join(",");
      }
      context.clearRect(0, 0, viewport.width, viewport.height);
      const seconds = getSubwayServiceSecond(timestamp);
      const zoom = map.getZoom();
      const detail = detailBlend(zoom);
      for (const trip of trips) {
        const pose = sampleSubwayTrip(trip, seconds);
        if (!pose) continue;
        const alpha = ready.current.has(pose.line) ? 1 - detail : 1;
        if (alpha <= 0) continue;
        const icon = sampleOverviewTrainIcon(
          pose.sampler, pose.frontDistanceMeters, pose.carCount, project, viewport, zoom, pose.front,
        );
        if (icon) drawOverviewTrainIcon(context, icon, {
          color: SUBWAY_LINE_COLORS[pose.line], dwelling: pose.dwelling, opacity: alpha,
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
  }, [mapRef, now, pulse]);

  return <>
    {!pulse && <canvas ref={canvasRef} role="img" aria-label="시간표 기준 열차 위치"
      className="pointer-events-none absolute inset-0 z-2 h-full w-full" />}
    <SubwayTrainHover cinemaInput={cinemaInput} selectedLines={selectedLines} onLine2Focus={onLine2Focus} />
  </>;
}
