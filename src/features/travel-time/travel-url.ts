import { TIME_BANDS, type TimeBand } from "./travel-bands";
import type { TravelEndpoint } from "./travel-route";
import { parseTravelYear, type TravelYear } from "./travel-years";

// 공유 링크: ?travel=1&od=진접,서울역&year=2040&t=day08
// 지점은 @위도_경도(소수 5자리)로 적는다. 쉼표는 출발·도착 구분자다.

export interface TravelUrlState {
  active: boolean;
  origin: TravelEndpoint | null;
  destination: TravelEndpoint | null;
  year: TravelYear | null;
  band: TimeBand | null;
}

export function parseEndpoint(value: string | undefined): TravelEndpoint | null {
  if (!value) return null;
  if (value.startsWith("@")) {
    const [lat, lon] = value.slice(1).split("_").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { kind: "point", coordinate: [lon, lat] };
  }
  return { kind: "station", complex: value };
}

export function formatEndpoint(endpoint: TravelEndpoint) {
  if (endpoint.kind === "station") return endpoint.complex;
  const [lon, lat] = endpoint.coordinate;
  return `@${lat.toFixed(5)}_${lon.toFixed(5)}`;
}

export function readTravelUrl(search: string): TravelUrlState {
  const params = new URLSearchParams(search);
  const [origin, destination] = (params.get("od") ?? "").split(",");
  return {
    active: params.get("travel") === "1" || params.has("od"),
    origin: parseEndpoint(origin),
    destination: parseEndpoint(destination),
    year: parseTravelYear(params.get("year")),
    band: TIME_BANDS.find(band => band.id === params.get("t")) ?? null,
  };
}

export function writeTravelUrl(
  href: string,
  state: { active: boolean; origin: TravelEndpoint | null; destination: TravelEndpoint | null; year: TravelYear; band: TimeBand },
) {
  const url = new URL(href);
  for (const key of ["travel", "od", "year", "t"]) url.searchParams.delete(key);
  if (state.active) {
    url.searchParams.set("travel", "1");
    if (state.origin) {
      url.searchParams.set("od", [state.origin, state.destination].filter(Boolean).map(e => formatEndpoint(e!)).join(","));
    }
    url.searchParams.set("year", String(state.year));
    if (state.band.id !== TIME_BANDS[0].id) url.searchParams.set("t", state.band.id);
  }
  return url.toString();
}
