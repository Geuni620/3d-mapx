import type { Coordinate } from "./travel-time-data";
import { TRAVEL_PARAMETERS } from "./travel-time-parameters";
import type { TransferRule, TravelNetwork } from "./travel-network";

export type TravelEndpoint =
  | { kind: "station"; complex: string }
  | { kind: "point"; coordinate: Coordinate };

export const BREAKDOWN_KEYS = [
  "walkAccess", "entry", "wait", "ride", "transferWalk", "transferWait", "exit", "walkEgress",
] as const;
export type BreakdownKey = (typeof BREAKDOWN_KEYS)[number];
export type Breakdown = Record<BreakdownKey, number>;

export const BREAKDOWN_LABELS: Record<BreakdownKey, string> = {
  walkAccess: "보행",
  entry: "진입",
  wait: "대기",
  ride: "차내",
  transferWalk: "환승보행",
  transferWait: "환승대기",
  exit: "진출",
  walkEgress: "보행",
};

export type RouteLeg =
  | { kind: "walk"; role: "access" | "egress" | "direct"; seconds: number; meters: number; from: Coordinate; to: Coordinate; name: string }
  | {
    kind: "ride";
    service: string;
    /** 직결 운행으로 이어 탄 노선까지 포함한 계통 목록 */
    services: string[];
    fromPlatform: string;
    toPlatform: string;
    waitSeconds: number;
    seconds: number;
    stops: number;
    approxMeters: number;
    path: Coordinate[];
  }
  | { kind: "transfer"; at: string; fromPlatform: string; toPlatform: string; seconds: number; rule: TransferRule };

export interface TravelRoute {
  totalSeconds: number;
  breakdown: Breakdown;
  legs: RouteLeg[];
  originComplex?: string;
  destinationComplex?: string;
}

type EdgeKind = "access" | "egress" | "direct" | "entry" | "wait" | "ride" | "dwell" | "transfer" | "exit";

interface Edge {
  to: string;
  cost: number;
  kind: EdgeKind;
  run?: number;
  meters?: number;
  rule?: TransferRule;
}

export function haversineMeters(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.sqrt(h));
}

export function walkSeconds(straightMeters: number) {
  return (straightMeters * TRAVEL_PARAMETERS.walkDetour.value) / TRAVEL_PARAMETERS.walkSpeed.value;
}

/** 대기시간 = 배차간격 × 0.5 (도시철도 관행) */
export function waitSeconds(headwaySeconds: number) {
  return headwaySeconds * TRAVEL_PARAMETERS.waitRatio.value;
}

/** 지점에서 보행으로 닿는 역(반경·후보 수 제한) */
export function nearbyComplexes(network: TravelNetwork, coordinate: Coordinate) {
  return [...network.complexes.values()]
    .map(complex => ({ complex, meters: haversineMeters(coordinate, complex.coordinate) }))
    .filter(({ meters }) => meters <= TRAVEL_PARAMETERS.accessRadius.value)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, TRAVEL_PARAMETERS.accessCandidates.value);
}

class MinHeap {
  private items: [number, string][] = [];
  get size() { return this.items.length; }
  push(item: [number, string]) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent][0] <= items[i][0]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && items[left][0] < items[smallest][0]) smallest = left;
        if (right < items.length && items[right][0] < items[smallest][0]) smallest = right;
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * 연도별 그래프에서 총 소요시간이 가장 짧은 경로를 찾는다(다익스트라).
 * 노드: g:역 게이트 밖, p:승강장, r:구간을 막 달린 열차 안. 대기는 승강장에서 구간에 오를 때 부과한다.
 */
