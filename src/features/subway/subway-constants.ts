export const SUBWAY_LINES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type SubwayLineNumber = (typeof SUBWAY_LINES)[number];

export const SUBWAY_LINE_COLORS = {
  1: "#0052A4",
  2: "#00A84D",
  3: "#EF7C1C",
  4: "#00A5DE",
  5: "#996CAC",
  6: "#CD7C2F",
  7: "#747F00",
  8: "#E6186C",
} satisfies Record<SubwayLineNumber, string>;
