import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import Map from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE } from "./app/map-config";
import { SEOUL_TRANSIT_DARK_STYLE } from "./app/map-style";
import { SeoulSubwayLayers } from "./components/seoul-subway-layers";
import { SubwayLineLegend } from "./components/subway-line-legend";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

export function App() {
  return (
    <div className="relative h-screen w-screen">
      <Map
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={SEOUL_TRANSIT_DARK_STYLE}
        style={{ width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <SeoulSubwayLayers />
        </Suspense>
      </Map>
      <SubwayLineLegend className="absolute left-4 top-4 z-10" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
