import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { countScheduledTrains, getReplayProfile } from "./day-profile";
import { formatSeoulClock, REPLAY_DAYS, REPLAY_END, REPLAY_START, useTrainClockStore, useTrainTime } from "./train-clock";
import "./replay-dock.css";

const MINUTE = 60_000;
const ticks = [[300, "05"], [480, "08"], [720, "12"], [960, "16"], [1200, "20"], [1440, "00"], [1530, "01:30"]] as const;
const percent = (ms: number) => 100 * (ms - REPLAY_START) / (REPLAY_END - REPLAY_START);
const CHART_WIDTH = 1000;
const CHART_HEIGHT = 52;

export function ReplayDock() {
  const clock = useTrainClockStore();
  const { time, mode, day, dayType, playing, rate } = useTrainTime();
  const reference = REPLAY_DAYS.find(item => item.id === dayType)!;
  const profile = getReplayProfile(reference.reference);
  const offset = Math.max(REPLAY_START, Math.min(REPLAY_END, time - day));
  const progress = percent(offset);
  const minute = Math.floor(offset / MINUTE);
  const peak = percent(profile.peak.timestamp - reference.reference);
  const timeText = formatSeoulClock(time);
  const second = Math.floor(time / 1000);
  const count = useMemo(() => countScheduledTrains(second * 1000), [second]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const curve = useMemo(() => {
    const path = new Path2D();
    profile.points.forEach(({ timestamp, count }, i) => {
      const x = percent(timestamp - profile.start + REPLAY_START) * CHART_WIDTH / 100;
      const y = CHART_HEIGHT - 4 - count / Math.max(1, profile.peak.count) * (CHART_HEIGHT - 10);
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    const area = new Path2D(path);
    area.lineTo(CHART_WIDTH, CHART_HEIGHT);
    area.lineTo(0, CHART_HEIGHT);
    area.closePath();
    return { path, area };
  }, [profile]);
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
    const fill = context.createLinearGradient(0, 0, 0, CHART_HEIGHT);
    fill.addColorStop(0, "#5fc09e70");
    fill.addColorStop(1, "#5fc09e00");
    context.fillStyle = fill;
    context.fill(curve.area);
    context.strokeStyle = "#5f9e89";
    context.stroke(curve.path);
    context.save();
    context.beginPath();
    context.rect(0, 0, progress * CHART_WIDTH / 100, CHART_HEIGHT);
    context.clip();
    context.lineWidth = 2;
    context.strokeStyle = "#85e7be";
    context.stroke(curve.path);
    context.restore();
  }, [curve, progress]);

  return (
    <section className="replay-dock" aria-label="하루 운행 리플레이">
      <div className="replay-dock-top">
        <button type="button" className="replay-play" onClick={clock.togglePlaying}
          aria-label={playing ? "일시정지" : "재생"}>{playing ? "Ⅱ" : "▶"}</button>
        <div className="replay-segments" role="group" aria-label="재생 배속">
          {([1, 10, 60] as const).map(speed =>
            <button key={speed} type="button" aria-pressed={rate === speed} onClick={() => clock.setRate(speed)}>×{speed}</button>)}
        </div>
        <div className="replay-segments replay-days" role="group" aria-label="시간표 요일">
          {REPLAY_DAYS.map(item => (
            <button key={item.id} type="button" aria-pressed={dayType === item.id} onClick={() => clock.selectDay(item)}>
              {item.label}<small>최다 {getReplayProfile(item.reference).peak.count}</small>
            </button>
          ))}
        </div>
        <div className="replay-dock-status">
          <output aria-label="현재 시각과 운행 편성 추정">{timeText} <small>KST</small> · {count}편성</output>
          <button type="button" className="replay-live" onClick={clock.live} disabled={mode === "live"}>● 실시간으로</button>
        </div>
      </div>
      <div className="replay-dock-track" style={{ "--replay-progress": `${progress}%`, "--replay-peak": `${peak}%` } as CSSProperties}>
        <canvas aria-hidden="true" ref={canvas} width={CHART_WIDTH} height={CHART_HEIGHT} />
        <span className="replay-peak">최다 {formatSeoulClock(profile.peak.timestamp)} · {profile.peak.count}</span>
        <span aria-hidden="true" className="replay-thumb-label">{formatSeoulClock(day + minute * MINUTE)}</span>
        <input type="range" min={300} max={1530} step={1} value={minute}
          aria-label="하루 운행 시각" aria-valuetext={formatSeoulClock(day + minute * MINUTE)}
          onChange={event => clock.seek(Number(event.target.value) * MINUTE)} />
        <div className="replay-ticks" aria-hidden="true">
          {ticks.map(([at, label]) => <span key={at} style={{ left: `${percent(at * MINUTE)}%` }}>{label}</span>)}
        </div>
      </div>
      <p className="replay-attribution">서울교통공사 2026-09-01 공표 시간표 기준 · 10분 간격 운행 편성 수</p>
    </section>
  );
}
