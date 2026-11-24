import { getScheduledFleet, getSubwayServiceMidnight } from "../subway/line-2-timetable";
import { SUBWAY_LINES } from "../subway/subway-constants";
import { getActiveSubwayTrips, getSubwayServiceSecond, sampleSubwayTrip } from "../subway/subway-timetable";

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

export function readPulseStats(time: number) {
  const perLine = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const seconds = getSubwayServiceSecond(time);
  const trips = getActiveSubwayTrips(time, SUBWAY_LINES);
  const main = getScheduledFleet(time);
  let dwelling = 0;
  for (const trip of trips) {
    perLine[trip[0]]++;
    if (sampleSubwayTrip(trip, seconds)?.dwelling) dwelling++;
  }
  perLine[2] += main.length;
  for (const train of main) {
    if (train.getMotion(time).phase === "dwelling") dwelling++;
  }
  return { time, perLine, total: trips.length + main.length, dwelling };
}
