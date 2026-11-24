import { useEffect, useRef, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { ScheduledTrain } from "../features/subway/line-2-timetable";
import {
  SUBWAY_STATION_LABEL_LAYER_ID,
  SUBWAY_TRAIN_LAYER_ID,
} from "../features/subway/subway-layer-ids";
import { createSubwayTrainCustomLayer } from "../features/subway/subway-train-custom-layer";

interface SubwayTrainLayerProps {
  isActive: boolean;
  trains: readonly ScheduledTrain[];
  frozenTimestamp: number | null;
}

// 첫 근접 확대에만 Three.js 레이어를 붙인다. 이후 줌 전환은 레이어의 불투명도를 사용한다.
export function SubwayTrainLayer({ isActive, trains, frozenTimestamp }: SubwayTrainLayerProps) {
  const { current: mapReference } = useMap();
  const current = useRef(trains);
  const [hasDetailLayer, setHasDetailLayer] = useState(isActive);
  useEffect(() => {
    current.current = trains;
    if (isActive) {
      setHasDetailLayer(true);
      mapReference?.getMap().triggerRepaint();
    }
  }, [trains, isActive, mapReference]);
  useEffect(() => {
    const map = mapReference?.getMap();

    if (map === undefined || !hasDetailLayer) {
      return;
    }

    const detachLayer = () => {
      if (map.getLayer(SUBWAY_TRAIN_LAYER_ID) !== undefined) {
        map.removeLayer(SUBWAY_TRAIN_LAYER_ID);
      }
    };
    // 지도 스타일과 역사 라벨이 준비된 뒤 열차 레이어를 라벨 아래에 추가한다.
    const attachLayer = () => {
      if (
        map.getLayer(SUBWAY_TRAIN_LAYER_ID) !== undefined ||
        map.getLayer(SUBWAY_STATION_LABEL_LAYER_ID) === undefined
      ) {
        return;
      }

      try {
        map.addLayer(
          createSubwayTrainCustomLayer({ getTrains: () => current.current, frozenTimestamp }),
          SUBWAY_STATION_LABEL_LAYER_ID,
        );
      } catch (error) {
        console.error("2호선 Three.js 열차 레이어를 초기화하지 못했습니다.", error);
      }
    };

    attachLayer();
    map.on("styledata", attachLayer);
    map.on("idle", attachLayer);

    return () => {
      map.off("styledata", attachLayer);
      map.off("idle", attachLayer);
      detachLayer();
    };
  }, [hasDetailLayer, mapReference, frozenTimestamp]);

  return null;
}
