import { describe, expect, it } from "vitest";
import { TIME_BANDS } from "./travel-network";
import { formatEndpoint, parseEndpoint, readTravelUrl, writeTravelUrl } from "./travel-url";

describe("소요시간 공유 URL", () => {
  it("역과 지점을 왕복 변환한다", () => {
    expect(parseEndpoint("진접")).toEqual({ kind: "station", complex: "진접" });
    const point = parseEndpoint("@37.65123_127.12345")!;
    expect(point).toEqual({ kind: "point", coordinate: [127.12345, 37.65123] });
    expect(formatEndpoint(point)).toBe("@37.65123_127.12345");
    expect(parseEndpoint("@abc_1")).toBeNull();
  });

  it("od·year·t를 읽고 쓴다", () => {
    const state = readTravelUrl("?od=%EC%A7%84%EC%A0%91,%EC%84%9C%EC%9A%B8%EC%97%AD&year=2040&t=day13");
    expect(state).toMatchObject({
      active: true,
      origin: { kind: "station", complex: "진접" },
      destination: { kind: "station", complex: "서울역" },
      year: 2040,
      band: TIME_BANDS[1],
    });
    const href = writeTravelUrl("http://x.test/?pulse=1", { active: true, origin: state.origin, destination: state.destination, year: 2030, band: TIME_BANDS[0] });
    const url = new URL(href);
    expect(url.searchParams.get("od")).toBe("진접,서울역");
    expect(url.searchParams.get("year")).toBe("2030");
    expect(url.searchParams.get("pulse")).toBe("1");
    expect(url.searchParams.has("t")).toBe(false);
    expect(new URL(writeTravelUrl(href, { active: false, origin: null, destination: null, year: 2026, band: TIME_BANDS[0] })).search).toBe("?pulse=1");
  });
});
