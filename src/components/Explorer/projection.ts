import * as THREE from 'three';

const clip = new THREE.Matrix4(), model = new THREE.Matrix4(), pixels = new THREE.Matrix4();
const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(1,1,1);
const normal = new THREE.Vector3(), eye = new THREE.Vector3();

/** Project an actual HTML plane using CSS pixels, independently of drawing-buffer DPR.
 * The homogeneous divide happens in CSS matrix3d, so text remains a selectable DOM.
 */
export function projectHTML(element: HTMLElement, camera: THREE.PerspectiveCamera, center: THREE.Vector3,
  yaw: number, worldWidth: number, cssWidth: number, cssHeight: number, viewportWidth: number, viewportHeight: number) {
  normal.set(Math.sin(yaw), 0, Math.cos(yaw));
  eye.copy(camera.position).sub(center);
  if (eye.dot(normal) <= .05) { element.style.visibility = 'hidden'; return false; }
  rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
  model.compose(position.copy(center), rotation, scale);
  const units = worldWidth / cssWidth;
  pixels.set(units,0,0,-worldWidth/2, 0,-units,0,cssHeight*units/2, 0,0,1,0, 0,0,0,1);
  clip.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse).multiply(model).multiply(pixels);
  const e=clip.elements, w=viewportWidth/2, h=viewportHeight/2;
  const matrix=[];
  for(let c=0;c<4;c++) {
    const i=c*4;
    matrix.push(w*(e[i]+e[i+3]), h*(-e[i+1]+e[i+3]), 0, e[i+3]);
  }
  // Preserve a non-singular CSS transform. Collapsing the Z column makes
  // browsers discard the entire selectable plane when backface culling is on.
  matrix[8]=0;matrix[9]=0;matrix[10]=1;matrix[11]=0;
  const middle=new THREE.Vector3().copy(center).project(camera);
  if(middle.z < -1 || middle.z > 1 || Math.abs(middle.x)>1.8 || Math.abs(middle.y)>1.8) { element.style.visibility='hidden'; return false; }
  element.style.visibility='visible';
  element.style.transform=`matrix3d(${matrix.join(',')})`;
  return true;
}
