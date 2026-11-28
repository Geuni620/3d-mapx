import {
  Color,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Shape,
} from "three";
import { bridgeBearing, Parts, physical, railY } from "./scene-geometry";
import { outdoorDarkness, type Lighting } from "./solar-palette";

export function createBridge() {
  const group = new Group();
  group.rotation.y = -bridgeBearing;
  const parts = new Parts(),
    accents = new Parts(),
    fixtures = new Parts();
  const girder = physical("#638783", 0.46, 0.5),
    edge = physical("#95a69d", 0.48, 0.53),
    bottom = physical("#384f52", 0.45, 0.56);
  const concrete = physical("#b6b7ac", 0.02, 0.87),
    ballast = physical("#747a77", 0.04, 0.96),
    seat = physical("#393c38", 0.23, 0.68);
  const steel = physical("#a1aba7", 0.76, 0.36),
    rust = physical("#786754", 0.6, 0.65),
    post = physical("#9aa5a3", 0.65, 0.42),
    wire = physical("#51473a", 0.55, 0.59);
  const line = physical("#00a84d", 0.18, 0.4),
    outline = physical("#0b3b1c", 0.23, 0.55);
  const lamp = new MeshBasicMaterial({ color: "#ffe4ae" }),
    length = 1360,
    railCenters = [-1.13, 2.62];
  const flood = { value: 0 };
  function structureFinish(mat: ReturnType<typeof physical>, mode: "pier" | "steel" | "stone") {
    mat.onBeforeCompile = (s) => {
      s.uniforms.uFlood = flood;
      s.vertexShader =
        "varying vec3 yardPosition;\n" +
        s.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
        vec4 lp=vec4(position,1.);
        #ifdef USE_INSTANCING
          lp=instanceMatrix*lp;
        #endif
        yardPosition=lp.xyz;`,
        );
      s.fragmentShader =
        "uniform float uFlood;varying vec3 yardPosition;float concreteHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*4375.5453);}\n" +
        s.fragmentShader
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
        vec3 p=yardPosition;
        ${
          mode === "pier"
            ? `float grain=concreteHash(floor((p.xz+vec2(p.y*.31,p.y))*9.));
          float seam=1.-smoothstep(.012,.035+fwidth(p.y),abs(fract((p.y+.12)/1.8)-.5)*1.8);
          float tide=smoothstep(.18,1.75,p.y);
          diffuseColor.rgb*=mix(vec3(.41,.49,.43),vec3(.91+.13*grain),tide)*(1.-.11*seam);`
            : mode === "steel"
              ? `float run=sin(p.z*2.8)*sin(p.z*1.15+.2);float band=1.-smoothstep(.035,.16,abs(fract(p.z/4.9+.5)-.5)*4.9);
          diffuseColor.rgb*=.89+.08*run+.10*smoothstep(13.9,16.8,p.y)-.14*band;`
              : `float grit=concreteHash(floor(p.xz*10.));diffuseColor.rgb*=.76+.33*grit;`
        }
      `,
          )
          .replace(
            "#include <emissivemap_fragment>",
            `#include <emissivemap_fragment>
        ${
          mode === "pier"
            ? `float pool=exp(-abs(abs(p.x-.73)-1.9)*.65)*smoothstep(.12,2.,p.y)*exp(-max(p.y-2.,0.)*.12);
          totalEmissiveRadiance+=uFlood*pool*vec3(.26,.14,.064)*(1.-smoothstep(12.1,14.5,p.y));`
            : mode === "steel"
              ? `float pools=exp(-abs(mod(p.z-15.+25.65,51.3)-25.65)*.12);totalEmissiveRadiance+=uFlood*(.012+pools*.07)*vec3(.30,.40,.38);`
              : ""
        }
      `,
          );
    };
    mat.customProgramCacheKey = () => "bridge-finish-" + mode;
  }
  structureFinish(concrete, "pier");
  structureFinish(girder, "steel");
  structureFinish(ballast, "stone");
  // PC 상판, 강상자형 주형의 상·하부 플랜지와 외측 점검 통로.
  parts.box(concrete, 0.74, railY - 0.91, 0, 11.5, 0.54, length);
  parts.box(ballast, 0.74, railY - 0.51, 0, 8.7, 0.33, length);
  for (const x of [-3.1, 0.72, 4.55]) {
    parts.box(girder, x, railY - 2.67, 0, 1.23, 3.06, length);
    parts.box(edge, x, railY - 1.25, 0, 1.75, 0.18, length);
    parts.box(bottom, x, railY - 4.2, 0, 1.68, 0.2, length);
  }
  for (const side of [-1, 1]) {
    const x = 0.74 + side * 5.5;
    parts.box(edge, x, railY - 0.53, 0, 1.32, 0.17, length);
    parts.box(bottom, x, railY - 0.76, 0, 0.16, 0.38, length);
    parts.box(outline, x + side * 0.665, railY - 0.53, 0, 0.1, 0.4, length);
    accents.box(line, x + side * 0.726, railY - 0.53, 0, 0.035, 0.2, length);
    for (const h of [0.25, 0.66, 1.02])
      parts.rod(
        post,
        [x + side * 0.36, railY + h, -680],
        [x + side * 0.36, railY + h, 680],
        h === 1.02 ? 0.042 : 0.026,
      );
    for (let z = -678; z <= 678; z += 3) {
      parts.box(post, x + side * 0.36, railY + 0.27, z, 0.075, 1.53, 0.082);
      if (z % 6 === 0)
        parts.rod(edge, [x, railY - 0.61, z], [x - side * 1.15, railY - 2.17, z], 0.075);
    }
  }
  for (let z = -679; z <= 679; z += 4.9) {
    parts.box(bottom, 0.72, railY - 2.8, z, 9.4, 0.44, 0.29);
    for (const x of [-3.73, -2.47, 3.9, 5.18]) parts.box(edge, x, railY - 2.72, z, 0.1, 2.73, 0.1);
  }
  for (const x of railCenters)
    for (const s of [-1, 1]) {
      const rx = x + s * 0.718;
      parts.box(rust, rx, railY - 0.115, 0, 0.145, 0.13, length);
      parts.box(steel, rx, railY - 0.025, 0, 0.079, 0.052, length);
    }
  for (let z = -680; z <= 680; z += 0.68)
    for (const x of railCenters) {
      parts.box(concrete, x, railY - 0.25, z, 2.52, 0.18, 0.25);
      if (Math.abs(z) < 190)
        for (const s of [-1, 1])
          parts.box(seat, x + s * 0.718, railY - 0.155, z, 0.32, 0.046, 0.27);
    }
  const pierShape = new Shape();
  [
    [-2.9, -1.0],
    [2.9, -1.0],
    [2.45, 8.25],
    [2.85, 9.75],
    [5.3, 11.45],
    [5.5, 12.1],
    [5.5, 12.9],
    [-5.5, 12.9],
    [-5.5, 12.1],
    [-5.3, 11.45],
    [-2.85, 9.75],
    [-2.45, 8.25],
  ].forEach(([x, y], i) => (i ? pierShape.lineTo(x, y) : pierShape.moveTo(x, y)));
  pierShape.closePath();
  const pierGeo = new ExtrudeGeometry(pierShape, {
    depth: 2.5,
    bevelEnabled: true,
    bevelThickness: 0.14,
    bevelSize: 0.14,
    bevelSegments: 2,
    curveSegments: 1,
  });
  pierGeo.translate(0, 0, -1.25);
  const piers = new InstancedMesh(pierGeo, concrete, 27);
  for (let i = 0; i < 27; i++) {
    const z = (i - 13) * 51.3 + 15;
    piers.setMatrixAt(i, new Matrix4().makeTranslation(0.73, 0, z));
    parts.box(concrete, 0.73, 0.42, z, 7.25, 1.35, 4.9);
    for (const x of [-1.9, 3.3]) {
      parts.box(bottom, x, 1.18, z + 1.97, 0.38, 0.22, 0.41);
      fixtures.box(lamp, x, 1.3, z + 1.97, 0.26, 0.05, 0.3);
    }
    parts.box(bottom, 0.73, 0.11, z, 7.3, 0.25, 4.94);
    for (const x of [-3.1, 0.72, 4.55]) {
      parts.box(concrete, x, 13.18, z, 1.86, 0.42, 2.0);
      parts.box(seat, x, 13.54, z, 1.15, 0.31, 1.54);
    }
  }
  piers.castShadow = true;
  piers.receiveShadow = true;
  group.add(piers);
  // 복선 전차선, 조가선의 현수 곡선과 행거, 절연애자.
  for (let k = -14; k <= 14; k++) {
    const z = 8 + k * 48;
    for (const side of [-1, 1]) {
      const x = 0.74 + side * 4.82;
      parts.box(concrete, x, railY - 0.15, z, 0.8, 0.85, 0.85);
      parts.box(post, x, railY + 3.47, z, 0.19, 7.55, 0.23);
      parts.box(edge, x + side * 0.14, railY + 3.47, z, 0.1, 7.55, 0.29);
      parts.rod(steel, [x, railY + 6.6, z], [x - side * 1.75, railY + 7.13, z], 0.045);
      parts.rod(post, [x, railY + 6.55, z], [x - side * 2.75, railY + 5.25, z], 0.052);
    }
    parts.box(post, 0.74, railY + 7.12, z, 9.95, 0.18, 0.18);
    for (const x of railCenters) {
      parts.rod(seat, [x, railY + 7.04, z], [x, railY + 6.64, z], 0.1);
      if (k === 14) continue;
      parts.rod(wire, [x, railY + 4.86, z], [x, railY + 4.86, z + 48], 0.055);
      for (let j = 0; j < 6; j++) {
        const h = (u: number) => railY + 6.64 - 0.95 * 4 * u * (1 - u);
        parts.rod(wire, [x, h(j / 6), z + 8 * j], [x, h((j + 1) / 6), z + 8 * (j + 1)], 0.049);
        parts.rod(wire, [x, h(j / 6), z + 8 * j], [x, railY + 4.86, z + 8 * j], 0.031);
      }
    }
    if (k % 2 === 0) {
      const lx = -4.93;
      parts.rod(post, [lx, railY - 0.5, z + 13], [lx, railY + 3.05, z + 13], 0.065);
      parts.box(bottom, lx, railY + 3.15, z + 13, 0.4, 0.15, 0.8);
      fixtures.box(lamp, lx, railY + 3.065, z + 13, 0.35, 0.08, 0.68);
    }
  }
  parts.finish(group);
  accents.finish(group);
  fixtures.finish(group, false);
  // 선로 띠만 블룸에 포함한다. 교량 조명은 물에 비치지만 블룸 마스크에서는 빠진다.
  group.traverse((o) => {
    if (o instanceof Mesh && o.material === line) o.userData.glow = true;
  });
  return {
    group,
    passageGlow(t: Lighting, amount: number) {
      const dark = outdoorDarkness(t) * amount;
      line.emissiveIntensity = 1.8 * dark;
      flood.value = dark;
      lamp.color.set("#ffe3a6").multiplyScalar(0.65 + 5 * dark);
    },
    apply(t: Lighting) {
      line.color.set("#00A84D");
      line.emissive.set("#20cc76");
      line.emissiveIntensity = t.tunnel ? 0 : outdoorDarkness(t) * 1.8;
      flood.value = outdoorDarkness(t);
      lamp.color.set("#ffe3a6").multiplyScalar(0.85 + 5 * outdoorDarkness(t));
      girder.color.set("#668780").lerp(new Color(t.facade), 0.13);
      concrete.color.set("#adafa4").lerp(new Color(t.land), 0.12);
    },
  };
}