export function findTravelRoute(
  network: TravelNetwork,
  origin: TravelEndpoint,
  destination: TravelEndpoint,
): TravelRoute | null {
  const { entry, exit, sameStationTransfer } = TRAVEL_PARAMETERS;
  const startEdges: Edge[] = [];
  if (origin.kind === "station") {
    if (!network.complexes.has(origin.complex)) return null;
    startEdges.push({ to: `g:${origin.complex}`, cost: 0, kind: "access", meters: 0 });
  } else {
    for (const { complex, meters } of nearbyComplexes(network, origin.coordinate)) {
      startEdges.push({ to: `g:${complex.id}`, cost: walkSeconds(meters), kind: "access", meters });
    }
  }
  const finishFrom = new Map<string, Edge>();
  if (destination.kind === "station") {
    if (!network.complexes.has(destination.complex)) return null;
    finishFrom.set(`g:${destination.complex}`, { to: "end", cost: 0, kind: "egress", meters: 0 });
  } else {
    for (const { complex, meters } of nearbyComplexes(network, destination.coordinate)) {
      finishFrom.set(`g:${complex.id}`, { to: "end", cost: walkSeconds(meters), kind: "egress", meters });
    }
  }
  if (origin.kind === "point" && destination.kind === "point") {
    const meters = haversineMeters(origin.coordinate, destination.coordinate);
    if (meters <= TRAVEL_PARAMETERS.accessRadius.value) {
      startEdges.push({ to: "end", cost: walkSeconds(meters), kind: "direct", meters });
    }
  }
  if (!startEdges.length || (!finishFrom.size && !startEdges.some(edge => edge.to === "end"))) return null;

  const edgesFrom = (node: string): Edge[] => {
    if (node === "start") return startEdges;
    const finish = finishFrom.get(node);
    const [type, key] = [node.slice(0, 1), node.slice(2)];
    if (type === "g") {
      const complex = network.complexes.get(key)!;
      const edges: Edge[] = complex.platforms.map(platform => ({ to: `p:${platform}`, cost: entry.value, kind: "entry" }));
      return finish ? [...edges, finish] : edges;
    }
    if (type === "p") {
      return (network.runsFrom.get(key) ?? []).map(index => {
        const run = network.runs[index];
        return { to: `r:${index}`, cost: waitSeconds(run.headwaySeconds), kind: "wait", run: index };
      });
    }
    const index = Number(key);
    const run = network.runs[index];
    const arrived = network.platforms.get(run.to)!;
    const edges: Edge[] = (network.continuations.get(index) ?? []).map(next => ({
      to: `r:${next}#ride`,
      cost: run.dwellSeconds + network.runs[next].seconds,
      kind: "dwell",
      run: next,
    }));
    edges.push({ to: `g:${arrived.complex}`, cost: exit.value, kind: "exit" });
    const sameSeconds = network.sameStationSeconds.get(run.to);
    edges.push(sameSeconds === undefined
      ? { to: `p:${run.to}`, cost: sameStationTransfer.value, kind: "transfer", rule: "same" }
      : { to: `p:${run.to}`, cost: sameSeconds, kind: "transfer", rule: "same-csv" });
    for (const transfer of network.transfers.get(run.to) ?? []) {
      edges.push({ to: `p:${transfer.to}`, cost: transfer.seconds, kind: "transfer", rule: transfer.rule });
    }
    return edges;
  };

  // "r:N#ride"는 "r:N"과 같은 상태다. 승차 직후(wait)와 계속 타고 온 경우(dwell)를 구분해 기록만 한다.
  const normalize = (node: string) => node.replace("#ride", "");
  const distance = new Map<string, number>([["start", 0]]);
  const previous = new Map<string, { from: string; edge: Edge }>();
  const heap = new MinHeap();
  heap.push([0, "start"]);
  while (heap.size) {
    const [cost, node] = heap.pop();
    if (cost > (distance.get(node) ?? Infinity)) continue;
    if (node === "end") break;
    for (const edge of edgesFrom(node)) {
      let edgeCost = edge.cost;
      // 승차(wait) 간선은 대기 뒤 첫 구간 주행시간까지 포함한다.
      if (edge.kind === "wait") edgeCost += network.runs[edge.run!].seconds;
      const target = normalize(edge.to);
      const next = cost + edgeCost;
      if (next < (distance.get(target) ?? Infinity)) {
        distance.set(target, next);
        previous.set(target, { from: node, edge });
        heap.push([next, target]);
      }
    }
  }
  if (!previous.has("end")) return null;

  const steps: { from: string; edge: Edge }[] = [];
  for (let node = "end"; node !== "start";) {
    const step = previous.get(node)!;
    steps.unshift(step);
    node = step.from;
  }
  return summarizeRoute(network, steps, origin, destination);
}

