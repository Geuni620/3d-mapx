import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { SeoulSubwayOsmServiceRoute } from "../features/subway/osm-subway-network";
import {
  SUBWAY_STATION_LABEL_LAYER_ID,
  SUBWAY_TRAIN_LAYER_ID,
} from "../features/subway/subway-layer-ids";
import { createSubwayTrainCustomLayer } from "../features/subway/subway-train-custom-layer";

interface SubwayTrainLayerProps {
  isActive: boolean;
  serviceRoutes: SeoulSubwayOsmServiceRoute[];
}

export function SubwayTrainLayer({
  isActive,
  serviceRoutes,
}: SubwayTrainLayerProps) {
  const { current: mapReference } = useMap();
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const map = mapReference?.getMap();

    if (map === undefined) {
      return;
    }

    const detachLayer = () => {
      if (map.getLayer(SUBWAY_TRAIN_LAYER_ID) !== undefined) {
        map.removeLayer(SUBWAY_TRAIN_LAYER_ID);
      }
    };
    const attachLayer = () => {
      if (
        !isActive ||
        serviceRoutes.length === 0 ||
        map.getLayer(SUBWAY_TRAIN_LAYER_ID) !== undefined ||
        map.getLayer(SUBWAY_STATION_LABEL_LAYER_ID) === undefined
      ) {
        return;
      }

      try {
        map.addLayer(
          createSubwayTrainCustomLayer({ serviceRoutes, reducedMotion }),
          SUBWAY_STATION_LABEL_LAYER_ID,
        );
      } catch (error) {
        console.error("2호선 Three.js 열차 레이어를 초기화하지 못했습니다.", error);
      }
    };

    if (isActive) {
      attachLayer();
    } else {
      detachLayer();
    }

    map.on("styledata", attachLayer);
    map.on("idle", attachLayer);

    return () => {
      map.off("styledata", attachLayer);
      map.off("idle", attachLayer);
      detachLayer();
    };
  }, [isActive, mapReference, reducedMotion, serviceRoutes]);

  return null;
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateReducedMotion = () => setReducedMotion(mediaQuery.matches);

    updateReducedMotion();
    mediaQuery.addEventListener("change", updateReducedMotion);

    return () => mediaQuery.removeEventListener("change", updateReducedMotion);
  }, []);

  return reducedMotion;
}
