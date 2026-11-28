import { describe, expect, it } from "vitest";
import { FUTURE_LINES, type FutureLine } from "./travel-time-data";
import { describeOpening, isLineOpen, parseTravelYear } from "./travel-years";

const line = (patch: Partial<Pick<FutureLine, "included">> & { opening: Partial<FutureLine["opening"]> }) => ({
  included: patch.included ?? true,
  opening: { year: null, kind: "", confidence: "B" as const, ...patch.opening },
});
const byId = (id: string) => FUTURE_LINES.lines.find(item => item.id === id)!;

describe("연도별 노선 반영 기준", () => {
  it("2026은 현재 기준망 그대로다", () => {
    expect(FUTURE_LINES.lines.some(item => isLineOpen(item, 2026))).toBe(false);
  });

  it("2030은 목표·보도 연도가 2030 이하인 착공 노선만 넣는다", () => {
    expect(isLineOpen(line({ opening: { year: 2028 } }), 2030)).toBe(true);
    expect(isLineOpen(line({ opening: { reportedYear: 2029, confidence: "C" } }), 2030)).toBe(true);
    expect(isLineOpen(line({ opening: { year: 2031 } }), 2030)).toBe(false);
    expect(isLineOpen(line({ opening: { confidence: "미정" } }), 2030)).toBe(false);
  });

  it("2040은 반영 대상 전부, 개통연도 미정도 넣는다", () => {
    expect(isLineOpen(line({ opening: { confidence: "미정" } }), 2040)).toBe(true);
    expect(isLineOpen(line({ opening: { year: 2031 } }), 2040)).toBe(true);
  });

  it("기본계획·예타 단계는 어느 해에도 반영하지 않는다", () => {
    const unapproved = FUTURE_LINES.lines.filter(item => item.stage !== "착공");
    expect(unapproved.map(item => item.id).sort()).toEqual(["BYEOLNAE_EXT", "GHN", "GOYANG_EP", "SONGPA_HANAM", "WISIN"]);
    for (const item of unapproved) {
      expect(item.included).toBe(false);
      expect(item.routing.enabled).toBe(false);
      expect(isLineOpen(item, 2030)).toBe(false);
      expect(isLineOpen(item, 2040)).toBe(false);
    }
    expect(isLineOpen(line({ included: false, opening: { year: 2028 } }), 2040)).toBe(false);
  });

  it("GTX-B는 2031 잠정이라 2040에만, 동북선은 2030부터 들어간다", () => {
    expect([isLineOpen(byId("GTXB"), 2030), isLineOpen(byId("GTXB"), 2040)]).toEqual([false, true]);
    expect([isLineOpen(byId("DONGBUK"), 2030), isLineOpen(byId("DONGBUK"), 2040)]).toEqual([true, true]);
  });

  it("보도 연도와 미정은 배지로 구분한다", () => {
    expect(describeOpening(byId("GTXB")).badge).toBe("목표");
    expect(describeOpening(byId("GTXC"))).toEqual({ label: "보도 2031", badge: "보도 기준" });
    expect(describeOpening(byId("WIRYE_TRAM")).badge).toBe("개통연도 미정");
  });

  it("URL 연도는 슬라이더 눈금만 받는다", () => {
    expect(parseTravelYear("2040")).toBe(2040);
    expect(parseTravelYear("2035")).toBeNull();
    expect(parseTravelYear(null)).toBeNull();
  });
});
