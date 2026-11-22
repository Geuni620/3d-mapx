import {
  Color,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Object3D,
  Mesh,
  ShaderMaterial,
  LessDepth,
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
  type IUniform,
} from "three";
import contextJson from "./data/riverfront.json?raw";
import { physical, rings, Surface, Parts, seeded, type RingSet } from "./scene-geometry";
import { outdoorDarkness, type Lighting } from "./solar-palette";

interface Context {
  land: RingSet[];
  river: RingSet[];
  parks: RingSet[];
  buildings: [number, ...number[][]][];
  roads: [string, number[]][];
  dem: number[][];
}
const data: Context = JSON.parse(contextJson);
export function createRiverfront(allBearings = false) {
  const group = new Group(),
    banks = physical("#f0ebe2"),
    green = physical("#8fbc68"),
    road = physical("#ffffff");
  const walls = physical("#f2ede4", 0.09, 0.74),
    roofs = physical("#ced2d0", 0.14, 0.73),
    hills = physical("#829782");
  const shore = physical("#a5a99c"),
    tree = physical("#6e8e5b");
  const night: IUniform<number> = { value: 0 },
    lit: IUniform<number> = { value: 0 };
  walls.side = DoubleSide;
  walls.onBeforeCompile = (s) => {
    s.uniforms.uNight = night;
    s.uniforms.uLit = lit;
    s.vertexShader =
      "attribute float blockSeed;varying vec3 facadeUv;\n" +
      s.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n facadeUv=vec3(uv,blockSeed);",
      );
    s.fragmentShader =
      `uniform float uNight,uLit;varying vec3 facadeUv;
      // Integral of the repeated window opening, in facade tile coordinates.
      vec2 windowIntegral(vec2 p,vec2 start,vec2 size){
        return floor(p)*size+clamp(fract(p)-start,vec2(0.),size);
      }\n` +
      s.fragmentShader
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
      vec2 tile=facadeUv.xy/vec2(2.62+fract(facadeUv.z*2.7)*1.1,3.1);
      vec2 f=fract(tile),footprint=max(fwidth(tile),vec2(.008));
      vec2 start=vec2(.16,.23),size=vec2(.68,.59);
      vec2 win=(windowIntegral(tile+.5*footprint,start,size)-windowIntegral(tile-.5*footprint,start,size))/footprint;
      float glass=win.x*win.y;
      float unresolved=smoothstep(.35,1.,max(footprint.x,footprint.y));
      float random=fract(sin(dot(floor(tile),vec2(12.9898,78.233))+facadeUv.z*45.32)*4375.5453);
      float bank=fract(sin(floor(tile.y)*4.1+facadeUv.z*17.)*25839.7);
      float occupied=step(1.-uLit,fract(random+bank*.31));
      float curtain=.78+.22*smoothstep(.44,.47,f.x);
      diffuseColor.rgb*=mix(.60,1.15,fract(facadeUv.z*7.1));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.18,.28,.34)*(.7+.3*mix(f.y,.5,unresolved)),glass*(.92+.06*uNight));`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
      vec3 lamp=mix(vec3(.60,.76,.84),vec3(1.,.62,.26),smoothstep(.15,.65,random));
      vec3 illumination=mix(lamp*occupied*curtain*(.30+.29*random),
                            vec3(.84,.68,.50)*uLit*.89*.445,unresolved);
      totalEmissiveRadiance+=illumination*glass*(.025+.975*uNight);`,
        );
  };
  const ground = new Surface(),
    parks = new Surface(),
    streets = new Surface(),
    facades = new Surface(),
    tops = new Surface(),
    edge = new Surface();
  data.land.forEach((p) => ground.top(rings(p), 2.6));
  data.parks.forEach((p) => parks.top(rings(p), 2.78));
  for (const p of data.river)
    for (const r of rings(p))
      for (let i = 0; i < r.length; i++) {
        const a = r[i],
          b = r[(i + 1) % r.length];
        if (a.distanceTo(b) < 0.3) continue;
        const at = new Vector3(a.x, 2.55, -a.y),
          bt = new Vector3(b.x, 2.55, -b.y),
          ab = at.clone().setY(-0.6),
          bb = bt.clone().setY(-0.6);
        edge.tri(at, bt, ab);
        edge.tri(ab, bt, bb);
      }
  const widths: Record<string, number> = {
    motorway: 16,
    trunk: 12,
    primary: 11,
    secondary: 8,
    tertiary: 5,
    minor: 3.6,
    service: 2.4,
    path: 1.35,
    rail: 2.1,
  };
  for (const [kind, p] of data.roads) {
    const w = widths[kind] / 2;
    if (!allBearings && p[0] < -450) continue;
    for (let i = 2; i < p.length; i += 2) {
      const a = new Vector3(p[i - 2], 2.94, -p[i - 1]),
        b = new Vector3(p[i], 2.94, -p[i + 1]),
        dx = b.x - a.x,
        dz = b.z - a.z,
        len = Math.hypot(dx, dz);
      if (len < 1) continue;
      // 철교 아래의 지도 도로는 강물 위에 그리지 않는다.
      const offset = new Vector3((-dz * w) / len, 0, (dx * w) / len);
      const l = a.clone().add(offset),
        r = a.clone().sub(offset),
        l2 = b.clone().add(offset),
        r2 = b.clone().sub(offset);
      streets.tri(l, l2, r);
      streets.tri(r, l2, r2);
    }
  }
  // 멀리 있는 낮은 소형 부속 건물은 화면에서 한 픽셀보다 작아 생략한다.
  const fixtures = new Parts(),
    regular = physical("#849293", 0.3, 0.76);
  data.buildings.forEach(([raw, ...p], i) => {
    const ring = p[0];
    if (!ring || ring.length < 6) return;
    let x = 0,
      n = 0;
    for (let j = 0; j < ring.length; j += 2) {
      x += ring[j];
      n += ring[j + 1];
    }
    x /= ring.length / 2;
    n /= ring.length / 2;
    if (
      (!allBearings && (x < -330 || Math.abs(n - 0.28 * x) > 850 + Math.max(0, x) * 1.05)) ||
      (Math.hypot(x, n) > 3000 && raw < 12)
    )
      return;
    const rs = rings(p),
      seed = seeded(i + 93),
      base = 2.9,
      height = base + Math.max(3, Math.min(319, raw));
    tops.top(rs, height, seed);
    for (const r of rs)
      for (let k = 0; k < r.length; k++) {
        const a = r[k],
          b = r[(k + 1) % r.length],
          len = a.distanceTo(b);
        if (len < 0.3) continue;
        const p0 = new Vector3(a.x, base, -a.y),
          p1 = new Vector3(b.x, base, -b.y),
          p2 = p0.clone().setY(height),
          p3 = p1.clone().setY(height);
        facades.tri(p0, p1, p2, [0, 0, len, 0, 0, raw], seed);
        facades.tri(p1, p3, p2, [len, 0, len, raw, 0, raw], seed);
      }
    if (raw > 24 && Math.hypot(x, n) < 3200 && seed > 0.32)
      fixtures.box(regular, x, height + 1.1, -n, 4 + seed * 4, 2.2, 5 + seed * 3);
  });
  const groundShadow = new ShaderMaterial({
    transparent: true,
    depthWrite: true,
    depthFunc: LessDepth,
    side: DoubleSide,
    uniforms: {
      lightDirection: { value: new Vector3() },
      shadowInk: { value: new Color() },
      strength: { value: 0.3 },
    },
    vertexShader: `uniform vec3 lightDirection;void main(){vec3 p=position;
      p.xz-=lightDirection.xz*min(160.,max(0.,p.y-2.75)/max(.075,lightDirection.y));p.y=3.04;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `uniform vec3 shadowInk;uniform float strength;void main(){gl_FragColor=vec4(shadowInk,strength);}`,
  });
  const silhouettes = new Group();
  group.add(silhouettes);
  for (const [surface, mat] of [
    [ground, banks],
    [parks, green],
    [streets, road],
    [facades, walls],
    [tops, roofs],
    [edge, shore],
  ] as const) {
    if (!surface.pos.length) continue;
    mat.side = DoubleSide;
    const mesh = surface.mesh(mat);
    mesh.castShadow = false;
    group.add(mesh);
    if (mat === walls || mat === roofs) {
      const shade = new Mesh(mesh.geometry, groundShadow);
      shade.frustumCulled = false;
      shade.renderOrder = 1;
      silhouettes.add(shade);
    }
  }
  // DEM은 먼 산 능선에만 사용한다. 가까운 강변의 높이는 단순화한다.
  const hpos: number[] = [],
    idx: number[] = [],
    rows = data.dem.length,
    cols = data.dem[0].length;
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = -12000 + i * 360,
        n = -16000 + j * 360,
        d = Math.hypot(x, n);
      hpos.push(
        x,
        Math.max(0, data.dem[j][i] - 7) * Math.min(1, Math.max(0, (d - 4200) / 2500)) - 8,
        -n,
      );
      if (i && j) {
        const v = j * cols + i;
        idx.push(v - cols - 1, v - cols, v - 1, v - 1, v - cols, v);
      }
    }
  const dem = new BufferGeometry();
  dem.setAttribute("position", new Float32BufferAttribute(hpos, 3));
  dem.setIndex(idx);
  dem.computeVertexNormals();
  group.add(new Mesh(dem, hills));
  // 공원 폴리곤 안쪽에서만 수목 군집을 만든다.
  const contains = (r: number[], x: number, y: number) => {
    let inside = false;
    for (let a = 0, b = r.length - 2; a < r.length; b = a, a += 2) {
      if (
        r[a + 1] > y !== r[b + 1] > y &&
        x < ((r[b] - r[a]) * (y - r[a + 1])) / (r[b + 1] - r[a + 1]) + r[a]
      )
        inside = !inside;
    }
    return inside;
  };
  const foliage: Object3D[] = [];
  data.parks.forEach((p, k) => {
    const r = p[0];
    if (r.length < 6) return;
    const xs = r.filter((_, i) => i % 2 === 0),
      ys = r.filter((_, i) => i % 2 === 1);
    const x0 = Math.min(...xs),
      x1 = Math.max(...xs),
      y0 = Math.min(...ys),
      y1 = Math.max(...ys);
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2,
      range = Math.hypot(cx, cy);
    if (
      range > 3400 ||
      (!allBearings && (cx < -360 || Math.abs(cy - 0.28 * cx) > 800 + Math.max(0, cx) * 1.1))
    )
      return;
    const attempts = Math.min(500, Math.ceil(((x1 - x0) * (y1 - y0)) / (range > 1800 ? 260 : 130)));
    for (let i = 0; i < attempts; i++) {
      const s = seeded(i * 17 + k * 113),
        x = x0 + (x1 - x0) * s,
        y = y0 + (y1 - y0) * seeded(i * 39 + k * 47);
      if (!contains(r, x, y)) continue;
      const h = 3.5 + 5 * seeded(i + k);
      const form = new Object3D();
      form.position.set(x, 3.0 + h * 0.52, -y);
      form.rotation.set(s * 0.11, s * 5, s * 0.13);
      form.scale.set(2.15 + h * 0.18, h * 0.56, 2 + h * 0.17);
      form.updateMatrix();
      foliage.push(form);
    }
  });
  fixtures.finish(group);
  const canopy = new InstancedMesh(new IcosahedronGeometry(1, 1), tree, foliage.length);
  foliage.forEach((f, i) => {
    canopy.setMatrixAt(i, f.matrix);
    canopy.setColorAt(
      i,
      new Color().setRGB(
        0.58 + 0.31 * seeded(i),
        0.68 + 0.27 * seeded(i + 5),
        0.48 + 0.3 * seeded(i + 55),
      ),
    );
  });
  canopy.receiveShadow = true;
  canopy.castShadow = true;
  group.add(canopy);
  return {
    group,
    apply(t: Lighting) {
      banks.color.set(t.land);
      green.color.set(t.park);
      road.color.set(t.road);
      walls.color.set(t.facade).multiplyScalar(0.71);
      roofs.color.set(t.facade).multiplyScalar(0.8);
      hills.color.set(t.park).lerp(new Color(t.horizon), 0.32).multiplyScalar(0.72);
      tree.color.set(t.park).multiplyScalar(0.55);
      shore.color.set(t.land).multiplyScalar(0.7);
      night.value = outdoorDarkness(t);
      lit.value = t.lit;
      silhouettes.visible = t.power > 0.1;
      groundShadow.uniforms.lightDirection.value.fromArray(t.direction);
      groundShadow.uniforms.shadowInk.value.set(t.phase === "midday" ? "#55615e" : "#654c50");
      groundShadow.uniforms.strength.value = 0.3 * t.power;
    },
  };
}
