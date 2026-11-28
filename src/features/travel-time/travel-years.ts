import type { FutureLine } from "./travel-time-data";

export const TRAVEL_YEARS = [2026, 2030, 2040] as const;
export type TravelYear = (typeof TRAVEL_YEARS)[number];

/**
 * 장래 노선이 그 해 계산망에 들어가는지 판정한다.
 * - 착공(승인·고시 이후 단계)만 반영한다. 기본계획·예타는 어느 해에도 넣지 않는다.
 * - 2026은 현재 기준망 그대로다.
 * - 중간 연도는 공식 목표연도(B) 또는 보도연도(C)가 그 해 이하일 때만 넣는다.
 * - 마지막 연도(2040)는 반영 대상 전부를 넣는다. 개통연도 미정도 포함한다.
 */
export function isLineOpen(line: Pick<FutureLine, "included" | "opening">, year: TravelYear): boolean {
  if (!line.included || year === TRAVEL_YEARS[0]) return false;
  if (year === TRAVEL_YEARS[TRAVEL_YEARS.length - 1]) return true;
  const expected = line.opening.year ?? line.opening.reportedYear ?? null;
  return expected !== null && expected <= year;
}

export type OpeningBadge = "목표" | "보도 기준" | "개통연도 미정";

export function describeOpening(line: Pick<FutureLine, "opening">): { label: string; badge: OpeningBadge } {
  const { year, reportedYear, confidence } = line.opening;
  if (year !== null && confidence !== "C") return { label: `${year} 개통 목표`, badge: "목표" };
  if (reportedYear) return { label: `보도 ${reportedYear}`, badge: "보도 기준" };
  return { label: "개통연도 미정", badge: "개통연도 미정" };
}

export function parseTravelYear(value: string | null): TravelYear | null {
  const year = Number(value);
  return (TRAVEL_YEARS as readonly number[]).includes(year) ? year as TravelYear : null;
}
