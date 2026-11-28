import { describe, expect, it } from "vitest";
import line2Timetable from "../subway/data/line-2-timetable.json";
import { BASE_GRAPH, FUTURE_LINES } from "./travel-time-data";

const stationIndex = (id: string) => BASE_GRAPH.stations.findIndex(station => station.id === id);
const findRun = (from: string, to: string) =>
  BASE_GRAPH.runs.find(([, a, b]) => a === stationIndex(from) && b === stationIndex(to));

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

describe("역→역 소요시간 그래프 생성 규칙", () => {
  it("1~8호선 OSM 역을 모두 담고 2호선 본선 순환을 포함한다", () => {
    expect(new Set(BASE_GRAPH.stations.map(station => station.line))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(findRun("2:시청", "2:충정로")).toBeDefined();
    expect(findRun("2:을지로입구", "2:시청")).toBeDefined();
    expect(findRun("4:오남", "4:진접")).toBeDefined();
    expect(findRun("8:별내", "8:다산")).toBeDefined();
  });

  it("차내시간은 공표 시간표 역간 시간의 중앙값이다", () => {
    // 2호선 외선 시청→충정로 표본을 시간표에서 직접 다시 모은다.
    const names = line2Timetable.stations["outer-loop"];
    const samples: number[] = [];
    for (const [, , pattern] of Object.values(line2Timetable.days).flat() as [string, number, number][]) {
      const [direction, first, ...intervals] = line2Timetable.patterns[pattern] as [string, number, ...number[]];
      if (direction !== "outer-loop") continue;
      for (let i = 0; i < intervals.length; i += 2) {
        const from = names[(first + i / 2) % names.length];
        const to = names[(first + i / 2 + 1) % names.length];
        if (from === "시청" && to === "충정로") samples.push(intervals[i]);
      }
    }
    const run = findRun("2:시청", "2:충정로")!;
    expect(samples.length).toBeGreaterThan(100);
    expect(run[3]).toBe(Math.round(median(samples)));
    expect(run[5]).toBe(samples.length);
  });

  it("배차 프로필은 시간대별 출발 열차 수이고 출근시간에 운행이 있다", () => {
    const [, , , , , , , , profiles] = findRun("4:오남", "4:진접")!;
    const weekday = BASE_GRAPH.profiles[profiles[0]];
    expect(weekday).toHaveLength(BASE_GRAPH.hours[1] - BASE_GRAPH.hours[0]);
    expect(weekday[8 - BASE_GRAPH.hours[0]]).toBeGreaterThan(0);
    expect(BASE_GRAPH.profiles.flat().every(count => Number.isInteger(count) && count >= 0)).toBe(true);
  });

  it("환승은 같은 역(이름·별칭) 안의 다른 호선끼리만 잇는다", () => {
    for (const [from, to] of BASE_GRAPH.transfers) {
      const a = BASE_GRAPH.stations[from];
      const b = BASE_GRAPH.stations[to];
      expect(a.complex).toBe(b.complex);
      expect(a.line).not.toBe(b.line);
    }
    expect(BASE_GRAPH.stations.find(station => station.id === "4:총신대입구")?.complex).toBe("이수");
  });

  it("환승거리는 서울교통공사 CSV에서 읽고, 없는 쌍만 가정값으로 남긴다", () => {
    const transfer = (from: string, to: string) =>
      BASE_GRAPH.transfers.find(([a, b]) => a === stationIndex(from) && b === stationIndex(to));
    expect(transfer("1:서울역", "4:서울역")?.slice(2)).toEqual([159, "csv"]);
    // 1호선 신도림→2호선은 CSV에 2호선→1호선 방향만 있다.
    expect(transfer("1:신도림", "2:신도림")?.slice(2)).toEqual([81, "csv-reverse"]);
    // 코레일 운영 금정역은 서울교통공사 자료에 없다.
    expect(transfer("1:금정", "4:금정")?.slice(2)).toEqual([null, null]);
    expect(BASE_GRAPH.sameLineTransfers).toContainEqual([stationIndex("2:성수"), 23]);
  });
});

describe("장래 노선 데이터", () => {
  it("착공 노선만 반영 대상이고 출처를 갖는다", () => {
    for (const line of FUTURE_LINES.lines) {
      expect(line.included).toBe(line.stage === "착공");
      expect(line.sources.length).toBeGreaterThan(0);
    }
  });

  it("경로 계산 역은 좌표가 있고 역간 거리가 양수다", () => {
    for (const line of FUTURE_LINES.lines) {
      if (!line.routing.enabled) continue;
      expect(line.routing.segments.length).toBe(line.routing.order.length - 1);
      for (const segment of line.routing.segments) {
        expect(segment.meters).toBeGreaterThan(0);
        expect(segment.approxMeters).toBeLessThanOrEqual(segment.meters + 1);
      }
    }
    const gtxb = FUTURE_LINES.lines.find(line => line.id === "GTXB")!;
    expect(gtxb.routing.enabled && gtxb.routing.excluded.map(item => item.reason)).toEqual(["좌표 미확보"]);
  });
});
