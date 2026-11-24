import { useTrainClock } from "../features/night-pulse/train-clock";
import { useCallback, useEffect, useRef, useState } from "react";
import { LngLatBounds } from "maplibre-gl";
import { Marker, useMap } from "react-map-gl/maplibre";
import { SEOUL_SUBWAY_OSM_NETWORK } from "../features/subway/osm-subway-network";
import { getScheduledFleet, type ScheduledTrain } from "../features/subway/line-2-timetable";
import {
  detailBlend,
  DETAIL_START,
  PULSE_DETAIL_START,
  DETAIL_END,
} from "../features/subway/line-2-main-simulation";
import { Line2FleetOverview } from "./line-2-fleet-overview";
import { SubwayTrainLayer } from "./subway-train-layer";
import "./line-2-service.css";

const DEPOTS = [
  { name: "군자차량기지", longitude: 127.053306, latitude: 37.558724, osm: 425074031 },
  { name: "신정차량기지", longitude: 126.865996, latitude: 37.511497, osm: 612318436 },
];
const bounds = SEOUL_SUBWAY_OSM_NETWORK.serviceRoutes
  .filter((r) => r.direction === "outer-loop")
  .flatMap((r) => r.path)
  .reduce((box, p) => box.extend(p), new LngLatBounds());
DEPOTS.forEach((d) => bounds.extend([d.longitude, d.latitude]));
const labels = { accelerating: "가속", cruising: "정속", braking: "감속", dwelling: "정차" };
const directionName = (train: ScheduledTrain) =>
  train.direction === "inner-loop" ? "내선" : "외선";

