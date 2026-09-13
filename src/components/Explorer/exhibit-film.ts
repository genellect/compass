import * as THREE from 'three';
import type { Room } from './contracts';
import { televisionLocal } from './exhibit-layout';

/** Reuse the published product-film poster on the physical television.
 * No YouTube, audio or media request is made until this room is occupied. */
export function createExhibitFilm(scene: THREE.Scene, room: Room, _poster: THREE.Texture) {
  const material = new THREE.MeshBasicMaterial({ color: '#0d2029', toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.7,3.20625), material);
  screen.position.set(televisionLocal[0],televisionLocal[1],televisionLocal[2]+.053).applyAxisAngle(THREE.Object3D.DEFAULT_UP,room.yaw).add(new THREE.Vector3().fromArray(room.origin));
  screen.rotation.y=room.yaw;screen.visible=false;scene.add(screen);
  const abort = new AbortController();
  let started=false,disposed=false,texture:THREE.Texture|null=null,bitmap:ImageBitmap|null=null;
  async function load() {
    try {
      const response=await fetch('/images/interactive/product-film-poster.jpg',{signal:abort.signal});
      if(!response.ok)return;
      const image=await createImageBitmap(await response.blob(),{imageOrientation:'flipY'});
      if(disposed){image.close();return;}
      bitmap=image;texture=new THREE.Texture(image);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
      material.map=texture;material.color.set('#ffffff');material.needsUpdate=true;
    } catch { /* A failed exhibit image leaves its chassis and accessible CTA. */ }
  }
  return {
    screen,time:()=>0,
    update(visible:boolean,_moving:boolean){screen.visible=visible;if(visible&&!started){started=true;void load();}},
    dispose(){disposed=true;abort.abort();scene.remove(screen);screen.geometry.dispose();material.dispose();texture?.dispose();bitmap?.close();}
  };
}
