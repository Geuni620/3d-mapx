import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_DIR = process.env.OSM_SUBWAY_CACHE_DIR ?? "/private/tmp/3d-mapx-osm-subway";
const OUTPUT_DIR = new URL("../src/features/subway/data/", import.meta.url);
const NETWORK_MODULE_FILE = new URL(
  "../src/features/subway/osm-subway-network.ts",
  import.meta.url,
);

const ROUTE_MASTERS = [
  { lineNumber: 1, relationId: 8691899 },
  { lineNumber: 2, relationId: 7625892 },
  { lineNumber: 3, relationId: 7879839 },
  { lineNumber: 4, relationId: 7625893 },
  { lineNumber: 5, relationId: 7879871 },
  { lineNumber: 6, relationId: 7919154 },
  { lineNumber: 7, relationId: 7922930 },
  { lineNumber: 8, relationId: 7919019 },
];

async function main() {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const lineNetworks = [];

  const requestedLineNumber = getRequestedLineNumber();
  const routeMasters = requestedLineNumber === undefined
    ? ROUTE_MASTERS
    : ROUTE_MASTERS.filter(({ lineNumber }) => lineNumber === requestedLineNumber);

  if (routeMasters.length === 0) {
    throw new Error(`Unsupported subway line: ${requestedLineNumber}`);
  }

  for (const routeMaster of routeMasters) {
    const routeMasterXml = await loadRelationXml({
      lineNumber: routeMaster.lineNumber,
      relationId: routeMaster.relationId,
      filePrefix: "route-master",
    });
    const routeMasterOsm = parseOsmXml(routeMasterXml);
    const routeMasterRelation = routeMasterOsm.relations.get(routeMaster.relationId);

    if (routeMasterRelation === undefined) {
      throw new Error(`Missing route master relation: ${routeMaster.relationId}`);
    }

    const childRouteRelationIds = routeMasterRelation.members
      .filter((member) => member.type === "relation")
      .map((member) => member.ref);
    const childRouteXmls = await mapWithConcurrency(
      childRouteRelationIds,
      4,
      (relationId) =>
        loadRelationXml({
          lineNumber: routeMaster.lineNumber,
          relationId,
          filePrefix: "route",
        }),
    );
    const lineNetwork = createLineNetwork(
      routeMaster,
      mergeOsmData([routeMasterOsm, ...childRouteXmls.map(parseOsmXml)]),
    );

    lineNetworks.push(lineNetwork);
    console.log(
      `${routeMaster.lineNumber}호선: routes=${lineNetwork.routeCount}, ways=${lineNetwork.wayCount}, stations=${lineNetwork.stations.length}`,
    );
  }

  for (const lineNetwork of lineNetworks) {
    await writeLineNetworkData(lineNetwork);
  }

  const source = {
    provider: "OpenStreetMap",
    license: "ODbL-1.0",
    copyrightUrl: "https://www.openstreetmap.org/copyright",
    fetchedAt: getKoreanDateString(),
    routeMasterRelationIds: Object.fromEntries(
      ROUTE_MASTERS.map(({ lineNumber, relationId }) => [lineNumber, relationId]),
    ),
  };

  if (requestedLineNumber === undefined) {
    await writeFile(NETWORK_MODULE_FILE, formatNetworkModule(source));
  }
}

function writeLineNetworkData(lineNetwork) {
  const outputFile = new URL(
    `osm-subway-line-${lineNetwork.route.lineNumber}.json`,
    OUTPUT_DIR,
  );
  const data = {
    route: lineNetwork.route,
    stations: lineNetwork.stations,
    serviceRoutes: lineNetwork.serviceRoutes,
  };

  return writeFile(outputFile, `${JSON.stringify(data, null, 2)}\n`);
}

