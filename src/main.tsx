import { StrictMode, Suspense } from "react";
import type { DeckProps } from "@deck.gl/core";
import { DeckGL } from "@deck.gl/react";
import { createRoot } from "react-dom/client";
import Map from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE } from "./app/map-config";
import { SEOUL_TRANSIT_DARK_STYLE } from "./app/map-style";
import { SeoulSubwayLayers } from "./components/seoul-subway-layers";
import { SubwayLineLegend } from "./components/subway-line-legend";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

const DECK_LAYERS: DeckProps["layers"] = [];

export function App() {
  return (
    <div className="relative h-screen w-screen">
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller
        layers={DECK_LAYERS}
        style={{ width: "100%", height: "100%" }}
      >
        <Map mapStyle={SEOUL_TRANSIT_DARK_STYLE}>
          <Suspense fallback={null}>
            <SeoulSubwayLayers />
          </Suspense>
        </Map>
      </DeckGL>
      <SubwayLineLegend className="absolute left-4 top-4 z-10" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
