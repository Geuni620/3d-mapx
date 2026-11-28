import { getLine2ServiceDay } from "./line-2-timetable";
import { getLine1TripPresentation, line1LegStations, line1StationName } from "./line-1-sections";
import { getScheduledSubwayTrips, getSubwayServiceSecond, getSubwayTripLegs } from "./subway-timetable";

interface StationCall {
  headsign: string;
  arrival: number;
  departure: number;
  kind: "arrival" | "departure" | "terminates";
}

const callsByDay = new Map<string, Map<string, StationCall[]>>();

function indexStationCalls(timestamp: number) {
  const index = new Map<string, StationCall[]>();
  function add(station: string | null | undefined, call: StationCall) {
    if (!station) return;
    const calls = index.get(station) ?? [];
    calls.push(call);
    index.set(station, calls);
  }

  for (const trip of getScheduledSubwayTrips(timestamp)) {
    if (trip[0] !== 1) continue;
    const { headsign } = getLine1TripPresentation(trip);
    const legs = getSubwayTripLegs(trip);
    let time = trip[1];
    add(line1LegStations[legs[0][0]]?.[0], {
      headsign, arrival: time, departure: time, kind: "departure",
    });
    legs.forEach(([leg, travel, dwell, passes], i) => {
      const arrival = time + travel;
      time = arrival + dwell;
      if (passes) return;
      add(line1LegStations[leg]?.[1], {
        headsign, arrival, departure: time,
        kind: i === legs.length - 1 ? "terminates" : "arrival",
      });
    });
  }
  for (const calls of index.values()) calls.sort((a, b) => a.arrival - b.arrival);
  return index;
}

export function getLine1StationBoard(name: string, timestamp: number, limit = 5) {
  const day = getLine2ServiceDay(timestamp);
  let index = callsByDay.get(day);
  if (!index) {
    index = indexStationCalls(timestamp);
    callsByDay.set(day, index);
  }
  const now = getSubwayServiceSecond(timestamp);
  const calls = index.get(line1StationName(name)) ?? [];
  return calls.filter(call => call.departure > now).slice(0, limit).map(call => ({
    ...call,
    dwelling: call.arrival <= now && now < call.departure,
    scheduledMs: timestamp + (call.arrival - now) * 1000,
  }));
}
