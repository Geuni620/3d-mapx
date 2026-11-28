import { useEffect, useMemo, useRef, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "maplibre-gl";
import type { MapTheme } from "../../app/seoul-daylight";
import { BASE_GRAPH, FUTURE_LINES } from "./travel-time-data";
import { REGIONAL_LINES, REGIONAL_TIMINGS } from "./travel-regional";
import { endpointCoordinate, routeBounds, routeFailure } from "./travel-time-format";
import { TravelTimeLayers } from "./travel-time-layers";
import { buildTravelNetwork, TIME_BANDS, type TimeBand, type TravelNetwork } from "./travel-network";
import { TravelTimePanel, TravelYearDock, type YearResult } from "./travel-time-panel";
import { findTravelRoute, type TravelEndpoint } from "./travel-route";
import { readTravelUrl, writeTravelUrl } from "./travel-url";
import { TRAVEL_YEARS, type TravelYear } from "./travel-years";
import "./travel-time.css";

const STATION_PICK_RADIUS_PX = 18;

function endpointKey(endpoint: TravelEndpoint | null) {
  if (!endpoint) return "";
  return endpoint.kind === "station" ? endpoint.complex : endpoint.coordinate.join();
}

export default function TravelTimeMode({ theme, onClose }: { theme: MapTheme; onClose: () => void }) {
  const { current: mapRef } = useMap();
  const [initial] = useState(() => readTravelUrl(location.search));
  const [year, setYear] = useState<TravelYear>(initial.year ?? TRAVEL_YEARS[0]);
  const [band, setBand] = useState<TimeBand>(initial.band ?? TIME_BANDS[0]);
  const [od, setOd] = useState({ origin: initial.origin, destination: initial.destination });
  const [showReference, setShowReference] = useState(false);

  // 연도별 그래프 구성 + 3개 연도 탐색은 합쳐 수 ms~수십 ms다. 숫자 애니메이션·지도 이벤트로 다시 그릴 때마다
  // 반복하지 않도록 시간대와 출발·도착이 바뀔 때만 계산한다.
  const networks = useMemo(
    () => TRAVEL_YEARS.map(value => buildTravelNetwork(BASE_GRAPH, FUTURE_LINES.lines, value, band, REGIONAL_LINES, REGIONAL_TIMINGS)),
    [band],
  );
  const results = useMemo<YearResult[]>(() => networks.map(network => {
    const { origin, destination } = od;
    const failure = origin && destination
      ? routeFailure(origin, network, "출발") ?? routeFailure(destination, network, "도착")
      : null;
    const route = origin && destination && !failure ? findTravelRoute(network, origin, destination) : null;
    return { year: network.year, network, route, failure };
  }), [networks, od]);
  const current = results.find(result => result.year === year)!;

  useEffect(() => {
    history.replaceState(history.state, "", writeTravelUrl(location.href, { active: true, ...od, year, band }));
  }, [od, year, band]);
  useEffect(() => () => {
    history.replaceState(history.state, "", writeTravelUrl(location.href, {
      active: false, origin: null, destination: null, year: TRAVEL_YEARS[0], band: TIME_BANDS[0],
    }));
  }, []);

  // 지도 클릭 핸들러는 한 번만 붙이고, 그 해 역 목록은 ref로 읽는다.
  const networkRef = useRef<TravelNetwork>(current.network);
  useEffect(() => { networkRef.current = current.network; }, [current.network]);
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    const onClick = (event: MapLayerMouseEvent) => {
      if ((event.originalEvent.target as HTMLElement | null)?.closest?.(".travel-panel, .travel-year-dock")) return;
      let picked: string | null = null;
      let best = STATION_PICK_RADIUS_PX;
      for (const complex of networkRef.current.complexes.values()) {
        const point = map.project(complex.coordinate);
        const distance = Math.hypot(point.x - event.point.x, point.y - event.point.y);
        if (distance < best) { best = distance; picked = complex.id; }
      }
      const endpoint: TravelEndpoint = picked
        ? { kind: "station", complex: picked }
        : { kind: "point", coordinate: [event.lngLat.lng, event.lngLat.lat] };
      setOd(previous => previous.origin && !previous.destination
        ? { origin: previous.origin, destination: endpoint }
        : { origin: endpoint, destination: null });
    };
    map.on("click", onClick);
    const canvas = map.getCanvas();
    canvas.style.cursor = "crosshair";
    return () => {
      map.off("click", onClick);
      canvas.style.cursor = "";
    };
  }, [mapRef]);

  // 출발·도착이 바뀔 때만 카메라를 옮긴다. 연도를 넘길 때는 같은 화면에서 비교되도록 그대로 둔다.
  const odKey = `${endpointKey(od.origin)}|${endpointKey(od.destination)}`;
  const fittedKey = useRef("");
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map || !od.origin || !od.destination || fittedKey.current === odKey) return;
    fittedKey.current = odKey;
    const latest = networks.at(-1)!;
    const extra = [endpointCoordinate(od.origin, latest), endpointCoordinate(od.destination, latest)].filter(Boolean) as [number, number][];
    const bounds = results.reduce<ReturnType<typeof routeBounds>>((all, result) => {
      const next = routeBounds(result.route, extra);
      if (!all || !next) return all ?? next;
      return [
        [Math.min(all[0][0], next[0][0]), Math.min(all[0][1], next[0][1])],
        [Math.max(all[1][0], next[1][0]), Math.max(all[1][1], next[1][1])],
      ];
    }, null);
    if (!bounds) return;
    const mobile = map.getContainer().clientWidth <= 640;
    map.fitBounds(bounds, {
      padding: mobile
        ? { top: 70, bottom: Math.round(map.getContainer().clientHeight * 0.42), left: 28, right: 28 }
        : { top: 90, bottom: 170, left: 70, right: 470 },
      maxZoom: 14,
      pitch: mobile ? 30 : 42,
      duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700,
    });
  }, [mapRef, odKey, od, networks, results]);

  const picking = !od.origin ? "origin" : !od.destination ? "destination" : null;

  return <>
    <TravelTimeLayers lines={FUTURE_LINES.lines} year={year} showReference={showReference}
      route={current.route} network={current.network} theme={theme} origin={od.origin} destination={od.destination} />
    <TravelTimePanel
      results={results}
      year={year}
      onYear={setYear}
      band={band}
      onBand={setBand}
      origin={od.origin}
      destination={od.destination}
      picking={picking}
      onPreset={(origin, destination) => setOd({
        origin: { kind: "station", complex: origin },
        destination: { kind: "station", complex: destination },
      })}
      onSwap={() => setOd(previous => ({ origin: previous.destination, destination: previous.origin }))}
      onReset={() => setOd({ origin: null, destination: null })}
      onClose={onClose}
    />
    <TravelYearDock year={year} onYear={setYear} showReference={showReference} onShowReference={setShowReference} />
  </>;
}
