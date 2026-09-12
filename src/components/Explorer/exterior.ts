import * as THREE from 'three';

/** Real ISS photography, displayed at astronomical distance. This cyclorama
 * is an authored backdrop, not a measured panoramic reconstruction. Building
 * geometry supplies close-range parallax, with no synthetic star particles.
 */
export async function addExterior(scene:THREE.Scene,bytes:(url:string)=>Promise<ArrayBuffer>) {
  let texture:THREE.Texture|null=null,bitmap:ImageBitmap|null=null;
  const geometry=new THREE.CylinderGeometry(2200,2200,2304,128,1,true);
  const material=new THREE.MeshBasicMaterial({side:THREE.BackSide,fog:false,toneMapped:false});
  const sky=new THREE.Mesh(geometry,material);sky.position.y=650;sky.rotation.y=.45;scene.add(sky);
  const dispose=()=>{scene.remove(sky);geometry.dispose();material.dispose();texture?.dispose();bitmap?.close();};
  try{
    const data=await bytes('/habitat/explorer/v1/iss-horizon.webp');
    bitmap=await createImageBitmap(new Blob([data]),{imageOrientation:'flipY'});
    texture=new THREE.Texture(bitmap);texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=THREE.RepeatWrapping;texture.repeat.x=4;texture.needsUpdate=true;material.map=texture;material.needsUpdate=true;
  }catch{dispose();throw new Error('Exterior unavailable');}
  return {dispose,texture:texture!};
}
