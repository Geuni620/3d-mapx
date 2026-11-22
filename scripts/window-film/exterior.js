import * as T from 'three';
import { pointOnBridge } from '../../src/features/dangsan/bridge-alignment.ts';
import { railHeightAt } from '../../src/features/dangsan/bridge-location.ts';

export function configureExterior(shot) {
  const {scene,atmo,city,theme} = shot;
  city.apply({...theme, facade:'#9d919f', land:'#a99a93', road:'#b2a098', park:'#888777', lit:.035});
  scene.fog.color.set('#db9b83');
  scene.fog.density=.00092;
  scene.environmentIntensity=.58;
  const sky=atmo.sky.material, water=atmo.water.material;
  // 서울 일몰 방위는 유지하고 창에 해가 걸리도록 고도만 올린다.
  const direction=new T.Vector3(...theme.direction);
  const alt=T.MathUtils.degToRad(5.6);
  direction.y=0; direction.normalize().multiplyScalar(Math.cos(alt)); direction.y=Math.sin(alt);
  sky.uniforms.sunPosition.value.copy(direction).multiplyScalar(450000);
  water.uniforms.sunDirection.value.copy(direction);
  const solar='gl_FragColor=vec4(finalSky,1.);';
  if(!sky.fragmentShader.includes(solar))throw Error('sky shader version');
  sky.fragmentShader=sky.fragmentShader.replace(solar,`
    float angleToSun=acos(clamp(cosTheta,-1.,1.));
    float westerly=pow(max(cosTheta,0.),3.);
    float altY=max(direction.y,0.);
    vec3 dusk=mix(vec3(.47,.24,.24),vec3(.93,.29,.067),westerly);
    vec3 veil=mix(dusk,vec3(.44,.198,.22),smoothstep(.021,.32,altY));
    vec3 air=mix(veil,vec3(.049,.103,.19),smoothstep(.15,.58,altY));
    float halo=exp(-angleToSun*11.);
    air+=vec3(1.08,.30,.032)*halo+vec3(.32,.082,.007)*exp(-angleToSun*35.);
    float az=atan(direction.x,direction.z);
    float sheet=fbm(vec2(az*3.8+2.9,altY*29.+.8));
    float wisps=fbm(vec2(az*9.+3.,altY*92.+5.));
    float veilCloud=smoothstep(.43,.67,.68*sheet+.32*wisps)*(.4+.6*smoothstep(.015,.21,altY));
    vec3 cloudInk=mix(vec3(.23,.16,.23),vec3(.85,.325,.145),exp(-angleToSun*3.2));
    air=mix(air,cloudInk,veilCloud*.53);
    air*=mix(vec3(1.),vec3(1.,.70,.54),exp(-angleToSun*6.));
    float ember=1.-smoothstep(.011,.0175,angleToSun);
    float limb=1.-smoothstep(.0015,.015,angleToSun);
    float dust=.85+.15*smoothstep(.39,.61,fbm(vec2(az*22.+2.1,altY*155.+4.7)));
    air+=mix(vec3(1.10,.34,.023),vec3(2.35,.95,.125),limb)*ember*dust;
    air+=vec3(.63,.110,.009)*exp(-angleToSun*46.);
    gl_FragColor=vec4(air,1.);`);
  sky.needsUpdate=true;
  water.uniforms.waterColor.value.set('#4b586a');
  water.uniforms.sunColor.value.setRGB(.94,.38,.09);
  water.uniforms.distortionScale.value=2.2;
  water.uniforms.artNight.value=.0;
  const needle='outgoingLight+=waterColor*.06*noise.r;';
  if(!water.fragmentShader.includes(needle))throw Error('Water shader version');
  water.fragmentShader=water.fragmentShader.replace('void main() {',`
    float waveHash(vec2 p){p=fract(p*vec2(.1031,.0937));p+=dot(p,p.yx+19.19);return fract(p.x*p.y);}
    float waveNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(waveHash(i),waveHash(i+vec2(1.,0.)),f.x),mix(waveHash(i+vec2(0.,1.)),waveHash(i+1.),f.x),f.y);}
    void main() {`).replace(needle,`
    vec2 toSun=normalize(sunDirection.xz),lateral=vec2(-toSun.y,toSun.x);
    vec3 halfway=normalize(eyeDirection+sunDirection);
    vec2 slope=halfway.xz/max(.065,halfway.y);
    float golden=exp(-.5*pow(dot(slope,lateral)/.25,2.)-.5*pow(dot(slope,toSun)/.25,2.));
    vec2 ripple=vec2(dot(worldPosition.xz,lateral)*.20,dot(worldPosition.xz,toSun)*.78)+vec2(noise.x*.5,noise.y*.8-time*.13);
    float rip=.53*waveNoise(ripple)+.47*waveNoise(ripple*2.07+9.);
    float g=smoothstep(.37,.73,rip);
    g=mix(g,.37,smoothstep(.48,1.6,max(fwidth(ripple.x),fwidth(ripple.y))));
    float roughSea=waveNoise(ripple*.45+vec2(2.1,8.2))*.45+waveNoise(ripple*.97+vec2(2.1,-1.8))*.35+waveNoise(ripple*1.65+4.2)*.2;
    float waveGain=.59+.9*smoothstep(.28,.73,roughSea);
    vec3 hanBase=mix(vec3(.078,.112,.154),vec3(.250,.159,.145),pow(1.-max(0.,eyeDirection.y),3.));
    outgoingLight=mix(hanBase*waveGain,reflectionSample*(.79+.38*roughSea),.20+.24*fresnel);
    outgoingLight+=specularLight*vec3(.23,.105,.043);
    outgoingLight+=golden*(.085+1.07*g)*vec3(2.64,.54,.055);
    `);
  const reflected='vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );';
  if(!water.fragmentShader.includes(reflected))throw Error('unrecognized mirror pass');
  water.fragmentShader=water.fragmentShader.replace(reflected,`vec2 pos=worldPosition.xz;
    vec2 rippleUV=vec2(pos.x*.13+.09*pos.y,pos.y*.43-pos.x*.14);
    float acrossW=waveNoise(rippleUV+vec2(time*.12,-time*.18))-.5;
    float alongW=waveNoise(rippleUV*.53+vec2(5.,time*.14))-.5;
    vec2 mir=mirrorCoord.xy/mirrorCoord.w+distortion+vec2(.007*alongW,.023*acrossW);
    vec2 smear=vec2(.002,.009);
    vec3 reflectionSample=texture2D(mirrorSampler,mir).rgb*.36+
      .16*(texture2D(mirrorSampler,mir+smear).rgb+texture2D(mirrorSampler,mir-smear).rgb)+
      .16*(texture2D(mirrorSampler,mir+smear*vec2(-.5,1.7)).rgb+texture2D(mirrorSampler,mir-smear*vec2(-.5,1.7)).rgb);`);
  water.needsUpdate=true;
  for(const obj of city.group.children){
    if(!obj.isInstancedMesh || obj.geometry.type!=='IcosahedronGeometry')continue;
    const mat=new T.Matrix4(), pos=new T.Vector3(), rot=new T.Quaternion(),sc=new T.Vector3();
    for(let i=0;i<obj.count;i++){
      const rnd=k=>T.MathUtils.seededRandom((i+17)*1349+k*7919);
      obj.getMatrixAt(i,mat);mat.decompose(pos,rot,sc);
      sc.x*=.80+.51*rnd(1);sc.y*=.64+.57*rnd(2);sc.z*=.80+.38*rnd(3);
      obj.setMatrixAt(i,mat.compose(pos,rot,sc));
      obj.setColorAt(i,new T.Color().setRGB(.87+.10*rnd(4),.83+.14*rnd(5),.80+.09*rnd(6)));
    }
    obj.instanceMatrix.needsUpdate=true;obj.instanceColor.needsUpdate=true;
    obj.material.color.set('#798575');
  }
  // 서쪽 대각 철재의 위치와 치수는 창밖 전경을 위해 정했다.
  const steel=new T.MeshStandardMaterial({color:'#545d64',metalness:.48,roughness:.57});
  const lip=new T.MeshStandardMaterial({color:'#8a8176',metalness:.49,roughness:.52});
  const gusset=new T.MeshStandardMaterial({color:'#525b60',metalness:.36,roughness:.66});
  function point(s,h,off=-6.52){
    const p=pointOnBridge(s);
    return new T.Vector3(p.east+off*Math.cos(p.bearing),railHeightAt(s)+h,p.south+off*Math.sin(p.bearing));
  }
  const batches=new Map();
  function bar(m,a,b,w,d) {
    const dir=b.clone().sub(a);const size=dir.length();
    const basisX=dir.clone().cross(new T.Vector3(.805,0,.592)).normalize();
    const basisZ=basisX.clone().cross(dir.clone().normalize()).normalize();
    const matrix=new T.Matrix4().makeBasis(basisX,dir.multiplyScalar(1/size),basisZ);
    matrix.scale(new T.Vector3(w,size,d)).setPosition(a.clone().lerp(b,.5));
    if(!batches.has(m))batches.set(m,[]);
    batches.get(m).push(matrix);
  }
  // 철재 사이에 노을을 가리지 않는 구간을 남긴다.
  for(const [s0,span] of [[560,22],[582,22],[608,19],[741,22],[914,22],[947,21]]){
    const top=5.8,bottom=.78;
    for(const h of [bottom,top]){
      bar(steel,point(s0,h),point(s0+span,h),.20,.18);
      bar(lip,point(s0,h+.094,-6.40),point(s0+span,h+.094,-6.40),.040,.13);
    }
    for(let j=0;j<2;j++){
      const a=s0+j*span*.5,b=a+span*.5,h1=j===0?bottom:top,h2=j===0?top:bottom;
      bar(steel,point(a,h1),point(b,h2),.22,.19);
      bar(lip,point(a,h1+.07,-6.39),point(b,h2+.07,-6.39),.048,.12);
    }
    for(const s of [s0,s0+span]){
      bar(steel,point(s,-.25),point(s,top),.22,.22);
      bar(gusset,point(s,bottom-.18,-6.4),point(s,bottom+.25,-6.4),.48,.034);
    }
  }
  for(const [m,arr] of batches){
    const mesh=new T.InstancedMesh(new T.BoxGeometry(1,1,1),m,arr.length);
    arr.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.computeBoundingSphere();
    mesh.name='window-side-bracing'; scene.add(mesh);
  }
}
