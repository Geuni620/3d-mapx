import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
import { DETAIL_START, DETAIL_END } from "../features/subway/line-2-main-simulation";
import { Line2Service } from "./line-2-service";

const SubwayFleetOverview = lazy(() => import("./subway-fleet-overview"));

interface SeoulSubwayMapProps {
  selectedLineNumbers: SubwayLineNumber[];
  layerVisibility: SubwayLayerVisibility;
  visualLevel: SubwayVisualLevel;
  zoom: number;
  theme: MapTheme;
  onZoomChange: (zoom: number) => void;
}

export function SeoulSubwayMap({
  selectedLineNumbers,
  layerVisibility,
  visualLevel,
  zoom,
  theme,
  onZoomChange,
}: SeoulSubwayMapProps) {
  const [initialStyle] = useState(() => SEOUL_TRANSIT_STYLES[theme]);
  const [requestedTrain, setRequestedTrain] = useState<{ id: string } | null>(null);
  const visibleStations = useMemo(
    () => createVisibleSubwayStations(selectedLineNumbers),
    [selectedLineNumbers],
  );
  // OSM 역사 노드는 노선 geometry와 어긋날 수 있어, 라벨/마커에는 보정 좌표를 사용한다.
  const displayStations = useMemo(
    () => createSubwayDisplayStations(visibleStations),
    [visibleStations],
  );
  const routePaths = useMemo(() => createSubwayRoutePaths(selectedLineNumbers), [selectedLineNumbers]);
  const stationCircles = useMemo(() => createSubwayStationCircles(displayStations), [displayStations]);
  const subwayDeckLayers = useMemo(
    () =>
      createSubwayDeckLayers(
        routePaths,
        stationCircles,
        layerVisibility,
        visualLevel,
      ),
    [routePaths, stationCircles, layerVisibility, visualLevel],
  );

  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={initialStyle}
      style={{ width: "100%", height: "100%" }}
      onZoom={({ viewState }) => {
        const nextZoom = viewState.zoom;
        const trainLayerChanged = [DETAIL_START, DETAIL_END].some((threshold) =>
          (zoom < threshold) !== (nextZoom < threshold),
        );
        if (trainLayerChanged || (zoom > 13) !== (nextZoom > 13) || createSubwayVisualLevel(nextZoom) !== visualLevel) {
          onZoomChange(nextZoom);
        }
      }}
      onZoomEnd={({ viewState }) => onZoomChange(viewState.zoom)}
    >
      <MapThemeColors theme={theme} />
      <SeoulSubwayLayers stations={displayStations} theme={theme} />
      <DeckRouteOverlay layers={subwayDeckLayers} />
      {selectedLineNumbers.length > 0 && layerVisibility.isTrainLayerVisible && (
        <Suspense fallback={null}>
          <SubwayFleetOverview selectedLines={selectedLineNumbers} onLine2Focus={setRequestedTrain} />
        </Suspense>
      )}
      {selectedLineNumbers.includes(2) && layerVisibility.isTrainLayerVisible && (
        <Line2Service zoom={zoom} requestedTrain={requestedTrain} />
      )}
    </Map>
  );
}

function MapThemeColors({ theme }: { theme: MapTheme }) {
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
    map.on("style.load", apply);
    return () => { map.off("style.load", apply); };
  }, [mapReference, theme]);
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
