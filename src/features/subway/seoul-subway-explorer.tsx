import { useMemo, useReducer, useState } from "react";
import { INITIAL_VIEW_STATE } from "../../app/map-config";
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

const debug = import.meta.env.DEV && new URLSearchParams(window.location.search).get("debug") === "1";

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

  const selectedLineNumbers = useMemo(
    () => getSelectedLineNumbers(selectedLineNumberSet),
    [selectedLineNumberSet],
  );
  const visualLevel = createSubwayVisualLevel(zoom);

  return (
    <div className="relative h-screen w-screen">
      <SeoulSubwayMap
        selectedLineNumbers={selectedLineNumbers}
        layerVisibility={layerVisibility}
        visualLevel={visualLevel}
        zoom={zoom}
        onZoomChange={setZoom}
      />
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
