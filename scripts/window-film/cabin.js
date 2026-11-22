import * as T from 'three';

export function createCabin(shot, train, depart) {
  const {renderer,scene,atmo,trains}=shot;
  const car=trains.group.getObjectByName('train-car-3');
  if(!car)throw Error('Passenger car missing');
  const nearScene=new T.Scene();
  nearScene.environment=scene.environment;
  nearScene.environmentIntensity=.38;
  const cabinCam=new T.PerspectiveCamera(52,16/9,.028,15);
  const outsideCam=shot.camera;
  outsideCam.near=.6;outsideCam.far=58000;
  const mat=(color,metalness,roughness)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const sideWall=mat('#625d56',.18,.59), outerRim=mat('#8e9292',.58,.37),
    extrusion=mat('#53575a',.54,.38), gasket=mat('#252827',.04,.76),
    glazingBead=mat('#555655',.25,.46),sill=mat('#817f78',.55,.43);
  const liner=mat('#888074',.23,.59);
  function loop(path,x,y,w,h,r){
    const l=x-w/2,b=y-h/2,R=x+w/2,t=y+h/2;
    path.moveTo(l+r,b);path.lineTo(R-r,b);path.quadraticCurveTo(R,b,R,b+r);
    path.lineTo(R,t-r);path.quadraticCurveTo(R,t,R-r,t);path.lineTo(l+r,t);
    path.quadraticCurveTo(l,t,l,t-r);path.lineTo(l,b+r);path.quadraticCurveTo(l,b,l+r,b);path.closePath();
    return path;
  }
  const panel=new T.Shape();loop(panel,0,0,10,3,.05);
  const centers=[-4.62,-2.31,0,2.31,4.62];
  const W=2.025,H=1.036,R=.137;
  for(const x of centers)panel.holes.push(loop(new T.Path(),x,0,W,H,R));
  function addShape(shape,material,z,d,b=.003) {
    const geo=new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:b>0,bevelSize:b,bevelThickness:b,bevelSegments:3,curveSegments:15});
    const mesh=new T.Mesh(geo,material);mesh.position.z=z;nearScene.add(mesh);return mesh;
  }
  addShape(panel,sideWall,.045,.052,.007);
  function ring(x,w,h,r,border,z,depth,m,b){
    const s=loop(new T.Shape(),x,0,w,h,r);
    s.holes.push(loop(new T.Path(),x,0,w-2*border,h-2*border,r-border));
    return addShape(s,m,z,depth,b);
  }
  function box(x,y,z,w,h,d,m){
    const m3=new T.Mesh(new T.BoxGeometry(w,h,d),m);m3.position.set(x,y,z);nearScene.add(m3);return m3;
  }
  for(const x of centers){
    ring(x,W+.04,H+.04,R+.02,.038,.038,.058,outerRim,.004);
    ring(x,W-.028,H-.028,R-.014,.025,.024,.044,extrusion,.004);
    ring(x,W-.070,H-.070,R-.035,.026,.010,.026,gasket,.007);
    ring(x,W-.110,H-.110,R-.055,.010,.007,.014,glazingBead,.0025);
    box(x,-H*.5-.05,.085,2.016,.034,.095,sill);
    box(x,-H*.5-.073,.075,2.014,.012,.062,liner);
  }
  // 실내등 반사를 유리 평면에 둬서 창밖이 움직여도 창틀에 가려지게 한다.
  const glass=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
    uniforms:{paneWidth:{value:W-.128},paneHeight:{value:H-.128}},
    vertexShader:`varying vec2 st;void main(){st=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
      varying vec2 st;uniform float paneWidth,paneHeight;
      float glowLine(vec2 p,vec2 a,vec2 b,float r){
        vec2 d=b-a;vec2 nearest=a+d*clamp(dot(p-a,d)/dot(d,d),0.,1.);
        return exp(-pow(length(p-nearest)/r,2.));
      }
      void main(){
        vec2 p=(st-.5)*vec2(paneWidth,paneHeight);
        vec2 q=abs(p)-(vec2(paneWidth,paneHeight)*.5-.073);
        float sd=length(max(q,0.))+min(max(q.x,q.y),0.)-.073;
        if(sd>0.)discard;
        vec2 uv=st;
        float bar=glowLine(uv,vec2(.34,.794),vec2(.70,.823),.0074);
        float strip=glowLine(uv,vec2(.76,.828),vec2(1.30,.871),.0064);
        float halo=glowLine(uv,vec2(.34,.794),vec2(.70,.823),.022);
        float twin=glowLine(uv,vec2(.34,.783),vec2(.70,.812),.0035);
        float jamb=glowLine(uv,vec2(.802,.21),vec2(.813,.83),.010)*.036;
        float glint=(bar+strip)*.17+twin*.038+halo*.037+jamb;
        float sheen=.013+.013*smoothstep(.62,.94,uv.y);
        float alpha=sheen+glint;
        vec3 reflected=(vec3(.16,.24,.29)*sheen+vec3(1.,.84,.64)*glint)/max(alpha,.0001);
        gl_FragColor=vec4(reflected,alpha);
      }`});
  for(const x of centers){
    const mesh=new T.Mesh(new T.PlaneGeometry(W-.128,H-.128),glass);
    mesh.position.set(x,0,.018);nearScene.add(mesh);
  }
  const ambient=new T.HemisphereLight('#cbd4dc','#72665b',.92);
  const interiorLight=new T.DirectionalLight('#f5e2c3',.82);interiorLight.position.set(.1,2,2.4);
  const rimLight=new T.DirectionalLight('#ffac67',1.2);rimLight.position.set(-2.2,.6,-1.1);
  nearScene.add(ambient,interiorLight,rimLight);
  for(const m of [sideWall,outerRim]){
    m.onBeforeCompile=s=>{
      s.vertexShader='varying vec3 cabinPos;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ncabinPos=position;');
      s.fragmentShader='varying vec3 cabinPos;\n'+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float coverage=1.-smoothstep(.28,1.3,fwidth(cabinPos.y*1350.));diffuseColor.rgb*=.982+.018*cos(cabinPos.y*1350.)*coverage;`);
    };
  }
  const eye=new T.Vector3(), gaze=new T.Vector3(),worldEye=new T.Vector3(), worldGaze=new T.Vector3();
  const p0=new T.Vector3(), localForward=new T.Vector3(), localIn=new T.Vector3(), localUp=new T.Vector3();
  const camOpt={yaw:-40, eyeX:1.115, eyeZ:.855, eyeY:.056, pitch:-1.5, fov:44, start:54, gain:0};
  trains.group.visible=false;
  const rad=Math.PI/180;
  const windowDraw=(frame,jx=0,jy=0)=>{
    const sec=frame/60,u=frame/1619,q=u*u*(3-2*u);
    const epoch=depart+(camOpt.start+1.12*sec)*1000;
    trains.place(epoch,false,false,false,[train]);
    const visibility=trains.drawnIds.size;
    // 차량의 +Y는 전방, +Z는 위, +X는 오른쪽이다. 승객과 왼쪽 창을 같은 차량 좌표에 둔다.
    car.updateWorldMatrix(true,false);p0.set(0,0,0).applyMatrix4(car.matrixWorld);
    localForward.set(0,1,0).transformDirection(car.matrixWorld);
    localUp.set(0,0,1).transformDirection(car.matrixWorld);
    localIn.set(1,0,0).transformDirection(car.matrixWorld);
    const yaw=(camOpt.yaw-4.5*Math.sin(Math.PI*u*.78)+1.0*Math.sin(sec*.14))*rad;
    const pitch=(camOpt.pitch-1.1*q+.10*Math.sin(sec*.81))*rad;
    eye.set(camOpt.eyeX+.044*q+.003*Math.sin(sec*2.53),camOpt.eyeY+.005*Math.sin(sec*2.15),camOpt.eyeZ-.038*q);
    gaze.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
    worldEye.copy(p0).addScaledVector(localIn,-1.55+eye.z).addScaledVector(localForward,eye.x).addScaledVector(localUp,2.24+eye.y);
    worldGaze.copy(worldEye).addScaledVector(localForward,gaze.x).addScaledVector(localUp,gaze.y).addScaledVector(localIn,gaze.z);
    outsideCam.position.copy(worldEye);outsideCam.up.copy(localUp);outsideCam.lookAt(worldGaze);
    cabinCam.position.copy(eye);cabinCam.up.set(0,1,0);cabinCam.lookAt(eye.clone().add(gaze));
    for(const c of [outsideCam,cabinCam]){
      c.fov=camOpt.fov-.8*q;c.setViewOffset(1920,1080,jx,jy,1920,1080);c.updateProjectionMatrix();c.updateMatrixWorld(true);
    }
    atmo.time(81+sec*.71);
    renderer.toneMappingExposure=.97;


    return {visible:visibility,sec,x:worldEye.x,y:worldEye.y,z:worldEye.z};
  };
  const cabinPass=()=>{renderer.autoClear=false;renderer.clearDepth();renderer.render(nearScene,cabinCam);renderer.autoClear=true;};
  shot.post.size(2560,1440,false);
  return {car, windowDraw, cabinPass};
}
