import type { ScheduledTrain } from "./line-2-timetable";

const labels = { accelerating: "가속", cruising: "정속", braking: "감속", dwelling: "정차" };

export const line2DirectionName = (train: ScheduledTrain) => train.direction === "inner-loop" ? "내선" : "외선";

export function line2Headsign(train: ScheduledTrain) {
  return train.origin === train.destination ? `${line2DirectionName(train)}순환` : `${train.destination}행`;
}

export function describeLine2Motion(train: ScheduledTrain, time: number) {
  const state = train.getMotion(time);
  const event = train.getStopEvent(time);
  if (event && time < event.departureMs)
    return `${event.station}역 정차 · 출발까지 ${Math.ceil((event.departureMs - time) / 1000)}초`;
  const speed = `${labels[state.motion]} · ${Math.round(state.speedMetersPerSecond * 3.6)} km/h 추정`;
  return event ? `${event.station}역 출발 · ${speed}` : speed;
}

export function describeArrival(arrivalMs: number, time: number) {
  const seconds = Math.max(0, Math.ceil((arrivalMs - time) / 1_000));
  return seconds < 60 ? `${seconds}초 후` : `${Math.ceil(seconds / 60)}분 후`;
}
