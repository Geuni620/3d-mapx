import { describe, expect, it } from "vitest";
import { illumination, mixOk, presetEpoch, solarPosition, slerp } from "./solar-palette";

describe("당산철교의 태양과 시각 테마", () => {
  it("남중은 남쪽, 일몰은 서남서이며 같은 고도의 아침·저녁 색이 다르다", () => {
    const noon = solarPosition(presetEpoch("midday")),
      sunset = solarPosition(presetEpoch("sunset"));
    expect(noon.elevation).toBeCloseTo(32.5, 0);
    expect(Math.abs(noon.azimuth - 180)).toBeLessThan(1);
    expect(sunset.azimuth).toBeGreaterThan(240);
    expect(sunset.elevation).toBeGreaterThan(0);
    expect(sunset.elevation).toBeLessThan(0.3);
    expect(illumination(presetEpoch("dawn")).horizon).not.toBe(
      illumination(presetEpoch("bluehour")).horizon,
    );
  });
  it("같은 한국 시각에도 여름과 겨울의 일몰이 다르다", () => {
    const at = (month: string) =>
      solarPosition(Date.parse(`2026-${month}-21T18:00:00+09:00`)).elevation;
    expect(at("06")).toBeGreaterThan(10);
    expect(at("12")).toBeLessThan(-6);
  });
  it("합정 북쪽 터널의 조명은 시각과 무관하다", () => {
    const a = illumination(presetEpoch("midday"), "midday", true),
      b = illumination(presetEpoch("night"), "night", true);
    expect(a.power).toBe(0);
    expect(a.cabin).toBe(1);
    expect(a.land).toBe("#141210");
    expect({ ...a, phase: b.phase }).toEqual(b);
  });
  it("OKLab 그라데이션의 양 끝점과 slerp 방향 길이를 보존한다", () => {
    expect(mixOk("#103254", "#deba87", 0)).toBe("#103254");
    expect(mixOk("#103254", "#deba87", 1)).toBe("#deba87");
    expect(Math.hypot(...slerp([0, 1, 0], [1, 0, 0], 0.5))).toBeCloseTo(1, 7);
  });
});
