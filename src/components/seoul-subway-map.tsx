import { useEffect } from "react";
import type { LayersList } from "@deck.gl/core";
import { MapboxOverlay } from "@deck.gl/mapbox";
import Map, { useControl, useMap } from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE } from "../app/map-config";
import { SEOUL_TRANSIT_DARK_STYLE } from "../app/map-style";
import { SEOUL_SUBWAY_OSM_NETWORK } from "../features/subway/osm-subway-network";
import { createSubwayRoutePathLayers } from "../features/subway/subway-paths";
import type { SubwayStationMapPoint } from "../features/subway/subway-geojson";
import type { SubwayLineNumber } from "../features/subway/subway-constants";
import { SUBWAY_STATION_LABEL_LAYER_ID } from "../features/subway/subway-layer-ids";
import { SeoulSubwayLayers } from "./seoul-subway-layers";

interface SeoulSubwayMapProps {
  selectedLineNumbers: SubwayLineNumber[];
}

export function SeoulSubwayMap({ selectedLineNumbers }: SeoulSubwayMapProps) {
  const visibleStations = createVisibleSubwayStations(selectedLineNumbers);
  const routeLayers = createSubwayRoutePathLayers(selectedLineNumbers);

  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle={SEOUL_TRANSIT_DARK_STYLE}
      style={{ width: "100%", height: "100%" }}
    >
      <SeoulSubwayLayers stations={visibleStations} />
      <DeckRouteOverlay layers={routeLayers} />
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
