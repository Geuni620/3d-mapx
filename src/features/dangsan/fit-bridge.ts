import { Group, InstancedMesh, Matrix4 } from "three";
import { bridgeLength, northPortal, pointOnBridge, southPortal } from "./bridge-alignment";
import { railHeightAt } from "./bridge-location";
import { Parts, physical, railY } from "./scene-geometry";

function addApproaches(group: Group, stretch: number) {
  const parts = new Parts();
  const slab = physical("#979c94"), steel = physical("#a1aba7", 0.7, 0.36);
  for (const [from, to] of [[southPortal, 0], [bridgeLength, northPortal]]) {
    const z = 680 - (from + to) / (2 * stretch), length = (to - from) / stretch;
    parts.box(slab, 0.74, railY - 1.0, z, 10.1, 1.55, length);
    for (const track of [-1.13, 2.62]) {
      for (const side of [-1, 1])
        parts.box(steel, track + side * 0.718, railY - 0.07, z, 0.11, 0.14, length);
    }
    for (let s = from + 17; s < to; s += 35) {
      if (railHeightAt(s) > 2) parts.box(slab, 0.74, (railY - 1.75) / 2, 680 - s / stretch, 3.8, railY - 1.75, 2);
    }
  }
  parts.finish(group);
}

// 긴 거더와 레일을 나눈 뒤 OSM 두 궤도의 중간 선형을 따라 놓는다. 치수·횡단면은 기존 미술 모델이다.
export function fitBridgeToTracks(group: Group) {
  group.rotation.y = 0;
  const stretch = bridgeLength / 1360;
  addApproaches(group, stretch);
  const matrix = new Matrix4();
  for (const part of [...group.children]) {
    if (!(part instanceof InstancedMesh)) continue;
    const matrices: Matrix4[] = [];
    for (let index = 0; index < part.count; index++) {
      part.getMatrixAt(index, matrix);
      const axis = [2, 6, 10].reduce((a, b) =>
        Math.abs(matrix.elements[a]) > Math.abs(matrix.elements[b]) ? a : b,
      );
      const n = Math.max(1, Math.ceil(Math.abs(matrix.elements[axis]) / 12));
      const column = axis - 2;
      for (let k = 0; k < n; k++) {
        const m = matrix.clone(),
          e = m.elements,
          shift = (k + 0.5) / n - 0.5;
        const x = e[12] + shift * e[column],
          y = e[13] + shift * e[column + 1],
          z = e[14] + shift * e[column + 2];
        const along = (680 - z) * stretch;
        const pose = pointOnBridge(along);
        const height = railHeightAt(along);
        const grade = (railHeightAt(along + 0.5) - railHeightAt(along - 0.5));
        const support = y < railY - 4.4;
        const seat = y > 7 && y < 9 && (along < 0 || along > bridgeLength);
        const verticalScale = support ? Math.max(0.001, seat ? (height - 1.75) / (railY - 1.75) : (height - 4.4) / (railY - 4.4)) : 1;
        for (let row = 0; row < 3; row++) e[column + row] /= n;
        m.setPosition(0, 0, 0);
        for (const c of [0, 4, 8]) {
          e[c + 1] = e[c + 1] * verticalScale - (support ? 0 : grade * stretch * e[c + 2]);
          e[c + 2] *= stretch;
        }
        m.premultiply(new Matrix4().makeRotationY(-pose.bearing));
        m.setPosition(pose.east + (x - 0.74) * Math.cos(pose.bearing),
          support ? y * verticalScale : height + y - railY,
          pose.south + (x - 0.74) * Math.sin(pose.bearing));
        matrices.push(m);
      }
    }
    const mesh = new InstancedMesh(part.geometry, part.material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.computeBoundingSphere();
    mesh.castShadow = part.castShadow;
    mesh.receiveShadow = part.receiveShadow;
    mesh.userData = { ...part.userData };
    group.remove(part);
    part.dispose();
    group.add(mesh);
  }
}
