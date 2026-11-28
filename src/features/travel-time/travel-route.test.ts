import { describe, expect, it } from "vitest";
import { BASE_GRAPH, FUTURE_LINES, type BaseGraph } from "./travel-time-data";
import { REGIONAL_LINES, REGIONAL_TIMINGS } from "./travel-regional";
import { buildTravelNetwork, TIME_BANDS } from "./travel-network";
import { BREAKDOWN_KEYS, findTravelRoute, waitSeconds, type TravelEndpoint } from "./travel-route";
import { TRAVEL_PARAMETERS } from "./travel-time-parameters";
import { TRAVEL_PRESETS } from "./travel-time-format";
import { TRAVEL_YEARS } from "./travel-years";

const band = TIME_BANDS[0];
const hourIndex = band.hour - 4;
const station = (complex: string): TravelEndpoint => ({ kind: "station", complex });

// 시간당 trainsPerHour대가 출발하는 배차 프로필(04~25시)
function profile(trainsPerHour: number) {
  return Array.from({ length: 22 }, (_, i) => (i === hourIndex ? trainsPerHour : 0));
}

/** 가–나–다(1호선), 나–라(2호선) 장난감 그래프. 나는 두 호선 환승역이다. */
function toyGraph({ continuation = true, transferMeters = 120 as number | null } = {}): BaseGraph {
  const coordinate = (lon: number): [number, number] => [127 + lon / 100, 37.5];
  return {
    edition: "toy",
    source: "toy",
    transferSource: null,
    hours: [4, 26],
    days: ["DAY", "SAT", "END"],
    stations: [
      { id: "1:가", name: "가", complex: "가", line: 1, coordinate: coordinate(0) },
      { id: "1:나", name: "나", complex: "나", line: 1, coordinate: coordinate(1) },
      { id: "1:다", name: "다", complex: "다", line: 1, coordinate: coordinate(2) },
      { id: "2:나", name: "나", complex: "나", line: 2, coordinate: coordinate(1) },
      { id: "2:라", name: "라", complex: "라", line: 2, coordinate: coordinate(1.5) },
    ],
    // [line, from, to, seconds, dwell, samples, segment, reversed, profiles]
    runs: [
      [1, 0, 1, 120, 30, 1, 0, 0, [0, 0, 0]],
      [1, 1, 2, 300, 30, 1, 1, 0, [0, 0, 0]],
      [2, 3, 4, 90, 30, 1, 2, 0, [1, 1, 1]],
    ],
    profiles: [profile(12), profile(6)],
    continuations: continuation ? [[0, 1, 2]] : [],
    transfers: [[1, 3, transferMeters, transferMeters === null ? null : "csv"], [3, 1, transferMeters, transferMeters === null ? null : "csv"]],
    sameLineTransfers: [],
    externalTransfers: [],
    segments: [[coordinate(0), coordinate(1)], [coordinate(1), coordinate(2)], [coordinate(1), coordinate(1.5)]],
    segmentMeters: [880, 880, 440],
  };
}

describe("다익스트라 경로 탐색", () => {
  it("대기시간은 배차간격의 절반이다", () => {
    expect(TRAVEL_PARAMETERS.waitRatio.value).toBe(0.5);
    expect(waitSeconds(300)).toBe(150);
    expect(waitSeconds(600)).toBe(300);
  });

  it("환승을 포함한 경로를 찾고 시간 분해 합이 총시간과 같다", () => {
    const network = buildTravelNetwork(toyGraph(), [], 2026, band);
    const route = findTravelRoute(network, station("가"), station("라"))!;
    expect(route.legs.map(leg => leg.kind)).toEqual(["ride", "transfer", "ride"]);
    expect(route.breakdown).toEqual({
      walkAccess: 0,
      entry: TRAVEL_PARAMETERS.entry.value,
      wait: waitSeconds(3600 / 12),
      ride: 120 + 90,
      transferWalk: 120 / TRAVEL_PARAMETERS.walkSpeed.value,
      transferWait: waitSeconds(3600 / 6),
      exit: TRAVEL_PARAMETERS.exit.value,
      walkEgress: 0,
    });
    const sum = BREAKDOWN_KEYS.reduce((total, key) => total + route.breakdown[key], 0);
    expect(route.totalSeconds).toBeCloseTo(sum, 6);
    expect(route.totalSeconds).toBeCloseTo(180 + 150 + 120 + 100 + 300 + 90 + 60, 6);
  });

  it("환승거리를 모르면 환승 가정값을 쓴다", () => {
    const network = buildTravelNetwork(toyGraph({ transferMeters: null }), [], 2026, band);
    const route = findTravelRoute(network, station("가"), station("라"))!;
    expect(route.breakdown.transferWalk).toBe(TRAVEL_PARAMETERS.transferFallback.value);
  });

  it("같은 열차로 이어지는 구간은 정차시간만, 이어지지 않으면 다시 기다린다", () => {
    const through = findTravelRoute(buildTravelNetwork(toyGraph(), [], 2026, band), station("가"), station("다"))!;
    expect(through.breakdown.ride).toBe(120 + 30 + 300);
    expect(through.breakdown.transferWait).toBe(0);

    const broken = findTravelRoute(buildTravelNetwork(toyGraph({ continuation: false }), [], 2026, band), station("가"), station("다"))!;
    expect(broken.breakdown.ride).toBe(120 + 300);
    expect(broken.breakdown.transferWait).toBe(waitSeconds(300));
  });

  it("보행 접근 반경 밖 지점은 경로를 만들지 않는다", () => {
    const network = buildTravelNetwork(toyGraph(), [], 2026, band);
    const far: TravelEndpoint = { kind: "point", coordinate: [127.2, 37.5] };
    expect(findTravelRoute(network, far, station("라"))).toBeNull();
    const near: TravelEndpoint = { kind: "point", coordinate: [127.0, 37.505] };
    const route = findTravelRoute(network, near, station("라"))!;
    expect(route.breakdown.walkAccess).toBeGreaterThan(0);
    expect(route.legs[0].kind).toBe("walk");
  });
});

