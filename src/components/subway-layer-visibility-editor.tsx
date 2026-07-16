import type { Dispatch } from "react";
import {
  type SubwayLayerVisibility,
  type SubwayLayerVisibilityAction,
} from "../features/subway/subway-layer-visibility";
import type { SubwayVisualLevel } from "../features/subway/subway-paths";
import { cn } from "../lib/cn";

interface SubwayLayerVisibilityEditorProps {
  layerVisibility: SubwayLayerVisibility;
  dispatchLayerVisibility: Dispatch<SubwayLayerVisibilityAction>;
  onToggleTrainLayer: () => void;
  visualLevel: SubwayVisualLevel;
  zoom: number;
}

export function SubwayLayerVisibilityEditor({
  layerVisibility,
  dispatchLayerVisibility,
  onToggleTrainLayer,
  visualLevel,
  zoom,
}: SubwayLayerVisibilityEditorProps) {
  const handleToggleRouteLayer = () => {
    dispatchLayerVisibility({ type: "toggle-route-layer" });
  };

  const handleToggleStationCircleLayer = () => {
    dispatchLayerVisibility({ type: "toggle-station-circle-layer" });
  };

  return (
    <section className="mt-3 border-t border-white/10 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Layers
        </p>
        <span className="text-[10px] font-semibold text-zinc-600">편집</span>
      </div>

      <SubwayVisualLevelStatus visualLevel={visualLevel} zoom={zoom} />

      <div className="grid grid-cols-2 gap-1.5">
        <SubwayLayerVisibilityButton
          label="노선 Path"
          isVisible={layerVisibility.isRouteLayerVisible}
          onToggle={handleToggleRouteLayer}
        />
        <SubwayLayerVisibilityButton
          label="역사 Circle"
          isVisible={layerVisibility.isStationCircleLayerVisible}
          onToggle={handleToggleStationCircleLayer}
        />
        <SubwayLayerVisibilityButton
          label="2호선 Train"
          isVisible={layerVisibility.isTrainLayerVisible}
          onToggle={onToggleTrainLayer}
        />
      </div>
    </section>
  );
}

interface SubwayVisualLevelStatusProps {
  visualLevel: SubwayVisualLevel;
  zoom: number;
}

function SubwayVisualLevelStatus({
  visualLevel,
  zoom,
}: SubwayVisualLevelStatusProps) {
  return (
    <div className="mb-2 rounded-sm border border-white/10 bg-black/20 px-2 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Zoom
        </span>
        <span className="text-[11px] font-semibold text-zinc-100">
          {zoom.toFixed(2)}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-zinc-500">
        <span>{visualLevel.label}</span>
        <span>Circle {visualLevel.stationCircleLabel}</span>
      </div>
    </div>
  );
}

interface SubwayLayerVisibilityButtonProps {
  label: string;
  isVisible: boolean;
  onToggle: () => void;
}

function SubwayLayerVisibilityButton({
  label,
  isVisible,
  onToggle,
}: SubwayLayerVisibilityButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={isVisible}
      onClick={onToggle}
      className={cn(
        "flex h-8 items-center justify-between rounded-sm border px-2 text-left text-[11px] font-semibold transition",
        isVisible
          ? "border-white/15 bg-white/10 text-zinc-100"
          : "border-white/5 bg-black/20 text-zinc-500 hover:border-white/10 hover:text-zinc-300",
      )}
    >
      <span>{label}</span>
      <span className="text-[10px] text-zinc-500">
        {isVisible ? "ON" : "OFF"}
      </span>
    </button>
  );
}
