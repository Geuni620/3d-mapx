import { use } from "react";
import { DeckGL } from "@deck.gl/react";
import Map from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE } from "../app/map-config";
import { SEOUL_TRANSIT_DARK_STYLE } from "../app/map-style";
import { createSubwayRoutePathLayers } from "../features/subway/subway-paths";
import {
  fetchSeoulSubwayStations,
  type SeoulSubwayStation,
  type SubwayLineNumber,
} from "../services/subway-station";
import { SeoulSubwayLayers } from "./seoul-subway-layers";

const subwayStationsPromise = fetchSeoulSubwayStations();

interface SeoulSubwayMapProps {
  selectedLineNumbers: SubwayLineNumber[];
}

export function SeoulSubwayMap({ selectedLineNumbers }: SeoulSubwayMapProps) {
  const stations = use(subwayStationsPromise);
  const visibleStations = filterStationsByLine(stations, selectedLineNumbers);
  const routeLayers = createSubwayRoutePathLayers(visibleStations);

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

function filterStationsByLine(
  stations: SeoulSubwayStation[],
  selectedLineNumbers: SubwayLineNumber[],
): SeoulSubwayStation[] {
  return stations.filter((station) =>
    selectedLineNumbers.includes(station.lineNumber),
  );
}