describe("실데이터 연도별 경로", () => {
  const networks = TRAVEL_YEARS.map(year => buildTravelNetwork(BASE_GRAPH, FUTURE_LINES.lines, year, band, REGIONAL_LINES, REGIONAL_TIMINGS));

  it("프리셋 구간은 모든 연도에서 계산되고 분해 합이 총시간과 같다", () => {
    for (const network of networks) {
      for (const preset of TRAVEL_PRESETS) {
        const route = findTravelRoute(network, station(preset.origin), station(preset.destination));
        expect(route, `${network.year} ${preset.label}`).not.toBeNull();
        const sum = BREAKDOWN_KEYS.reduce((total, key) => total + route!.breakdown[key], 0);
        expect(route!.totalSeconds).toBeCloseTo(sum, 6);
      }
    }
  });

  it("진접→서울역은 확정 사업 기준으로 연도가 바뀌어도 4호선 그대로다", () => {
    const totals = networks.map(network => findTravelRoute(network, station("진접"), station("서울역"))!);
    expect(new Set(totals.map(route => Math.round(route.totalSeconds))).size).toBe(1);
    expect(totals[0].legs.filter(leg => leg.kind === "ride").map(leg => leg.kind === "ride" && leg.service)).toEqual(["4"]);
  });

  it("환승은 서울교통공사 환승거리 ÷ 1.2m/s, 자료가 없는 장래 환승은 150초 가정값이다", () => {
    const onam = findTravelRoute(networks[0], station("오남"), station("광화문"))!;
    const ddp = onam.legs.find(leg => leg.kind === "transfer" && leg.at === "동대문역사문화공원");
    expect(ddp).toMatchObject({ rule: "csv", seconds: 107 / TRAVEL_PARAMETERS.walkSpeed.value });
    // 4호선 → GTX-A(이미 운행 중인 서울역)는 CSV 실측 264m, 반대 방향은 같은 값을 쓴다.
    expect(networks[0].transfers.get("4:서울역")!.find(transfer => transfer.to === "GTXA:서울역"))
      .toMatchObject({ rule: "csv", seconds: 264 / TRAVEL_PARAMETERS.walkSpeed.value });
    expect(networks[0].transfers.get("GTXA:서울역")!.find(transfer => transfer.to === "4:서울역"))
      .toMatchObject({ rule: "csv-reverse" });
    const gtxc = networks[2].transfers.get("2:삼성")!.find(transfer => transfer.to === "GTXC:삼성");
    expect(gtxc).toMatchObject({ rule: "future", seconds: TRAVEL_PARAMETERS.futureTransfer.value });
  });

  it("경의중앙선 신촌은 2호선 신촌과 같은 역으로 묶지 않는다", () => {
    expect(networks[0].platforms.get("GJ:신촌")!.complex).not.toBe("신촌");
    expect(networks[0].platforms.get("GJ:서울역")!.complex).toBe("서울역");
  });

  it("GTX-A 삼성 연결은 기존 GTX-A 운행 구간과 갈아타지 않고 이어진다", () => {
    const route = findTravelRoute(networks[1], station("운정중앙"), station("동탄"))!;
    const rides = route.legs.filter(leg => leg.kind === "ride");
    expect(rides).toHaveLength(1);
    expect(rides[0].kind === "ride" && rides[0].services).toEqual(["GTXA", "GTXA_LINK"]);
    expect(findTravelRoute(networks[0], station("운정중앙"), station("동탄"))!.totalSeconds).toBeGreaterThan(route.totalSeconds);
  });

  it("별내→상봉은 2026 경춘선, 2040 GTX-B로 더 짧아진다", () => {
    const [now, , later] = networks.map(network => findTravelRoute(network, station("별내"), station("상봉"))!);
    expect(now.legs.filter(leg => leg.kind === "ride").map(leg => leg.kind === "ride" && leg.service)).toEqual(["GC"]);
    expect(later.legs.some(leg => leg.kind === "ride" && leg.service === "GTXB")).toBe(true);
    expect(later.totalSeconds).toBeLessThan(now.totalSeconds);
  });
});
