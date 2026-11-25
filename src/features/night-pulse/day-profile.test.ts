import { expect, it } from "vitest";
import { countScheduledTrains, createDayProfile } from "./day-profile";
import { parseReplayTime } from "./train-clock";
import { getSubwayServiceMidnight } from "../subway/line-2-timetable";

it("공표 평일 시간표와 익일 새벽 편성을 집계한다", () => {
  const morning = Date.parse("2026-11-23T08:20:00+09:00");
  const afterMidnight = Date.parse("2026-11-24T00:45:00+09:00");
  expect(countScheduledTrains(morning)).toBe(414);
  // 00:45 정각과 같은 분의 10초 뒤는 편성 종료 시각을 사이에 둔다.
  expect(countScheduledTrains(afterMidnight)).toBe(69);
  expect(countScheduledTrains(afterMidnight + 10_000)).toBe(68);
  const { peak, points, end } = createDayProfile(afterMidnight);
  expect(peak).toEqual({ timestamp: morning + 600_000, count: 415 });
  expect(points[1].timestamp - points[0].timestamp).toBe(600_000);
  expect(end).toBe(Date.parse("2026-11-24T01:30:00+09:00"));
});

it("공유 링크의 KST 시각을 검증하고 새벽은 전날 시간표로 해석한다", () => {
  const now = Date.parse("2026-11-24T23:00:00+09:00");
  const time = parseReplayTime("00:45", now)!;
  expect(time).toBe(Date.parse("2026-11-24T00:45:00+09:00"));
  expect(getSubwayServiceMidnight(time)).toBe(Date.parse("2026-11-23T00:00:00+09:00"));
  expect(parseReplayTime("25:99", now)).toBeNull();
  expect(parseReplayTime("", now)).toBeNull();
});
