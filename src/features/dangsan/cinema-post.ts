import { bridgeCenterline } from "./bridge-alignment";
import {
  AlwaysDepth,
  Color,
  Matrix4,
  type PerspectiveCamera,
  DepthTexture,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  NoBlending,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type Material,
  type Scene,
  type WebGLRenderer,
  type Object3D,
} from "three";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export function createCinemaPost(renderer: WebGLRenderer) {
  const beauty = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true });
  beauty.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
  beauty.samples = Math.min(4, renderer.capabilities.maxSamples);
  const mask = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: true });
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.48, 0.32, 0.55);
  const black = new MeshBasicMaterial({ color: 0, toneMapped: false });
  const copyDepth = new ShaderMaterial({
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    depthFunc: AlwaysDepth,
    uniforms: { depthMap: { value: beauty.depthTexture } },
    vertexShader: "varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader:
      "varying vec2 v;uniform sampler2D depthMap;void main(){gl_FragDepth=min(1.,texture2D(depthMap,v).r+.000006);gl_FragColor=vec4(0.);}",
  });
  const depthQuad = new FullScreenQuad(copyDepth);
  const savedClear = new Color();
  const fx = new ShaderMaterial({
    blending: NoBlending,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      beauty: { value: beauty.texture },
      depthMap: { value: beauty.depthTexture },
      glow: { value: bloom.renderTargetsHorizontal[0].texture },
      texel: { value: new Vector2() },
      bloomGain: { value: 0 },
      nearFar: { value: new Vector2(0.35, 60000) },
      ao: { value: 0.42 },
      mapMode: { value: 0 },
      bridgeNodes: { value: bridgeCenterline.map((p) => new Vector2(p.east, p.south)) },
      inverseViewProjection: { value: new Matrix4() },
      cameraWorld: { value: new Matrix4() },
    },
    vertexShader: "varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `varying vec2 v;uniform sampler2D beauty,depthMap,glow;uniform vec2 texel,nearFar;uniform float bloomGain,ao;
    uniform float mapMode; uniform mat4 inverseViewProjection,cameraWorld;
    uniform vec2 bridgeNodes[${bridgeCenterline.length}];
    float bridgeDistance(vec2 p) {
      float best=1e15;
      for(int i=1;i<${bridgeCenterline.length};i++) { vec2 a=bridgeNodes[i-1],v=bridgeNodes[i]-a;
        best=min(best,length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.,1.)));}
      return best;
    }
    float zAt(vec2 p){float d=texture2D(depthMap,p).r;return nearFar.x*nearFar.y/(nearFar.y-d*(nearFar.y-nearFar.x));}
    float luma(vec3 c){return dot(c/(1.+c),vec3(.299,.587,.114));}
    void main(){
      vec3 center=texture2D(beauty,v).rgb;
      vec3 nw=texture2D(beauty,v+texel*vec2(-1.,-1.)).rgb,ne=texture2D(beauty,v+texel*vec2(1.,-1.)).rgb;
      vec3 sw=texture2D(beauty,v+texel*vec2(-1.,1.)).rgb,se=texture2D(beauty,v+texel*vec2(1.,1.)).rgb;
      float l0=luma(nw),l1=luma(ne),l2=luma(sw),l3=luma(se),lm=luma(center);
      vec2 dir=vec2(-(l0+l1-l2-l3),l0+l2-l1-l3);
      float red=max((l0+l1+l2+l3)*.03125,.0078125);
      dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+red),vec2(-8.),vec2(8.))*texel;
      vec3 a=.5*(texture2D(beauty,v+dir*(-1./6.)).rgb+texture2D(beauty,v+dir*(1./6.)).rgb);
      vec3 b=a*.5+.25*(texture2D(beauty,v-dir*.5).rgb+texture2D(beauty,v+dir*.5).rgb);
      float lo=min(lm,min(min(l0,l1),min(l2,l3))),hi=max(lm,max(max(l0,l1),max(l2,l3)));
      vec3 color=(luma(b)<lo||luma(b)>hi)?a:b;
      float z=zAt(v),occ=0.;
      if(z<800.){float radius=clamp(.85/(z*texel.y),2.,36.);
        for(int i=0;i<8;i++){float angle=float(i)*2.39996;vec2 uv2=v+vec2(cos(angle),sin(angle))*texel*radius*(.35+.08*float(i));
          float dz=z-zAt(uv2);occ+=smoothstep(.05,.9,dz)*(1.-smoothstep(1.8,4.2,dz));}}
      color*=1.-ao*occ/8.;
      color+=texture2D(glow,v).rgb*bloomGain;
      color*=1.-.065*pow(length((v-.5)*1.35),2.);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      if(mapMode>.5){
        float d=texture2D(depthMap,v).r;
        vec4 wp=inverseViewProjection*vec4(v*2.-1.,d*2.-1.,1.);
        vec3 p=wp.xyz/wp.w;
        float dist=bridgeDistance(p.xz);
        float structure=(1.-smoothstep(8.,13.,dist))*smoothstep(.15,1.3,p.y);
        float water=(1.-smoothstep(12.,145.,dist))*(1.-smoothstep(.20,2.4,abs(p.y)));
        float reflectance=.28+.64*smoothstep(.018,.25,luma(color));
        float coverage=max(structure,water*reflectance)*(1.-step(.9999999,d));
        gl_FragColor=vec4(gl_FragColor.rgb*coverage,coverage);
      }
    }`,
  });
  const quad = new FullScreenQuad(fx);
  let w = 1,
    h = 1;
  let interactive = false;
  return {
    mapCamera(camera: PerspectiveCamera) {
      fx.uniforms.mapMode.value = 1;
      fx.uniforms.inverseViewProjection.value.multiplyMatrices(
        camera.matrixWorld,
        camera.projectionMatrixInverse,
      );
      fx.uniforms.cameraWorld.value.copy(camera.matrixWorld);
    },
    size(width: number, height: number, live: boolean) {
      if (w === width && h === height && live === interactive) return;
      if (live !== interactive) beauty.dispose();
      interactive = live;
      w = width;
      h = height;
      beauty.samples = interactive
        ? 0
        : Math.min(w * h > 6000000 ? 2 : 4, renderer.capabilities.maxSamples);
      beauty.setSize(w, h);
      const bw = Math.max(1, Math.round(w * 0.38)),
        bh = Math.max(1, Math.round(h * 0.38));
      mask.setSize(bw, bh);
      bloom.setSize(bw, bh);
      fx.uniforms.texel.value.set(1 / w, 1 / h);
    },
    render(
      scene: Scene,
      camera: PerspectiveCamera,
      gain: number,
      omit: Object3D[],
      maskMode: (on: boolean) => void,
    ) {
      fx.uniforms.nearFar.value.set(camera.near, camera.far);
      renderer.setRenderTarget(beauty);
      renderer.clear();
      renderer.render(scene, camera);
      if (gain > 0.05) {
        const restored: [Mesh, Material | Material[]][] = [];
        const visibility = omit.map((o) => o.visible);
        const backdrop = scene.background;
        scene.background = interactive ? null : new Color(0);
        const clearMode = renderer.autoClear;
        renderer.getClearColor(savedClear);
        const savedAlpha = renderer.getClearAlpha();
        omit.forEach((o) => {
          o.visible = false;
        });
        maskMode(true);
        try {
          scene.traverseVisible((o) => {
            if (o instanceof Mesh && !o.userData.glow) {
              restored.push([o, o.material]);
              if (interactive) o.visible = false;
              else o.material = black;
            }
          });
          renderer.setRenderTarget(mask);
          renderer.setClearColor(0x000000, 1);
          renderer.clear();
          if (interactive) {
            renderer.autoClear = false;
            depthQuad.render(renderer);
          }
          renderer.render(scene, camera);
          renderer.autoClear = clearMode;
          bloom.render(renderer, mask, mask, 0, false);
        } finally {
          restored.forEach(([o, m]) => {
            o.material = m;
            o.visible = true;
          });
          renderer.autoClear = clearMode;
          omit.forEach((o, i) => {
            o.visible = visibility[i];
          });
          maskMode(false);
          scene.background = backdrop;
          renderer.setClearColor(savedClear, savedAlpha);
        }
      }
      fx.uniforms.bloomGain.value = gain;
      renderer.setRenderTarget(null);
      quad.render(renderer);
    },
    dispose() {
      beauty.dispose();
      mask.dispose();
      bloom.dispose();
      black.dispose();
      copyDepth.dispose();
      depthQuad.dispose();
      fx.dispose();
      quad.dispose();
    },
  };
}
