import { useEffect, useMemo, useRef, useState } from "react";
import { getSubwayServiceMidnight } from "../subway/line-2-timetable";
import { SUBWAY_LINES, SUBWAY_LINE_COLORS } from "../subway/subway-constants";
import { createDayProfile, readPulseStats } from "./day-profile";
import { formatSeoulClock, useTrainClock } from "./train-clock";
import "./night-pulse-hud.css";

export function NightPulseHud({ replay }: { replay: string | null }) {
  const now = useTrainClock();
  const [stats, setStats] = useState(() => readPulseStats(now()));
  const chart = useRef<HTMLCanvasElement>(null);
  const serviceDay = getSubwayServiceMidnight(stats.time);
  const profile = useMemo(() => createDayProfile(serviceDay + 5 * 3_600_000), [serviceDay]);

  useEffect(() => {
    const update = () => setStats(readPulseStats(now()));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [now]);

  useEffect(() => {
    const context = chart.current?.getContext("2d");
    if (!context) return;
    const width = context.canvas.width;
    const height = context.canvas.height;
    context.clearRect(0, 0, width, height);
    const x = (time: number) => 5 + (width - 10) * Math.max(0, Math.min(1, (time - profile.start) / (profile.end - profile.start)));
    const y = (count: number) => height - 6 - (height - 12) * count / Math.max(1, profile.peak.count);
    const curve = new Path2D();
    for (const point of profile.points) curve.lineTo(x(point.timestamp), y(point.count));
    const area = new Path2D(curve);
    area.lineTo(width - 5, height);
    area.lineTo(5, height);
    area.closePath();
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#93ffd26b");
    gradient.addColorStop(1, "#93ffd200");
    context.fillStyle = gradient;
    context.fill(area);
    context.strokeStyle = "#aef5d5";
    context.lineWidth = 2;
    context.stroke(curve);
    const marker = x(stats.time);
    context.strokeStyle = "#ffffff70";
    context.beginPath();
    context.moveTo(marker, 0);
    context.lineTo(marker, height);
    context.stroke();
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(marker, y(stats.total), 4, 0, Math.PI * 2);
    context.fill();
  }, [profile, stats]);
  const mostActive = Math.max(1, ...stats.perLine);
  return (
    <section className="night-pulse-hud" aria-label="야간 맥박 운행 현황">
      <header className="night-pulse-header">
        <p className="night-pulse-mode">{replay ? `재생 중 ${replay}` : <><i aria-hidden="true" /> LIVE</>}</p>
        <p className="night-pulse-clock">{formatSeoulClock(stats.time)} <span>KST</span></p>
        <p className="night-pulse-totals"><b>{stats.total}</b>편성 운행 · <strong>{stats.dwelling}</strong>정차 중</p>
      </header>
      <figure className="night-pulse-profile">
        <canvas ref={chart} width={456} height={80} role="img" aria-label="05시부터 다음 날 01시 30분까지의 운행 편성 수" />
        <figcaption>최다 {formatSeoulClock(profile.peak.timestamp)} · {profile.peak.count}편성</figcaption>
      </figure>
      <ol className="night-pulse-bars" aria-label="호선별 운행 편성">
        {SUBWAY_LINES.map(line => (
          <li key={line}>
            <span>{line}호선</span>
            <i aria-hidden="true" style={{ background: SUBWAY_LINE_COLORS[line], width: `${stats.perLine[line] / mostActive * 100}%` }} />
            <b>{stats.perLine[line]}</b>
          </li>
        ))}
      </ol>
      <p className="night-pulse-note">위치·편성 수: 서울교통공사 공표 시간표 기준 추정<br />꼬리는 지난 150초 궤적<br />건물 창불·수면 광택은 합성 장식</p>
    </section>
  );
}
