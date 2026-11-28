import * as T from 'three';
import { createAtmosphere } from '../../src/features/dangsan/atmosphere.ts';
import { nearestBridgePoint, pointOnBridge } from '../../src/features/dangsan/bridge-alignment.ts';
import { railHeightAt } from '../../src/features/dangsan/bridge-location.ts';
import { createBridge } from '../../src/features/dangsan/bridge.ts';
import { createCinemaPost } from '../../src/features/dangsan/cinema-post.ts';
import { createCinematicTrains } from '../../src/features/dangsan/cinematic-trains.ts';
import { fitBridgeToTracks } from '../../src/features/dangsan/fit-bridge.ts';
import { createRiverfront } from '../../src/features/dangsan/riverfront.ts';
import { illumination } from '../../src/features/dangsan/solar-palette.ts';
import { getScheduledFleet } from '../../src/features/subway/line-2-timetable.ts';
import { configureExterior } from './exterior.js';
import { addFoliage } from './foliage.js';
import { createCabin } from './cabin.js';
import { createSampler } from './sampler.js';

export async function prepareFilm() {
 const depart=Date.parse('2026-11-21T17:04:30+09:00');
 const train=getScheduledFleet(depart).find(t=>t.number==='2280'&&t.direction==='inner-loop');
 if(!train||train.getStopEvent(depart-300)?.station!=='당산')throw Error('Could not verify Dangsan departure');
 const canvas=document.querySelector('canvas');
 const renderer=new T.WebGLRenderer({canvas,alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
 renderer.setSize(1920,1080,false);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.26;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(39,16/9,.38,58000);
 const bridge=createBridge();fitBridgeToTracks(bridge.group);const city=createRiverfront(true);const atmo=createAtmosphere(renderer,scene);let loaded=0;
 const trains=createCinematicTrains(renderer.capabilities.getMaxAnisotropy(),()=>loaded++,true);scene.add(city.group,bridge.group,trains.group);atmo.trackLights(trains.lightTracks);
 const theme=illumination(depart);atmo.apply(theme,'recorded-sunset');bridge.apply(theme);city.apply(theme);trains.apply(theme);
 const hemi=new T.HemisphereLight('#e0d5d0','#8a8187',.82),ambient=new T.AmbientLight('#d7cacc',.27),sun=new T.DirectionalLight('#ffbf82',2.05),fill=new T.DirectionalLight('#babfda',.50);
 sun.position.fromArray(theme.direction).multiplyScalar(500);fill.position.set(85,105,-40);scene.add(hemi,ambient,sun,fill);
 scene.background=new T.Color(theme.horizon);scene.environmentIntensity=.70;
 scene.fog.color.set('#d2a19a');scene.fog.density=.00026;
 atmo.water.material.uniforms.distortionScale.value=1.25;
 const post=createCinemaPost(renderer);post.size(1920,1080,false);
 // 차창 패스를 구성하기 전, 승인 촬영과 같은 외부 장면으로 첫 렌더를 준비한다.
 const rad=Math.PI/180;
 const mix=(a,b,k)=>a+(b-a)*k, smoother=x=>x*x*x*(10+x*(-15+6*x));
 const duration=27,fps=60;
 const opt={side:1,startAngle:62,endAngle:49,startDist:66,endDist:180,startH:11,endH:42,startAim:32,endAim:4,exp:1.02};
 function draw(frame){
  const u=frame/(duration*fps-1),q=smoother(u),sec=frame/fps;
  const epoch=depart+(33.0+1.12*sec)*1000;
  trains.place(epoch,false,false,false,[train]);atmo.time(sec*.71+80);
  const lead=train.getLeadPose(epoch).lead;
  const leadS=nearestBridgePoint(...lead.coordinate).along;
  const travelled=Math.max(0,leadS-326.7473846832439);const aimS=leadS-(10+55*(1-Math.exp(-travelled/120))+25*q);const anchor=pointOnBridge(aimS);
  const trackHeight=railHeightAt(aimS);
  const a=mix(opt.startAngle,opt.endAngle,q)*rad,range=mix(opt.startDist,opt.endDist,q);
  // 초기 카메라의 축은 선로 꼭짓점에서 꺾이지 않도록 고정한다.
  const bearing=36.2*rad, x=Math.sin(bearing),z=-Math.cos(bearing),rx=Math.cos(bearing),rz=Math.sin(bearing);
  const along=Math.cos(a)*range,across=opt.side*Math.sin(a)*range;
  camera.position.set(anchor.east+x*along+rx*across,trackHeight+mix(opt.startH,opt.endH,q),anchor.south+z*along+rz*across);
  const look=pointOnBridge(aimS+mix(opt.startAim,29,q)+3*Math.sin(Math.PI*q)+24*Math.sin(Math.PI*u)**2);
  camera.lookAt(look.east,trackHeight+mix(1.5,opt.endAim,q),look.south);
  camera.fov=mix(39.5,41.5,q);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  renderer.toneMappingExposure=opt.exp;
  post.render(scene,camera,.18,[atmo.sky,atmo.water,city.group],trains.setMask);
  return {frame,epoch,leadS,visible:trains.drawnIds.size};
 }
 for(let i=0;i<100&&loaded<4;i++)await new Promise(r=>setTimeout(r,55));
 if(loaded<4)throw Error('Train texture load incomplete '+loaded);
 draw(0);
 const shot = { canvas, renderer, camera, scene, bridge, city, atmo, trains, post, theme };
 configureExterior(shot);
 addFoliage(shot);
 const cabin = createCabin(shot, train, depart);
 return { shot, drawFilm: createSampler(shot, cabin), train: train.number, car: cabin.car.name };
}
