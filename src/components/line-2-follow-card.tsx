import { getUpcomingStops, type ScheduledTrain } from "../features/subway/line-2-timetable";
import { describeArrival, describeLine2Motion, line2DirectionName, line2Headsign } from "../features/subway/line-2-presentation";
import { formatSeoulClock } from "../features/night-pulse/train-clock";
import "./line-2-follow-card.css";

export function Line2FollowCard({ train, time, following, onToggle }: {
  train: ScheduledTrain;
  time: number;
  following: boolean;
  onToggle: () => void;
}) {
  const next = getUpcomingStops(train, time, 3);
  return (
    <section className="line2-detail-card line2-follow-card" aria-label="2호선 열차 추적">
      <header className="line2-detail-header">
        <span className="line2-detail-chip" aria-hidden="true">2</span>
        <div>
          <h2>{line2DirectionName(train)} {train.number}</h2>
          <p>{train.origin} 출발 · {line2Headsign(train)}</p>
        </div>
        <button type="button" className="line2-follow-switch" aria-pressed={following}
          aria-label="자동 추적" onClick={onToggle}>{following ? "추적 중" : "추적 시작"}</button>
      </header>
      <p className="line2-follow-motion">{describeLine2Motion(train, time)}</p>
      <ol className="line2-next-stops">
        {next.map((stop, i) => <li key={stop.arrivalMs}>
          <span className="line2-stop-name">{i === 0 && <small>다음 역</small>}{stop.station}</span>
          <span className="line2-stop-time"><b>{describeArrival(stop.arrivalMs, time)}</b>
            <small>예정 {formatSeoulClock(stop.arrivalMs, true)}</small></span>
        </li>)}
      </ol>
      {!next.length && <p className="line2-detail-note">예정된 다음 정차역 없음</p>}
      <footer className="line2-detail-note"><kbd>ESC</kbd> 추적 해제 · 공표 시간표 기준 예정 시각</footer>
    </section>
  );
}
