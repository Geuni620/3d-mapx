import { CinemaTour, type CinemaTrainInput } from "../features/cinema/cinema-tour";
import type { CinemaShot } from "../features/cinema/cinema-sequence";
import { attachNightPulseStyle } from "../features/night-pulse/night-pulse-style";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LayersList } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import Map, { useControl, useMap } from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE } from "../app/map-config";
import { getSeoulTransitColors, SEOUL_TRANSIT_STYLES } from "../app/map-style";
import type { MapTheme } from "../app/seoul-daylight";
import { SEOUL_SUBWAY_OSM_NETWORK } from "../features/subway/osm-subway-network";
import {
  createSubwayVisualLevel,
  createSubwayDeckLayers,
  createSubwayDisplayStations,
  createSubwayRoutePaths,
  createSubwayStationCircles,
  type SubwayVisualLevel,
} from "../features/subway/subway-paths";
import type { SubwayStationMapPoint } from "../features/subway/subway-geojson";
import type { SubwayLineNumber } from "../features/subway/subway-constants";
import type { SubwayLayerVisibility } from "../features/subway/subway-layer-visibility";
import { SUBWAY_STATION_LABEL_LAYER_ID } from "../features/subway/subway-layer-ids";
import { SeoulSubwayLayers } from "./seoul-subway-layers";
import { DETAIL_START, DETAIL_END, PULSE_DETAIL_START } from "../features/subway/line-2-main-simulation";
import { Line2Service } from "./line-2-service";
import { Line2StationBoard } from "./line-2-station-board";
import { line2StationName } from "../features/subway/line-2-station-board";
import { getLine2StationDirections } from "../features/subway/line-2-timetable";
import type { PulseStationRegion } from "../features/night-pulse/night-pulse-layer";

const NightPulse = lazy(() => import("../features/night-pulse/night-pulse"));
const EMPTY_LAYERS: LayersList = [];
const SubwayFleetOverview = lazy(() => import("./subway-fleet-overview"));

interface SeoulSubwayMapProps {
  selectedLineNumbers: SubwayLineNumber[];
  layerVisibility: SubwayLayerVisibility;
  visualLevel: SubwayVisualLevel;
  zoom: number;
  theme: MapTheme;
  pulse: boolean;
  cinemaDirect: boolean;
  cinemaShot: CinemaShot | null;
  onCinemaShot: (shot: CinemaShot | null) => void;
  followOnMount: boolean;
  onZoomChange: (zoom: number) => void;
}

