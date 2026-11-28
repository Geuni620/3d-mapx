import {
  Color,
  DataTexture,
  FogExp2,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  PlaneGeometry,
  PMREMGenerator,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  Vector3,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { Water } from "three/addons/objects/Water.js";
import { outdoorDarkness, type Lighting } from "./solar-palette";

function waveNormals(renderer: WebGLRenderer) {
  const w = 256,
    data = new Uint8Array(w * w * 4);
  // 여러 파장과 방향을 겹친 주기적 기울기장. 단일 사인파 격자의 규칙적인 반사선을 피한다.
  let random = 19457;
  const rand = () => {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    return random / 4294967296;
  };
  const waves = Array.from({ length: 45 }, (_, i) => {
    const freq = 2 + Math.pow(i / 44, 1.6) * 33,
      angle = (rand() * 0.83 + 0.07) * Math.PI;
    return [
      Math.round(freq * Math.cos(angle)),
      Math.round(freq * Math.sin(angle)),
      rand() * Math.PI * 2,
      0.048 / (1 + freq * 0.075),
    ];
  });
  for (let j = 0; j < w; j++)
    for (let i = 0; i < w; i++) {
      let u = (i * Math.PI * 2) / w,
        v = (j * Math.PI * 2) / w;
      const a = u + 0.13 * Math.sin(2 * v) + 0.07 * Math.sin(3 * u + v),
        b = v + 0.16 * Math.sin(u - 2 * v) + 0.05 * Math.cos(4 * u);
      let dx = 0,
        dz = 0;
      for (const [kx, kz, phase, slope] of waves) {
        const q = (Math.cos(a * kx + b * kz + phase) * slope) / Math.hypot(kx, kz);
        dx += q * kx;
        dz += q * kz;
      }
      const n = new Vector3(dx, dz * 1.3, 1).normalize(),
        k = (j * w + i) * 4;
      data[k] = Math.round((n.x + 1) * 127.5);
      data[k + 1] = Math.round((n.y + 1) * 127.5);
      data[k + 2] = Math.round((n.z + 1) * 127.5);
      data[k + 3] = 255;
    }
  const tex = new DataTexture(data, w, w, RGBAFormat);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(12, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  return tex;
}
export function createAtmosphere(renderer: WebGLRenderer, scene: Scene) {
  const sky = new Sky();
  sky.scale.setScalar(55000);
  sky.frustumCulled = false;
  sky.material.depthWrite = false;
  const su = sky.material.uniforms;
  Object.assign(su, {
    artTop: { value: new Color() },
    artHorizon: { value: new Color() },
    artNight: { value: 0 },
  });
  su.turbidity.value = 2.8;
  su.rayleigh.value = 1.15;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.78;
  // 실제 산란 성분과 태양 원반을 유지하고, 황혼·야간의 지평 색은 미술 토큰으로 정한다.
  sky.material.fragmentShader =
    "uniform vec3 artTop,artHorizon;uniform float artNight;\n" +
    sky.material.fragmentShader.replace(
      "gl_FragColor = vec4( texColor, 1.0 );",
      `
      float altitude=max(direction.y,0.);
      float h=1.-exp(-altitude*8.0);
      vec3 gradient=mix(artHorizon,artTop,h);
      vec2 uvCloud=direction.xz/(.10+altitude)*vec2(1.8,3.9)+vec2(2.4,1.6);
      float clouds=smoothstep(.40,.82,fbm(uvCloud)*.72+fbm(uvCloud*2.8)*.28)*smoothstep(.003,.11,altitude);
      gradient=mix(gradient, mix(artHorizon,vec3(1.08),.38),clouds*.44*(1.-artNight));
      vec3 physicalSky=min(texColor,vec3(1.7))*.045*(1.-artNight);
      float star=step(.99984,fract(sin(dot(floor(uv*vec2(5100.,2300.)),vec2(12.9,78.2)))*4375.89));
      vec3 finalSky=gradient*(1.02+.075*fbm(uvCloud*.65))+physicalSky+
        sundisc*vec3(9.,6.,3.)*(1.-artNight)+vec3(star*.14*artNight*smoothstep(.06,.44,altitude));
      gl_FragColor=vec4(finalSky,1.);`,
    );
  su.cloudCoverage.value = 0;
  scene.add(sky);
  const envScene = new Scene(),
    envSky = new Mesh(sky.geometry, sky.material);
  envSky.scale.copy(sky.scale);
  envScene.add(envSky);
  const pmrem = new PMREMGenerator(renderer);
  let env: WebGLRenderTarget | null = null;
  const normals = waveNormals(renderer);
  const water = new Water(new PlaneGeometry(17000, 16000), {
    textureWidth: 1024,
    textureHeight: 768,
    waterNormals: normals,
    sunDirection: new Vector3(),
    sunColor: "#ffffff",
    waterColor: "#2e86b8",
    distortionScale: 4.4,
    clipBias: 0.002,
    fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  const wu = water.material.uniforms;
  wu.size.value = 4.5;
  wu.artNight = { value: 0 };
  wu.lightTracks = { value: [new Vector3(), new Vector3()] };
  water.material.fragmentShader =
    "uniform vec3 lightTracks[2];uniform float artNight;\n" +
    water.material.fragmentShader.replace(
      "vec3 outgoingLight = albedo;",
      `
      float fresnel=.13+.48*pow(1.-theta,3.)+.10*artNight;
      vec3 deep=waterColor*(.26+.17*max(surfaceNormal.y,0.));
      float shadow=getShadowMask();deep*=mix(.42,1.,shadow);
      vec3 outgoingLight=mix(deep,reflectionSample,fresnel)+specularLight*(.27+.25*(1.-artNight));
      outgoingLight+=waterColor*.06*noise.r;
      // 거친 수면의 반사 방향이 차량 창 높이에서 편성을 만나는 지점. 광량은 시각적 근사.
      if(artNight>.04){
        vec3 ray=reflect(-eyeDirection,surfaceNormal);
        vec2 hit=worldPosition.xz+ray.xz*20.25/max(.045,ray.y);
        for(int k=0;k<2;k++){
          vec2 f=vec2(sin(lightTracks[k].y),-cos(lightTracks[k].y));
          vec2 off=hit-lightTracks[k].xz;float along=dot(off,f);
          float side=dot(off,vec2(-f.y,f.x));
          float fall=exp(-abs(side)*.13)*smoothstep(-194.,-181.,along)*(1.-smoothstep(4.,12.,along));
          float spaced=.50+.5*smoothstep(.08,.68,fract((along+9.)/3.12));
          outgoingLight+=vec3(.94,.51,.205)*fall*spaced*artNight*.48;
        }
      }
    `,
    );
  water.receiveShadow = true;
  scene.add(water);
  const fog = new FogExp2("#e8f0f8", 0.00019);
  scene.fog = fog;
  let lastEnvironment = "";
  return {
    sky,
    water,
    trackLights(v: Vector3[]) {
      wu.lightTracks.value = v;
    },
    apply(t: Lighting, envKey: string) {
      sky.visible = water.visible = !t.tunnel;
      scene.fog = fog;
      fog.color.set(t.tunnel ? "#121215" : t.horizon);
      fog.density = t.tunnel ? 0.0085 : 0.00012 + 0.00009 * t.cabin;
      su.artTop.value.set(t.sky);
      su.artHorizon.value.set(t.horizon);
      su.artNight.value = t.phase === "night" || t.phase === "midnight" ? 1 : t.cabin * 0.72;
      su.sunPosition.value.fromArray(t.direction).multiplyScalar(450000);
      wu.sunDirection.value.fromArray(t.direction);
      wu.sunColor.value.set(t.sun).multiplyScalar(t.power * 0.96);
      wu.waterColor.value.set(t.water);
      wu.artNight.value = outdoorDarkness(t);
      if (t.tunnel) {
        scene.environment = null;
        return;
      }
      if (lastEnvironment !== envKey || !env) {
        const next = pmrem.fromScene(envScene, 0, 0.1, 110000, { size: 128 });
        env?.dispose();
        env = next;
        lastEnvironment = envKey;
      }
      scene.environment = env.texture;
      scene.environmentIntensity = 0.82 - 0.48 * outdoorDarkness(t);
    },
    time(sec: number) {
      wu.time.value = sec * 0.42;
    },
    dispose() {
      const reflection = wu.mirrorSampler.value?.renderTarget as WebGLRenderTarget | undefined;
      reflection?.dispose();
      normals.dispose();
      env?.dispose();
      pmrem.dispose();
    },
  };
}
