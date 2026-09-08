import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { manifest, sections, smooth, type TourPosition, type Quality, type SceneState } from './scene-config';

export interface SceneController {
  start(): Promise<void>;
  update(position: TourPosition, jump?: boolean): void;
  setPaused(paused: boolean): void;
  setQuality(quality: Quality): void;
  dispose(): void;
}
type Zone = { object: THREE.Group; animated: THREE.Object3D[]; base: number[]; rotationBase: number[] };
function disposeObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  object.traverse(node => { if (node instanceof THREE.Mesh) { geometries.add(node.geometry); for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material); } });
  geometries.forEach(geometry => geometry.dispose());
  const textures = new Set<THREE.Texture>();
  materials.forEach(material => { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); });
  textures.forEach(texture => { texture.dispose(); if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close(); });
}

export function createScene(host: HTMLElement, onState: (state: SceneState) => void): SceneController {
  let disposed = false, paused = false, quality: Quality = 'standard', fatal = false;
  let started = false, frame = 0, last = 0, clock = 0, loadedAt = 0, sampleAt = 0, samples = 0, slowWindows = 0;
  let position: TourPosition = { index: 0, next: 1, blend: 0, local: 0 };
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'default' });
  renderer.setClearColor(0x071724); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;
  renderer.domElement.setAttribute('aria-hidden', 'true'); host.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0x101d28, .0025);
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 1400); camera.filmOffset = -4.32;
  let environment: THREE.WebGLRenderTarget | null = null;
  scene.environmentIntensity = .65;
  scene.add(new THREE.HemisphereLight(0xd7e8ff, 0x333632, .85));
  const sun = new THREE.DirectionalLight(0xd4e5ff, 3.1);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: .1, far: 55 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00012;
  scene.add(sun, sun.target);
  const warm = new THREE.DirectionalLight(0xffdfb6, .65); warm.position.set(-7, 4, 2); scene.add(warm);
  const renderTarget = new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType}); renderTarget.samples = Math.min(4, renderer.capabilities.maxSamples);
  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera), bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .18, .35, 1.4), output = new OutputPass();
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output);
  const loader = new GLTFLoader();
  const zones = new Map<number, Zone>(), structures = new Map<number, THREE.Group>();
  const requests = new Map<number, Promise<void>>(), aborters = new Set<AbortController>();
  let architecture: THREE.Group | null = null;
  let campus: THREE.Group | null = null;
  const pointer = new THREE.Vector2(), targetPointer = new THREE.Vector2();
  const cameraPoint = new THREE.Vector3(), look = new THREE.Vector3(), nextPoint = new THREE.Vector3();
  const frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  // A single shared distant starfield; deliberately deterministic.
  let seed = 21; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const vertices = new Float32Array(900 * 3);
  for (let i = 0; i < 900; i++) { vertices[i * 3] = random() * 1400 - 600; vertices[i * 3 + 1] = random() * 450; vertices[i * 3 + 2] = -950 - random() * 150; }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xbbdce5, size: .4, sizeAttenuation: true, fog: false });
  const stars = new THREE.Points(starGeometry, starMaterial); scene.add(stars);
  const planetGeometry = new THREE.SphereGeometry(390, 96, 64), planetMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, fog: false });
  const planetTexture = new THREE.TextureLoader().load(manifest.zones[0].poster.replace('top.webp','planet.webp'), texture => {
    if (disposed) texture.dispose();
    else { texture.colorSpace = THREE.SRGBColorSpace; planetMaterial.map = texture; planetMaterial.needsUpdate = true; }
  });
  const planet = new THREE.Mesh(planetGeometry, planetMaterial); scene.add(planet);
  planet.position.set(88,-310,-550);

  const resize = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    const ratio = Math.min(devicePixelRatio || 1, 2, Math.sqrt((quality === 'standard' ? 6e6 : 1.5e6) / (w * h)));
    renderer.setPixelRatio(ratio); renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio); composer.setSize(w, h);
    // Bloom is intentionally half resolution.
    bloom.setSize(Math.max(1, w * ratio / 2), Math.max(1, h * ratio / 2));
    camera.aspect = w / h;
    // Match the Blender 26mm / 36mm sensor poster, including background-size: cover.
    // A narrower viewport crops the image horizontally; a wider one crops vertically.
    camera.filmGauge = camera.aspect >= 1 ? Math.min(36, 20.25 * camera.aspect) : 20.25;
    camera.setFocalLength(26); schedule();
  };
  const fetchBytes = async (url: string) => {
    const abort = new AbortController(); aborters.add(abort);
    const timeout = setTimeout(() => abort.abort(), 20000);
    try {
      const response = await fetch(url, { signal: abort.signal }); if (!response.ok) throw new Error('Habitat asset unavailable');
      return await response.arrayBuffer();
    } finally { clearTimeout(timeout); aborters.delete(abort); }
  };
  const load = async (url: string) => {
      const data = await fetchBytes(url);
      if (disposed) throw new Error('Disposed');
      const gltf = await loader.parseAsync(data, '');
      if (disposed) { disposeObject(gltf.scene); throw new Error('Disposed'); }
      gltf.scene.traverse(node => {
        if (node instanceof THREE.Mesh) {
          node.castShadow = true; node.receiveShadow = true;
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (material.transparent) { node.castShadow = false; material.depthWrite = false; }
            if (material.map) material.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          }
        }
      });
      return gltf.scene;
  };
  const wanted = () => new Set([position.index - 1, position.index, position.next, position.next + (position.blend > 0 ? 0 : -1)].filter(i => i >= 0 && i < sections.length));
  const trim = () => {
    const keep = wanted();
    for (const [index, zone] of zones) if (!keep.has(index)) { scene.remove(zone.object); disposeObject(zone.object); zones.delete(index); }
    for (const [index, structure] of structures) if (!keep.has(index)) { scene.remove(structure); structures.delete(index); }
  };
  const ensureZone = (index: number): Promise<void> => {
    if (index < 0 || index >= sections.length || zones.has(index) || disposed) return Promise.resolve();
    if (requests.has(index)) return requests.get(index)!;
    const request = load(manifest.zones[index].model).then(object => {
      if (disposed || !wanted().has(index)) { disposeObject(object); return; }
      const animated: THREE.Object3D[] = [];
      object.traverse(node => { if (node.name.startsWith('Spin_') || node.name.startsWith('Float_')) animated.push(node); });
      object.position.x = index * 22;
      zones.set(index, { object, animated, base: animated.map(node => node.position.y), rotationBase: animated.map(node=>node.rotation.y) }); scene.add(object);
      if (architecture) { const copy = architecture.clone(true); copy.position.x = index * 22; scene.add(copy); structures.set(index, copy); }
      loadedAt = performance.now(); trim(); schedule();
    }).catch(() => {
      if (!disposed && (index === position.index || (position.blend > 0 && index === position.next))) fail();
    }).finally(() => requests.delete(index));
    requests.set(index, request); return request;
  };
  const fail = (state: SceneState = 'failed') => { if (disposed) return; fatal = true; cancelAnimationFrame(frame); frame = 0; onState(state); };
  function schedule() { if (started && !disposed && !fatal && !document.hidden && !frame) frame = requestAnimationFrame(draw); }
  const paint = () => {
    if (disposed || fatal) return;
    const a = sections[position.index], b = sections[position.next];
    const offset=THREE.MathUtils.lerp(a.filmOffset,b.filmOffset,paused?0:position.blend);
    if(camera.filmOffset!==offset){camera.filmOffset=offset;camera.updateProjectionMatrix();}
    cameraPoint.fromArray(a.reading);
    if (!paused) {
      const phase = smooth(position.local / .2);
      cameraPoint.fromArray(a.arrival).lerp(new THREE.Vector3().fromArray(a.reading), phase);
      if (position.local > .65) cameraPoint.lerp(new THREE.Vector3().fromArray(a.exit), smooth((position.local - .65) / .35));
      cameraPoint.lerp(nextPoint.fromArray(b.arrival), position.blend);
      // Move through the shared foreground aisle, with a shallow arc into the next room.
      // Both endpoints are zero, so anchors and reading poses remain continuous.
      const travel = Math.sin(Math.PI * position.blend);
      cameraPoint.z += travel * 1.8;
      cameraPoint.y += travel * .06;
    }
    look.fromArray(a.target).lerp(nextPoint.fromArray(b.target), paused ? 0 : position.blend);
    if (!paused) look.x += Math.sin(Math.PI * position.blend) * 7;
    camera.position.copy(cameraPoint);
    pointer.lerp(targetPointer, .06);
    if (!paused) { look.x += pointer.x * .18; look.y += pointer.y * .12; }
    camera.lookAt(look);
    sun.position.set(look.x - 8, 5.5, -12); sun.target.position.set(look.x, 0, 1);
    for (const zone of zones.values()) zone.animated.forEach((node, i) => {
      if (node.name.startsWith('Spin_')) node.rotation.y = zone.rotationBase[i] + clock * .10 * (i % 2 ? 1 : -1);
      else node.position.y = zone.base[i] + Math.sin(clock * .65 + i) * .065;
    });
    const ready = zones.has(position.index) && (position.blend === 0 || zones.has(position.next));
    if (!ready) { onState('loading'); return; }
    renderer.info.reset(); composer.render();
    host.dataset.drawCalls = String(renderer.info.render.calls);
    // Count visible model geometry separately from shadow/post-processing submissions.
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let visibleTriangles=0;
    scene.traverseVisible(node=>{if(node instanceof THREE.Mesh&&(!node.frustumCulled||frustum.intersectsObject(node)))visibleTriangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3;});
    host.dataset.triangles = String(visibleTriangles);
    host.dataset.submittedTriangles = String(renderer.info.render.triangles);
    host.dataset.quality = quality;
    onState(paused ? 'paused' : 'ready');
  };
  function draw(time: number) {
    frame = 0;
    if (disposed || fatal || document.hidden) return;
    if (time - last >= 1000 / 60 - .8) {
      const interval = time - last;
      const elapsed = Math.min(interval / 1000, .1); last = time;
      if (!paused) clock += elapsed;
      paint();
      // Measure delivered frames, including GPU stalls. JavaScript submission time
      // cannot distinguish an occluded window from an expensive asynchronous GPU frame.
      if (!paused && time - loadedAt > 4000) {
        samples++;
        if (!sampleAt) sampleAt = time;
        if (time - sampleAt > 3000) {
          const fps = samples * 1000 / (time - sampleAt); host.dataset.fps = fps.toFixed(1);
          slowWindows = fps < 28 ? slowWindows + 1 : 0;
          samples = 0; sampleAt = time;
          if (slowWindows >= 2) {
            slowWindows = 0;
            // Quality-first: keep the authored presentation or show its offline render.
            // Do not silently trade away the approved visual quality to maintain animation.
            host.dataset.fallbackReason = 'sustained-frame-budget'; fail('static'); return;
          }
        }
      }
    }
    if (!paused) schedule();
  }
  function setQuality(value: Quality) {
    quality = value; bloom.enabled = value === 'standard'; stars.visible = value === 'standard';
    composer.renderTarget1.samples = value === 'standard' ? Math.min(4,renderer.capabilities.maxSamples) : 0; composer.renderTarget2.samples = composer.renderTarget1.samples;
    sun.shadow.mapSize.set(value === 'standard' ? 4096 : 1024, value === 'standard' ? 4096 : 1024);
    sun.shadow.map?.dispose(); sun.shadow.map = null; resize();
    sampleAt = 0; samples = 0; loadedAt = performance.now();
  }
  const onPointer = (event: PointerEvent) => { targetPointer.set((event.clientX / innerWidth - .5) * 2, (.5 - event.clientY / innerHeight) * 2); };
  const onLeave = () => targetPointer.set(0, 0);
  const onVisibility = () => { cancelAnimationFrame(frame); frame = 0; last = performance.now(); sampleAt = 0; samples = 0; if (!document.hidden) schedule(); };
  const onLost = (event: Event) => { event.preventDefault(); fail(); };
  const observer = new ResizeObserver(resize); observer.observe(host);
  window.addEventListener('pointermove', onPointer, { passive: true }); window.addEventListener('blur', onLeave);
  document.addEventListener('visibilitychange', onVisibility); renderer.domElement.addEventListener('webglcontextlost', onLost);
  resize();
  return {
    async start() {
      try {
        const lighting = new HDRLoader().parse(await fetchBytes(manifest.lighting));
        if(disposed)return;
        const texture = new THREE.DataTexture();
        Object.assign(texture,{image:{data:lighting.data,width:lighting.width,height:lighting.height},type:lighting.type,colorSpace:lighting.colorSpace,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,flipY:true,generateMipmaps:false});
        texture.mapping=THREE.EquirectangularReflectionMapping;texture.needsUpdate=true;
        const generator=new THREE.PMREMGenerator(renderer);
        try {environment=generator.fromEquirectangular(texture);scene.environment=environment.texture;}
        finally {generator.dispose();texture.dispose();}
        architecture = await load(manifest.architecture);
        campus = await load(manifest.environment);
        if (disposed) return;
        campus.traverse(node=>{if(node instanceof THREE.Mesh)node.castShadow=false;});
        scene.add(campus);
        // Start accepting destination changes while the first zone is still downloading.
        started = true;
        await ensureZone(position.index); if (disposed || fatal) return;
        last = performance.now(); schedule();
        void ensureZone(position.index);
        void ensureZone(position.next);
      } catch { if (!disposed) fail(); }
    },
    update(value) {
      position = value;
      if (started) { trim(); void ensureZone(value.index); void ensureZone(value.next); schedule(); }
    },
    setPaused(value) { paused = value; targetPointer.set(0, 0); sampleAt = 0; samples = 0; last = 0; schedule(); },
    setQuality,
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(frame);
      aborters.forEach(abort => abort.abort()); observer.disconnect();
      window.removeEventListener('pointermove', onPointer); window.removeEventListener('blur', onLeave);
      document.removeEventListener('visibilitychange', onVisibility); renderer.domElement.removeEventListener('webglcontextlost', onLost);
      zones.forEach(zone => disposeObject(zone.object)); zones.clear(); structures.clear();
      if (architecture) disposeObject(architecture);
      if (campus) disposeObject(campus);
      starGeometry.dispose(); starMaterial.dispose(); planetGeometry.dispose(); planetMaterial.dispose(); planetTexture.dispose(); environment?.dispose();
      sun.shadow.dispose(); bloom.dispose(); output.dispose(); composer.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
