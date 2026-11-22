import * as T from 'three';

export function createSampler(shot, {windowDraw, cabinPass}) {
 const {renderer,scene:background,atmo,trains,post,camera}=shot;
 const W=1920,H=1080;
 const held=new T.Scene();held.environment=background.environment;held.environmentIntensity=background.environmentIntensity;
 held.fog=background.fog;
 for(const o of background.children.slice()){
   if(o===shot.bridge.group||o.name==='window-side-bracing')held.add(o);
   else if(o.isLight)held.add(o.clone());
 }
 const sub=new T.WebGLRenderTarget(W,H,{type:T.HalfFloatType,depthBuffer:true,samples:Math.min(4,renderer.capabilities.maxSamples)});
 const sum=new T.WebGLRenderTarget(W,H,{type:T.HalfFloatType,depthBuffer:false});
 const bgTex=[new T.FramebufferTexture(W,H),new T.FramebufferTexture(W,H)];
 const vertex='varying vec2 v;void main(){v=uv;gl_Position=vec4(position.xy,0.,1.);}';
 const weight={value:1/16};
 const accumulate=new T.ShaderMaterial({uniforms:{layer:{value:sub.texture},weight},vertexShader:vertex,
  transparent:true,premultipliedAlpha:true,blending:T.CustomBlending,blendSrc:T.OneFactor,blendDst:T.OneFactor,
  blendEquation:T.AddEquation,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneFactor,depthTest:false,depthWrite:false,
  fragmentShader:`varying vec2 v;uniform sampler2D layer;uniform float weight;
  #include <tonemapping_pars_fragment>
  vec3 encoded(vec3 c){return mix(1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,12.92*c,lessThanEqual(c,vec3(.0031308)));}
  void main(){vec4 p=texture2D(layer,v);
    vec3 lin=p.rgb/max(.00001,p.a);
    gl_FragColor=vec4(encoded(ACESFilmicToneMapping(lin))*p.a,p.a)*weight;}`});
 // 움직이는 철재의 반투명 가장자리를 합성할 때 노출이 바뀌지 않도록
 // 각 패스에 같은 ACES 노출을 적용하고 표시 색상에 알파를 미리 곱해 누적한다.
 accumulate.uniforms.toneMappingExposure={value:.97};
 const composite=new T.ShaderMaterial({uniforms:{a:{value:bgTex[0]},b:{value:bgTex[1]},hold:{value:sum.texture},sunAt:{value:new T.Vector2()}},vertexShader:vertex,
  blending:T.NoBlending,depthTest:false,depthWrite:false,
  fragmentShader:'varying vec2 v;uniform sampler2D a,b,hold;uniform vec2 sunAt;void main(){vec4 h=texture2D(hold,v);vec3 farColor=.5*(texture2D(a,v).rgb+texture2D(b,v).rgb);vec2 sd=(v-sunAt)*vec2(1.77778,1.);float glow=1.-smoothstep(.004,.108,length(sd));float below=smoothstep(.024,.15,sunAt.y-v.y);float ribbon=exp(-pow(sd.x/(.080+.17*max(0.,-sd.y)),2.))*below;float warm=smoothstep(.07,.34,farColor.r-farColor.b);farColor*=vec3(1.,1.-warm*(.080*glow+.047*ribbon),1.-warm*(.31*glow+.19*ribbon));gl_FragColor=vec4(h.rgb+(1.-clamp(h.a,0.,1.))*farColor,1.);}'});
 const quad=new T.Mesh(new T.PlaneGeometry(2,2),composite),quadScene=new T.Scene(),cam=new T.OrthographicCamera(-1,1,1,-1,.1,2);
 quad.frustumCulled=false;quadScene.add(quad);
 const N=18;weight.value=1/N;
 function halton(index,base){let sum=0,f=1;while(index>0){f/=base;sum+=(index%base)*f;index=Math.floor(index/base);}return sum;}
 return n=>{
  let state;
  renderer.setClearColor(0x000000,1);
  for(let i=0;i<2;i++){
    state=windowDraw(n+(i-.5)*.38,(i-.5)*.59,(.5-i)*.47);
    post.render(background,camera,0,[atmo.sky,atmo.water,shot.city.group],trains.setMask);
    renderer.copyFramebufferToTexture(bgTex[i]);
  }
  renderer.setClearColor(0x000000,0);
  renderer.setRenderTarget(sum);renderer.clear();
  quad.material=accumulate;
  for(let i=0;i<N;i++){
    const t=((i+.5)/N-.5)*.78;
    windowDraw(n+t,halton(i+1,2)-.5,halton(i+1,3)-.5);
    renderer.setRenderTarget(sub);renderer.render(held,camera);
    renderer.setRenderTarget(sum);renderer.autoClear=false;renderer.render(quadScene,cam);renderer.autoClear=true;
  }
  state=windowDraw(n,0,0);const sun=atmo.sky.material.uniforms.sunPosition.value.clone().normalize().multiplyScalar(5000).add(camera.position).project(camera);composite.uniforms.sunAt.value.set(.5+.5*sun.x,.5+.5*sun.y);
  renderer.setRenderTarget(null);quad.material=composite;renderer.render(quadScene,cam);
  cabinPass();
  return state;
 };
}