function summarizeRoute(
  network: TravelNetwork,
  steps: { from: string; edge: Edge }[],
  origin: TravelEndpoint,
  destination: TravelEndpoint,
): TravelRoute {
  const breakdown = Object.fromEntries(BREAKDOWN_KEYS.map(key => [key, 0])) as Breakdown;
  const legs: RouteLeg[] = [];
  let rode = false;
  let pendingWait = 0;
  let originComplex: string | undefined;
  let destinationComplex: string | undefined;
  const complexCoordinate = (node: string) => network.complexes.get(node.slice(2))!.coordinate;
  const originCoordinate = origin.kind === "point" ? origin.coordinate : undefined;
  const destinationCoordinate = destination.kind === "point" ? destination.coordinate : undefined;

  for (const { from, edge } of steps) {
    switch (edge.kind) {
      case "access":
        originComplex = edge.to.slice(2);
        breakdown.walkAccess += edge.cost;
        if (originCoordinate && edge.cost > 0) legs.push({
          kind: "walk", role: "access", seconds: edge.cost, meters: edge.meters!,
          from: originCoordinate, to: complexCoordinate(edge.to), name: network.complexes.get(originComplex)!.name,
        });
        break;
      case "direct":
        breakdown.walkAccess += edge.cost;
        legs.push({ kind: "walk", role: "direct", seconds: edge.cost, meters: edge.meters!, from: originCoordinate!, to: destinationCoordinate!, name: "목적지" });
        break;
      case "egress":
        destinationComplex = from.slice(2);
        breakdown.walkEgress += edge.cost;
        if (destinationCoordinate && edge.cost > 0) legs.push({
          kind: "walk", role: "egress", seconds: edge.cost, meters: edge.meters!,
          from: complexCoordinate(from), to: destinationCoordinate, name: network.complexes.get(destinationComplex)!.name,
        });
        break;
      case "entry":
        breakdown.entry += edge.cost;
        break;
      case "exit":
        breakdown.exit += edge.cost;
        break;
      case "transfer": {
        breakdown.transferWalk += edge.cost;
        const run = network.runs[Number(from.slice(2))];
        const toPlatform = edge.to.slice(2);
        legs.push({
          kind: "transfer",
          at: network.complexes.get(network.platforms.get(toPlatform)!.complex)!.name,
          fromPlatform: run.to,
          toPlatform,
          seconds: edge.cost,
          rule: edge.rule!,
        });
        break;
      }
      case "wait": {
        const wait = edge.cost;
        if (rode) breakdown.transferWait += wait;
        else breakdown.wait += wait;
        pendingWait = wait;
        const run = network.runs[edge.run!];
        breakdown.ride += run.seconds;
        legs.push({
          kind: "ride",
          service: run.service,
          services: [run.service],
          fromPlatform: run.from,
          toPlatform: run.to,
          waitSeconds: pendingWait,
          seconds: run.seconds,
          stops: 1,
          approxMeters: run.approxMeters,
          path: [...run.path],
        });
        rode = true;
        break;
      }
      case "dwell": {
        const run = network.runs[edge.run!];
        breakdown.ride += edge.cost;
        const leg = legs.at(-1);
        if (leg?.kind === "ride") {
          leg.toPlatform = run.to;
          if (!leg.services.includes(run.service)) leg.services.push(run.service);
          leg.seconds += edge.cost;
          leg.stops += 1;
          leg.approxMeters += run.approxMeters;
          leg.path.push(...run.path.slice(1));
        }
        break;
      }
    }
  }
  // 같은 승강장에서 다시 같은 계통을 타는 0초 환승은 리스트에서 숨긴다.
  const visibleLegs = legs.filter(leg => !(leg.kind === "transfer" && leg.seconds === 0 && leg.fromPlatform === leg.toPlatform));
  const totalSeconds = BREAKDOWN_KEYS.reduce((sum, key) => sum + breakdown[key], 0);
  return { totalSeconds, breakdown, legs: visibleLegs, originComplex, destinationComplex };
}

export function formatMinutes(seconds: number) {
  return Math.round(seconds / 60);
}
