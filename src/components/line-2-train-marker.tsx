import { useEffect } from "react";
import { Marker } from "maplibre-gl";
import { useMap } from "react-map-gl/maplibre";
import { useTrainClock } from "../features/night-pulse/train-clock";
import { line2DirectionName } from "../features/subway/line-2-presentation";
import type { ScheduledTrain } from "../features/subway/line-2-timetable";

export function Line2TrainMarker({ train, approach = false }: { train: ScheduledTrain; approach?: boolean }) {
  const { current: mapRef } = useMap();
  const now = useTrainClock();
  useEffect(() => {
    const map = mapRef?.getMap();
    if (!map) return;
    const element = document.createElement("div");
    element.className = approach ? "line2-train-marker line2-approach-marker" : "line2-train-marker";
    element.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = `${line2DirectionName(train)} ${train.number}`;
    element.append(label);
    const marker = new Marker({ element, anchor: "center" });
    let frame = 0;
    let lastTime = NaN;
    function update() {
      const time = now();
      if (time !== lastTime && !document.hidden) {
        lastTime = time;
        marker.setLngLat(train.getLeadPose(time).lead.coordinate);
      }
      frame = requestAnimationFrame(update);
    }
    marker.setLngLat(train.getLeadPose(now()).lead.coordinate).addTo(map);
    frame = requestAnimationFrame(update);
    return () => { cancelAnimationFrame(frame); marker.remove(); };
  }, [mapRef, now, train, approach]);
  return null;
}
