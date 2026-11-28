import type { Coordinate } from "./travel-time-data";
import type { TravelNetwork } from "./travel-network";
import type { TravelEndpoint, TravelRoute } from "./travel-route";
import { nearbyComplexes } from "./travel-route";

export function minutesText(seconds: number) {
  const minutes = seconds / 60;
  return minutes < 10 && minutes % 1 !== 0 ? minutes.toFixed(1).replace(/\.0$/, "") : String(Math.round(minutes));
}

export function deltaText(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes === 0) return "변화 없음";
  return `${minutes > 0 ? "+" : "−"}${Math.abs(minutes)}분`;
}

export function endpointLabel(endpoint: TravelEndpoint | null, network: TravelNetwork) {
  if (!endpoint) return null;
  if (endpoint.kind === "station") return network.complexes.get(endpoint.complex)?.name ?? endpoint.complex.split(":").at(-1)!;
  const [nearest] = nearbyComplexes(network, endpoint.coordinate);
  return nearest ? `지점 · ${nearest.complex.name} ${Math.round(nearest.meters / 10) * 10}m` : "지점 · 주변 1.5km 역 없음";
}

export function platformName(network: TravelNetwork, id: string) {
  return network.platforms.get(id)?.name.split("(")[0] ?? id;
}

export function futureServicesUsed(route: TravelRoute | null, network: TravelNetwork) {
  return [...new Set((route?.legs ?? [])
    .filter(leg => leg.kind === "ride" && network.services.get(leg.service)?.future)
    .map(leg => leg.kind === "ride" ? leg.service : ""))];
}

export function routeFailure(endpoint: TravelEndpoint, network: TravelNetwork, role: "출발" | "도착") {
  if (endpoint.kind === "station") {
    return network.complexes.has(endpoint.complex) ? null : `${network.year}년 계산망에 아직 없는 역입니다`;
  }
  return nearbyComplexes(network, endpoint.coordinate).length ? null : `${role} 지점 1.5km 안에 역이 없습니다 (보행 접근 범위 밖)`;
}

export const TRAVEL_PRESETS = [
  { id: "jinjeop-seoul", label: "진접 → 서울역", origin: "진접", destination: "서울역" },
  { id: "byeollae-jamsil", label: "별내 → 잠실", origin: "별내", destination: "잠실" },
  { id: "byeollae-sangbong", label: "별내 → 상봉", origin: "별내", destination: "상봉" },
  { id: "onam-gwanghwamun", label: "오남 → 광화문", origin: "오남", destination: "광화문" },
] as const;

export function routeBounds(route: TravelRoute | null, extra: Coordinate[]) {
  const points = [
    ...extra,
    ...(route?.legs ?? []).flatMap(leg => leg.kind === "ride" ? leg.path : leg.kind === "walk" ? [leg.from, leg.to] : []),
  ];
  if (!points.length) return null;
  const lons = points.map(point => point[0]);
  const lats = points.map(point => point[1]);
  return [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]] as [Coordinate, Coordinate];
}

export function endpointCoordinate(endpoint: TravelEndpoint | null, network: TravelNetwork): Coordinate | null {
  if (!endpoint) return null;
  if (endpoint.kind === "point") return endpoint.coordinate;
  return network.complexes.get(endpoint.complex)?.coordinate ?? null;
}

