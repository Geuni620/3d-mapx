import { expect, it } from "vitest";
import { countScheduledTrains, getReplayProfile } from "./day-profile";
import { createTrainClock, formatSeoulClock, parseReplayTime, REPLAY_DAYS, REPLAY_END } from "./train-clock";

it("요일별 공표 시간표에서 최대 동시 운행 수를 집계한다", () => {
  const [weekday, saturday, holiday] = REPLAY_DAYS.map(day => getReplayProfile(day.reference));
  expect([weekday.peak.count, saturday.peak.count, holiday.peak.count]).toEqual([415, 261, 261]);
  expect(formatSeoulClock(weekday.peak.timestamp)).toBe("08:30");
  expect(countScheduledTrains(Date.parse("2026-11-23T08:20:00+09:00"))).toBe(414);
});

it("배속과 일시정지를 같은 시각에 적용하고 자정 이후에는 영업일을 보존한다", () => {
  let wall = Date.parse("2026-11-25T14:00:00+09:00");
  const clock = createTrainClock({
    readWall: () => wall, search: new URLSearchParams("at=23:59&day=2026-11-23"), reduced: true, replaceTime() {},
  });
  expect(clock.getSnapshot().playing).toBe(false);
  clock.setRate(60);
  clock.togglePlaying();
  wall += 2_000;
  expect(formatSeoulClock(clock.now())).toBe("00:01");
  clock.togglePlaying();
  wall += 2_000;
  expect(formatSeoulClock(clock.now())).toBe("00:01");
  expect(clock.getSnapshot().day).toBe(REPLAY_DAYS[0].reference);
  clock.seek(REPLAY_END);
  expect(formatSeoulClock(clock.now())).toBe("01:30");
  expect(parseReplayTime("01:30", wall, "2026-11-23")).toBe(clock.now());
  clock.live();
  expect(clock.now()).toBe(wall);
});
