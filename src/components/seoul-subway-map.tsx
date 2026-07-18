import { useEffect, useMemo, useRef } from "react";
import type { LayersList } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import Map, {
  useControl,
  useMap,
  type MapRef,
} from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE } from "../app/map-config";
import { SEOUL_TRANSIT_DARK_STYLE } from "../app/map-style";
import { SEOUL_SUBWAY_OSM_NETWORK } from "../features/subway/osm-subway-network";
import {
  createSubwayDeckLayers,
  createSubwayDisplayStations,
  type SubwayVisualLevel,
} from "../features/subway/subway-paths";
import type { SubwayStationMapPoint } from "../features/subway/subway-geojson";
import type { SubwayLineNumber } from "../features/subway/subway-constants";
import type { SubwayLayerVisibility } from "../features/subway/subway-layer-visibility";
import { SUBWAY_STATION_LABEL_LAYER_ID } from "../features/subway/subway-layer-ids";
import { SeoulSubwayLayers } from "./seoul-subway-layers";
import { SubwayTrainLayer } from "./subway-train-layer";

// 현재는 선발대로 2호선 본선의 외선·내선 운행 경로만 열차 레이어에 전달한다.
const LINE_2_MAIN_SERVICE_ROUTES = SEOUL_SUBWAY_OSM_NETWORK.serviceRoutes.filter(
  (serviceRoute) =>
    serviceRoute.lineNumber === 2 &&
    (serviceRoute.direction === "outer-loop" ||
      serviceRoute.direction === "inner-loop"),
);

interface SeoulSubwayMapProps {
  selectedLineNumbers: SubwayLineNumber[];
  layerVisibility: SubwayLayerVisibility;
  visualLevel: SubwayVisualLevel;
  zoom: number;
  isFollowingLine2Train: boolean;
  onZoomChange: (zoom: number) => void;
  onStopFollowingLine2Train: () => void;
}

export function SeoulSubwayMap({
  selectedLineNumbers,
  layerVisibility,
  visualLevel,
  zoom,
  isFollowingLine2Train,
  onZoomChange,
  onStopFollowingLine2Train,
}: SeoulSubwayMapProps) {
  const mapReference = useRef<MapRef>(null);
  const visibleStations = useMemo(
    () => createVisibleSubwayStations(selectedLineNumbers),
    [selectedLineNumbers],
  );
  // OSM 역사 노드는 노선 geometry와 어긋날 수 있어, 라벨/마커에는 보정 좌표를 사용한다.
  const displayStations = useMemo(
    () => createSubwayDisplayStations(visibleStations),
    [visibleStations],
  );
  const subwayDeckLayers = useMemo(
    () =>
      createSubwayDeckLayers(
        selectedLineNumbers,
        displayStations,
        layerVisibility,
        visualLevel,
      ),
    [displayStations, layerVisibility, selectedLineNumbers, visualLevel],
  );

  useEffect(() => {
    if (!isFollowingLine2Train) {
      return;
    }

    const initialCoordinate = LINE_2_MAIN_SERVICE_ROUTES[0]?.path[0];

    if (initialCoordinate === undefined) {
      return;
    }

    mapReference.current?.jumpTo({
      center: { lng: initialCoordinate[0], lat: initialCoordinate[1] },
      zoom: 16,
      pitch: 60,
    });
  }, [isFollowingLine2Train]);

  return (
    <Map
      ref={mapReference}
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={SEOUL_TRANSIT_DARK_STYLE}
      style={{ width: "100%", height: "100%" }}
      onMove={(event) => {
        const nextZoom = Number(event.viewState.zoom.toFixed(2));

        if (zoom !== nextZoom) {
          onZoomChange(nextZoom);
        }
      }}
      onDragStart={() => {
        if (isFollowingLine2Train) {
          onStopFollowingLine2Train();
        }
      }}
      onZoomStart={(event) => {
        if (isFollowingLine2Train && event.originalEvent !== undefined) {
          onStopFollowingLine2Train();
        }
      }}
    >
      <SeoulSubwayLayers stations={displayStations} />
      <DeckRouteOverlay layers={subwayDeckLayers} />
      <SubwayTrainLayer
        isActive={
          selectedLineNumbers.includes(2) &&
          layerVisibility.isTrainLayerVisible &&
          visualLevel.id === "inspection"
        }
        isFollowing={isFollowingLine2Train}
        serviceRoutes={LINE_2_MAIN_SERVICE_ROUTES}
      />
    </Map>
  );
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

    const updateRouteLayers = () => {
      if (map.getLayer(SUBWAY_STATION_LABEL_LAYER_ID) === undefined) {
        return;
      }

      overlay.setProps({ layers });
    };

    updateRouteLayers();
    map.on("styledata", updateRouteLayers);
    map.on("idle", updateRouteLayers);

    return () => {
      map.off("styledata", updateRouteLayers);
      map.off("idle", updateRouteLayers);
      overlay.setProps({ layers: [] });
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
