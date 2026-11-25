import { createContext, useContext } from "react";
import { trainFrameTimestamp } from "../subway/line-2-main-simulation";

const KST_OFFSET = 9 * 3_600_000;
const DAY = 86_400_000;

export const TrainClock = createContext(trainFrameTimestamp);
export const useTrainClock = () => useContext(TrainClock);

export function parseReplayTime(value: string | null, wallTime: number) {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  // 서울 자정 이후 시각은 해당 달력일에 놓고 시간표에서 전날 운행일로 분류한다.
  const midnight = Math.floor((wallTime + KST_OFFSET) / DAY) * DAY - KST_OFFSET;
  return midnight + (hours * 60 + minutes) * 60_000;
}

export function formatSeoulClock(timestamp: number) {
  return new Date(timestamp + KST_OFFSET).toISOString().slice(11, 16);
}
