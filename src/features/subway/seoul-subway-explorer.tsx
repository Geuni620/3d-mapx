import { readCinemaOptions, type CinemaShot } from "../cinema/cinema-sequence";
import { ReplayDock } from "../night-pulse/replay-dock";
import { createTrainClock, TrainClock } from "../night-pulse/train-clock";
import { lazy, Suspense, useEffect, useMemo, useReducer, useState } from "react";
import { INITIAL_VIEW_STATE } from "../../app/map-config";
import { getSeoulDaylightTheme, type MapThemePreference } from "../../app/seoul-daylight";
import { SeoulSubwayMap } from "../../components/seoul-subway-map";
import { Line1MapLegend } from "../../components/line-1-section-key";
import { SubwayLineInspector } from "../../components/subway-line-inspector";
import { createSubwayVisualLevel } from "./subway-paths";
import {
  createInitialSelectedLineNumberSet,
  getSelectedLineNumbers,
  selectedLineNumberSetReducer,
  type SubwayLineSelectionAction,
} from "./subway-line-selection";
import {
  createInitialSubwayLayerVisibility,
  subwayLayerVisibilityReducer,
} from "./subway-layer-visibility";
import { readTravelUrl } from "../travel-time/travel-url";
import "./subway-map-theme.css";

// 소요시간 그래프(약 340KB)는 모드를 켤 때만 불러온다.
const TravelTimeMode = lazy(() => import("../travel-time/travel-time-mode"));

const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug") === "1";
const PULSE_STORAGE_KEY = "3d-mapx:night-pulse";

function pulseRequested() {
  return new URLSearchParams(location.search).get("pulse") === "1";
}

function readPulsePreference() {
  if (pulseRequested()) return true;
  try { return localStorage.getItem(PULSE_STORAGE_KEY) === "1"; }
  catch { return false; }
}

const THEME_STORAGE_KEY = "3d-mapx:map-theme";
const themeOptions = [
  { value: "auto", label: "자동" },
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
] as const;

function readThemePreference(): MapThemePreference {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // 저장소를 사용할 수 없어도 기본 자동 모드로 시작한다.
  }
  return "auto";
}

