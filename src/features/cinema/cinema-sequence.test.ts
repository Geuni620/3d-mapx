import { describe, expect, it } from "vitest";
import { parseReplayTime } from "../night-pulse/train-clock";
import { getSubwayServiceMidnight } from "../subway/line-2-timetable";
import { CINEMA_IDLE_MS, CINEMA_ORBIT_MS, isMorningPeak, nextCinemaShot, readCinemaOptions, selectTrainShot, shouldStartCinema } from "./cinema-sequence";

const at = (time: string) => Date.parse(`2026-11-25T${time}+09:00`);
const seoul = [126.978, 37.5665] as const;
const near = (): [number, number] => [...seoul];

describe("시네마 시작", () => {
  it("URL에서 명시적으로 시작하고 클린 화면을 요청할 수 있다", () => {
    expect(readCinemaOptions(new URLSearchParams("cinema=1&clean=1"))).toEqual({ direct: true, clean: true });
    expect(readCinemaOptions(new URLSearchParams("cinema=0&clean=yes"))).toEqual({ direct: false, clean: false });
  });

  it("입력으로 초기화된 대기 시간, 페이지 표시 여부, 움직임 설정을 확인한다", () => {
    expect(shouldStartCinema(CINEMA_IDLE_MS, false, true)).toBe(true);
    expect(shouldStartCinema(CINEMA_IDLE_MS - 1, false, true)).toBe(false);
    expect(shouldStartCinema(0, false, true)).toBe(false);
    expect(shouldStartCinema(CINEMA_IDLE_MS, true, true)).toBe(false);
    expect(shouldStartCinema(CINEMA_IDLE_MS, false, false)).toBe(false);
  });

  it("서울 시각과 서비스일로 첨두와 자정 이후 열차 시각을 결정한다", () => {
    const time = parseReplayTime("08:20", at("20:00:00"), "2026-11-28");
    expect(time).toBe(Date.parse("2026-11-28T08:20:00+09:00"));
    expect(isMorningPeak(time!)).toBe(true);
    expect(isMorningPeak(at("21:02:00"))).toBe(false);
    const late = parseReplayTime("00:12", at("20:00:00"), "2026-11-28")!;
    expect(late).toBe(Date.parse("2026-11-29T00:12:00+09:00"));
    expect(getSubwayServiceMidnight(late)).toBe(Date.parse("2026-11-28T00:00:00+09:00"));
    expect(parseReplayTime("08:20", at("20:00:00"), "2026-11-31")).toBe(at("08:20:00"));
  });
});

describe("시간표 열차 시퀀스", () => {
  it("철교 운행을 찾고 동일 편성에서 다음 정차역까지 달린 뒤 다른 노선으로 넘어간다", () => {
    const start = at("21:02:00");
    const time = Array.from({ length: 180 }, (_, index) => start + index * 1_000).find((timestamp) => {
      const side = selectTrainShot(timestamp);
      return side.kind === "side" && side.bridge;
    });
    expect(time).toBeDefined();
    const orbit = { kind: "orbit" } as const;
    expect(nextCinemaShot(orbit, CINEMA_ORBIT_MS - 1, time!, near())).toBe(orbit);

    const side = nextCinemaShot(orbit, CINEMA_ORBIT_MS, time!, near());
    expect(side.kind).toBe("side");
    if (side.kind !== "side") throw new Error("측면 추적 대상 없음");
    expect(side.bridge).toBe(true);
    expect(side.train.line).toBe(2);
    const front = nextCinemaShot(side, 9_000, time! + 9_000, near());
    expect(front).toEqual({ kind: "front", train: side.train });
    expect(nextCinemaShot(front, 20_000, side.train.arrival - 1, near())).toBe(front);

    const transfer = nextCinemaShot(front, 20_001, side.train.arrival, near());
    expect(transfer.kind).toBe("transfer");
    if (transfer.kind !== "transfer") throw new Error("노선 전환 대상 없음");
    expect(transfer.train.line).not.toBe(2);
    expect(transfer.train.sample(side.train.arrival)).toBeDefined();
  });

  it("운행이 없는 시간에는 열차를 만들지 않고 오빗으로 이어간다", () => {
    expect(selectTrainShot(at("03:30:00"))).toEqual({ kind: "orbit" });
  });
});
