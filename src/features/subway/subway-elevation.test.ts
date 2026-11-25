import { describe, expect, it } from "vitest";
import { bridgeCenter } from "../dangsan/bridge-alignment";
import { getScheduledFleet } from "./line-2-timetable";
import { SEOUL_SUBWAY_OSM_NETWORK, type SubwayCoordinate } from "./osm-subway-network";
import { SUBWAY_LINES, type SubwayLineNumber } from "./subway-constants";
import { createElevatedSubwayRoute, elevateSubwayPath, getSubwayStationAltitude } from "./subway-elevation";
import { getActiveSubwayTrips, getSubwayServiceSecond, sampleSubwayTrip } from "./subway-timetable";

const hapjeongCrossing: SubwayCoordinate = [126.9135143, 37.5492270];
const rushHour = Date.parse("2026-11-23T08:30:00+09:00");

function stationAltitude(line: SubwayLineNumber, name: string) {
  const station = SEOUL_SUBWAY_OSM_NETWORK.stations.find(s => s.lineNumber === line && s.name === name)!;
  return getSubwayStationAltitude(station.id);
}

describe("서울 지하철 선로의 상대 고도", () => {
  it("합정역 지하 두 선로가 동일한 지표면을 기준으로 13.68m 높이 차이를 유지한다", () => {
    expect(stationAltitude(2, "합정")).toBeCloseTo(-14.2);
    expect(stationAltitude(6, "합정")).toBeCloseTo(-27.88);
    const altitudes = ([2, 6] as const).map(line => {
      const path = SEOUL_SUBWAY_OSM_NETWORK.routes.find(route => route.lineNumber === line)!
        .pathSegments.reduce((longest, segment) => segment.length > longest.length ? segment : longest);
      const route = createElevatedSubwayRoute(line, path, line === 2)!;
      return route.elevationAt(route.project(hapjeongCrossing).distanceMeters);
    });
    expect(altitudes[0]).toBeLessThan(0);
    expect(altitudes[0] - altitudes[1]).toBeGreaterThan(12);
  });

  it("2호선 본선과 6호선 운행 경로 모두 합정에서 서로 다른 높이를 사용한다", () => {
    const line2 = getScheduledFleet(rushHour)[0].sampler;
    const trip = getActiveSubwayTrips(rushHour, [6]).find(trip => {
      const train = sampleSubwayTrip(trip, getSubwayServiceSecond(rushHour));
      return (train?.sampler.project(hapjeongCrossing).offsetMeters ?? Infinity) < 15;
    })!;
    const line6 = sampleSubwayTrip(trip, getSubwayServiceSecond(rushHour))!.sampler;
    const altitude = line2.elevationAt!(line2.project(hapjeongCrossing).distanceMeters);
    expect(altitude).toBeLessThan(0);
    expect(altitude - line6.elevationAt!(line6.project(hapjeongCrossing).distanceMeters)).toBeGreaterThan(12);
  });

  it("당산철교에는 고가 높이를 적용하고 순환 경계의 고도는 연속이다", () => {
    const sampler = getScheduledFleet(rushHour)[0].sampler;
    expect(stationAltitude(2, "당산")).toBeCloseTo(10.17);
    expect(sampler.elevationAt!(sampler.project(bridgeCenter).distanceMeters)).toBeGreaterThan(15);
    expect(sampler.elevationAt!(sampler.totalDistanceMeters + 5)).toBeCloseTo(sampler.elevationAt!(5));
  });

  it("1~8호선 경로에 유한한 높이가 들어가며 자료 밖 1호선 구간은 0m에 이어진다", () => {
    expect(stationAltitude(8, "암사역사공원")).toBeCloseTo(-18.38);
    for (const line of SUBWAY_LINES) {
      const route = SEOUL_SUBWAY_OSM_NETWORK.routes.find(route => route.lineNumber === line)!;
      const coordinates = route.pathSegments.flatMap(path => elevateSubwayPath(line, path));
      expect(coordinates.every(point => point.every(Number.isFinite))).toBe(true);
      expect(coordinates.some(([, , z]) => z < 0)).toBe(true);
    }
    const station = SEOUL_SUBWAY_OSM_NETWORK.stations.find(s => s.lineNumber === 1 && s.name === "수원")!;
    const path = SEOUL_SUBWAY_OSM_NETWORK.routes[0].pathSegments.find(path =>
      path.some(([lng, lat]) => lng === station.longitude && lat === station.latitude))!;
    const sampler = createElevatedSubwayRoute(1, path, false)!;
    expect(sampler.elevationAt(sampler.project([station.longitude, station.latitude]).distanceMeters)).toBe(0);
  });
});
