import { createContext, useContext, useSyncExternalStore } from "react";
import { getLine2ServiceDay, getSubwayServiceMidnight } from "../subway/line-2-timetable";

const KST_OFFSET = 9 * 3_600_000;
export const DAY_MS = 86_400_000;
export const REPLAY_START = 5 * 3_600_000;
export const REPLAY_END = (25 * 60 + 30) * 60_000;

export const REPLAY_DAYS = [
  { id: "DAY", label: "평일", reference: Date.parse("2026-11-23T00:00:00+09:00") },
  { id: "SAT", label: "토", reference: Date.parse("2026-11-28T00:00:00+09:00") },
  { id: "END", label: "휴일", reference: Date.parse("2026-11-29T00:00:00+09:00") },
] as const;

type Day = (typeof REPLAY_DAYS)[number];
type Rate = 1 | 10 | 60;

function frameTime() {
  const time = document.timeline.currentTime;
  return performance.timeOrigin + (typeof time === "number" ? time : performance.now());
}

export function parseReplayTime(value: string | null, wallTime: number, serviceDate?: string | null) {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  const minute = (hours * 60 + minutes) * 60_000;
  const day = serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ? Date.parse(`${serviceDate}T00:00:00+09:00`) : NaN;
  if (Number.isFinite(day) && new Date(day + KST_OFFSET).toISOString().slice(0, 10) === serviceDate)
    return day + minute + (minute < 3 * 3_600_000 ? DAY_MS : 0);
  const midnight = Math.floor((wallTime + KST_OFFSET) / DAY_MS) * DAY_MS - KST_OFFSET;
  return midnight + minute;
}

export function formatSeoulClock(timestamp: number, withSeconds = false) {
  return new Date(timestamp + KST_OFFSET).toISOString().slice(11, withSeconds ? 19 : 16);
}

export function createTrainClock({
  readWall = frameTime,
  search = new URLSearchParams(location.search),
  reduced = matchMedia("(prefers-reduced-motion: reduce)").matches,
  replaceTime = (time: number | null, day: number) => {
    const url = new URL(location.href);
    if (time === null) {
      url.searchParams.delete("at");
      url.searchParams.delete("day");
    } else {
      url.searchParams.set("at", formatSeoulClock(time));
      url.searchParams.set("day", new Date(day + KST_OFFSET).toISOString().slice(0, 10));
    }
    if (url.href !== location.href) history.replaceState(history.state, "", url);
  },
} = {}) {
  let anchor = readWall();
  const initial = parseReplayTime(search.get("at"), anchor, search.get("day"));
  let mode: "live" | "replay" = initial !== null || reduced ? "replay" : "live";
  let playing = !reduced;
  let rate: Rate = 1;
  let day = getSubwayServiceMidnight(initial ?? anchor);
  const withinDay = (time: number) => Math.min(day + REPLAY_END, Math.max(day + REPLAY_START, time));
  let time = withinDay(initial ?? anchor);
  let lastPublished = -Infinity;
  let frame = 0;
  const listeners = new Set<() => void>();

  const now = () => mode === "live" ? readWall() : withinDay(time + (playing ? (readWall() - anchor) * rate : 0));
  const snapshot = () => {
    const current = now();
    const serviceDay = mode === "live" ? getSubwayServiceMidnight(current) : day;
    return { time: current, mode, playing, rate, day: serviceDay, dayType: getLine2ServiceDay(serviceDay + REPLAY_START) };
  };
  let current = snapshot();
  function publish(syncUrl = true) {
    current = snapshot();
    if (syncUrl) replaceTime(mode === "replay" ? current.time : null, day);
    for (const listener of listeners) listener();
  }
  function tick(realTime: number) {
    if (mode === "replay" && playing && now() >= day + REPLAY_END) {
      playing = false;
      time = day + REPLAY_END;
      publish();
    } else if (playing && realTime - lastPublished >= 125) {
      lastPublished = realTime;
      publish(mode === "replay");
    }
    frame = requestAnimationFrame(tick);
  }
  function enterReplay() {
    if (mode === "replay") return;
    const at = now();
    day = getSubwayServiceMidnight(at);
    mode = "replay";
    time = withinDay(at);
    anchor = readWall();
  }
  return {
    now,
    forecast: (elapsedMs: number) => {
      const at = now();
      return mode === "live" ? at + elapsedMs : withinDay(at + (playing ? elapsedMs * rate : 0));
    },
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start() {
      lastPublished = -Infinity;
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    },
    seek(offsetMs: number) {
      const wasLive = mode === "live";
      enterReplay();
      if (wasLive) playing = false;
      time = withinDay(day + offsetMs);
      anchor = readWall();
      publish();
    },
    selectDay(selected: Day) {
      enterReplay();
      const offset = now() - day;
      day = selected.reference;
      time = withinDay(day + offset);
      anchor = readWall();
      publish();
    },
    togglePlaying() {
      const wasLive = mode === "live";
      enterReplay();
      time = now();
      playing = wasLive ? false : !playing;
      if (playing && time >= day + REPLAY_END) time = day + REPLAY_START;
      anchor = readWall();
      publish();
    },
    setRate(next: Rate) {
      enterReplay();
      time = now();
      anchor = readWall();
      rate = next;
      publish();
    },
    live() {
      mode = "live";
      playing = true;
      rate = 1;
      publish();
    },
  };
}

export const TrainClock = createContext<ReturnType<typeof createTrainClock> | null>(null);
export function useTrainClockStore() {
  const clock = useContext(TrainClock);
  if (!clock) throw new Error("열차 시계가 초기화되지 않았습니다.");
  return clock;
}
export const useTrainClock = () => useTrainClockStore().now;
export const useTrainTime = () => {
  const clock = useTrainClockStore();
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot);
};
