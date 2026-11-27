import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { useTrainClock } from "../night-pulse/train-clock";
import { blendCinemaView, getCinemaView, readCinemaView } from "./cinema-camera";
import { CINEMA_IDLE_MS, nextCinemaShot, shouldStartCinema, type CinemaShot } from "./cinema-sequence";
import "./cinema-tour.css";

const activityEvents = ["pointermove", "pointerdown", "touchstart", "wheel", "keydown", "click"] as const;
const emptyPadding = { top: 0, right: 0, bottom: 0, left: 0 };

export function CinemaTour({ direct, shot, onShot }: {
  direct: boolean;
  shot: CinemaShot | null;
  onShot: (shot: CinemaShot | null) => void;
}) {
  const now = useTrainClock();
  const { current: mapRef } = useMap();

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let ready = Boolean(map.isStyleLoaded());
    let pending = direct;
    let lastInput = performance.now();
    let idleTimer = 0;
    let frame = 0;
    let running: CinemaShot | null = null;
    let startedAt = 0;
    let current = readCinemaView(map);
    let entry = current;
    let saved: typeof current | undefined;
    let savedPadding = map.getPadding();
    let savedMaxPitch = map.getMaxPitch();
    let previousFrame = 0;

    function tick(stamp: number) {
      if (!running || !map) return;
      const time = now();
      const next = nextCinemaShot(running, stamp - startedAt, time, current.center.toArray());
      if (next !== running) {
        running = next;
        startedAt = stamp;
        entry = current;
        onShot(next);
      }

      const elapsed = stamp - startedAt;
      const view = getCinemaView(map, running, time, elapsed, entry.bearing);
      if (view) {
        const duration = running.kind === "front" ? 1_800 : 3_000;
        const t = Math.min(1, elapsed / duration);
        const ease = t * t * (3 - 2 * t);
        const follow = 1 - Math.exp(-Math.min(80, stamp - previousFrame) / 70);
        current = t < 1 ? blendCinemaView(entry, view, ease) : blendCinemaView(current, view, follow);
        map.jumpTo(current, { cinema: true });
      }
      previousFrame = stamp;
      frame = requestAnimationFrame(tick);
    }

    function start() {
      if (!ready || !map || running || document.hidden) return;
      pending = false;
      clearTimeout(idleTimer);
      saved = readCinemaView(map);
      savedPadding = map.getPadding();
      savedMaxPitch = map.getMaxPitch();
      map.stop();
      map.setMaxPitch(85);
      map.jumpTo({ padding: emptyPadding }, { cinema: true });
      current = saved;
      entry = saved;
      startedAt = previousFrame = performance.now();
      running = { kind: "orbit" };
      onShot(running);
      frame = requestAnimationFrame(tick);
    }

    function stop() {
      if (!running || !saved || !map) return;
      cancelAnimationFrame(frame);
      running = null;
      map.jumpTo({ ...saved, padding: savedPadding });
      map.setMaxPitch(savedMaxPitch);
      saved = undefined;
      onShot(null);
    }

    function schedule() {
      clearTimeout(idleTimer);
      if (!ready || document.hidden || running || reduced.matches) return;
      const idle = performance.now() - lastInput;
      if (shouldStartCinema(idle, reduced.matches, !document.hidden)) start();
      else idleTimer = window.setTimeout(schedule, CINEMA_IDLE_MS - idle);
    }

    function activity() {
      pending = false;
      lastInput = performance.now();
      stop();
      schedule();
    }

    function visibility() {
      lastInput = performance.now();
      if (document.hidden) stop();
      if (pending) start();
      schedule();
    }

    function loaded() {
      ready = true;
      if (pending) start();
      schedule();
    }

    for (const event of activityEvents) window.addEventListener(event, activity, true);
    document.addEventListener("visibilitychange", visibility);
    reduced.addEventListener("change", schedule);
    map.once("load", loaded);
    // 기본 지도 카메라 초기화가 끝난 시점을 복귀 기준으로 삼는다.
    const initialize = requestAnimationFrame(() => { if (ready) loaded(); });
    return () => {
      cancelAnimationFrame(initialize);
      clearTimeout(idleTimer);
      stop();
      map.off("load", loaded);
      for (const event of activityEvents) window.removeEventListener(event, activity, true);
      document.removeEventListener("visibilitychange", visibility);
      reduced.removeEventListener("change", schedule);
    };
  }, [mapRef, direct, now, onShot]);

  const title = shot?.kind === "orbit" ? "서울 전경"
    : shot?.kind === "side" ? (shot.bridge ? "당산철교" : `${shot.train.line}호선 측면`)
    : shot?.kind === "front" ? `${shot.train.line}호선 전면`
    : shot?.kind === "transfer" ? `${shot.train.line}호선으로 전환` : null;

  return title ? <span className="cinema-shot-status" role="status">{title}</span> : null;
}
