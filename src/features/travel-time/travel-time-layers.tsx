import { useEffect } from "react";
import { Layer, Marker, Source, useMap } from "react-map-gl/maplibre";
import type { MapTheme } from "../../app/seoul-daylight";
import type { FutureLine } from "./travel-time-data";
import { endpointCoordinate } from "./travel-time-format";
import type { TravelNetwork } from "./travel-network";
import type { TravelEndpoint, TravelRoute } from "./travel-route";
import { describeOpening, isLineOpen, type TravelYear } from "./travel-years";

const FLOW_LAYER_ID = "travel-route-flow";
// 진행 방향으로 흐르는 점선. 대시 배열을 순서대로 바꾸는 방식이라 줌과 무관하게 일정한 속도로 보인다.
const FLOW_STEPS: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];

function lineFeatures(lines: FutureLine[], year: TravelYear, showReference: boolean) {
  return {
    type: "FeatureCollection" as const,
    features: lines
      .filter(line => line.included || showReference)
      .flatMap(line => line.geometry.map(coordinates => ({
        type: "Feature" as const,
        properties: {
          id: line.id,
          color: line.color,
          state: !line.included ? "reference" : isLineOpen(line, year) ? "open" : "planned",
        },
        geometry: { type: "LineString" as const, coordinates },
      }))),
  };
}

