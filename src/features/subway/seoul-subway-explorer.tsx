import { useEffect, useMemo, useReducer, useState } from "react";
import { INITIAL_VIEW_STATE } from "../../app/map-config";
import { getSeoulDaylightTheme, type MapThemePreference } from "../../app/seoul-daylight";
import { SeoulSubwayMap } from "../../components/seoul-subway-map";
import { SubwayLineInspector } from "../../components/subway-line-inspector";
import type { SubwayLineNumber } from "./subway-constants";
import { createSubwayVisualLevel } from "./subway-paths";
import {
  createInitialSelectedLineNumberSet,
  getSelectedLineNumbers,
  selectedLineNumberSetReducer,
} from "./subway-line-selection";
import {
  createInitialSubwayLayerVisibility,
  subwayLayerVisibilityReducer,
} from "./subway-layer-visibility";
import "./subway-map-theme.css";

const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug") === "1";
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
    () => debug ? createInitialSelectedLineNumberSet() : new Set<SubwayLineNumber>([2]),
  );
  const [layerVisibility, dispatchLayerVisibility] = useReducer(
    subwayLayerVisibilityReducer,
    undefined,
    createInitialSubwayLayerVisibility,
  );
  const [zoom, setZoom] = useState(INITIAL_VIEW_STATE.zoom);
  const [preference, setPreference] = useState<MapThemePreference>(readThemePreference);
  const [daylightTheme, setDaylightTheme] = useState(() => getSeoulDaylightTheme(Date.now()));
  const theme = preference === "auto" ? daylightTheme : preference;

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

  return (
    <div className="relative h-screen w-screen subway-map" data-map-theme={theme}>
      <SeoulSubwayMap
        selectedLineNumbers={selectedLineNumbers}
        layerVisibility={layerVisibility}
        visualLevel={visualLevel}
        zoom={zoom}
        theme={theme}
        onZoomChange={setZoom}
      />
      <div className="subway-theme-switch" role="group" aria-label="지도 테마">
        {themeOptions.map(({ value, label }) =>
          <button key={value} type="button" aria-pressed={preference === value}
            title={value === "auto" ? "서울 일출·일몰 기준" : undefined}
            onClick={() => selectTheme(value)}>{label}</button>,
        )}
        {preference === "auto" && <span role="status">서울 {theme === "light" ? "낮" : "밤"}</span>}
      </div>
      {debug && <SubwayLineInspector
        className="absolute left-4 top-4 z-10"
        selectedLineNumberSet={selectedLineNumberSet}
        dispatchSelectedLineNumberSet={dispatchSelectedLineNumberSet}
        layerVisibility={layerVisibility}
        dispatchLayerVisibility={dispatchLayerVisibility}
        visualLevel={visualLevel}
        zoom={zoom}
      />}
    </div>
  );
}