export function Line2Service({ zoom, requestedTrain, pulse }: { zoom: number; pulse: boolean; requestedTrain: { id: string } | null }) {
  const clock = useTrainClock();
  const { current: mapRef } = useMap();
  const [frozen, setFrozen] = useState<number | null>(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? clock() : null,
  );
  const [fleet, setFleet] = useState(() => getScheduledFleet(frozen ?? clock()));
  const [selectedId, select] = useState<string | null>(null);
  const [depot, setDepot] = useState<string | null>(null);
  const overviewSurface = useRef<HTMLDivElement>(null);
  const speed = useRef<HTMLOutputElement>(null);
  const selected = fleet.find((t) => t.id === selectedId);
  useEffect(() => {
    if (!requestedTrain) return;
    select(requestedTrain.id);
    setDepot(null);
  }, [requestedTrain]);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setFrozen(query.matches ? clock() : null);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [clock]);
  useEffect(() => {
    const refresh = () => {
      const next = getScheduledFleet(frozen ?? clock());
      setFleet((old) =>
        old.length === next.length && old.every((v, i) => v === next[i]) ? old : next,
      );
    };
    refresh();
    if (frozen !== null) return;
    const timer = window.setInterval(refresh, 1000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [frozen, clock]);
  useEffect(() => {
    if (!selectedId || selected) return;
    select(null);
  }, [selectedId, selected]);
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!selected || !map) return;
    const update = () => {
      const now = frozen ?? clock();
      const state = selected.getLeadPose(now);
      const event = selected.getStopEvent(now);
      const stopped = event && now < event.departureMs;
      const stationText = event
        ? stopped
          ? `${event.station}역 정차 · 출발까지 ${Math.ceil((event.departureMs - now) / 1000)}초`
          : `${event.station}역 출발`
        : "";
      const speedText = `${labels[state.motion]} · ${Math.round(state.speedMetersPerSecond * 3.6)} km/h 추정`;
      const text = stationText
        ? stopped
          ? stationText
          : `${stationText} · ${speedText}`
        : speedText;
      if (speed.current && speed.current.value !== text) speed.current.value = text;
    };
    update();
    const timer = frozen === null ? window.setInterval(update, 150) : undefined;
    return () => clearInterval(timer);
  }, [selected, frozen, mapRef, clock]);
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    function fade() {
      if (overviewSurface.current)
        overviewSurface.current.style.opacity = String(1 - detailBlend(map!.getZoom()));
    }
    fade();
    map.on("zoom", fade);
    return () => {
      map.off("zoom", fade);
    };
  }, [mapRef, zoom]);
  const inspect = useCallback(
    (train: ScheduledTrain, animate = true) => {
      const map = mapRef?.getMap();
      if (!map) return;
      select(train.id);
      setDepot(null);
      const now = frozen ?? clock();
      const goal = train.getLeadPose(now).lead.coordinate;
      const targetPixels = map.project(goal);
      const container = map.getContainer();
      const travel = Math.hypot(
        targetPixels.x - container.clientWidth / 2,
        targetPixels.y - container.clientHeight / 2,
      );
      const screens = travel / Math.max(1, container.clientWidth);
      const duration =
        animate && frozen === null
          ? Math.min(3200, 720 + 260 * Math.abs(18.25 - map.getZoom()) + 160 * Math.min(5, screens))
          : 0;
      const { lead } = train.getLeadPose(frozen ?? clock() + duration);
      // 방위를 유지한 채 선택 지점으로 접근해 같은 선로 위의 열차를 계속 읽게 한다.
      map.easeTo({
        center: lead.coordinate,
        zoom: 18.25,
        pitch: 55,
        bearing: map.getBearing(),
        duration,
        easing: (t) => t * t * t * (t * (6 * t - 15) + 10),
      });
    },
    [mapRef, frozen, clock],
  );
  const overview = useCallback(
    (animate = true) => {
      const map = mapRef?.getMap();
      if (!map) return;
      const debug =
        import.meta.env.DEV && new URLSearchParams(location.search).get("debug") === "1";
      const left = debug && map.getContainer().clientWidth >= 768 ? 282 : 38;
      map.fitBounds(bounds, {
        padding: { top: 76, bottom: 100, left, right: 38 },
        maxZoom: 12.15,
        pitch: 0,
        bearing: 0,
        linear: true,
        duration: animate && frozen === null ? 1000 : 0,
      });
    },
    [mapRef, frozen],
  );
  const initialized = useRef(false);
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map || initialized.current) return;
    function initialize() {
      if (initialized.current) return;
      initialized.current = true;
      const query = new URLSearchParams(location.search);
      const trains = getScheduledFleet(frozen ?? clock());
      if (query.get("view") === "line2" && trains.length) {
        const first =
          trains.find(
            (t) =>
              t.direction === "outer-loop" &&
              t.getMotion(frozen ?? clock()).speedMetersPerSecond > 3,
          ) ?? trains[0];
        inspect(first, false);
      } else if (
        !(import.meta.env.DEV && query.get("debug") === "1") ||
        query.get("view") === "network"
      )
        overview(false);
      if (import.meta.env.DEV && query.get("debug") === "1" && query.has("zoom")) {
        const level = Number(query.get("zoom"));
        if (Number.isFinite(level) && level >= 0 && level <= 22) mapRef?.getMap().setZoom(level);
      }
    }
    if (map.loaded() || map.isStyleLoaded()) initialize();
    else map.once("load", initialize);
    return () => {
      map.off("load", initialize);
    };
  }, [mapRef, frozen, inspect, overview, clock]);
  const outer = fleet.filter((t) => t.direction === "outer-loop").length;
  return (
    <>
      {!pulse && zoom < DETAIL_END && (
        <div
          ref={overviewSurface}
          className="line2-symbol-plane"
          style={{ opacity: 1 - detailBlend(zoom) }}
        >
          <Line2FleetOverview
            trains={fleet}
            selectedId={selected?.id ?? null}
            frozenTimestamp={frozen}
          />
        </div>
      )}
      <SubwayTrainLayer
        pulse={pulse}
        isActive={zoom >= (pulse ? PULSE_DETAIL_START : DETAIL_START) || selectedId !== null}
        trains={fleet}
        frozenTimestamp={frozen}
      />
      {!pulse && DEPOTS.map((d) => (
        <Marker key={d.name} longitude={d.longitude} latitude={d.latitude} anchor="center">
          <button
            type="button"
            className="line2-depot"
            aria-label={d.name}
            title={d.name}
            aria-expanded={depot === d.name}
            onClick={(e) => {
              e.stopPropagation();
              setDepot((old) => (old === d.name ? null : d.name));
            }}
          >
            <span aria-hidden="true">▥</span>
            {(depot === d.name || zoom > 13) && <b>{d.name}</b>}
          </button>
        </Marker>
      ))}
      <div className="line2-service-panel">
        <div className="line2-service-status">
          <a
            href="https://www.data.go.kr/data/15098251/fileData.do"
            target="_blank"
            rel="noreferrer"
          >
            시간표 기준 추정
          </a>
          <a href={`${import.meta.env.BASE_URL}rolling-stock/credits.txt`} target="_blank" rel="noreferrer">
            차량 에셋
          </a>
          <span>
            {fleet.length
              ? `내선 ${fleet.length - outer} · 외선 ${outer}편성`
              : "현재 본선 운행 없음"}
          </span>
        </div>
        <div className="line2-service-actions">
          <select
            aria-label="시간표 열차 선택"
            value={selected?.id ?? ""}
            onChange={(e) => {
              const t = fleet.find((t) => t.id === e.target.value);
              if (t) inspect(t);
              else select(null);
            }}
          >
            <option value="">열차 선택</option>
            {(["inner-loop", "outer-loop"] as const).map((dir) => (
              <optgroup key={dir} label={dir === "inner-loop" ? "내선" : "외선"}>
                {fleet
                  .filter((t) => t.direction === dir)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {directionName(t)} {t.number}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {selected && (
            <button type="button" onClick={() => inspect(selected)}>
              열차 위치
            </button>
          )}
          <button type="button" onClick={() => overview()}>
            순환선 전체
          </button>
        </div>
        {selected && <output ref={speed} aria-label="선택 열차의 추정 속도" aria-live="off" />}
      </div>
    </>
  );
}