async function loadRelationXml({ lineNumber, relationId, filePrefix }) {
  const cacheFilePath = path.join(
    CACHE_DIR,
    `line-${lineNumber}-${filePrefix}-${relationId}.xml`,
  );

  if (!process.argv.includes("--refresh")) {
    try {
      return await readFile(cacheFilePath, "utf8");
    } catch {
      // Cache miss; fetch from OSM below.
    }
  }

  const response = await fetch(
    `https://api.openstreetmap.org/api/0.6/relation/${relationId}/full`,
    {
      headers: {
        "User-Agent": "3d-mapx-osm-subway-network-generator/1.0",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch OSM relation ${relationId}: ${response.status}`);
  }

  const xml = await response.text();
  await writeFile(cacheFilePath, xml);

  return xml;
}

function createLineNetwork(routeMaster, osm) {
  const routeMasterRelation = osm.relations.get(routeMaster.relationId);

  if (routeMasterRelation === undefined) {
    throw new Error(`Missing route master relation: ${routeMaster.relationId}`);
  }

  const childRouteRelations = routeMasterRelation.members
    .filter((member) => member.type === "relation")
    .map((member) => osm.relations.get(member.ref))
    .filter((relation) => relation !== undefined)
    .filter((relation) => relation.tags.type === "route");

  const contributingRelations =
    childRouteRelations.length > 0 ? childRouteRelations : [routeMasterRelation];

  const wayIds = getUniqueWayIds(contributingRelations, osm.ways);
  const pathSegments = createConnectedPathSegments(
    wayIds.map((wayId) => osm.ways.get(wayId)).filter((way) => way !== undefined),
    osm.nodes,
  );
  const stations = createStations(routeMaster.lineNumber, contributingRelations, osm.nodes);
  const relationIds = contributingRelations.map((relation) => relation.id);
  const serviceRoutes = contributingRelations
    .filter((relation) => relation.tags.route === "subway")
    .map((relation) => createServiceRoute(routeMaster.lineNumber, relation, osm))
    .filter((serviceRoute) => serviceRoute !== undefined);

  if (routeMaster.lineNumber === 2) {
    assertLine2ServiceRoutes(serviceRoutes);
  }

  return {
    routeCount: contributingRelations.length,
    wayCount: wayIds.length,
    route: {
      id: `line-${routeMaster.lineNumber}-osm-network`,
      lineNumber: routeMaster.lineNumber,
      name:
        routeMasterRelation.tags["name:ko"] ??
        routeMasterRelation.tags.name ??
        `${routeMaster.lineNumber}호선`,
      routeMasterRelationId: routeMaster.relationId,
      osmRelationIds: relationIds,
      pathSegments,
    },
    stations,
    serviceRoutes,
  };
}

// 한 방향의 지하철 노선 데이터를 열차가 따라갈 경로와 정차역 순서로 정리한다.
function createServiceRoute(lineNumber, relation, osm) {
  const ways = relation.members
    .filter((member) => member.type === "way")
    .map((member) => osm.ways.get(member.ref))
    .filter((way) => way !== undefined);
  const pathSegments = createConnectedPathSegments(ways, osm.nodes);
  const longestPath = pathSegments.toSorted(
    (first, second) => getPathLengthMeters(second) - getPathLengthMeters(first),
  )[0];
  const orderedStops = createOrderedServiceStops(lineNumber, relation, osm.nodes);

  if (longestPath === undefined || longestPath.length < 2 || orderedStops.length < 2) {
    return undefined;
  }

  const direction = classifyServiceDirection(relation.id, relation.tags);
  const path = direction === "outer-loop" || direction === "inner-loop"
    ? orientAndRotateServicePath(longestPath, orderedStops)
    : orientOpenServicePath(longestPath, orderedStops);
  const stops = orderedStops.map((stop) => {
    const projection = projectCoordinateOntoPath(stop.coordinate, path);

    return {
      id: stop.id,
      osmNodeId: stop.osmNodeId,
      name: stop.name,
      coordinate: projection.coordinate,
      distanceMeters: Number(projection.distanceMeters.toFixed(2)),
    };
  });

  return {
    id: `line-${lineNumber}-service-${relation.id}`,
    lineNumber,
    osmRelationId: relation.id,
    name: relation.tags["name:ko"] ?? relation.tags.name ?? `${lineNumber}호선`,
    from: relation.tags.from,
    to: relation.tags.to,
    direction,
    path,
    stops,
  };
}

function orientOpenServicePath(sourcePath, orderedStops) {
  const firstStopIndex = findClosestCoordinateIndex(sourcePath, orderedStops[0].coordinate);
  const secondStopIndex = findClosestCoordinateIndex(sourcePath, orderedStops[1].coordinate);

  return secondStopIndex >= firstStopIndex ? sourcePath : [...sourcePath].reverse();
}

function createOrderedServiceStops(lineNumber, relation, nodeMap) {
  const stops = [];
  const stopNames = new Set();

  for (const member of relation.members) {
    if (member.type !== "node" || !isStopRole(member.role)) {
      continue;
    }

    const node = nodeMap.get(member.ref);
    const name = getStationName(node);

    if (node === undefined || name === undefined) {
      continue;
    }

    const normalizedName = normalizeStationName(name);

    if (stopNames.has(normalizedName)) {
      continue;
    }

    stopNames.add(normalizedName);
    stops.push({
      id: `osm-node-${node.id}`,
      osmNodeId: node.id,
      lineNumber,
      name,
      coordinate: [node.lon, node.lat],
    });
  }

  return stops;
}

// 순환 경로의 시작점과 이동 방향을 첫 두 정차역의 운행 순서에 맞춘다.
function orientAndRotateServicePath(sourcePath, orderedStops) {
  let path = ensureClosedPath(sourcePath);
  const firstStopIndex = findClosestCoordinateIndex(path, orderedStops[0].coordinate);

  path = rotateClosedPath(path, firstStopIndex);

  const secondStopIndex = findClosestCoordinateIndex(path, orderedStops[1].coordinate);

  if (secondStopIndex > (path.length - 1) / 2) {
    path = [path[0], ...path.slice(1, -1).reverse(), path[0]];
  }

  return path;
}

function ensureClosedPath(path) {
  const first = path[0];
  const last = path.at(-1);

  if (first[0] === last[0] && first[1] === last[1]) {
    return [...path];
  }

  return [...path, first];
}

function rotateClosedPath(path, startIndex) {
  const openPath = path.slice(0, -1);
  const rotatedPath = [...openPath.slice(startIndex), ...openPath.slice(0, startIndex)];

  return [...rotatedPath, rotatedPath[0]];
}

function findClosestCoordinateIndex(path, coordinate) {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < path.length - 1; index += 1) {
    const distance = getDistanceMeters(path[index], coordinate);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  return closestIndex;
}

// 정차역을 운행 경로 위의 가장 가까운 위치로 맞추고 경로 시작점부터의 거리를 계산한다.
function projectCoordinateOntoPath(coordinate, path) {
  let cumulativeDistanceMeters = 0;
  let bestProjection;

  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const segmentLengthMeters = getDistanceMeters(start, end);
    const projection = projectCoordinateOntoSegment(coordinate, start, end);
    const offsetMeters = getDistanceMeters(coordinate, projection.coordinate);

    if (bestProjection === undefined || offsetMeters < bestProjection.offsetMeters) {
      bestProjection = {
        coordinate: projection.coordinate,
        distanceMeters: cumulativeDistanceMeters + segmentLengthMeters * projection.ratio,
        offsetMeters,
      };
    }

    cumulativeDistanceMeters += segmentLengthMeters;
  }

  return bestProjection;
}

// 역과 가장 가까운 선로 한 조각 위의 위치가 시작점에서 몇 퍼센트 지점인지 구한다.
function projectCoordinateOntoSegment(coordinate, start, end) {
  const latitudeScale = Math.cos((coordinate[1] * Math.PI) / 180);
  const deltaX = (end[0] - start[0]) * latitudeScale;
  const deltaY = end[1] - start[1];
  const coordinateX = (coordinate[0] - start[0]) * latitudeScale;
  const coordinateY = coordinate[1] - start[1];
  const squaredLength = deltaX * deltaX + deltaY * deltaY;
  const ratio = squaredLength === 0
    ? 0
    : Math.max(0, Math.min(1, (coordinateX * deltaX + coordinateY * deltaY) / squaredLength));

  return {
    coordinate: [
      start[0] + (end[0] - start[0]) * ratio,
      start[1] + (end[1] - start[1]) * ratio,
    ],
    ratio,
  };
}

function getPathLengthMeters(path) {
  return path.slice(1).reduce(
    (total, coordinate, index) => total + getDistanceMeters(path[index], coordinate),
    0,
  );
}

function getDistanceMeters(first, second) {
  const earthRadiusMeters = 6_371_008.8;
  const latitudeDelta = ((second[1] - first[1]) * Math.PI) / 180;
  const longitudeDelta = ((second[0] - first[0]) * Math.PI) / 180;
  const firstLatitude = (first[1] * Math.PI) / 180;
  const secondLatitude = (second[1] * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

// OSM 태그만으로 방향을 구분하기 어려워 확인된 relation ID를 운행 방향에 연결한다.
function classifyServiceDirection(relationId, tags) {
  const knownDirections = new Map([
    [2404374, "outer-loop"],
    [4729409, "inner-loop"],
    [4729405, "outbound"],
    [4729406, "inbound"],
    [4729408, "outbound"],
    [4729407, "inbound"],
  ]);

  return knownDirections.get(relationId) ??
    (tags.roundtrip === "yes" ? "unknown" : "unknown");
}

function assertLine2ServiceRoutes(serviceRoutes) {
  const expectedMainRoutes = new Map([
    [2404374, "outer-loop"],
    [4729409, "inner-loop"],
  ]);

  for (const [relationId, direction] of expectedMainRoutes) {
    const serviceRoute = serviceRoutes.find((route) => route.osmRelationId === relationId);

    if (serviceRoute === undefined || serviceRoute.direction !== direction) {
      throw new Error(`Unexpected Line 2 service relation: ${relationId}`);
    }
  }
}

function getRequestedLineNumber() {
  const lineArgumentIndex = process.argv.indexOf("--line");

  if (lineArgumentIndex === -1) {
    return undefined;
  }

  const lineNumber = Number(process.argv[lineArgumentIndex + 1]);

  if (!Number.isInteger(lineNumber)) {
    throw new Error("--line requires an integer line number");
  }

  return lineNumber;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const itemIndex = currentIndex;

      currentIndex += 1;
      results[itemIndex] = await mapper(items[itemIndex], itemIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  return results;
}

function mergeOsmData(osmDataList) {
  const nodes = new Map();
  const ways = new Map();
  const relations = new Map();

  for (const osmData of osmDataList) {
    mergeMap(nodes, osmData.nodes);
    mergeMap(ways, osmData.ways);
    mergeMap(relations, osmData.relations);
  }

  return { nodes, ways, relations };
}

function mergeMap(target, source) {
  for (const [key, value] of source) {
    target.set(key, value);
  }
}

function getUniqueWayIds(relations, wayMap) {
  const wayIds = [];
  const wayIdSet = new Set();

  for (const relation of relations) {
    for (const member of relation.members) {
      if (member.type !== "way" || wayIdSet.has(member.ref) || !wayMap.has(member.ref)) {
        continue;
      }

      wayIdSet.add(member.ref);
      wayIds.push(member.ref);
    }
  }

  return wayIds;
}

function createStations(lineNumber, relations, nodeMap) {
  const stationsByName = new Map();

  for (const relation of relations) {
    for (const member of relation.members) {
      if (member.type !== "node" || !isStationRole(member.role)) {
        continue;
      }

      const node = nodeMap.get(member.ref);
      const name = getStationName(node);

      if (node === undefined || name === undefined) {
        continue;
      }

      const normalizedName = normalizeStationName(name);
      const currentStation = stationsByName.get(normalizedName);
      const nextStation = {
        id: `osm-node-${node.id}`,
        osmNodeId: node.id,
        lineNumber,
        sequence: currentStation?.sequence ?? stationsByName.size + 1,
        ref: node.tags.ref,
        name,
        longitude: node.lon,
        latitude: node.lat,
      };

      if (currentStation === undefined || isStopRole(member.role)) {
        stationsByName.set(normalizedName, nextStation);
      }
    }
  }

  return Array.from(stationsByName.values()).sort(
    (a, b) => a.sequence - b.sequence || a.name.localeCompare(b.name, "ko"),
  );
}

function createConnectedPathSegments(ways, nodeMap) {
  const unusedWayMap = new Map(
    ways
      .filter((way) => way.nodeRefs.length >= 2)
      .map((way) => [way.id, way.nodeRefs]),
  );
  const endpointWayIds = createEndpointWayIds(unusedWayMap);
  const pathSegments = [];

  while (unusedWayMap.size > 0) {
    const [wayId, nodeRefs] = unusedWayMap.entries().next().value;
    removeWay(wayId, nodeRefs, unusedWayMap, endpointWayIds);

    const connectedNodeRefs = [...nodeRefs];

    extendPath(connectedNodeRefs, "forward", unusedWayMap, endpointWayIds);
    extendPath(connectedNodeRefs, "backward", unusedWayMap, endpointWayIds);

    const coordinates = connectedNodeRefs
      .map((nodeRef) => nodeMap.get(nodeRef))
      .filter((node) => node !== undefined)
      .map((node) => [node.lon, node.lat]);

    if (coordinates.length >= 2) {
      pathSegments.push(coordinates);
    }
  }

  return pathSegments;
}

function createEndpointWayIds(wayMap) {
  const endpointWayIds = new Map();

  for (const [wayId, nodeRefs] of wayMap) {
    addEndpointWayId(endpointWayIds, nodeRefs[0], wayId);
    addEndpointWayId(endpointWayIds, nodeRefs.at(-1), wayId);
  }

  return endpointWayIds;
}

function extendPath(pathNodeRefs, direction, unusedWayMap, endpointWayIds) {
  while (true) {
    const endpoint =
      direction === "forward" ? pathNodeRefs.at(-1) : pathNodeRefs[0];
    const nextWayId = findConnectedWayId(endpoint, unusedWayMap, endpointWayIds);

    if (nextWayId === undefined) {
      return;
    }

    const nextWayNodeRefs = unusedWayMap.get(nextWayId);
    removeWay(nextWayId, nextWayNodeRefs, unusedWayMap, endpointWayIds);

    const orientedNodeRefs =
      nextWayNodeRefs[0] === endpoint
        ? nextWayNodeRefs
        : [...nextWayNodeRefs].reverse();

    if (direction === "forward") {
      pathNodeRefs.push(...orientedNodeRefs.slice(1));
      continue;
    }

    pathNodeRefs.unshift(...orientedNodeRefs.slice(1).reverse());
  }
}

function findConnectedWayId(endpoint, unusedWayMap, endpointWayIds) {
  const wayIds = endpointWayIds.get(endpoint);

  if (wayIds === undefined) {
    return undefined;
  }

  return Array.from(wayIds).find((wayId) => unusedWayMap.has(wayId));
}

function addEndpointWayId(endpointWayIds, endpoint, wayId) {
  if (endpoint === undefined) {
    return;
  }

  const wayIds = endpointWayIds.get(endpoint) ?? new Set();

  wayIds.add(wayId);
  endpointWayIds.set(endpoint, wayIds);
}

function removeWay(wayId, nodeRefs, unusedWayMap, endpointWayIds) {
  unusedWayMap.delete(wayId);
  endpointWayIds.get(nodeRefs[0])?.delete(wayId);
  endpointWayIds.get(nodeRefs.at(-1))?.delete(wayId);
}

function isStationRole(role) {
  return isStopRole(role) || role.includes("platform");
}

function isStopRole(role) {
  return role.includes("stop");
}

function getStationName(node) {
  return node?.tags["name:ko"] ?? node?.tags.name;
}

function normalizeStationName(stationName) {
  return stationName.replace(/\s*\(.+\)\s*$/, "").replace(/\s+/g, "").trim();
}

function parseOsmXml(xml) {
  return {
    nodes: parseNodes(xml),
    ways: parseWays(xml),
    relations: parseRelations(xml),
  };
}

function parseNodes(xml) {
  const nodes = new Map();
  const nodePattern = /<node\b([^>]*?)(?:\/>|>([\s\S]*?)<\/node>)/g;

  for (const match of xml.matchAll(nodePattern)) {
    const attrs = parseAttributes(match[1]);
    const body = match[2] ?? "";
    const id = Number(attrs.id);

    nodes.set(id, {
      id,
      lat: roundCoordinate(Number(attrs.lat)),
      lon: roundCoordinate(Number(attrs.lon)),
      tags: parseTags(body),
    });
  }

  return nodes;
}

function parseWays(xml) {
  const ways = new Map();
  const wayPattern = /<way\b([^>]*)>([\s\S]*?)<\/way>/g;

  for (const match of xml.matchAll(wayPattern)) {
    const attrs = parseAttributes(match[1]);
    const body = match[2] ?? "";
    const id = Number(attrs.id);

    ways.set(id, {
      id,
      nodeRefs: Array.from(body.matchAll(/<nd\b([^>]*)\/>/g)).map((ndMatch) =>
        Number(parseAttributes(ndMatch[1]).ref),
      ),
      tags: parseTags(body),
    });
  }

  return ways;
}

function parseRelations(xml) {
  const relations = new Map();
  const relationPattern = /<relation\b([^>]*)>([\s\S]*?)<\/relation>/g;

  for (const match of xml.matchAll(relationPattern)) {
    const attrs = parseAttributes(match[1]);
    const body = match[2] ?? "";
    const id = Number(attrs.id);

    relations.set(id, {
      id,
      members: Array.from(body.matchAll(/<member\b([^>]*)\/>/g)).map((memberMatch) => {
        const memberAttrs = parseAttributes(memberMatch[1]);

        return {
          type: memberAttrs.type,
          ref: Number(memberAttrs.ref),
          role: memberAttrs.role ?? "",
        };
      }),
      tags: parseTags(body),
    });
  }

  return relations;
}

function parseTags(body) {
  return Object.fromEntries(
    Array.from(body.matchAll(/<tag\b([^>]*)\/>/g)).map((tagMatch) => {
      const attrs = parseAttributes(tagMatch[1]);

      return [attrs.k, attrs.v];
    }),
  );
}

function parseAttributes(value) {
  return Object.fromEntries(
    Array.from(value.matchAll(/([^\s=]+)="([^"]*)"/g)).map((match) => [
      match[1],
      decodeXml(match[2]),
    ]),
  );
}

function decodeXml(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function roundCoordinate(value) {
  return Number(value.toFixed(7));
}

function getKoreanDateString() {
  const dateParts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const datePartByType = Object.fromEntries(
    dateParts.map((datePart) => [datePart.type, datePart.value]),
  );

  return `${datePartByType.year}-${datePartByType.month}-${datePartByType.day}`;
}

function indentJsonBlock(value, indentSize) {
  const [firstLine, ...remainingLines] = value.split("\n");
  const indent = " ".repeat(indentSize);

  return [
    firstLine,
    ...remainingLines.map((line) => `${indent}${line}`),
  ].join("\n");
}

function formatNetworkModule(source) {
  const lineImports = ROUTE_MASTERS.map(
    ({ lineNumber }) =>
      `import line${lineNumber} from "./data/osm-subway-line-${lineNumber}.json";`,
  ).join("\n");
  const lineNetworkItems = ROUTE_MASTERS.map(
    ({ lineNumber }) => `  line${lineNumber},`,
  ).join("\n");

  return `${lineImports}
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
${lineNetworkItems}
] as unknown as SeoulSubwayOsmLineNetwork[];

export const SEOUL_SUBWAY_OSM_NETWORK = {
  source: ${indentJsonBlock(JSON.stringify(source, null, 2), 2)},
  routes: SEOUL_SUBWAY_OSM_LINE_NETWORKS.map((lineNetwork) => lineNetwork.route),
  stations: SEOUL_SUBWAY_OSM_LINE_NETWORKS.flatMap(
    (lineNetwork) => lineNetwork.stations,
  ),
  serviceRoutes: SEOUL_SUBWAY_OSM_LINE_NETWORKS.flatMap(
    (lineNetwork) => lineNetwork.serviceRoutes ?? [],
  ),
} satisfies SeoulSubwayOsmNetwork;
`;
}

await main();
