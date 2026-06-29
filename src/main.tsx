import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SeoulSubwayExplorer } from "./features/subway/seoul-subway-explorer";
import "./index.css";
import "maplibre-gl/dist/maplibre-gl.css";

export function App() {
  return <SeoulSubwayExplorer />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