export function createTunnel() {
  const group = new Group(),
    parts = new Parts();
  const lining = physical("#423b33", 0.06, 0.86),
    invert = physical("#49443c", 0.12, 0.76),
    wire = physical("#342e26", 0.5, 0.64),
    rail = physical("#929494", 0.66, 0.4);
  const lamp = new MeshBasicMaterial({ color: new Color("#f2e5bd").multiplyScalar(2.0) });
  // 합정 북쪽 검증 구간의 터널 단면과 등 위치는 실내 조명 확인용 재구성이다.
  for (const x of [-4.25, 4.25]) {
    parts.box(lining, x, 2.5, 0, 0.35, 7.8, 330);
    parts.box(invert, x * 0.9, 0.45, 0, 0.6, 0.8, 330);
  }
  parts.box(lining, 0, 6.55, 0, 8.8, 0.55, 330);
  parts.box(invert, 0, -0.39, 0, 9, 0.5, 330);
  for (const x of [-0.718, 0.718]) parts.box(rail, x, -0.07, 0, 0.1, 0.14, 330);
  for (let z = -164; z < 165; z += 0.7) parts.box(invert, 0, -0.23, z, 2.55, 0.15, 0.28);
  for (let z = -160; z < 165; z += 5) {
    for (const x of [-4.03, 4.03]) parts.box(wire, x, 3.0, z, 0.13, 5.7, 0.1);
    if (z % 10 === 0) parts.box(lamp, -3.89, 4.22, z, 0.1, 0.13, 1.3);
  }
  for (const x of [-3.94, 3.94])
    for (const y of [2.35, 2.52, 2.7]) parts.rod(wire, [x, y, -164], [x, y, 164], 0.048);
  parts.finish(group, false);
  return group;
}
