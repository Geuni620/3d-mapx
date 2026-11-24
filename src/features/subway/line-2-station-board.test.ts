import { expect, it } from "vitest";
import { getLine2StationBoard } from "./line-2-station-board";
import { getLine2StationDirections } from "./line-2-timetable";
import { formatSeoulClock } from "../night-pulse/train-clock";

it("평일 합정 21시 02분의 방향별 다음 편성을 공표 정차 패턴 순서로 보여준다", () => {
  const time = Date.parse("2026-11-23T21:02:00+09:00");
  const board = getLine2StationBoard("합정", time);
  const rows = (entries: typeof board["inner-loop"]) =>
    entries.map(entry => [entry.train.number, formatSeoulClock(entry.scheduledMs, true)]);
  expect(rows(board["inner-loop"])).toEqual([["2436", "21:08:00"], ["2438", "21:12:00"], ["2440", "21:18:00"]]);
  expect(rows(board["outer-loop"])).toEqual([["2457", "21:05:30"], ["2459", "21:10:30"], ["2461", "21:14:30"]]);
  expect(getLine2StationDirections("합정")).toEqual({ "inner-loop": "홍대입구", "outer-loop": "당산" });
});

it("같은 열차의 접근과 정차를 구별하고 출발 예정 편성은 지도에 강조하지 않는다", () => {
  const time = Date.parse("2026-11-23T21:05:20+09:00");
  expect(getLine2StationBoard("합정", time)["outer-loop"][0]).toMatchObject({ train: { number: "2457" }, approaching: true, dwelling: false });
  expect(getLine2StationBoard("합정", time + 15_000)["outer-loop"][0]).toMatchObject({ train: { number: "2457" }, approaching: false, dwelling: true });
  const early = getLine2StationBoard("합정", Date.parse("2026-11-23T05:00:00+09:00"));
  expect([...early["inner-loop"], ...early["outer-loop"]].every(entry => !entry.approaching)).toBe(true);
});