export function SeoulSubwayMap({
  selectedLineNumbers,
  layerVisibility,
  visualLevel,
  zoom,
  theme,
  pulse,
  cinemaDirect, cinemaShot, onCinemaShot,
  followOnMount,
  onZoomChange,
}: SeoulSubwayMapProps) {
  const [initialStyle] = useState(() => SEOUL_TRANSIT_STYLES[theme]);
  const [requestedTrain, setRequestedTrain] = useState<{ id: string | null } | null>(null);
  const [selectedTrainId, selectTrain] = useState<string | null>(null);
  const cinemaInput = useRef<CinemaTrainInput>({});
  const canShowLine2Trains = selectedLineNumbers.includes(2) && layerVisibility.isTrainLayerVisible;
  useEffect(() => {
    if (!canShowLine2Trains) {
      setRequestedTrain(null);
      selectTrain(null);
    }
  }, [canShowLine2Trains]);
  const [station, setStation] = useState<SubwayStationMapPoint | null>(null);
  const stationRegions = useRef<PulseStationRegion[]>([]);
  const onStationRegions = useCallback((regions: PulseStationRegion[]) => { stationRegions.current = regions; }, []);
  const closeStation = useCallback(() => setStation(null), []);
  const focusTrain = useCallback((train: { id: string | null }) => {
    if (train.id !== null) setStation(null);
    setRequestedTrain(train);
  }, []);
  const visibleStations = useMemo(
    () => createVisibleSubwayStations(selectedLineNumbers),
    [selectedLineNumbers],
  );
  // OSM 역사 노드는 노선 geometry와 어긋날 수 있어, 라벨/마커에는 보정 좌표를 사용한다.
  const displayStations = useMemo(
    () => createSubwayDisplayStations(visibleStations),
    [visibleStations],
  );
  const line2Stations = useMemo(() => displayStations.filter(
    candidate => candidate.lineNumber === 2 && getLine2StationDirections(line2StationName(candidate.name)),
  ), [displayStations]);
  const routePaths = useMemo(() => createSubwayRoutePaths(selectedLineNumbers), [selectedLineNumbers]);
  const stationCircles = useMemo(() => createSubwayStationCircles(displayStations), [displayStations]);
  const subwayDeckLayers = useMemo(
    () =>
      pulse ? EMPTY_LAYERS : createSubwayDeckLayers(
        routePaths,
        stationCircles,
        layerVisibility,
        visualLevel,
      ),
    [routePaths, stationCircles, layerVisibility, visualLevel, pulse],
  );

  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={initialStyle}
      style={{ width: "100%", height: "100%" }}
      onZoom={({ viewState }) => {
        const nextZoom = viewState.zoom;
        const trainLayerChanged = [DETAIL_START, DETAIL_END, PULSE_DETAIL_START].some((threshold) =>
          (zoom < threshold) !== (nextZoom < threshold),
        );
        if (trainLayerChanged || (zoom > 13) !== (nextZoom > 13) || createSubwayVisualLevel(nextZoom) !== visualLevel) {
          onZoomChange(nextZoom);
        }
      }}
      onZoomEnd={event => { if (!("cinema" in event)) onZoomChange(event.viewState.zoom); }}
      onClick={event => {
        if (event.defaultPrevented || !line2Stations.length) return;
        const { x, y } = event.point;
        const map = event.target;
        const byName = (name: string) => line2Stations.find(item => line2StationName(item.name) === line2StationName(name));
        const features = map.getLayer(SUBWAY_STATION_LABEL_LAYER_ID)
          ? map.queryRenderedFeatures(event.point, { layers: [SUBWAY_STATION_LABEL_LAYER_ID] })
          : [];
        // 환승역에서 지도에 남은 라벨이 다른 호선 소속이어도 같은 역의 전광판을 연다.
        let picked = features.map(feature => byName(feature.properties.name)).find(Boolean);
        if (!picked && layerVisibility.isStationCircleLayerVisible) {
          if (pulse) {
            const region = stationRegions.current.find(region =>
              x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height,
            );
            if (region) picked = byName(region.name);
          } else if (map.getZoom() > 12.4) {
            let distance = 12;
            for (const candidate of line2Stations) {
              const point = map.project([candidate.longitude, candidate.latitude]);
              const offset = Math.hypot(x - point.x, y - point.y);
              if (offset < distance) { picked = candidate; distance = offset; }
            }
          }
        }
        if (picked) {
          event.preventDefault();
          setStation(picked);
        }
      }}
    >
      <MapThemeColors theme={theme} pulse={pulse} />
      <SeoulSubwayLayers stations={displayStations} theme={theme} />
      <DeckRouteOverlay layers={subwayDeckLayers} />
      {pulse && <Suspense fallback={null}>
        <NightPulse onStationRegions={onStationRegions} lines={selectedLineNumbers} stations={displayStations}
          routes={routePaths}
          showRoutes={layerVisibility.isRouteLayerVisible}
          showStations={layerVisibility.isStationCircleLayerVisible}
          showTrains={layerVisibility.isTrainLayerVisible} />
      </Suspense>}
      {selectedLineNumbers.length > 0 && layerVisibility.isTrainLayerVisible && (
        <Suspense fallback={null}>
          <SubwayFleetOverview cinemaInput={cinemaInput} selectedLines={selectedLineNumbers} onLine2Focus={focusTrain} pulse={pulse} />
        </Suspense>
      )}
      {canShowLine2Trains && (
        <Line2Service zoom={zoom} requestedTrain={requestedTrain} pulse={pulse}
          selectedId={selectedTrainId} select={selectTrain}
          boardOpen={station !== null} onInspect={closeStation} followOnMount={followOnMount} />
      )}
      {station && selectedLineNumbers.includes(2) && <Line2StationBoard station={station} name={line2StationName(station.name)}
        showTrains={layerVisibility.isTrainLayerVisible} onClose={closeStation} />}
      <CinemaTour direct={cinemaDirect} shot={cinemaShot} onShot={onCinemaShot} trainInput={cinemaInput}
        blocked={(canShowLine2Trains && selectedTrainId !== null) || (station !== null && selectedLineNumbers.includes(2))} />
    </Map>
  );
}

function MapThemeColors({ theme, pulse }: { theme: MapTheme; pulse: boolean }) {
  const { current: mapReference } = useMap();
  useEffect(() => {
    const map = mapReference?.getMap();
    if (!map) return;
    const apply = () => {
      for (const { layerId, property, value } of getSeoulTransitColors(theme)) {
        if (map.getLayer(layerId) && map.getPaintProperty(layerId, property) !== value) {
          map.setPaintProperty(layerId, property, value);
        }
      }
    };
    apply();
    if (pulse) return attachNightPulseStyle(map);
    map.on("style.load", apply);
    return () => { map.off("style.load", apply); };
  }, [mapReference, theme, pulse]);
  return null;
}

interface DeckRouteOverlayProps {
  layers: LayersList;
}

function DeckRouteOverlay({ layers }: DeckRouteOverlayProps) {
  const { current: mapReference } = useMap();
  const overlay = useControl(
    () => new MapboxOverlay({ interleaved: true, layers: [] }),
  );
  // 재마운트 시 역 라벨이 준비되기 전 이전 레이어가 붙는 것을 막는다.
  useEffect(() => () => overlay.setProps({ layers: [] }), [overlay]);

  useEffect(() => {
    const map = mapReference?.getMap();

    if (map === undefined) {
      return;
    }

    let applied = false;
    const updateRouteLayers = () => {
      if (applied || map.getLayer(SUBWAY_STATION_LABEL_LAYER_ID) === undefined) {
        return;
      }

      applied = true;
      overlay.setProps({ layers });
    };

    updateRouteLayers();
    map.on("styledata", updateRouteLayers);
    map.on("idle", updateRouteLayers);

    return () => {
      map.off("styledata", updateRouteLayers);
      map.off("idle", updateRouteLayers);
    };
  }, [layers, mapReference, overlay]);

  return null;
}

function createVisibleSubwayStations(
  selectedLineNumbers: SubwayLineNumber[],
): SubwayStationMapPoint[] {
  return SEOUL_SUBWAY_OSM_NETWORK.stations.filter((station) =>
    selectedLineNumbers.includes(station.lineNumber),
  );
}
