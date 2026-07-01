import { DeckGL } from "@deck.gl/react";
import Map from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE } from "../app/map-config";
import { SEOUL_TRANSIT_DARK_STYLE } from "../app/map-style";
import { SEOUL_SUBWAY_OSM_NETWORK } from "../features/subway/osm-subway-network";
import { createSubwayRoutePathLayers } from "../features/subway/subway-paths";
import type { SubwayStationMapPoint } from "../features/subway/subway-geojson";
import type { SubwayLineNumber } from "../features/subway/subway-constants";
import { SeoulSubwayLayers } from "./seoul-subway-layers";

interface SeoulSubwayMapProps {
  selectedLineNumbers: SubwayLineNumber[];
}

export function SeoulSubwayMap({ selectedLineNumbers }: SeoulSubwayMapProps) {
  const visibleStations = createVisibleSubwayStations(selectedLineNumbers);
  const routeLayers = createSubwayRoutePathLayers(selectedLineNumbers);

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller
      layers={routeLayers}
      style={{ width: "100%", height: "100%" }}
    >
      <Map mapStyle={SEOUL_TRANSIT_DARK_STYLE}>
        <SeoulSubwayLayers stations={visibleStations} />
      </Map>
    </DeckGL>
  );
}

function createVisibleSubwayStations(
  selectedLineNumbers: SubwayLineNumber[],
): SubwayStationMapPoint[] {
  return SEOUL_SUBWAY_OSM_NETWORK.stations.filter((station) =>
    selectedLineNumbers.includes(station.lineNumber),
  );
}
