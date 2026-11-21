import { useEffect, useMemo } from "react";
import type { LayersList } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import Map, { useControl, useMap } from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE } from "../app/map-config";
import { SEOUL_TRANSIT_DARK_STYLE } from "../app/map-style";
import { SEOUL_SUBWAY_OSM_NETWORK } from "../features/subway/osm-subway-network";
import {
  createSubwayVisualLevel,
  createSubwayDeckLayers,
  createSubwayDisplayStations,
  type SubwayVisualLevel,
} from "../features/subway/subway-paths";
import type { SubwayStationMapPoint } from "../features/subway/subway-geojson";
import type { SubwayLineNumber } from "../features/subway/subway-constants";
import type { SubwayLayerVisibility } from "../features/subway/subway-layer-visibility";
import { SUBWAY_STATION_LABEL_LAYER_ID } from "../features/subway/subway-layer-ids";
import { SeoulSubwayLayers } from "./seoul-subway-layers";
import { DETAIL_START, DETAIL_END } from "../features/subway/line-2-main-simulation";
import { Line2Service } from "./line-2-service";

interface SeoulSubwayMapProps {
  selectedLineNumbers: SubwayLineNumber[];
  layerVisibility: SubwayLayerVisibility;
  visualLevel: SubwayVisualLevel;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export function SeoulSubwayMap({
  selectedLineNumbers,
  layerVisibility,
  visualLevel,
  zoom,
  onZoomChange,
}: SeoulSubwayMapProps) {
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

  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={SEOUL_TRANSIT_DARK_STYLE}
      style={{ width: "100%", height: "100%" }}
      onMove={(event) => {
        const nextZoom = Number(event.viewState.zoom.toFixed(2));

        const debug = import.meta.env.DEV && new URLSearchParams(location.search).get("debug")==="1";
        const crossed = [13, DETAIL_START, DETAIL_END].some(z=>(zoom<z)!==(nextZoom<z));
        if (zoom !== nextZoom && (debug || crossed || createSubwayVisualLevel(nextZoom).id !== visualLevel.id)) {
          onZoomChange(nextZoom);
        }
      }}
    >
      <SeoulSubwayLayers stations={displayStations} />
      <DeckRouteOverlay layers={subwayDeckLayers} />
      {selectedLineNumbers.includes(2) && layerVisibility.isTrainLayerVisible && (
        <Line2Service zoom={zoom} />
      )}
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
