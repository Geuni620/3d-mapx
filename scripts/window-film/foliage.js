import * as T from 'three';
import riverfront from '../../src/features/dangsan/data/riverfront.json?raw';

export function addFoliage(shot) {
  const city=shot.city.group;
  const data=JSON.parse(riverfront);
  for(const o of city.children)if(o.geometry?.type==='IcosahedronGeometry')o.visible=false;
  let seed=667213;
  const rnd=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
  for(const o of city.children){
    const g=o.geometry;
    if(!g || o.isInstancedMesh || g.getAttribute('position')?.count!==data.dem.length*data.dem[0].length)continue;
    // 노을 속에서도 표고 격자의 능선이 드러나게 한다.
    o.material=new T.ShaderMaterial({side:T.DoubleSide,
     vertexShader:'varying float elev;varying vec3 n;void main(){elev=position.y;n=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
     fragmentShader:`varying float elev;varying vec3 n;void main(){float ridge=smoothstep(-10.,340.,elev);vec3 c=mix(vec3(.70,.385,.30),vec3(.54,.31,.295),.28+.58*ridge);c*=.96+.04*max(0.,n.y);gl_FragColor=vec4(c,1.);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
     }`});
  }
  const batches=Array.from({length:10},()=>[]);
  const palettes=[['#585655','#69665b','#77755f','#8b816d'],['#565a58','#686a5f','#7c7761','#918571'],['#555654','#69645c','#82715e','#9b826a'],['#5c5953','#706c5b','#847d64','#9b9175']];
  const textures=batches.map((_,variant)=>{
    const c=document.createElement('canvas');c.width=256;c.height=144;const g=c.getContext('2d');
    const colors=palettes[variant%4];
    function ellipse(x,y,w,h,color){g.fillStyle=color;g.beginPath();g.ellipse(x,y,w,h,0,0,2*Math.PI);g.fill();}
    for(let i=0;i<11;i++){
      const x=13+i*22+(rnd()-.5)*12,ty=34+rnd()*37,rad=13+rnd()*9,foot=139-rnd()*5;
      const trunk=g.createLinearGradient(0,ty,0,foot);trunk.addColorStop(0,'#555451');trunk.addColorStop(1,'#7d7368');
      g.fillStyle=trunk;g.fillRect(x-1.5,ty,3,foot-ty);
      for(let j=0;j<24;j++){const angle=rnd()*Math.PI*2,rr=Math.sqrt(rnd());const xx=x+Math.cos(angle)*rr*rad, yy=ty+Math.sin(angle)*rr*rad*1.16;
        const shade=yy<ty-rad*.3&&rnd()>.42?3:(rnd()>.58?2:rnd()>.4?1:0);
        ellipse(xx,yy,rad*(.24+.27*rnd()),rad*(.28+.28*rnd()),colors[shade]);}
    }
    for(let k=0;k<68;k++){const x=5+rnd()*246,y=111+rnd()*19;ellipse(x,y,4+rnd()*10,3+rnd()*8,colors[Math.floor(rnd()*3)]);}
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;return tex;
  });
  const contains=(r,x,y)=>{let hit=false;for(let i=0,j=r.length-2;i<r.length;j=i,i+=2)if((r[i+1]>y)!==(r[j+1]>y)&&x<(r[j]-r[i])*(y-r[i+1])/(r[j+1]-r[i+1])+r[i])hit=!hit;return hit;};
  const o=new T.Object3D();const geo=new T.PlaneGeometry(1,1);geo.translate(0,.5,0);
  const planeAngle=2.04;
  for(const p of data.parks){const r=p[0],xs=r.filter((_,i)=>i%2===0),ys=r.filter((_,i)=>i%2===1);
    const x0=Math.max(-2900,Math.min(...xs)),x1=Math.min(300,Math.max(...xs)),y0=Math.max(-2400,Math.min(...ys)),y1=Math.min(1100,Math.max(...ys));
    if(x0>=x1||y0>=y1)continue;
    for(let x=x0+7;x<x1;x+=19)for(let n=y0+6;n<y1;n+=14){
      const wx=x+(rnd()-.5)*12,wy=n+(rnd()-.5)*9;
      const meadow=Math.sin(wx*.015+wy*.008)*.58+Math.sin(wy*.021-.002*wx)*.42;
      if((meadow>.64&&rnd()>.10)||!contains(r,wx,wy)||p.slice(1).some(h=>contains(h,wx,wy)))continue;
      const variant=Math.floor(rnd()*batches.length),height=6.0+rnd()*6.1;
      o.position.set(wx,2.54,-wy);o.rotation.y=planeAngle+(rnd()-.5)*.66;o.scale.set(15+rnd()*14,height,1);
      o.updateMatrix();batches[variant].push(o.matrix.clone());
    }
  }
  for(let i=0;i<batches.length;i++){const arr=batches[i];const m=new T.MeshBasicMaterial({map:textures[i],alphaTest:.31,alphaToCoverage:true,side:T.DoubleSide,fog:true,color:'#ddd2c6'});
    const mesh=new T.InstancedMesh(geo,m,arr.length);arr.forEach((mat,j)=>mesh.setMatrixAt(j,mat));mesh.computeBoundingSphere();city.add(mesh);}
  // 수변의 흙과 돌은 지도에 있는 한강 폴리곤의 경계를 따른다.
  const v=[],clr=[];const tint=new T.Color();
  for(const polygon of data.river)for(const r of polygon)for(let i=0;i<r.length;i+=2){
    const j=(i+2)%r.length, x0=r[i],z0=-r[i+1],x1=r[j],z1=-r[j+1];
    if(Math.min(x0,x1)>50||Math.max(x0,x1)<-3200||Math.min(z0,z1)>2600||Math.max(z0,z1)<-2000)continue;
    const d=Math.hypot(x1-x0,z1-z0);if(d<.1)continue;
    const n=Math.ceil(d/11);
    for(let k=0;k<n;k++){
      const a=k/n,b=(k+1)/n,xa=x0+(x1-x0)*a,za=z0+(z1-z0)*a,xb=x0+(x1-x0)*b,zb=z0+(z1-z0)*b;
      for(const s of [-1,1]){const nx=-(z1-z0)/d*s*3.8,nz=(x1-x0)/d*s*3.8;
        v.push(xa,2.51,za,xb,2.51,zb,xa+nx,.06,za+nz,xb,2.51,zb,xb+nx,.06,zb+nz,xa+nx,.06,za+nz);
        tint.set('#958673').multiplyScalar(.89+.13*rnd());for(let m=0;m<6;m++)clr.push(tint.r,tint.g,tint.b);}
    }
  }
  const shore=new T.BufferGeometry();shore.setAttribute('position',new T.Float32BufferAttribute(v,3));shore.setAttribute('color',new T.Float32BufferAttribute(clr,3));shore.computeVertexNormals();
  city.add(new T.Mesh(shore,new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide})));
}
