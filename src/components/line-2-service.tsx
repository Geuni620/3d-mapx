import { useTrainClockStore, useTrainTime } from "../features/night-pulse/train-clock";
import { useCallback, useEffect, useRef, useState } from "react";
import { LngLatBounds } from "maplibre-gl";
import { Marker, useMap } from "react-map-gl/maplibre";
import { SEOUL_SUBWAY_OSM_NETWORK } from "../features/subway/osm-subway-network";
import { getScheduledFleet, type ScheduledTrain } from "../features/subway/line-2-timetable";
import { createSubwayScreenProjector, subwayCameraOffset } from "../features/subway/subway-screen-projection";
import {
  detailBlend,
  DETAIL_END,
} from "../features/subway/line-2-main-simulation";
import { Line2FleetOverview } from "./line-2-fleet-overview";
import { Line2FollowCard } from "./line-2-follow-card";
import { Line2TrainMarker } from "./line-2-train-marker";
import { line2DirectionName } from "../features/subway/line-2-presentation";
import { focusSubwayTrain } from "../features/subway/subway-train-camera";
import { SUBWAY_TRAIN_CAR_SPACING_METERS } from "../features/subway/subway-train-dimensions";
import { LINE_2_MAIN_CAR_COUNT } from "../features/subway/subway-train-model";
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

export function Line2Service({ zoom, requestedTrain, pulse }: {
  pulse: boolean; zoom: number; requestedTrain: { id: string | null } | null;
}) {
  const clock = useTrainClockStore();
  const { time } = useTrainTime();
  const { current: mapRef } = useMap();
  const fleet = getScheduledFleet(time);
  const [selectedId, select] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [depot, setDepot] = useState<string | null>(null);
  const overviewSurface = useRef<HTMLDivElement>(null);
  const selected = fleet.find((t) => t.id === selectedId);
  useEffect(() => {
    if (!requestedTrain) return;
    select(requestedTrain.id);
    setFollowing(requestedTrain.id !== null);
    setDepot(null);
  }, [requestedTrain]);
  useEffect(() => {
    if (!selectedId || selected) return;
    select(null);
    setFollowing(false);
  }, [selectedId, selected]);
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
      setFollowing(true);
      setDepot(null);
      focusSubwayTrain(map, LINE_2_MAIN_CAR_COUNT, (offset) => ({
        sampler: train.sampler,
        frontDistanceMeters: train.getMotion(clock.forecast(offset)).frontDistanceMeters,
      }), animate && !matchMedia("(prefers-reduced-motion: reduce)").matches);
    },
    [mapRef, clock],
  );

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map || !following || !selected) return;
    const train = selected;
    const project = createSubwayScreenProjector(map);
    let frame = 0;
    const cancel = () => {
      setFollowing(false);
      if (map.isEasing()) map.stop();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    function follow() {
      frame = requestAnimationFrame(follow);
      if (document.hidden || map!.isMoving() || map!.isEasing()) return;
      const motion = train.getMotion(clock.now());
      const distance = motion.frontDistanceMeters - (LINE_2_MAIN_CAR_COUNT - 1) * SUBWAY_TRAIN_CAR_SPACING_METERS / 2;
      const { coordinate } = train.sampler.sample(distance);
      const elevation = train.sampler.elevationAt?.(distance) ?? 0;
      const point = project(coordinate, elevation);
      const center = map!.transform.centerPoint;
      if (Math.hypot(point.x - center.x, point.y - center.y) < 1) return;
      const view = { zoom: map!.getZoom(), pitch: map!.getPitch(), bearing: map!.getBearing() };
      map!.easeTo({ center: coordinate, offset: subwayCameraOffset(map!, coordinate, elevation, view), duration: 0 });
    }
    map.on("dragstart", cancel);
    window.addEventListener("keydown", escape);
    frame = requestAnimationFrame(follow);
    return () => {
      cancelAnimationFrame(frame);
      map.off("dragstart", cancel);
      window.removeEventListener("keydown", escape);
    };
  }, [mapRef, following, selected, clock]);

  const overview = useCallback(
    (animate = true) => {
      const map = mapRef?.getMap();
      if (!map) return;
      setFollowing(false);
      const debug =
        import.meta.env.DEV && new URLSearchParams(location.search).get("debug") === "1";
      const left = debug && map.getContainer().clientWidth >= 768 ? 282 : 38;
      map.fitBounds(bounds, {
        padding: { top: 76, bottom: 100, left, right: 38 },
        maxZoom: 12.15,
        pitch: 0,
        bearing: 0,
        linear: true,
        duration: animate && !matchMedia("(prefers-reduced-motion: reduce)").matches ? 1000 : 0,
      });
    },
    [mapRef],
  );
  const initialized = useRef(false);
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map || initialized.current) return;
    function initialize() {
      if (initialized.current) return;
      initialized.current = true;
      const query = new URLSearchParams(location.search);
      const trains = getScheduledFleet(clock.now());
      if (query.get("view") === "line2" && trains.length) {
        const first =
          trains.find(
            (t) =>
              t.direction === "outer-loop" &&
              t.getMotion(clock.now()).speedMetersPerSecond > 3,
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
  }, [mapRef, inspect, overview, clock]);
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
          />
        </div>
      )}
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
      {selected && <>
        {following && <Line2TrainMarker train={selected} />}
        <Line2FollowCard train={selected} time={time} following={following} onToggle={() => {
          if (!following) inspect(selected);
          else {
            setFollowing(false);
            mapRef?.getMap().stop();
          }
        }} />
      </>}
      <section className="line2-service-panel" aria-label="2호선 본선">
        <header className="line2-service-header">
          <h2>2호선 본선</h2>
          <span className="line2-service-counts">{fleet.length
            ? <>내선 <b>{fleet.length - outer}</b> · 외선 <b>{outer}</b>편성</>
            : "현재 운행 없음"}
          </span>
        </header>
        <div className="line2-service-actions">
          <select
            aria-label="시간표 열차 선택"
            value={selected?.id ?? ""}
            onChange={(e) => {
              const t = fleet.find((t) => t.id === e.target.value);
              if (t) inspect(t);
              else { select(null); setFollowing(false); mapRef?.getMap().stop(); }
            }}
          >
            <option value="">열차 선택</option>
            {(["inner-loop", "outer-loop"] as const).map((dir) => (
              <optgroup key={dir} label={dir === "inner-loop" ? "내선" : "외선"}>
                {fleet
                  .filter((t) => t.direction === dir)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {line2DirectionName(t)} {t.number}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {selected && (
            <button type="button" className="line2-service-focus" onClick={() => inspect(selected)}>
              열차 위치
            </button>
          )}
          <button type="button" onClick={() => overview()}>
            순환선 전체
          </button>
        </div>
        <footer className="line2-service-sources">
          <a href="https://www.data.go.kr/data/15098251/fileData.do" target="_blank" rel="noreferrer">
            시간표 기준 추정
          </a>
          <a href={`${import.meta.env.BASE_URL}rolling-stock/credits.txt`} target="_blank" rel="noreferrer">
            차량 에셋
          </a>
        </footer>
      </section>
    </>
  );
}
