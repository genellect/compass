import * as THREE from 'three';
import type { MessageChapter } from '../../app/(official)/messages/messageParser';
import type { Room } from './contracts';
import { activityItems, founderStory, libraryItems } from './experience-content';
import { exhibits } from './exhibit-content';
import { exhibitAnchor } from './exhibit-layout';

/** Small, tangible exhibits; the existing building and television remain untouched. */
export function createExhibitObjects(room: Room, chapters: MessageChapter[], onAssetReady:()=>void=()=>{}) {
  const group = new THREE.Group(); group.position.fromArray(room.origin); group.rotation.y = room.yaw;
  const picks: THREE.Object3D[] = [], books: { group: THREE.Group; lid: THREE.Group; rest: THREE.Vector3; id: string }[] = [];
  const textures: THREE.Texture[] = [], bitmaps: ImageBitmap[] = [], abort = new AbortController();
  let disposed = false;
  const paper = new THREE.MeshStandardMaterial({ color: '#e9e3d4', roughness: .9 });
  const edge = new THREE.MeshStandardMaterial({ color: '#17353c', roughness: .65 });
  const wood = new THREE.MeshStandardMaterial({ color: '#6d5541', roughness: .56 });
  const metal = new THREE.MeshStandardMaterial({ color: '#a8b6b5', metalness: .8, roughness: .3 });
  const box = (parent: THREE.Object3D, size: number[], at: number[], material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size as [number, number, number]), material);
    mesh.position.fromArray(at); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const [anchorX,anchorZ]=exhibitAnchor(room.id);
  const desk = new THREE.Group(); desk.position.set(anchorX, 0, anchorZ); group.add(desk);
  box(desk, [4.6, .13, 1.55], [0, .86, -.15], wood);
  for (const x of [-1.85, 1.85]) box(desk, [.07, .78, 1.1], [x, .4, -.15], metal);
  const titles = room.id === 'resources' ? libraryItems.map(item => item.title) : room.id === 'manifesto' ? chapters.map(item => item.title)
    : room.id === 'founder' ? founderStory.map(item => item.label) : room.id === 'experience' ? activityItems.map(item => item.label) : [exhibits[room.id].label];
  titles.forEach((title, index) => {
    const item = new THREE.Group(), lid = new THREE.Group(); const id = `${room.id}:${index}`;
    item.position.set((index - (titles.length - 1) / 2) * 1.08, 1.48, .18); item.rotation.x = -.22;
    desk.add(item); const rest = item.position.clone();
    box(item, [.73, 1.02, .1], [0, 0, 0], paper);
    lid.position.set(-.39, 0, .07); item.add(lid);
    const cover = box(lid, [.8, 1.09, .035], [.4, 0, 0], edge);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 700;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#15363e'; ctx.fillRect(0, 0, 512, 700);
    ctx.fillStyle = '#eff0db'; ctx.font = '22px sans-serif'; ctx.fillText(exhibits[room.id].label.toUpperCase(), 40, 65);
    ctx.font = '500 34px sans-serif'; let row = '', y = 270;
    for (const char of title) { if (ctx.measureText(row + char).width > 420) { ctx.fillText(row, 40, y); y += 54; row = ''; } row += char; }
    ctx.fillText(row, 40, y); ctx.font = '20px sans-serif'; ctx.fillText('COMPASS', 40, 638);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.push(texture);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(.78, 1.07), new THREE.MeshStandardMaterial({ map: texture, roughness: .75 }));
    front.position.set(.4, 0, .02); lid.add(front);
    item.traverse(object => { object.userData.exhibitItem = id; }); picks.push(cover, front); books.push({ group: item, lid, rest, id });
    const image = room.id === 'resources' ? libraryItems[index].image : room.id === 'founder' && index === 0 ? '/images/founder/yuto-matsui-parent-20260908-480.webp' : room.id === 'technology' ? '/images/interactive/product-film-poster.jpg' : null;
    if (image) void (async () => {
      try {
        const response = await fetch(image, { signal: abort.signal }); if (!response.ok) return;
        const bitmap = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY' });
        if (disposed) { bitmap.close(); return; } bitmaps.push(bitmap);
        const map = new THREE.Texture(bitmap); map.flipY = false; map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; textures.push(map);
        const fit=Math.min(.78/bitmap.width,1.07/bitmap.height);front.geometry.dispose();front.geometry=new THREE.PlaneGeometry(bitmap.width*fit,bitmap.height*fit);
        front.material.map = map; front.material.needsUpdate = true;
        onAssetReady();
      } catch { /* Printed title and HTML remain available. */ }
    })();
  });
  return { group, picks,
    update(selected: string | null, dt: number) {
      for (const book of books) {
        const active = selected === book.id;
        book.group.position.y = THREE.MathUtils.damp(book.group.position.y, book.rest.y + (active ? .32 : 0), 9, dt);
        book.group.rotation.x = THREE.MathUtils.damp(book.group.rotation.x, active ? 0 : -.22, 9, dt);
        book.lid.rotation.y = THREE.MathUtils.damp(book.lid.rotation.y, active ? -.7 : 0, 9, dt);
      }
    },
    dispose() {
      disposed = true; abort.abort(); group.removeFromParent();
      const materials = new Set<THREE.Material>();
      group.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const m of Array.isArray(object.material) ? object.material : [object.material]) materials.add(m); } });
      materials.forEach(material => material.dispose()); textures.forEach(texture => texture.dispose()); bitmaps.forEach(bitmap => bitmap.close());
    },
  };
}
