import { describe, expect, it } from "vitest";
import { getSeoulDaylightTheme } from "./seoul-daylight";

describe("서울 일출·일몰 테마", () => {
  it.each([
    ["2026-06-21T06:30:00+09:00", "light"],
    ["2026-12-21T06:30:00+09:00", "dark"],
    ["2026-06-21T19:00:00+09:00", "light"],
    ["2026-12-21T19:00:00+09:00", "dark"],
  ])("한국 시각 %s의 태양 고도를 반영한다", (time, expected) => {
    expect(getSeoulDaylightTheme(Date.parse(time))).toBe(expected);
  });

  it("해외 사용자의 시각 표기가 달라도 같은 순간에 같은 값을 쓴다", () => {
    expect(getSeoulDaylightTheme(Date.parse("2026-12-21T03:00:00Z"))).toBe("light");
    expect(getSeoulDaylightTheme(Date.parse("2026-12-20T19:00:00-08:00"))).toBe("light");
  });
});
