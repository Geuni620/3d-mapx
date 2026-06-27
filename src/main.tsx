import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import Map from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE, MAP_STYLE_URL } from "./app/map-config";
import { SeoulSubwayLayers } from "./components/seoul-subway-layers";
import { SubwayLineLegend } from "./components/subway-line-legend";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

function App() {
  return (
    <div className="relative h-screen w-screen">
      <Map
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={MAP_STYLE_URL}
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
