import { useEffect } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import { formatSeoulClock, useTrainTime } from "../features/night-pulse/train-clock";
import { getLine1StationOperator, line1StationName } from "../features/subway/line-1-sections";
import { getLine1StationBoard } from "../features/subway/line-1-station-board";
import type { SubwayStationMapPoint } from "../features/subway/subway-geojson";
import { describeArrival } from "../features/subway/line-2-presentation";
import "./line-1-display.css";

export function Line1StationBoard({ station, onClose }: {
  station: SubwayStationMapPoint;
  onClose: () => void;
}) {
  const { time } = useTrainTime();
  const { current: mapRef } = useMap();
  const { longitude, latitude } = station;
  const name = line1StationName(station.name);
  const operator = getLine1StationOperator(name) ?? "운영기관 미확인";
  const calls = getLine1StationBoard(name, time);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    const compact = map.getContainer().clientWidth <= 640;
    map.easeTo({
      center: [longitude, latitude],
      zoom: Math.max(map.getZoom(), 13.5),
      offset: compact ? [0, -100] : [-145, 0],
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400,
    });
  }, [mapRef, longitude, latitude]);

  return <>
    <Marker longitude={longitude} latitude={latitude} anchor="center" style={{ pointerEvents: "none", zIndex: 6 }}>
      <span className="line1-board-marker" aria-hidden="true" />
    </Marker>
    <section className="line1-card line1-board" aria-label={`${name} 1호선 전광판`}>
      <header className="line1-card-header">
        <span className="line1-chip" aria-hidden="true">1</span>
        <div><h2>{name}</h2><p>{operator} · {formatSeoulClock(time)} 기준</p></div>
        <button type="button" aria-label="역 전광판 닫기" onClick={onClose}>×</button>
      </header>
      <ol>
        {calls.map((call, index) => (
          <li key={`${call.scheduledMs}/${index}`}>
            <div>
              <strong>{call.headsign}</strong>
              {call.kind === "terminates" && <small>이 역이 종착역</small>}
              {call.kind === "departure" && <small>이 역에서 출발</small>}
            </div>
            <div>
              <strong>{call.dwelling ? "정차 중" : describeArrival(call.scheduledMs, time)}</strong>
              <small>{formatSeoulClock(call.scheduledMs, true)} {call.kind === "departure" ? "출발" : "도착"} 예정</small>
            </div>
          </li>
        ))}
      </ol>
      {!calls.length && <p className="line1-board-empty">수록된 예정 열차가 없습니다.</p>}
      <footer>
        공표 시간표 기준 · 수록된 정차 열차만 표시
        {name === "서울역" && <small>서울역 지상·지하 승강장은 원본 시각표에서 구분되지 않습니다.</small>}
      </footer>
    </section>
  </>;
}
