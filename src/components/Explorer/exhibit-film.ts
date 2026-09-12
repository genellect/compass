import * as THREE from 'three';
import type {Room} from './contracts';

/** The movie is an actual ISS photographic timelapse, on one physical TV.
 * Its source is not requested until the laboratory is entered. A stopped or
 * rejected movie retains the still/last frame; it never jumps back to frame 0.
 */
export function createExhibitFilm(scene:THREE.Scene,room:Room,poster:THREE.Texture){
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='none';
  const preview=poster.clone();preview.repeat.set(1,1);preview.needsUpdate=true;
  const material=new THREE.MeshBasicMaterial({map:preview,toneMapped:false});
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(5.7,3.20625),material);
  screen.position.set(room.origin[0]-7.947*Math.sin(room.yaw),2.6,room.origin[2]-7.947*Math.cos(room.yaw));
  screen.rotation.y=room.yaw;screen.userData.explorer_read='technology';scene.add(screen);
  let texture:THREE.VideoTexture|null=null,wanted=false,started=false,failed=false,disposed=false,ended=false,timeout=0,lastTime=0;
  const fail=()=>{failed=true;video.pause();clearTimeout(timeout);};
  const arm=()=>{clearTimeout(timeout);timeout=window.setTimeout(()=>{if(wanted&&!ended)fail();},3000);};
  const ready=()=>{if(disposed||failed)return;texture=new THREE.VideoTexture(video);texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;material.needsUpdate=true;arm();};
  const progress=()=>{if(video.currentTime!==lastTime){lastTime=video.currentTime;if(wanted)arm();}};
  const end=()=>{ended=true;clearTimeout(timeout);};
  video.addEventListener('playing',ready,{once:true});video.addEventListener('timeupdate',progress);video.addEventListener('error',fail);video.addEventListener('ended',end);
  return {
    screen,
    time:()=>video.currentTime,
    update(visible:boolean,moving:boolean){
      screen.visible=visible;
      const next=visible&&moving&&!document.hidden&&!failed&&!ended;
      if(next===wanted)return;wanted=next;
      if(!next){video.pause();clearTimeout(timeout);return;}
      if(!started){video.src='/habitat/explorer/v1/iss-film.mp4';started=true;}
      arm();void video.play().catch(fail);
    },
    dispose(){disposed=true;wanted=false;clearTimeout(timeout);video.pause();video.removeAttribute('src');video.load();
      video.removeEventListener('playing',ready);video.removeEventListener('timeupdate',progress);video.removeEventListener('error',fail);video.removeEventListener('ended',end);
      scene.remove(screen);screen.geometry.dispose();material.dispose();preview.dispose();texture?.dispose();}
  };
}
