import { useEffect, useMemo, useReducer, useState } from "react";
import { INITIAL_VIEW_STATE } from "../../app/map-config";
import { SeoulSubwayMap } from "../../components/seoul-subway-map";
import { SubwayLineInspector } from "../../components/subway-line-inspector";
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
  const [isFollowingLine2Train, setIsFollowingLine2Train] = useState(false);

  const selectedLineNumbers = useMemo(
    () => getSelectedLineNumbers(selectedLineNumberSet),
    [selectedLineNumberSet],
  );
  const visualLevel = createSubwayVisualLevel(zoom);

  useEffect(() => {
    if (
      isFollowingLine2Train &&
      (!selectedLineNumberSet.has(2) || !layerVisibility.isTrainLayerVisible)
    ) {
      setIsFollowingLine2Train(false);
    }
  }, [isFollowingLine2Train, layerVisibility, selectedLineNumberSet]);

  const handleToggleTrainLayer = () => {
    const willShowTrainLayer = !layerVisibility.isTrainLayerVisible;

    dispatchLayerVisibility({ type: "toggle-train-layer" });

    if (!willShowTrainLayer) {
      setIsFollowingLine2Train(false);
      return;
    }

    dispatchSelectedLineNumberSet({ type: "select-only", lineNumber: 2 });

    if (!layerVisibility.isRouteLayerVisible) {
      dispatchLayerVisibility({ type: "toggle-route-layer" });
    }

    setIsFollowingLine2Train(true);
  };

  return (
    <div className="relative h-screen w-screen">
      <SeoulSubwayMap
        selectedLineNumbers={selectedLineNumbers}
        layerVisibility={layerVisibility}
        visualLevel={visualLevel}
        zoom={zoom}
        isFollowingLine2Train={isFollowingLine2Train}
        onZoomChange={setZoom}
        onStopFollowingLine2Train={() => setIsFollowingLine2Train(false)}
      />
      <SubwayLineInspector
        className="absolute left-4 top-4 z-10"
        selectedLineNumberSet={selectedLineNumberSet}
        dispatchSelectedLineNumberSet={dispatchSelectedLineNumberSet}
        layerVisibility={layerVisibility}
        dispatchLayerVisibility={dispatchLayerVisibility}
        visualLevel={visualLevel}
        zoom={zoom}
        onToggleTrainLayer={handleToggleTrainLayer}
      />
    </div>
  );
}
