import { BufferGeometry, Color, Float32BufferAttribute } from "three";

const HALF_WIDTH = 1.56;
export const BODY_HALF = 9.5;
export const CAB_JOIN = BODY_HALF - 1.25;
export const ROOF = 3.4;
const SHOULDER = 3.1;
const DOOR_HALF = 0.65;
const DOOR_TOP = 3.0;
const CAB_DOORS = [-7.25, -2.6, 2.05, 6.6];
const MID_DOORS = [-7.05, -2.35, 2.35, 7.05];

export function doorCenters(cab: boolean): readonly number[] {
  return cab ? CAB_DOORS : MID_DOORS;
}

type Point = [number, number, number];
type AtlasRegion = [number, number, number, number];

function geometry(vertices: number[], uvs: number[], indices: number[]) {
  const mesh = new BufferGeometry();
  mesh.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  mesh.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  return mesh;
}

function atlasUV([x, y, width, height]: AtlasRegion, u: number, v: number) {
  return [(x + 0.5 + u * (width - 1)) / 2048, 1 - (y + 0.5 + (1 - v) * (height - 1)) / 1024];
}

// +Y 방향이 선두, Z가 높이. 좌우 면에 서로 다른 UV를 줘 운전실 쪽 출입문 위치를 맞춘다.
export function createSideSkin(cab: boolean) {
  const front = cab ? CAB_JOIN : BODY_HALF;
  const vertices: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const rightOpen: number[] = [],
    leftOpen: number[] = [];
  for (const side of [1, -1]) {
    const row = cab ? (side === 1 ? 0 : 1) : 2;
    const region: AtlasRegion = [4, 4 + row * 224, 2040, 216];
    const left = side === 1 ? -BODY_HALF : front;
    const right = side === 1 ? front : -BODY_HALF;
    // 문짝과 고정 옆판을 같은 아틀라스 좌표에서 잘라 닫힌 상태의 도색이 끊기지 않게 한다.
    function panel(from: number, to: number, bottom: number, top: number, travel = 0) {
      const start = vertices.length / 3;
      const a = side === 1 ? from : to;
      const b = side === 1 ? to : from;
      for (const [y, z] of [
        [a, bottom],
        [b, bottom],
        [b, top],
        [a, top],
      ]) {
        vertices.push(side * HALF_WIDTH, y, z);
        uvs.push(...atlasUV(region, (y - left) / (right - left), (z - 1) / (SHOULDER - 1)));
        // 바깥쪽 옆판 뒤로 인입된다. 반대편 문과 창은 제자리에 남는다.
        const dx = travel === 0 ? 0 : -side * 0.075;
        rightOpen.push(side === 1 ? dx : 0, side === 1 ? travel : 0, 0);
        leftOpen.push(side === -1 ? dx : 0, side === -1 ? travel : 0, 0);
      }
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    let previous = -BODY_HALF;
    for (const y of doorCenters(cab)) {
      panel(previous, y - DOOR_HALF, 1, DOOR_TOP);
      panel(y - DOOR_HALF, y, 1, DOOR_TOP, -DOOR_HALF);
      panel(y, y + DOOR_HALF, 1, DOOR_TOP, DOOR_HALF);
      previous = y + DOOR_HALF;
    }
    panel(previous, front, 1, DOOR_TOP);
    panel(-BODY_HALF, front, DOOR_TOP, SHOULDER);
  }
  const mesh = geometry(vertices, uvs, indices);
  mesh.morphTargetsRelative = true;
  mesh.morphAttributes.position = [rightOpen, leftOpen].map(
    (v) => new Float32BufferAttribute(v, 3),
  );
  return mesh;
}

// 객실 문설주의 개폐 안내를 지도 외형에서도 읽게 한 표현. 네 가중치는 좌우 × 열림·닫힘이다.
// 지오메트리와 재질은 공유하고 Mesh별 색상 가중치로 개별 차량만 점등한다.
export function createDoorLamps(cab: boolean) {
  const vertices: number[] = [],
    indices: number[] = [];
  const channels: number[][] = [[], [], [], []];
  const green = new Color("#56ff9d"),
    amber = new Color("#ffbe39");
  for (const side of [1, -1]) {
    const sideIndex = side === 1 ? 0 : 1;
    for (const y of doorCenters(cab)) {
      for (const edge of [-DOOR_HALF, DOOR_HALF]) {
        const start = vertices.length / 3;
        for (const [halfWidth, halfHeight, power] of [
          [0.105, 0.5, 0],
          [0.033, 0.42, 1],
        ]) {
          for (const [dy, dz] of [
            [-halfWidth, -halfHeight],
            [halfWidth, -halfHeight],
            [halfWidth, halfHeight],
            [-halfWidth, halfHeight],
          ]) {
            vertices.push(side * (HALF_WIDTH + 0.025), y + edge + dy, 2.39 + dz);
            for (let i = 0; i < channels.length; i++) {
              const color = i < 2 ? green : amber;
              const alpha = i % 2 === sideIndex ? power : 0;
              channels[i].push(color.r, color.g, color.b, alpha);
            }
          }
        }
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          indices.push(
            start + i,
            start + j,
            start + i + 4,
            start + j,
            start + j + 4,
            start + i + 4,
          );
        }
        indices.push(start + 4, start + 5, start + 6, start + 4, start + 6, start + 7);
      }
    }
  }
  const mesh = new BufferGeometry();
  mesh.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  mesh.setAttribute(
    "color",
    new Float32BufferAttribute(new Float32Array((vertices.length / 3) * 4), 4),
  );
  mesh.setIndex(indices);
  mesh.morphTargetsRelative = true;
  // r185의 WebGL morph 업로더는 색상 채널에도 동수의 position 타깃을 요구한다.
  const noDisplacement = new Float32BufferAttribute(new Float32Array(vertices.length), 3);
  mesh.morphAttributes.position = channels.map(() => noDisplacement);
  mesh.morphAttributes.color = channels.map((colors) => new Float32BufferAttribute(colors, 4));
  return mesh;
}

