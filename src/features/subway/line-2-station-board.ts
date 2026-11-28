import {
  getScheduledServiceFleet, getSubwayServiceMidnight, getUpcomingStops,
  type Direction, type ScheduledStop, type ScheduledTrain,
} from "./line-2-timetable";

export const line2StationName = (name: string) => name.split("(")[0].replaceAll(" ", "");
export const LINE2_DIRECTIONS = ["inner-loop", "outer-loop"] as const;
export type StationBoardEntry = {
  train: ScheduledTrain;
  stop: ScheduledStop;
  scheduledMs: number;
  dwelling: boolean;
  approaching: boolean;
};

type IndexedStop = Pick<StationBoardEntry, "train" | "stop" | "scheduledMs">;
let indexedDay = NaN;
let index = new Map<string, Record<Direction, IndexedStop[]>>();

function stationSchedule(time: number) {
  const day = getSubwayServiceMidnight(time);
  if (day === indexedDay) return index;
  index = new Map();
  indexedDay = day;
  for (const train of getScheduledServiceFleet(time)) {
    const stops = [train.scheduledStops[0], ...getUpcomingStops(train, -Infinity, train.scheduledStops.length)];
    for (const stop of stops) {
      const station = index.get(stop.station) ?? { "inner-loop": [], "outer-loop": [] };
      station[train.direction].push({ train, stop, scheduledMs: stop.arrivalMs ?? stop.departureMs! });
      index.set(stop.station, station);
    }
  }
  for (const station of index.values()) {
    for (const direction of LINE2_DIRECTIONS) station[direction].sort((a, b) => a.scheduledMs - b.scheduledMs);
  }
  return index;
}

export function getLine2StationBoard(name: string, time: number, count = 3) {
  const station = stationSchedule(time).get(name);
  const board: Record<Direction, StationBoardEntry[]> = { "inner-loop": [], "outer-loop": [] };
  for (const direction of LINE2_DIRECTIONS) {
    for (const item of station?.[direction] ?? []) {
      const { train, stop, scheduledMs } = item;
      const dwelling = stop.arrivalMs !== null && stop.arrivalMs <= time && time < (stop.departureMs ?? train.arrivalMs);
      if (scheduledMs < time && !dwelling) continue;
      const approaching = time >= train.departureMs && stop.arrivalMs !== null && time < stop.arrivalMs &&
        getUpcomingStops(train, time, 1)[0] === stop && train.getMotion(time).phase === "moving";
      board[direction].push({ ...item, dwelling, approaching });
      if (board[direction].length >= count) break;
    }
  }
  return board;
}
