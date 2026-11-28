import { getScheduledFleet, getSubwayServiceMidnight } from "../subway/line-2-timetable";
import { SUBWAY_LINES } from "../subway/subway-constants";
import { getActiveSubwayTrips } from "../subway/subway-timetable";

export const countScheduledTrains = (time: number) =>
  getActiveSubwayTrips(time, SUBWAY_LINES).length + getScheduledFleet(time).length;

export function createDayProfile(time: number) {
  const midnight = getSubwayServiceMidnight(time);
  const points = [];
  for (let minute = 300; minute <= 1530; minute += 10) {
    const timestamp = midnight + minute * 60_000;
    points.push({ timestamp, count: countScheduledTrains(timestamp) });
  }
  const peak = points.reduce((a, b) => a.count >= b.count ? a : b);
  return { points, peak, start: points[0].timestamp, end: midnight + 1530 * 60_000 };
}

const replayProfiles = new Map<number, ReturnType<typeof createDayProfile>>();

export function getReplayProfile(referenceDay: number) {
  let profile = replayProfiles.get(referenceDay);
  if (!profile) {
    profile = createDayProfile(referenceDay + 5 * 3_600_000);
    replayProfiles.set(referenceDay, profile);
  }
  return profile;
}