// 시제품의 단면 로프트. 운전실의 둥근 양옆, 기울어진 유리와 볼록한 앞판을 연결한다.
export function createCabNose(tail: boolean) {
  const vertices: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const rings: Point[][] = [];
  const bottom = 0.62;
  const section = (t: number) => {
    const inset = 0.4 * (1 - Math.cos(t));
    const hw = HALF_WIDTH - inset,
      shoulder = SHOULDER - inset * 0.5,
      roof = ROOF - inset * 0.55;
    const radius = 0.3 + inset * 0.9;
    const ring: Point[] = [];
    const point = (x: number, z: number) => {
      const rake = 0.16 * Math.max(0, (z - 2.2) / 1.2) ** 2;
      const skirt = 0.05 * Math.max(0, (1 - z) / 0.4);
      ring.push([x, CAB_JOIN + (1.25 - rake - skirt) * Math.sin(t), z]);
    };
    for (let i = 0; i < 6; i++) point(hw, bottom + ((shoulder - bottom) * i) / 6);
    for (let i = 0; i <= 8; i++) {
      const a = (Math.PI * i) / 16;
      point(hw - radius + radius * Math.cos(a), shoulder + (roof - shoulder) * Math.sin(a));
    }
    for (let i = 1; i < 10; i++) point((hw - radius) * (1 - (2 * i) / 10), roof);
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI / 2 + (Math.PI * i) / 16;
      point(-hw + radius + radius * Math.cos(a), shoulder + (roof - shoulder) * Math.sin(a));
    }
    for (let i = 1; i < 6; i++) point(-hw, shoulder - ((shoulder - bottom) * i) / 6);
    for (let i = 0; i < 8; i++) point(-hw + (2 * hw * i) / 8, bottom);
    return ring;
  };
  for (let i = 0; i <= 12; i++) rings.push(section((i * Math.PI) / 24));
  const last = rings[rings.length - 1],
    mid = (bottom + ROOF) / 2;
  for (let i = 1; i < 6; i++) {
    const f = 1 - i / 6;
    rings.push(last.map(([x, y, z]) => [x * f, y + 0.06 * (1 - f * f), mid + (z - mid) * f]));
  }
  const region: AtlasRegion = [tail ? 414 : 4, 677, 396, 340];
  for (const ring of rings) {
    for (const [x, y, z] of ring) {
      vertices.push(x, y, z);
      uvs.push(...atlasUV(region, 0.5 - x / (2 * HALF_WIDTH), (z - bottom) / (ROOF - bottom)));
    }
  }
  const count = last.length;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < count; j++) {
      const a = i * count + j,
        b = i * count + ((j + 1) % count);
      indices.push(a, a + count, b, b, a + count, b + count);
    }
  }
  const center = vertices.length / 3;
  vertices.push(0, BODY_HALF + 0.06, mid);
  uvs.push(...atlasUV(region, 0.5, 0.5));
  for (let j = 0; j < count; j++) {
    indices.push(center - count + j, center, center - count + ((j + 1) % count));
  }
  const result = geometry(vertices, uvs, indices);
  const normals = result.getAttribute("normal");
  for (let i = 13 * count; i <= center; i++) {
    const x = vertices[i * 3] * 0.18,
      z = (vertices[i * 3 + 2] - mid) * 0.16;
    const length = Math.hypot(x, 1, z);
    normals.setXYZ(i, x / length, 1 / length, z / length);
  }
  return result;
}
