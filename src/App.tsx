import Map from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import "./App.css";

const SEOUL_CENTER = {
  longitude: 126.978,
  latitude: 37.5665,
};

const INITIAL_VIEW_STATE = {
  ...SEOUL_CENTER,
  zoom: 11,
  pitch: 45,
  bearing: 0,
};

function App() {
  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      mapStyle="https://tiles.openfreemap.org/styles/bright"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}

export default App;
