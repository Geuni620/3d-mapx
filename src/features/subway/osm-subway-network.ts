import line1 from "./data/osm-subway-line-1.json";
import line2 from "./data/osm-subway-line-2.json";
import line3 from "./data/osm-subway-line-3.json";
import line4 from "./data/osm-subway-line-4.json";
import line5 from "./data/osm-subway-line-5.json";
import line6 from "./data/osm-subway-line-6.json";
import line7 from "./data/osm-subway-line-7.json";
import line8 from "./data/osm-subway-line-8.json";
import type { SubwayLineNumber } from "./subway-constants";

export type SubwayCoordinate = [longitude: number, latitude: number];

export interface SeoulSubwayOsmNetworkSource {
  provider: "OpenStreetMap";
  license: "ODbL-1.0";
  copyrightUrl: string;
  fetchedAt: string;
  routeMasterRelationIds: Record<SubwayLineNumber, number>;
}

export interface SeoulSubwayOsmRoute {
  id: string;
  lineNumber: SubwayLineNumber;
  name: string;
  routeMasterRelationId: number;
  osmRelationIds: number[];
  pathSegments: SubwayCoordinate[][];
}

export type SubwayServiceDirection =
  | "outer-loop"
  | "inner-loop"
  | "outbound"
  | "inbound"
  | "unknown";

export interface SeoulSubwayOsmServiceStop {
  id: string;
  osmNodeId: number;
  name: string;
  coordinate: SubwayCoordinate;
  distanceMeters: number;
}

export interface SeoulSubwayOsmServiceRoute {
  id: string;
  lineNumber: SubwayLineNumber;
  osmRelationId: number;
  name: string;
  from?: string;
  to?: string;
  direction: SubwayServiceDirection;
  path: SubwayCoordinate[];
  stops: SeoulSubwayOsmServiceStop[];
}

export interface SeoulSubwayOsmStation {
  id: string;
  osmNodeId: number;
  lineNumber: SubwayLineNumber;
  sequence: number;
  ref?: string;
  name: string;
  longitude: number;
  latitude: number;
}

export interface SeoulSubwayOsmLineNetwork {
  route: SeoulSubwayOsmRoute;
  stations: SeoulSubwayOsmStation[];
  serviceRoutes?: SeoulSubwayOsmServiceRoute[];
}

export interface SeoulSubwayOsmNetwork {
  source: SeoulSubwayOsmNetworkSource;
  routes: SeoulSubwayOsmRoute[];
  stations: SeoulSubwayOsmStation[];
  serviceRoutes: SeoulSubwayOsmServiceRoute[];
}

const SEOUL_SUBWAY_OSM_LINE_NETWORKS = [
  line1,
  line2,
  line3,
  line4,
  line5,
  line6,
  line7,
  line8,
] as unknown as SeoulSubwayOsmLineNetwork[];

export const SEOUL_SUBWAY_OSM_NETWORK = {
  source: {
    "provider": "OpenStreetMap",
    "license": "ODbL-1.0",
    "copyrightUrl": "https://www.openstreetmap.org/copyright",
    "fetchedAt": "2026-07-01",
    "routeMasterRelationIds": {
      "1": 8691899,
      "2": 7625892,
      "3": 7879839,
      "4": 7625893,
      "5": 7879871,
      "6": 7919154,
      "7": 7922930,
      "8": 7919019
    }
  },
  routes: SEOUL_SUBWAY_OSM_LINE_NETWORKS.map((lineNetwork) => lineNetwork.route),
  stations: SEOUL_SUBWAY_OSM_LINE_NETWORKS.flatMap(
    (lineNetwork) => lineNetwork.stations,
  ),
  serviceRoutes: SEOUL_SUBWAY_OSM_LINE_NETWORKS.flatMap(
    (lineNetwork) => lineNetwork.serviceRoutes ?? [],
  ),
} satisfies SeoulSubwayOsmNetwork;
