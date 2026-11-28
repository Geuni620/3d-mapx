import { describe, expect, it } from "vitest";
import { REGIONAL_LINES, REGIONAL_ORDER, REGIONAL_TIMINGS } from "./travel-regional";

describe("수도권 광역·도시철도 기준망 데이터", () => {
  it("범위의 최소 노선을 모두 담는다", () => {
    const ids = REGIONAL_LINES.map(line => line.id);
    for (const id of ["L9", "GJ", "GC", "SB", "GG", "SH", "AREX", "SBD", "GTXA"]) expect(ids).toContain(id);
    expect(ids).toEqual(REGIONAL_ORDER.filter(id => ids.includes(id)));
  });

  it("노선마다 OSM relation id와 수집일을 기록하고, 역간 거리가 양수다", () => {
    for (const line of REGIONAL_LINES) {
      expect(line.osm.routeMasterIds.length).toBeGreaterThan(0);
      expect(line.osm.routeRelationIds.length).toBeGreaterThan(0);
      expect(line.osm.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(line.osm.license).toContain("ODbL");
      expect(line.stations.length).toBeGreaterThanOrEqual(2);
      const stationIds = new Set(line.stations.map(station => station.id));
      for (const run of line.runs) {
        expect(run.meters).toBeGreaterThan(0);
        expect(stationIds.has(run.from) && stationIds.has(run.to)).toBe(true);
      }
      for (const service of line.services) expect(service.stops.every(stop => stationIds.has(stop))).toBe(true);
    }
  });

  it("역 이름은 기존 1~8호선 이름과 같은 규칙으로 정규화한다", () => {
    const names = (id: string) => REGIONAL_LINES.find(line => line.id === id)!.stations.map(station => station.name);
    expect(names("GJ")).toContain("서울역");
    expect(names("GC")).toEqual(expect.arrayContaining(["상봉", "별내", "평내호평", "마석"]));
    expect(names("GTXA")).toEqual(expect.arrayContaining(["수서", "동탄", "운정중앙"]));
  });
});

describe("광역·도시철도 공표 시간표", () => {
  it("GTX-A·에버라인을 뺀 노선은 시간표가 있고 역이 모두 OSM 역에 붙는다", () => {
    const withoutTimetable = REGIONAL_LINES.filter(line => !REGIONAL_TIMINGS[line.id]).map(line => line.id).sort();
    expect(withoutTimetable).toEqual(["EVER", "GTXA"]);
    for (const [id, timing] of Object.entries(REGIONAL_TIMINGS)) {
      const stations = new Set(REGIONAL_LINES.find(line => line.id === id)!.stations.map(station => station.id));
      expect(timing.runs.every(([from, to]) => stations.has(from) && stations.has(to)), id).toBe(true);
      expect(timing.source.files[0].sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // 공항철도 디지털미디어시티는 OSM 계통에 정차 노드가 없어 앞뒤 구간에 합쳐진다.
    expect(Object.values(REGIONAL_TIMINGS).flatMap(timing => timing.unmatchedStations)).toEqual(["디지털미디어시티"]);
  });

  it("신분당선 신사→광교 차내시간은 공표 시간표의 역간 시간 합이다", () => {
    const timing = REGIONAL_TIMINGS.SBD;
    const runs = new Map(timing.runs.map(run => [`${run[0]}>${run[1]}`, run]));
    const stops = REGIONAL_LINES.find(line => line.id === "SBD")!.services.find(service => service.stops[0] === "SBD:신사")!.stops;
    let seconds = 0;
    stops.slice(1).forEach((stop, i) => {
      const run = runs.get(`${stops[i]}>${stop}`)!;
      seconds += run[2] + (i < stops.length - 2 ? run[3] : 0);
    });
    expect(seconds / 60).toBeGreaterThan(38);
    expect(seconds / 60).toBeLessThan(46);
  });
});
