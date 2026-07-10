export interface SubwayLayerVisibility {
  isRouteLayerVisible: boolean;
  isStationCircleLayerVisible: boolean;
}

export interface SubwayLayerVisibilityAction {
  type: "toggle-route-layer" | "toggle-station-circle-layer";
}

export function createInitialSubwayLayerVisibility(): SubwayLayerVisibility {
  return {
    isRouteLayerVisible: true,
    isStationCircleLayerVisible: true,
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
  }
}
