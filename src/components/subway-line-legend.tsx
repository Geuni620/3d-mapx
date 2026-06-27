import { cva, type VariantProps } from "class-variance-authority";
import {
  SUBWAY_LINE_COLORS,
  SUBWAY_LINES,
} from "../features/subway/subway-constants";
import { cn } from "../lib/cn";

const subwayLineLegend = cva(
  "rounded-md border border-zinc-200 bg-white/90 text-zinc-950 shadow-sm backdrop-blur",
  {
    variants: {
      density: {
        compact: "px-3 py-2",
        comfortable: "px-4 py-3",
      },
    },
    defaultVariants: {
      density: "compact",
    },
  },
);

type SubwayLineLegendProps = {
  className?: string;
} & VariantProps<typeof subwayLineLegend>;

export function SubwayLineLegend({
  className,
  density,
}: SubwayLineLegendProps) {
  return (
    <aside
      aria-label="서울 지하철 노선 범례"
      className={cn(subwayLineLegend({ density }), className)}
    >
      <ol className="grid grid-cols-2 gap-x-3 gap-y-1">
        {SUBWAY_LINES.map((lineNumber) => (
          <li
            key={lineNumber}
            className="flex items-center gap-2 whitespace-nowrap text-xs font-medium"
          >
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: SUBWAY_LINE_COLORS[lineNumber] }}
            />
            <span>{lineNumber}호선</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