export function SeoulSubwayExplorer() {
  const [selectedLineNumberSet, dispatchSelectedLineNumberSet] = useReducer(
    selectedLineNumberSetReducer,
    undefined,
    createInitialSelectedLineNumberSet,
  );
  const [layerVisibility, dispatchLayerVisibility] = useReducer(
    subwayLayerVisibilityReducer,
    undefined,
    createInitialSubwayLayerVisibility,
  );
  const [zoom, setZoom] = useState(INITIAL_VIEW_STATE.zoom);
  const [followOnMount, setFollowOnMount] = useState(false);
  const [preference, setPreference] = useState<MapThemePreference>(() => pulseRequested() ? "dark" : readThemePreference());
  const [pulseEnabled, setPulseEnabled] = useState(readPulsePreference);
  const [travelActive, setTravelActive] = useState(() => readTravelUrl(location.search).active);
  const [clock] = useState(() => createTrainClock());
  useEffect(() => clock.start(), [clock]);
  const [daylightTheme, setDaylightTheme] = useState(() => getSeoulDaylightTheme(Date.now()));
  const [cinema] = useState(() => readCinemaOptions(new URLSearchParams(location.search)));
  const [cinemaShot, setCinemaShot] = useState<CinemaShot | null>(null);
  const touring = cinemaShot !== null;
  const [cinemaTheme, setCinemaTheme] = useState(() => getSeoulDaylightTheme(clock.now()));
  useEffect(() => {
    if (!touring) return;
    const refresh = () => setCinemaTheme(getSeoulDaylightTheme(clock.now()));
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [clock, touring]);
  const theme = touring ? cinemaTheme : preference === "auto" ? daylightTheme : preference;

  const pulse = theme === "dark" && !travelActive && (touring || pulseEnabled);
  function togglePulse() {
    const enabled = !pulseEnabled;
    setPulseEnabled(enabled);
    try { localStorage.setItem(PULSE_STORAGE_KEY, enabled ? "1" : "0"); } catch { /* 저장소 없이도 토글한다. */ }
    if (!enabled && pulseRequested()) {
      const url = new URL(location.href);
      url.searchParams.delete("pulse");
      history.replaceState(history.state, "", url);
    }
  }

  useEffect(() => {
    if (preference !== "auto") return;
    const refresh = () => setDaylightTheme(getSeoulDaylightTheme(Date.now()));
    refresh();
    const timer = window.setInterval(refresh, 15000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [preference]);

  function selectTheme(next: MapThemePreference) {
    if (next === "auto") setDaylightTheme(getSeoulDaylightTheme(Date.now()));
    setPreference(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 저장소를 사용할 수 없을 때는 이 페이지의 선택만 반영한다.
    }
  }

  const selectedLineNumbers = useMemo(
    () => getSelectedLineNumbers(selectedLineNumberSet),
    [selectedLineNumberSet],
  );
  const visualLevel = createSubwayVisualLevel(zoom);

  function selectLines(action: SubwayLineSelectionAction) {
    setFollowOnMount(false);
    dispatchSelectedLineNumberSet(action);
  }

  function toggleTrainLayer() {
    dispatchLayerVisibility({ type: "toggle-train-layer" });
    const enabling = !layerVisibility.isTrainLayerVisible;
    setFollowOnMount(enabling);
    if (enabling) {
      dispatchSelectedLineNumberSet({ type: "select-only", lineNumber: 2 });
      if (!layerVisibility.isRouteLayerVisible) {
        dispatchLayerVisibility({ type: "toggle-route-layer" });
      }
    }
  }

  return (
    <div className="relative h-dvh w-full subway-map" data-map-theme={theme}
      data-cinema-shot={cinemaShot?.kind}
      data-cinema-bridge={cinemaShot?.kind === "side" && cinemaShot.bridge ? "" : undefined}
      data-cinema-clean={touring && cinema.clean ? "" : undefined}
      data-travel={travelActive ? "" : undefined}>
      <TrainClock.Provider value={clock}>
        <SeoulSubwayMap
          selectedLineNumbers={selectedLineNumbers}
          layerVisibility={travelActive ? { ...layerVisibility, isTrainLayerVisible: false } : layerVisibility}
          visualLevel={visualLevel}
          zoom={zoom}
          cinemaDirect={cinema.direct}
          cinemaShot={cinemaShot}
          onCinemaShot={setCinemaShot}
          theme={theme}
          pulse={pulse}
          followOnMount={followOnMount}
          onZoomChange={setZoom}
          travelTime={travelActive ? (
            <Suspense fallback={null}>
              <TravelTimeMode theme={theme} onClose={() => setTravelActive(false)} />
            </Suspense>
          ) : undefined}
        />
        {!travelActive && <ReplayDock />}
      </TrainClock.Provider>
      <div className="subway-theme-switch">
        {preference === "auto" && (
          <span className="subway-theme-status" role="status">서울 {theme === "light" ? "낮" : "밤"}</span>
        )}
        <div className="subway-theme-options" role="group" aria-label="지도 테마">
          {themeOptions.map(({ value, label }) => (
            <button key={value} type="button" data-mode={value} aria-pressed={preference === value}
              title={value === "auto" ? "서울 일출·일몰 기준" : undefined}
              onClick={() => selectTheme(value)}>{label}</button>
          ))}
        </div>
        <button type="button" className="subway-pulse-toggle" disabled={theme === "light" || travelActive} aria-pressed={pulse}
          title={theme === "light" ? "다크 테마에서 사용" : travelActive ? "소요시간 모드에서는 꺼집니다" : undefined}
          onClick={togglePulse}>야간 맥박</button>
        <button type="button" className="subway-pulse-toggle subway-travel-toggle" aria-pressed={travelActive}
          onClick={() => setTravelActive(!travelActive)}>소요시간</button>
      </div>
      {selectedLineNumberSet.has(1) && layerVisibility.isRouteLayerVisible && <Line1MapLegend />}
      {debug && <SubwayLineInspector
        className="cinema-inspector absolute left-4 top-4 z-10"
        selectedLineNumberSet={selectedLineNumberSet}
        dispatchSelectedLineNumberSet={selectLines}
        layerVisibility={layerVisibility}
        dispatchLayerVisibility={dispatchLayerVisibility}
        onToggleTrainLayer={toggleTrainLayer}
        visualLevel={visualLevel}
        zoom={zoom}
      />}
    </div>
  );
}
