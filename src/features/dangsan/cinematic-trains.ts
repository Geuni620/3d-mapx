import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  SpotLight,
  type BufferGeometry,
  type Material,
  type Texture,
} from "three";
import { createSubwayTrainModel } from "../subway/subway-train-model";
import { getScheduledFleet, type ScheduledTrain } from "../subway/line-2-timetable";
import { groundPoint, railY } from "./scene-geometry";
import { PASSING_TIME, railPose, isBridgeTrain } from "./bridge-location";
import type { Lighting } from "./solar-palette";

export const PASSING_EPOCH = PASSING_TIME;
export const TUNNEL_EPOCH = Date.parse("2026-11-21T17:18:37+09:00");

function patchTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.translate(64, 32);
  ctx.scale(64, 32);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, "rgba(255,236,189,.43)");
  g.addColorStop(0.42, "rgba(255,218,147,.25)");
  g.addColorStop(1, "rgba(255,204,130,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  return new CanvasTexture(c);
}
export function createCinematicTrains(maxAniso: number, onReady: () => void, mapMode = false) {
  const models = [0, 1].map(() =>
    createSubwayTrainModel({ lineColor: "#00a84d", carCount: 10, onTextureLoad: onReady }),
  );
  const group = new Group(),
    created = new Set<Material>(),
    geometries = new Set<BufferGeometry>();
  const gPatch = new PlaneGeometry(1, 1),
    windowPatch = patchTexture();
  const patch = new MeshBasicMaterial({
    map: windowPatch,
    color: "#ffce88",
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
  });
  const lens = new CylinderGeometry(0.073, 0.073, 0.035, 20).rotateX(0);
  const tailBar = new BoxGeometry(0.22, 0.026, 0.063);
  const white = new MeshBasicMaterial({ color: new Color(3, 3, 2.75) }),
    red = new MeshBasicMaterial({ color: new Color(2.8, 0.026, 0.005) });
  [patch, white, red].forEach((m) => created.add(m));
  [gPatch, lens, tailBar].forEach((g) => geometries.add(g));
  const cabin = { value: 1 },
    sky = { value: new Color() },
    glowOnly = { value: 0 },
    warm = { value: new Color("#ffe6b4") };
  let bodyPhysical: MeshPhysicalMaterial | undefined;
  const originals = new Map<Material, MeshPhysicalMaterial>();
  const skins = new Set<MeshPhysicalMaterial>();
  function skin(source: MeshStandardMaterial, isFace: boolean) {
    const mat = new MeshPhysicalMaterial({
      map: source.map,
      emissiveMap: source.emissiveMap,
      roughness: isFace ? 0.31 : 0.42,
      metalness: isFace ? 0.14 : 0.6,
      clearcoat: isFace ? 0.64 : 0.38,
      clearcoatRoughness: 0.22,
      side: DoubleSide,
      emissive: "#ffffff",
    });
    [mat.map, mat.emissiveMap].forEach((t: Texture | null) => {
      if (t) t.anisotropy = Math.min(12, maxAniso);
    });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, {
        uCabin: cabin,
        uSkyGlint: sky,
        uGlowOnly: glowOnly,
        uWarm: warm,
      });
      s.vertexShader =
        "varying vec3 coachP;\n" +
        s.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ncoachP=position;",
        );
      s.fragmentShader =
        "uniform float uCabin,uGlowOnly;uniform vec3 uSkyGlint,uWarm;varying vec3 coachP;\n" +
        s.fragmentShader
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
          vec3 paneMap=texture2D(emissiveMap,vEmissiveMapUv).rgb;
          float windowMask=smoothstep(.025,.21,max(max(paneMap.r,paneMap.g),paneMap.b));
          float paneHash=fract(sin(floor((coachP.y+10.)/1.58)*196.17+sign(coachP.x)*4.17)*1561.31);
          float shade=mix(.19,.95,step(.12,paneHash))*(.85+.20*paneHash);
          ${isFace ? "" : "vec3 eye=normalize(vViewPosition);vec3 N=normalize(cross(dFdx(-vViewPosition),dFdy(-vViewPosition)));N=faceforward(N,-eye,N);float incidence=clamp(abs(dot(N,eye)),.08,1.);float reflection=.06+.70*pow(1.-incidence,5.);vec3 ray=refract(-eye,N,1./1.5);vec2 warped=clamp(vMapUv+ray.xy*.00065,vec2(.001),vec2(.999));vec3 inside=texture2D(map,warped).rgb*exp(-vec3(1.9,1.65,1.45)/max(.55,incidence));vec3 smokedPane=mix(inside,uSkyGlint*.82,reflection+.14);diffuseColor.rgb=mix(diffuseColor.rgb,smokedPane,windowMask*(1.-.65*uCabin));"}
        `,
          )
          .replace(
            "#include <roughnessmap_fragment>",
            "#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.16,windowMask);",
          )
          .replace(
            "#include <metalnessmap_fragment>",
            "#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.16,windowMask);",
          )
          .replace(
            "#include <emissivemap_fragment>",
            isFace
              ? "#include <emissivemap_fragment>\ntotalEmissiveRadiance*=.36+.82*uCabin;"
              : "totalEmissiveRadiance=paneMap*uWarm*shade*uCabin*3.85;",
          )
          .replace(
            "#include <opaque_fragment>",
            "if(uGlowOnly>.5) outgoingLight=totalEmissiveRadiance;\n#include <opaque_fragment>",
          );
    };
    mat.customProgramCacheKey = () => (isFace ? "dangsan-cab-v1" : "dangsan-skin-v1");
    created.add(mat);
    skins.add(mat);
    return mat;
  }
  const beams: SpotLight[] = [];
  for (const model of models) {
    model.root.rotation.x = -Math.PI / 2;
    group.add(model.root);
    const sides = new Map<Material, MeshPhysicalMaterial>();
    model.root.traverse((obj) => {
      if (!(obj instanceof Mesh) || Array.isArray(obj.material)) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (
        obj.name === "train-door-window-skin" ||
        obj.name === "train-headlights" ||
        obj.name === "train-tail-lights"
      ) {
        const src = obj.material as MeshStandardMaterial,
          face = obj.name !== "train-door-window-skin";
        const cache = face ? originals : sides;
        if (!cache.has(src)) cache.set(src, skin(src, face));
        obj.material = cache.get(src)!;
        obj.userData.glow = true;
      } else if (obj.material instanceof MeshStandardMaterial) {
        if (!bodyPhysical) {
          bodyPhysical = new MeshPhysicalMaterial({
            color: "#dce4e5",
            vertexColors: true,
            metalness: 0.6,
            roughness: 0.38,
            clearcoat: 0.24,
            clearcoatRoughness: 0.34,
          });
          created.add(bodyPhysical);
        }
        obj.material = bodyPhysical;
      }
    });
    model.cars.forEach((car, i) => {
      if (i === 0 || i === 9) {
        const shell = car.children[0],
          front = i === 0;
        if (front) {
          const beam = new SpotLight("#fff3d9", 1, 64, 0.26, 0.72, 2);
          beam.position.set(0, 9, 1.95);
          beam.target.position.set(0, 35, -0.25);
          // Keep the map's light count constant as the second train enters. Changing it relinks the PBR programs.
          (mapMode ? group : shell).add(beam, beam.target);
          beams.push(beam);
        }
        for (const side of [-1, 1]) {
          const m = new Mesh(front ? lens : tailBar, front ? white : red);
          m.position.set(side * (front ? 0.86 : 0.61), 9.555, 2.02);
          m.userData.glow = true;
          shell.add(m);
        }
      }
      for (const side of [-1, 1]) {
        const light = new Mesh(gPatch, patch);
        light.position.set(side * 1.97, 0, -0.13);
        light.scale.set(1.5, 15.5, 1);
        light.renderOrder = 2;
        car.add(light);
      }
    });
  }
  const reference = getScheduledFleet(PASSING_EPOCH);
  const trains = ["2284", "2287"].map((n) => reference.find((t) => t.number === n)!);
  const tunnelCenter = trains[0].getLeadPose(TUNNEL_EPOCH).lead;
  const origin = groundPoint(tunnelCenter.coordinate);
  const axis = tunnelCenter.headingRadians;
  const up = new Vector3(0, 1, 0);
  const lightTracks = [new Vector3(), new Vector3()];
  const drawnIds = new Set<string>();
  function place(
    epoch: number,
    underground: boolean,
    empty: boolean,
    study = true,
    networkFleet?: readonly ScheduledTrain[],
  ) {
    const fleet = study
      ? trains
      : networkFleet ?? getScheduledFleet(epoch)
          .filter((t) => isBridgeTrain(t.getLeadPose(epoch).lead.coordinate))
          .slice(0, 2);
    drawnIds.clear();
    models.forEach((model, i) => {
      const t = fleet[i];
      model.root.visible = !!t && !empty && (!underground || i === 0);
      if (mapMode) beams[i].intensity = model.root.visible ? 320 * cabin.value : 0;
      lightTracks[i].set(1e5, 0, 1e5);
      if (!model.root.visible || !t) return;
      drawnIds.add(t.id);
      const state = t.getState(epoch);
      for (const pose of state.carPoses) {
        const point = groundPoint(pose.coordinate);
        if (pose.carIndex === 0) lightTracks[i].set(point.x, pose.headingRadians, point.z);
        if (underground) point.sub(origin).applyAxisAngle(up, axis);
        const car = model.cars[pose.carIndex];
        const level = networkFleet ? railPose(pose.coordinate, pose.headingRadians) : undefined;
        // 기존 모델의 +Y는 전두 방향, +Z는 상방이다.
        car.position.set(
          point.x,
          -point.z,
          underground ? 0 : level?.height ?? railY,
        );
        car.rotation.set(level?.pitch ?? 0, 0, -(pose.headingRadians - (underground ? axis : 0)), "ZXY");
        if (mapMode && pose.carIndex === 0) {
          const x = Math.sin(pose.headingRadians), z = -Math.cos(pose.headingRadians);
          beams[i].position.set(point.x + 9*x, car.position.z + 2, point.z + 9*z);
          beams[i].target.position.set(point.x + 35*x, car.position.z, point.z + 35*z);
        }
      }
    });
  }
  return {
    group,
    place,
    lightTracks,
    drawnIds,
    setMask(value: boolean) {
      glowOnly.value = value ? 1 : 0;
    },
    apply(t: Lighting) {
      cabin.value = t.cabin;
      sky.value.set(t.horizon);
      warm.value.set(t.tunnel ? "#fff0d4" : "#ffe1a6");
      white.color.setRGB(1.4 + t.cabin * 5, 1.38 + t.cabin * 4.8, 1.25 + t.cabin * 4.3);
      red.color.setRGB(1 + t.cabin * 3, 0.018, 0.008);
      patch.opacity = t.cabin * 0.56;
      beams.forEach((b) => {
        b.intensity = 320 * t.cabin;
        b.visible = mapMode || t.cabin > 0.08;
      });
    },
    dispose() {
      models.forEach((m) => m.dispose());
      created.forEach((x) => x.dispose());
      geometries.forEach((x) => x.dispose());
      windowPatch.dispose();
    },
  };
}
