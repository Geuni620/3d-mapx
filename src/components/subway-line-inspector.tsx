import type { Dispatch } from "react";
import { cva } from "class-variance-authority";
import {
  SUBWAY_LINE_COLORS,
  SUBWAY_LINES,
} from "../features/subway/subway-constants";
import type { SubwayLineSelectionAction } from "../features/subway/subway-line-selection";
import { cn } from "../lib/cn";
import type { SubwayLineNumber } from "../services/subway-station";

const subwayLineInspector = cva(
  "w-64 rounded-md border border-white/10 bg-zinc-950/80 p-3 text-zinc-100 shadow-lg shadow-black/25 backdrop-blur-md",
);

interface SubwayLineInspectorProps {
  selectedLineNumberSet: ReadonlySet<SubwayLineNumber>;
  dispatchSelectedLineNumberSet: Dispatch<SubwayLineSelectionAction>;
  className?: string;
}

export function SubwayLineInspector({
  selectedLineNumberSet,
  dispatchSelectedLineNumberSet,
  className,
}: SubwayLineInspectorProps) {
  const handleToggleLine = (lineNumber: SubwayLineNumber) => {
    dispatchSelectedLineNumberSet({ type: "toggle", lineNumber });
  };

  const handleSelectAllLines = () => {
    dispatchSelectedLineNumberSet({ type: "select-all" });
  };

  const handleClearLineSelection = () => {
    dispatchSelectedLineNumberSet({ type: "clear" });
  };

  return (
    <aside
      aria-label="서울 지하철 노선 인스펙터"
      className={cn(subwayLineInspector(), className)}
    >
      <SubwayLineInspectorHeader
        selectedLineCount={selectedLineNumberSet.size}
      />
      <SubwayLineToggleGrid
        selectedLineNumberSet={selectedLineNumberSet}
        onToggleLine={handleToggleLine}
      />
      <SubwayLineActions
        onSelectAll={handleSelectAllLines}
        onClearSelection={handleClearLineSelection}
      />
    </aside>
  );
}

interface SubwayLineInspectorHeaderProps {
  selectedLineCount: number;
}

function SubwayLineInspectorHeader({
  selectedLineCount,
}: SubwayLineInspectorHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          Inspector
        </p>
        <h2 className="text-sm font-semibold text-zinc-50">서울 지하철</h2>
      </div>
      <span className="rounded-sm border border-white/10 px-2 py-1 text-[11px] font-semibold text-zinc-300">
        {selectedLineCount}/{SUBWAY_LINES.length}
      </span>
    </div>
  );
}

interface SubwayLineToggleGridProps {
  selectedLineNumberSet: ReadonlySet<SubwayLineNumber>;
  onToggleLine: (lineNumber: SubwayLineNumber) => void;
}

function SubwayLineToggleGrid({
  selectedLineNumberSet,
  onToggleLine,
}: SubwayLineToggleGridProps) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {SUBWAY_LINES.map((lineNumber) => (
        <SubwayLineToggleButton
          key={lineNumber}
          lineNumber={lineNumber}
          isSelected={selectedLineNumberSet.has(lineNumber)}
          onToggleLine={onToggleLine}
        />
      ))}
    </div>
  );
}

interface SubwayLineToggleButtonProps {
  lineNumber: SubwayLineNumber;
  isSelected: boolean;
  onToggleLine: (lineNumber: SubwayLineNumber) => void;
}

function SubwayLineToggleButton({
  lineNumber,
  isSelected,
  onToggleLine,
}: SubwayLineToggleButtonProps) {
  const handleClick = () => {
    onToggleLine(lineNumber);
  };

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={handleClick}
      className={cn(
        "flex h-9 items-center justify-between rounded-sm border px-2 text-left text-xs font-semibold transition",
        isSelected
          ? "border-white/15 bg-white/10 text-zinc-50"
          : "border-white/5 bg-black/15 text-zinc-500 hover:border-white/10 hover:text-zinc-300",
      )}
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn("size-2.5 rounded-full", !isSelected && "opacity-35")}
          style={{ backgroundColor: SUBWAY_LINE_COLORS[lineNumber] }}
        />
        <span>{lineNumber}호선</span>
      </span>
      <span className="text-[10px] text-zinc-500">
        {isSelected ? "ON" : "OFF"}
      </span>
    </button>
  );
}

interface SubwayLineActionsProps {
  onSelectAll: () => void;
  onClearSelection: () => void;
}

function SubwayLineActions({
  onSelectAll,
  onClearSelection,
}: SubwayLineActionsProps) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-1.5">
      <button
        type="button"
        onClick={onSelectAll}
        className="h-8 rounded-sm border border-white/10 bg-white/10 text-xs font-semibold text-zinc-200 transition hover:bg-white/15"
      >
        전체
      </button>
      <button
        type="button"
        onClick={onClearSelection}
        className="h-8 rounded-sm border border-white/10 bg-black/20 text-xs font-semibold text-zinc-400 transition hover:text-zinc-200"
      >
        해제
      </button>
    </div>
  );
}
