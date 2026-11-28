import { useEffect } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import { formatSeoulClock, useTrainTime } from "../features/night-pulse/train-clock";
import { describeArrival, line2Headsign } from "../features/subway/line-2-presentation";
import { getLine2StationBoard, LINE2_DIRECTIONS } from "../features/subway/line-2-station-board";
import { getLine2StationDirections } from "../features/subway/line-2-timetable";
import type { SubwayStationMapPoint } from "../features/subway/subway-geojson";
import { Line2TrainMarker } from "./line-2-train-marker";
import "./line-2-follow-card.css";
import "./line-2-station-board.css";

export function Line2StationBoard({ station, name, showTrains, onClose }: {
  station: SubwayStationMapPoint;
  name: string;
  showTrains: boolean;
  onClose: () => void;
}) {
  const { time } = useTrainTime();
  const { current: mapRef } = useMap();
  const directions = getLine2StationDirections(name);
  const board = getLine2StationBoard(name, time);
  const { longitude, latitude } = station;

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    const mobile = map.getContainer().clientWidth <= 560;
    map.easeTo({
      center: [longitude, latitude],
      zoom: mobile ? 14.4 : 15.3,
      pitch: mobile ? 39 : 51,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 550,
      offset: mobile ? [0, -45] : [-60, 5],
    });
  }, [mapRef, longitude, latitude]);

  if (!directions) return null;
  return <>
    <div className="line2-board-vignette" aria-hidden="true" />
    <Marker longitude={longitude} latitude={latitude} anchor="center" style={{ pointerEvents: "none", zIndex: 6 }}>
      <div className="line2-board-marker" aria-hidden="true"><span>{name}</span></div>
    </Marker>
    {showTrains && LINE2_DIRECTIONS.flatMap(direction => board[direction]
      .filter(entry => entry.approaching)
      .map(({ train }) => <Line2TrainMarker key={train.id} train={train} approach />))}
    <section className="line2-detail-card line2-station-board" aria-label={`${name}역 전광판`}>
      <header className="line2-detail-header">
        <span className="line2-detail-chip" aria-hidden="true">2</span>
        <div><h2>{name}</h2><p>2호선 · 지금 {formatSeoulClock(time)} 기준</p></div>
        <button type="button" className="line2-board-close" aria-label="역 전광판 닫기" onClick={onClose}>×</button>
      </header>
      <div className="line2-board-columns">
        {LINE2_DIRECTIONS.map(direction => (
          <section key={direction}>
            <h3>{direction === "inner-loop" ? "내선" : "외선"} · {directions[direction]} 방면</h3>
            <ol>
              {board[direction].map(({ train, stop, scheduledMs, dwelling }) => (
                <li key={`${train.id}/${scheduledMs}`}>
                  <span className="line2-board-train"><b>{train.number}</b><small>{line2Headsign(train)}</small></span>
                  <span className="line2-board-time"><strong>{dwelling ? "정차 중" : describeArrival(scheduledMs, time)}</strong>
                    <small>{stop.arrivalMs === null ? "출발 예정" : "예정"} {formatSeoulClock(scheduledMs)}</small>
                  </span>
                </li>
              ))}
            </ol>
            {!board[direction].length && <p className="line2-detail-note">예정된 열차 없음</p>}
          </section>
        ))}
      </div>
      <footer className="line2-detail-note">지도에서는 이 역으로 다가오는 열차만 강조 · 공표 시간표 기준 예정 시각</footer>
    </section>
  </>;
}
