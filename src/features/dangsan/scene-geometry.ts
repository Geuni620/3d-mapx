import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  Quaternion,
  ShapeUtils,
  Vector2,
  Vector3,
  type Material,
} from "three";

import { DANGSAN_ORIGIN, DANGSAN_BEARING, DANGSAN_RAIL_HEIGHT } from "./bridge-location";
export const ORIGIN = DANGSAN_ORIGIN;
const meters = (Math.PI * 6371008.8) / 180;
export const bridgeBearing = DANGSAN_BEARING;
export const innerAxis = new Vector3(Math.sin(bridgeBearing), 0, -Math.cos(bridgeBearing));
export const eastRailSide = new Vector3(Math.cos(bridgeBearing), 0, Math.sin(bridgeBearing));
export const railY = DANGSAN_RAIL_HEIGHT;
export function groundPoint(coord: readonly number[], y = 0) {
  return new Vector3(
    (coord[0] - ORIGIN[0]) * meters * Math.cos((ORIGIN[1] * Math.PI) / 180),
    y,
    -(coord[1] - ORIGIN[1]) * meters,
  );
}
export function bridgePoint(across: number, up: number, along: number) {
  return new Vector3(
    across * eastRailSide.x + along * innerAxis.x,
    up,
    across * eastRailSide.z + along * innerAxis.z,
  );
}
export function physical(color: string, metalness = 0, roughness = 0.78) {
  return new MeshPhysicalMaterial({ color, metalness, roughness });
}

// 고정 구조물을 재질별 인스턴스로 묶는다. 로컬 z의 양수는 당산(남단) 쪽이다.
export class Parts {
  private batches = new Map<Material, { boxes: Matrix4[]; rods: Matrix4[] }>();
  private dummy = new Object3D();
  private up = new Vector3(0, 1, 0);
  private batch(material: Material) {
    let b = this.batches.get(material);
    if (!b) {
      b = { boxes: [], rods: [] };
      this.batches.set(material, b);
    }
    return b;
  }
  box(
    material: Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rotation = 0,
  ) {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, rotation, 0);
    this.dummy.scale.set(w, h, d);
    this.dummy.updateMatrix();
    this.batch(material).boxes.push(this.dummy.matrix.clone());
  }
  rod(material: Material, a: number[], b: number[], radius: number) {
    const start = new Vector3(...a),
      end = new Vector3(...b),
      delta = end.clone().sub(start);
    const q = new Quaternion().setFromUnitVectors(this.up, delta.clone().normalize());
    this.batch(material).rods.push(
      new Matrix4().compose(start.lerp(end, 0.5), q, new Vector3(radius, delta.length(), radius)),
    );
  }
  finish(parent: Group, shadow = true) {
    const box = new BoxGeometry(1, 1, 1),
      rod = new CylinderGeometry(1, 1, 1, 8);
    for (const [mat, b] of this.batches)
      for (const [g, ms] of [
        [box, b.boxes],
        [rod, b.rods],
      ] as const) {
        if (!ms.length) continue;
        const spans = new Map<number, Matrix4[]>();
        for (const matrix of ms) {
          const section = ms.length > 48 ? Math.floor(matrix.elements[14] / 128) : 0;
          const set = spans.get(section) ?? [];
          set.push(matrix);
          spans.set(section, set);
        }
        for (const matrices of spans.values()) {
          const mesh = new InstancedMesh(g, mat, matrices.length);
          matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
          mesh.castShadow = shadow;
          mesh.receiveShadow = true;
          mesh.computeBoundingSphere();
          parent.add(mesh);
        }
      }
    this.batches.clear();
  }
}
export type RingSet = number[][];
export function rings(p: RingSet) {
  return p.map((r) => {
    const a: Vector2[] = [];
    for (let i = 0; i < r.length; i += 2) a.push(new Vector2(r[i], r[i + 1]));
    return a;
  });
}
export class Surface {
  pos: number[] = [];
  uv: number[] = [];
  seeds: number[] = [];
  tri(a: Vector3, b: Vector3, c: Vector3, uv: number[] = [0, 0, 1, 0, 0, 1], seed = 0) {
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.uv.push(...uv);
    this.seeds.push(seed, seed, seed);
  }
  top(rs: Vector2[][], height: number, seed = 0) {
    const faces = ShapeUtils.triangulateShape(rs[0], rs.slice(1)),
      points = rs.flat();
    for (const [i, j, k] of faces) {
      const a = points[i],
        b = points[j],
        c = points[k];
      this.tri(
        new Vector3(a.x, height, -a.y),
        new Vector3(b.x, height, -b.y),
        new Vector3(c.x, height, -c.y),
        [a.x, a.y, b.x, b.y, c.x, c.y],
        seed,
      );
    }
  }
  mesh(mat: Material) {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
    g.setAttribute("blockSeed", new Float32BufferAttribute(this.seeds, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    this.pos = [];
    this.uv = [];
    this.seeds = [];
    const mesh = new Mesh(g, mat);
    mesh.receiveShadow = true;
    return mesh;
  }
}
export function seeded(n: number) {
  const v = Math.sin(n * 21.284 + 1.82) * 43291.271;
  return v - Math.floor(v);
}
