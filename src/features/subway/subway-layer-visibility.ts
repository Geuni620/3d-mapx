export interface SubwayLayerVisibility {
  isRouteLayerVisible: boolean;
  isStationCircleLayerVisible: boolean;
  isTrainLayerVisible: boolean;
}

export interface SubwayLayerVisibilityAction {
  type:
    | "toggle-route-layer"
    | "toggle-station-circle-layer"
    | "toggle-train-layer";
}

export function createInitialSubwayLayerVisibility(): SubwayLayerVisibility {
  return {
    isRouteLayerVisible: true,
    isStationCircleLayerVisible: true,
    isTrainLayerVisible: true,
  };
}

export function subwayLayerVisibilityReducer(
  layerVisibility: SubwayLayerVisibility,
  action: SubwayLayerVisibilityAction,
): SubwayLayerVisibility {
  switch (action.type) {
    case "toggle-route-layer":
      return {
        ...layerVisibility,
        isRouteLayerVisible: !layerVisibility.isRouteLayerVisible,
      };

    case "toggle-station-circle-layer":
      return {
        ...layerVisibility,
        isStationCircleLayerVisible:
          !layerVisibility.isStationCircleLayerVisible,
      };

    case "toggle-train-layer":
      return {
        ...layerVisibility,
        isTrainLayerVisible: !layerVisibility.isTrainLayerVisible,
      };
  }
}
