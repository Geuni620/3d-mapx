import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Quaternion,
  Shape,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { BODY_HALF, CAB_JOIN, doorCenters, ROOF } from "./subway-train-shell";
import { SUBWAY_TRAIN_BOGIE_OFFSET_METERS } from "./subway-train-dimensions";

type Pieces = BufferGeometry[];
type Point = [number, number, number];

function paint(pieces: Pieces, input: BufferGeometry, color: string) {
  const geometry = input.index ? input.toNonIndexed() : input;
  if (geometry !== input) input.dispose();
  const rgb = new Color(color);
  const count = geometry.getAttribute("position").count;
  const colors = new Float32BufferAttribute(new Float32Array(3 * count), 3);
  for (let i = 0; i < count; i++) colors.setXYZ(i, rgb.r, rgb.g, rgb.b);
  geometry.setAttribute("color", colors);
  pieces.push(geometry);
}

function box(pieces: Pieces, size: Point, at: Point, color: string) {
  paint(pieces, new BoxGeometry(...size).translate(...at), color);
}

function rod(pieces: Pieces, start: Point, end: Point, radius: number, color: string, sides = 8) {
  const a = new Vector3(...start),
    b = new Vector3(...end);
  const delta = b.clone().sub(a);
  const geometry = new CylinderGeometry(radius, radius, delta.length(), sides);
  geometry.applyQuaternion(
    new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()),
  );
  const center = a.lerp(b, 0.5);
  geometry.translate(center.x, center.y, center.z);
  paint(pieces, geometry, color);
}

function merge(pieces: Pieces) {
  const merged = mergeGeometries(pieces)!;
  pieces.forEach((piece) => piece.dispose());
  return merged;
}

export function createRunningGear() {
  const pieces: Pieces = [];
  for (const center of [-SUBWAY_TRAIN_BOGIE_OFFSET_METERS, SUBWAY_TRAIN_BOGIE_OFFSET_METERS]) {
    for (const axle of [center - 1.05, center + 1.05]) {
      rod(pieces, [-1.02, axle, 0.43], [1.02, axle, 0.43], 0.075, "#51585b");
      for (const side of [-1, 1]) {
        rod(pieces, [side * 0.7, axle, 0.43], [side * 0.83, axle, 0.43], 0.43, "#58616a", 20);
        rod(pieces, [side * 0.84, axle, 0.43], [side * 1.04, axle, 0.43], 0.14, "#303940", 12);
      }
    }
    for (const side of [-1, 1]) {
      box(pieces, [0.19, 2.9, 0.24], [side, center, 0.63], "#31373c");
      rod(pieces, [side, center, 0.72], [side, center, 0.94], 0.28, "#1f262a", 14);
    }
    box(pieces, [2.0, 0.64, 0.22], [0, center, 0.62], "#272d32");
  }
  return merge(pieces);
}

export function createCarBody(cab: boolean, powered: boolean) {
  const pieces: Pieces = [];
  const end = cab ? CAB_JOIN : BODY_HALF;
  const length = end + BODY_HALF,
    center = (end - BODY_HALF) / 2;
  // 옆판은 아틀라스 메시 하나만 그려 먼 카메라에서도 금속판과 창이 겹쳐 깜박이지 않게 한다.
  const shape = new Shape();
  const half = 1.555;
  shape.moveTo(-half, 3.1);
  shape.lineTo(half, 3.1);
  shape.quadraticCurveTo(half, ROOF, half - 0.3, ROOF);
  shape.lineTo(-half + 0.3, ROOF);
  shape.quadraticCurveTo(-half, ROOF, -half, 3.1);
  shape.closePath();
  const shell = new ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
    curveSegments: 8,
  });
  shell.rotateX(Math.PI / 2).translate(0, end, 0);
  paint(pieces, shell, "#a4adb3");
  for (const y of cab ? [-BODY_HALF] : [-BODY_HALF, end]) {
    box(pieces, [3.09, 0.036, 2.1], [0, y, 2.05], "#939da4");
  }
  box(pieces, [3.0, length, 0.12], [0, center, 0.94], "#394045");
  for (const y of doorCenters(cab)) {
    for (const side of [1, -1]) {
      // 문턱에서 안쪽 벽까지 깊이를 둬 카메라 각도가 바뀌어도 열린 입구가 읽히도록 한다.
      box(pieces, [0.08, 1.65, 2.09], [side * 0.58, y, 2.0], "#848780");
      box(pieces, [0.04, 0.98, 0.63], [side * 0.64, y, 2.52], "#3a4547");
      box(pieces, [0.04, 1.49, 0.21], [side * 0.64, y, 1.39], "#535f5d");
      box(pieces, [0.96, 1.36, 0.07], [side * 1.04, y, 1.04], "#787f78");
      box(pieces, [0.1, 1.3, 0.035], [side * 1.48, y, 1.09], "#deb34d");
      for (const end of [-1, 1]) {
        box(pieces, [0.91, 0.04, 1.98], [side * 1.03, y + end * 0.67, 2.04], "#4b5152");
      }
    }
  }
  for (const y of [-5.7, cab ? 4.7 : 5.2]) {
    box(pieces, [2.22, 3.2, 0.25], [0, y, ROOF + 0.125], "#929ba1");
    for (const side of [-1, 1]) {
      for (let slat = -6; slat <= 6; slat++) {
        box(pieces, [0.65, 0.075, 0.015], [side * 0.62, y + slat * 0.19, ROOF + 0.257], "#657078");
      }
    }
  }
  for (const [y, l, x] of [
    [-2.6, powered ? 2.6 : 1.8, 0.75],
    [1.0, 1.7, -0.65],
    [3.4, 1.4, 0.7],
  ]) {
    box(pieces, [1.03, l, 0.46], [x, y, 0.68], "#454d54");
  }
  box(pieces, [1.64, 0.45, 2.14], [0, -BODY_HALF - 0.18, 2.04], "#262c31");
  if (cab) {
    box(pieces, [0.42, 0.33, 0.32], [0, BODY_HALF + 0.1, 0.96], "#343c41");
    box(pieces, [2.48, 0.16, 0.23], [0, BODY_HALF - 0.31, 0.58], "#3a4246");
  }
  return merge(pieces);
}

export function createPantograph() {
  const pieces: Pieces = [];
  for (const side of [-1, 1]) {
    for (const y of [0.0, 1.1]) {
      rod(pieces, [side * 0.52, y, ROOF], [side * 0.52, y, 3.66], 0.08, "#ddd8c9");
    }
    rod(pieces, [side * 0.36, 1.05, 3.72], [side * 0.09, -0.65, 4.24], 0.043, "#48545c");
    rod(pieces, [side * 0.09, -0.65, 4.24], [side * 0.24, 0.35, 4.74], 0.035, "#48545c");
  }
  box(pieces, [1.26, 1.35, 0.085], [0, 0.55, 3.68], "#4a5054");
  for (const y of [0.23, 0.47]) {
    rod(pieces, [-0.58, y, 4.82], [0.58, y, 4.82], 0.032, "#51585e");
    for (const side of [-1, 1])
      rod(pieces, [side * 0.58, y, 4.82], [side * 0.86, y, 4.67], 0.025, "#4c555a");
  }
  return merge(pieces);
}
