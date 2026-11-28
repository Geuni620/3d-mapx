import { describe, expect, it } from "vitest";
import { getPlatformSide } from "./line-2-platform-side";
import timetable from "./data/line-2-timetable.json";

describe("2호선 본선 승강장 문 방향", () => {
  it("공사의 왕십리 내선 안내방송과 아현 승강장안내, 삼성·선릉의 방향 표기를 따른다", () => {
    expect(getPlatformSide("왕십리", "inner-loop")).toBe("right");
    for (const direction of ["inner-loop", "outer-loop"] as const) {
      expect(getPlatformSide("아현", direction)).toBe("right");
      expect(getPlatformSide("삼성역", direction)).toBe("left");
      expect(getPlatformSide("선릉", direction)).toBe("right");
      expect(getPlatformSide("서울대입구(관악구청)", direction)).toBe("left");
    }
  });

  it("시간표의 43개 역을 대조하고, 분기역·지선·미확인 역은 열림 방향을 정하지 않는다", () => {
    for (const direction of ["inner-loop", "outer-loop"] as const) {
      const unknown = timetable.stations[direction].filter(
        (station) => getPlatformSide(station, direction) === null,
      );
      expect(timetable.stations[direction]).toHaveLength(43);
      expect(unknown.sort()).toEqual(["성수", "신도림"]);
      expect(getPlatformSide("용답", direction)).toBeNull();
      expect(getPlatformSide("", direction)).toBeNull();
    }
  });
});
