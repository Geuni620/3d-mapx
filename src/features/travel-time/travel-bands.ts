import type { ServiceDay } from "./travel-time-data";

// 출발 시간대. 공유 URL 해석(travel-url)이 지도 첫 화면에서 쓰므로 무거운 데이터 모듈과 떼어 둔다.
export interface TimeBand {
  id: string;
  label: string;
  day: ServiceDay;
  hour: number;
}

export const TIME_BANDS: TimeBand[] = [
  { id: "day08", label: "평일 08시", day: "DAY", hour: 8 },
  { id: "day13", label: "평일 13시", day: "DAY", hour: 13 },
  { id: "day18", label: "평일 18시", day: "DAY", hour: 18 },
  { id: "sat13", label: "토요일 13시", day: "SAT", hour: 13 },
  { id: "end13", label: "휴일 13시", day: "END", hour: 13 },
];

