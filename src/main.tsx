import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { SeoulSubwayMap } from "./components/seoul-subway-map";
import { SubwayLineLegend } from "./components/subway-line-legend";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

export function App() {
  return (
    <div className="relative h-screen w-screen">
      <Suspense fallback={null}>
        <SeoulSubwayMap />
      </Suspense>
      <SubwayLineLegend className="absolute left-4 top-4 z-10" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
