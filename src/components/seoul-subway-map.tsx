import { use } from "react";
import { DeckGL } from "@deck.gl/react";
import Map from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE } from "../app/map-config";
import { SEOUL_TRANSIT_DARK_STYLE } from "../app/map-style";
import { createSubwayRoutePathLayers } from "../features/subway/subway-paths";
import { fetchSeoulSubwayStations } from "../services/subway-station";
import { SeoulSubwayLayers } from "./seoul-subway-layers";

const subwayStationsPromise = fetchSeoulSubwayStations();

export function SeoulSubwayMap() {
  const stations = use(subwayStationsPromise);
  const routeLayers = createSubwayRoutePathLayers(stations);

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller
      layers={routeLayers}
      style={{ width: "100%", height: "100%" }}
    >
      <Map mapStyle={SEOUL_TRANSIT_DARK_STYLE}>
        <SeoulSubwayLayers stations={stations} />
      </Map>
    </DeckGL>
  );
}