function stationFeatures(lines: FutureLine[], year: TravelYear, showReference: boolean) {
  const seen = new Set<string>();
  return {
    type: "FeatureCollection" as const,
    features: lines
      .filter(line => line.included || showReference)
      .flatMap(line => line.stations
        .filter(station => station.coordinate)
        .filter(station => {
          const key = `${station.name}:${station.coordinate!.join()}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map(station => ({
          type: "Feature" as const,
          properties: {
            name: station.name,
            color: line.color,
            opening: line.included ? describeOpening(line).label : `${line.stage} 단계`,
            state: !line.included ? "reference" : isLineOpen(line, year) ? "open" : "planned",
          },
          geometry: { type: "Point" as const, coordinates: station.coordinate! },
        }))),
  };
}

function routeFeatures(route: TravelRoute | null, network: TravelNetwork) {
  return {
    type: "FeatureCollection" as const,
    features: (route?.legs ?? []).flatMap(leg => {
      if (leg.kind === "ride") return [{
        type: "Feature" as const,
        properties: { kind: "ride", color: network.services.get(leg.service)!.color },
        geometry: { type: "LineString" as const, coordinates: leg.path },
      }];
      if (leg.kind === "walk") return [{
        type: "Feature" as const,
        properties: { kind: "walk", color: "#8e9c96" },
        geometry: { type: "LineString" as const, coordinates: [leg.from, leg.to] },
      }];
      return [];
    }),
  };
}

export function TravelTimeLayers({ lines, year, showReference, route, network, theme, origin, destination }: {
  lines: FutureLine[];
  year: TravelYear;
  showReference: boolean;
  route: TravelRoute | null;
  network: TravelNetwork;
  theme: MapTheme;
  origin: TravelEndpoint | null;
  destination: TravelEndpoint | null;
}) {
  const { current: mapRef } = useMap();
  const dark = theme === "dark";
  const hasRoute = Boolean(route?.legs.length);

  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map || !hasRoute || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let step = 0;
    const timer = window.setInterval(() => {
      if (!map.getLayer(FLOW_LAYER_ID)) return;
      step = (step + 1) % FLOW_STEPS.length;
      map.setPaintProperty(FLOW_LAYER_ID, "line-dasharray", FLOW_STEPS[step]);
    }, 60);
    return () => window.clearInterval(timer);
  }, [mapRef, hasRoute]);

  const originCoordinate = endpointCoordinate(origin, network);
  const destinationCoordinate = endpointCoordinate(destination, network);

  return <>
    <Source id="travel-future-lines" type="geojson" data={lineFeatures(lines, year, showReference)}>
      <Layer id="travel-future-reference" type="line" filter={["==", ["get", "state"], "reference"]}
        layout={{ "line-cap": "round" }}
        paint={{ "line-color": ["get", "color"], "line-width": 2, "line-opacity": 0.5, "line-dasharray": [0.6, 1.8] }} />
      <Layer id="travel-future-planned" type="line" filter={["==", ["get", "state"], "planned"]}
        paint={{ "line-color": ["get", "color"], "line-width": 2.6, "line-opacity": 0.72, "line-dasharray": [2, 1.6] }} />
      <Layer id="travel-future-open-casing" type="line" filter={["==", ["get", "state"], "open"]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": dark ? "#020403" : "#fffdf3", "line-width": 6.5, "line-opacity": 0.85 }} />
      <Layer id="travel-future-open" type="line" filter={["==", ["get", "state"], "open"]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": ["get", "color"], "line-width": 4 }} />
    </Source>
    <Source id="travel-future-stations" type="geojson" data={stationFeatures(lines, year, showReference)}>
      <Layer id="travel-future-station-ring" type="circle"
        paint={{
          "circle-radius": ["case", ["==", ["get", "state"], "open"], 5.5, 4],
          "circle-color": ["case", ["==", ["get", "state"], "open"], dark ? "#f4fff9" : "#ffffff", dark ? "#0b1411" : "#f4f6ef"],
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": ["case", ["==", ["get", "state"], "open"], 3, 1.6],
          "circle-opacity": ["case", ["==", ["get", "state"], "reference"], 0.55, 1],
          "circle-stroke-opacity": ["case", ["==", ["get", "state"], "reference"], 0.55, 1],
        }} />
      <Layer id="travel-future-station-label" type="symbol" minzoom={10.6}
        layout={{
          "text-field": ["format", ["get", "name"], { "font-scale": 1 }, "\n", {}, ["get", "opening"], { "font-scale": 0.82 }],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11.5,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-optional": true,
        }}
        paint={{
          "text-color": dark ? "#e9f6f0" : "#1e322b",
          "text-halo-color": dark ? "#020403" : "#fffdf3",
          "text-halo-width": 1.4,
          "text-opacity": ["case", ["==", ["get", "state"], "open"], 1, 0.7],
        }} />
    </Source>
    <Source id="travel-route" type="geojson" data={routeFeatures(route, network)}>
      <Layer id="travel-route-casing" type="line" layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": dark ? "#020403" : "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 8, 15, 14], "line-opacity": 0.92 }} />
      <Layer id="travel-route-line" type="line" filter={["==", ["get", "kind"], "ride"]}
        layout={{ "line-cap": "round", "line-join": "round" }}
        paint={{ "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 9, 5, 15, 9] }} />
      <Layer id="travel-route-walk" type="line" filter={["==", ["get", "kind"], "walk"]}
        layout={{ "line-cap": "round" }}
        paint={{ "line-color": dark ? "#c9d6d0" : "#4b5d56", "line-width": 3, "line-dasharray": [0.2, 1.8] }} />
      <Layer id={FLOW_LAYER_ID} type="line" filter={["==", ["get", "kind"], "ride"]}
        layout={{ "line-join": "round" }}
        paint={{ "line-color": "#ffffff", "line-opacity": 0.75, "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 15, 3], "line-dasharray": FLOW_STEPS[0] }} />
    </Source>
    {originCoordinate && <Marker longitude={originCoordinate[0]} latitude={originCoordinate[1]} anchor="bottom" style={{ zIndex: 4 }}>
      <span className="travel-pin" data-role="origin" aria-hidden="true">출발</span>
    </Marker>}
    {destinationCoordinate && <Marker longitude={destinationCoordinate[0]} latitude={destinationCoordinate[1]} anchor="bottom" style={{ zIndex: 4 }}>
      <span className="travel-pin" data-role="destination" aria-hidden="true">도착</span>
    </Marker>}
  </>;
}
