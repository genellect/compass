import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { manifest, sections, smooth, type TourPosition, type Quality, type SceneState } from './scene-config';

export interface SceneController {
  start(): Promise<void>;
  update(position: TourPosition, jump?: boolean): void;
  setPaused(paused: boolean): void;
  setQuality(quality: Quality): void;
  dispose(): void;
}
type Zone = { object: THREE.Group; animated: THREE.Object3D[]; base: number[]; rotationBase: number[] };
let areaLightTablesReady = false;
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
  let started = false, warming = true, frame = 0, last = 0, clock = 0, loadedAt = 0, sampleAt = 0, samples = 0, slowWindows = 0;
  let position: TourPosition = { index: 0, next: 1, blend: 0, local: 0 };
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'default' });
  renderer.setClearColor(0x071724); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.info.autoReset = false;
  renderer.domElement.setAttribute('aria-hidden', 'true'); host.append(renderer.domElement);
  const scene = new THREE.Scene();
  // Use the master's linear world radiance, independent of the reflection panorama.
  scene.background = new THREE.Color().setRGB(.025 * .32, .046 * .32, .075 * .32);
  scene.fog = new THREE.FogExp2(0x13232e, .00035);
  const camera = new THREE.PerspectiveCamera(43, 1, .1, 5000); camera.filmOffset = -1.8;
  let environment: THREE.WebGLRenderTarget | null = null;
  scene.environmentIntensity = 1;
  scene.add(new THREE.HemisphereLight(0xd7e8ff, 0x727a77, .35));
  if (!areaLightTablesReady) { RectAreaLightUniformsLib.init(); areaLightTablesReady = true; }
  const roomLights = [
    {light:new THREE.RectAreaLight(0xbadaff,.9,12,12),offset:new THREE.Vector3(0,6,-8)},
    {light:new THREE.RectAreaLight(0xffdeb0,.3,7,7),offset:new THREE.Vector3(-4,6,1)},
    {light:new THREE.RectAreaLight(0xbfdcff,.16,6,6),offset:new THREE.Vector3(4,5,8)},
  ];
  roomLights.forEach(({light})=>scene.add(light));
  const sun = new THREE.DirectionalLight(0xf2f7ff, 2.4);
  sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: .1, far: 55 });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00012;
  scene.add(sun, sun.target);
  const warm = new THREE.DirectionalLight(0xffdfb6, .65); warm.position.set(-7, 4, 2); scene.add(warm);
  const renderTarget = new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType}); renderTarget.samples = Math.min(4, renderer.capabilities.maxSamples);
  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera), bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .1, .35, 2), output = new OutputPass();
  composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const zones = new Map<number, Zone>(), structures = new Map<number, THREE.Group>();
  const structureMaterials = new Map<number,THREE.Material[]>(), structureLightmaps = new Map<number,THREE.Texture>();
  const requests = new Map<number, Promise<void>>(), aborters = new Set<AbortController>();
  let architecture: THREE.Group | null = null;
  let campus: THREE.Group | null = null;
  const pointer = new THREE.Vector2(), targetPointer = new THREE.Vector2();
  const cameraPoint = new THREE.Vector3(), look = new THREE.Vector3(), nextPoint = new THREE.Vector3();
  const pausedPoint = new THREE.Vector3(), pausedLook = new THREE.Vector3();
  const resolvedLook = new THREE.Vector3();
  let snapCamera = true, cameraLerp = 1;
  let displayedProgress = 0;
  let holdPausedPose = false, pausedFilmOffset = 0;
  const readingLook = new THREE.Vector3();
  const routes = sections.map((section, index) => {
    const next = sections[Math.min(index + 1, sections.length - 1)];
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3().fromArray(section.reading),new THREE.Vector3(section.exit[0],1.72,9),
      new THREE.Vector3().fromArray(section.exit),
      new THREE.Vector3(section.exit[0],1.72,16),new THREE.Vector3(next.arrival[0],1.72,16),
      new THREE.Vector3().fromArray(next.arrival),new THREE.Vector3(next.arrival[0],1.72,9),
      new THREE.Vector3().fromArray(next.reading),
    ], false, 'centripetal');
  });
  let shadowRoom = -1;
  const frustum=new THREE.Frustum(),projection=new THREE.Matrix4();
  // A single shared distant starfield; deliberately deterministic.
  let seed = 21; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const vertices = new Float32Array(180 * 3);
  for (let i = 0; i < 180; i++) { vertices[i * 3] = random() * 3500 - 1600; vertices[i * 3 + 1] = random() * 1400 + 200; vertices[i * 3 + 2] = -3800 - random() * 150; }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  const starMaterial = new THREE.PointsMaterial({ color: 0xbbdce5, size: .2, sizeAttenuation: true, fog: false });
  const stars = new THREE.Points(starGeometry, starMaterial); scene.add(stars);
  const planetGeometry = new THREE.SphereGeometry(380, 96, 64), planetMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, emissive: new THREE.Color().setRGB(.025,.20,.30), emissiveIntensity: .2, fog: false });
  const planetTexture = new THREE.TextureLoader().load(manifest.zones[0].poster.replace('top.webp','planet.webp'), texture => {
    if (disposed) texture.dispose();
    else { texture.colorSpace = THREE.SRGBColorSpace; planetMaterial.map = texture; planetMaterial.needsUpdate = true; }
  }, undefined, () => { if (!disposed) fail(); });
  const planet = new THREE.Mesh(planetGeometry, planetMaterial); scene.add(planet);
  planet.position.set(-250,260,-2200); planet.rotation.y=.8;

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
      const bounded = new Set<THREE.BufferGeometry>();
      gltf.scene.traverse(node => {
        if (node instanceof THREE.Mesh) {
          const geometry=node.geometry;
          if(geometry.index&&!bounded.has(geometry)){
            // glTF primitives can share a room-wide position buffer while each
            // material uses only a subset of its indices. Bounds based on the
            // entire buffer submit off-screen furniture and facade details.
            const box=new THREE.Box3(),point=new THREE.Vector3(),positions=geometry.getAttribute('position');
            for(let i=0;i<geometry.index.count;i++)box.expandByPoint(point.fromBufferAttribute(positions,geometry.index.getX(i)));
            geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new THREE.Sphere());bounded.add(geometry);
          }
          node.castShadow = true; node.receiveShadow = true;
          if(node.name.startsWith('Spin_')||node.name.startsWith('Float_'))node.castShadow=false;
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if(material.userData.habitat_cutout){material.transparent=false;material.alphaTest=.45;material.depthWrite=true;}
            else if (material.transparent) { node.castShadow = false; material.depthWrite = false; }
            if (material.map) material.map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
            // Cycles includes indirect bounce light; retain contact shading without
            // multiplying the coarse real-time ambient approximation into black.
            if (material.aoMap) material.aoMapIntensity = .5;
            if (material.userData.habitat_baked_indirect && material.emissiveMap) {
              material.lightMap = material.emissiveMap;
              material.lightMapIntensity = Math.PI;
              material.emissiveMap = null;
              material.emissive.fromArray(material.userData.habitat_emissive);
              material.emissiveIntensity = 1;
              if(material.userData.habitat_baked_full){
                material.aoMapIntensity=0;
                // Cycles has already integrated static direct light, bounce light
                // and contact shadows. Retain view-dependent PBR reflections without
                // lighting the diffuse surface a second time in the browser.
                material.onBeforeCompile=(shader:THREE.WebGLProgramParametersWithUniforms)=>{
                  const maps=THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );','');
                  shader.fragmentShader=shader.fragmentShader
                    .replace('#include <lights_fragment_maps>','irradiance = vec3(0.0);\n'+maps)
                    .replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nreflectedLight.directDiffuse = vec3(0.0);');
                };
                material.customProgramCacheKey=()=> 'compass-baked-diffuse-v3';
              }
            }
          }
        }
      });
      return gltf.scene;
  };
  const wanted = () => new Set([position.index - 1, position.index, position.next, position.next + (position.blend > 0 ? 0 : -1)].filter(i => i >= 0 && i < sections.length));
  const releaseLightmap=(texture:THREE.Texture)=>{texture.dispose();if(texture.image instanceof ImageBitmap)texture.image.close();};
  const releaseStructure=(index:number)=>{
    const object=structures.get(index);if(object)scene.remove(object);structures.delete(index);
    structureMaterials.get(index)?.forEach(material=>material.dispose());structureMaterials.delete(index);
    const lightmap=structureLightmaps.get(index);if(lightmap)releaseLightmap(lightmap);structureLightmaps.delete(index);
  };
  const trim = () => {
    const keep = wanted();
    for (const [index, zone] of zones) if (!keep.has(index)) { scene.remove(zone.object); disposeObject(zone.object); zones.delete(index); }
    for (const index of structures.keys()) if (!keep.has(index)) releaseStructure(index);
  };
  const ensureZone = (index: number): Promise<void> => {
    if (index < 0 || index >= sections.length || zones.has(index) || disposed) return Promise.resolve();
    if (requests.has(index)) return requests.get(index)!;
    const request = load(manifest.zones[index].model).then(async object => {
      let lightmap:THREE.Texture|undefined;
      try{
        const url=manifest.zones[index].architectureLightmap;
        if(url){
          const bytes=await fetchBytes(url);
          const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/webp'}),{colorSpaceConversion:'none'});
          lightmap=new THREE.Texture(bitmap);lightmap.flipY=false;lightmap.channel=1;
          lightmap.colorSpace=THREE.SRGBColorSpace;lightmap.needsUpdate=true;
        }
      }catch(error){disposeObject(object);if(lightmap)releaseLightmap(lightmap);throw error;}
      if (disposed || !wanted().has(index)) { disposeObject(object);if(lightmap)releaseLightmap(lightmap);return; }
      const animated: THREE.Object3D[] = [];
      object.traverse(node => { if (node.name.startsWith('Spin_') || node.name.startsWith('Float_')) animated.push(node); });
      object.position.fromArray(sections[index].origin);
      zones.set(index, { object, animated, base: animated.map(node => node.position.y), rotationBase: animated.map(node=>node.rotation.y) }); scene.add(object);
      if (architecture) {
        const copy = architecture.clone(true);
        if(lightmap){
          const materials=new Map<THREE.Material,THREE.Material>();
          const clone=(original:THREE.MeshStandardMaterial)=>{
            if(materials.has(original))return materials.get(original)!;
            const material=original.clone();
            material.onBeforeCompile=original.onBeforeCompile;material.customProgramCacheKey=original.customProgramCacheKey;
            if(material.lightMap)material.lightMap=lightmap!;
            materials.set(original,material);return material;
          };
          copy.traverse(node=>{if(node instanceof THREE.Mesh)node.material=Array.isArray(node.material)?node.material.map(clone):clone(node.material);});
          structureMaterials.set(index,[...materials.values()]);structureLightmaps.set(index,lightmap);
        }
        copy.position.fromArray(sections[index].origin);scene.add(copy);structures.set(index,copy);
      }else if(lightmap)releaseLightmap(lightmap);
      warming = true; renderer.shadowMap.needsUpdate = true; loadedAt = performance.now(); trim(); schedule();
    }).catch(() => {
      if (!disposed && (index === position.index || (position.blend > 0 && index === position.next))) fail();
    }).finally(() => requests.delete(index));
    requests.set(index, request); return request;
  };
  const fail = (state: SceneState = 'failed') => { if (disposed) return; fatal = true; cancelAnimationFrame(frame); frame = 0; onState(state); };
  function schedule() { if (started && !disposed && !fatal && !document.hidden && !frame) frame = requestAnimationFrame(draw); }
  const paint = () => {
    if (disposed || fatal) return;
    const targetProgress=position.index+position.blend;
    // Smooth along the authored route. Interpolating world positions directly
    // can cut through a wall when a wheel event crosses a tight turn.
    displayedProgress=snapCamera||paused?targetProgress:THREE.MathUtils.lerp(displayedProgress,targetProgress,cameraLerp);
    if(Math.abs(displayedProgress-targetProgress)<.0001)displayedProgress=targetProgress;
    const readingIndex=paused?(position.blend>.5?position.next:position.index):Math.min(sections.length-1,Math.floor(displayedProgress));
    const nextIndex=Math.min(readingIndex+1,sections.length-1);
    const travel=paused?0:displayedProgress-readingIndex;
    const a = sections[readingIndex], b = sections[nextIndex];
    const roomX = THREE.MathUtils.lerp(a.origin[0],b.origin[0],travel);
    roomLights.forEach(({light,offset})=>{light.position.copy(offset);light.position.x+=roomX;light.lookAt(roomX,1,0);});
    const offset=paused&&holdPausedPose?pausedFilmOffset:THREE.MathUtils.lerp(a.filmOffset,b.filmOffset,travel);
    if(camera.filmOffset!==offset){camera.filmOffset=offset;camera.updateProjectionMatrix();}
    cameraPoint.fromArray(a.reading);
    look.fromArray(a.target).lerp(nextPoint.fromArray(b.target),travel);
    if (!paused && travel > 0) {
      const route = routes[readingIndex], progress = travel;
      route.getPoint(progress,cameraPoint);
      // Look through the doorway and along the circulation gallery, then settle
      // on the authored subject. Anticipate a corner rather than staring into
      // its outer wall until the camera position has already turned.
      const anticipation=THREE.MathUtils.lerp(.3,.1,smooth((progress-.4)/.3));
      route.getPoint(Math.min(1,progress+anticipation),readingLook);
      const turn = smooth(progress / .24) * smooth((1-progress) / .24);
      look.lerp(readingLook,turn);
    }
    if(paused&&holdPausedPose){cameraPoint.copy(pausedPoint);look.copy(pausedLook);}
    pointer.lerp(targetPointer, .06);
    if (!paused) {
      const distance=cameraPoint.distanceTo(look);
      look.x+=pointer.x*distance*.012;look.y+=pointer.y*distance*.008;
    }
    camera.position.copy(cameraPoint);resolvedLook.copy(look);snapCamera=false;
    camera.lookAt(resolvedLook);
    // Static room geometry and lighting need one shadow update per area, not a
    // new 4096px render for every mouse movement or display refresh.
    const lightingRoom = position.blend > .5 ? position.next : position.index;
    if (shadowRoom !== lightingRoom) {
      shadowRoom = lightingRoom;
      Object.assign(sun.shadow.camera,{left:-25,right:25,top:25,bottom:-25,far:250});
      sun.shadow.camera.updateProjectionMatrix();
      sun.position.set(sections[lightingRoom].origin[0]-60,100,60);
      sun.target.position.set(sections[lightingRoom].origin[0],0,0);
      renderer.shadowMap.needsUpdate = true;
    }
    for (const zone of zones.values()) zone.animated.forEach((node, i) => {
      if (node.name.startsWith('Spin_')) node.rotation.y = zone.rotationBase[i] + clock * .10 * (i % 2 ? 1 : -1);
      else node.position.y = zone.base[i] + Math.sin(clock * .65 + i) * .065;
    });
    const ready = zones.has(position.index) && (position.blend === 0 || zones.has(position.next));
    if (!ready) { onState('loading'); return; }
    renderer.info.reset(); composer.render();
    if (warming) { loadedAt = performance.now(); sampleAt = 0; samples = 0; slowWindows = 0; warming = false; }
    host.dataset.drawCalls = String(renderer.info.render.calls);
    // Count visible model geometry separately from shadow/post-processing submissions.
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let visibleTriangles=0;
    scene.traverseVisible(node=>{if(node instanceof THREE.Mesh&&(!node.frustumCulled||frustum.intersectsObject(node)))visibleTriangles+=(node.geometry.index?.count??node.geometry.attributes.position.count)/3*(node instanceof THREE.InstancedMesh?node.count:1);});
    host.dataset.triangles = String(visibleTriangles);
    host.dataset.submittedTriangles = String(renderer.info.render.triangles);
    host.dataset.quality = quality;
    host.dataset.cameraPosition = camera.position.toArray().map(v=>v.toFixed(3)).join(',');
    host.dataset.cameraLookAt = resolvedLook.toArray().map(v=>v.toFixed(3)).join(',');
    host.dataset.travel = position.blend.toFixed(4);
    onState(paused ? 'paused' : 'ready');
  };
  function draw(time: number) {
    frame = 0;
    if (disposed || fatal || document.hidden) return;
    if (time - last >= 1000 / 60 - .8) {
      const interval = time - last;
      const elapsed = Math.min(interval / 1000, .1); last = time;
      cameraLerp = 1 - Math.exp(-elapsed / .085);
      if (!paused) clock += elapsed;
      paint();
      // Measure delivered frames, including GPU stalls. JavaScript submission time
      // cannot distinguish an occluded window from an expensive asynchronous GPU frame.
      if (!paused && time - loadedAt > 4000) {
        samples++;
        if (!sampleAt) sampleAt = time;
        if (time - sampleAt > 3000) {
          const fps = samples * 1000 / (time - sampleAt); host.dataset.fps = fps.toFixed(1);
          host.dataset.fpsAt = String(time);
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
        campus.traverse(node=>{if(node instanceof THREE.Mesh)node.castShadow=true;});
        scene.add(campus);
        // Start accepting destination changes while the first zone is still downloading.
        started = true;
        await ensureZone(position.index); if (disposed || fatal) return;
        last = performance.now(); schedule();
        void ensureZone(position.index);
        void ensureZone(position.next);
      } catch { if (!disposed) fail(); }
    },
    update(value,jump=false) {
      if(jump||Math.abs(value.index-position.index)>1)snapCamera=true;
      if(value.index!==position.index||Math.abs(value.local-position.local)>.00001)holdPausedPose=false;
      position = value;
      if (started) { trim(); void ensureZone(value.index); void ensureZone(value.next); schedule(); }
    },
    setPaused(value) {
      paused=value;holdPausedPose=value;
      if(value){pausedPoint.copy(camera.position);pausedLook.copy(resolvedLook);pausedFilmOffset=camera.filmOffset;}
      targetPointer.set(0,0);sampleAt=0;samples=0;last=0;schedule();
    },
    setQuality,
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(frame);
      aborters.forEach(abort => abort.abort()); observer.disconnect();
      window.removeEventListener('pointermove', onPointer); window.removeEventListener('blur', onLeave);
      document.removeEventListener('visibilitychange', onVisibility); renderer.domElement.removeEventListener('webglcontextlost', onLost);
      zones.forEach(zone => disposeObject(zone.object)); zones.clear();
      for(const index of structures.keys())releaseStructure(index);
      if (architecture) disposeObject(architecture);
      if (campus) disposeObject(campus);
      starGeometry.dispose(); starMaterial.dispose(); planetGeometry.dispose(); planetMaterial.dispose(); planetTexture.dispose(); environment?.dispose();
      sun.shadow.dispose(); bloom.dispose(); output.dispose(); composer.dispose(); renderer.dispose(); renderer.domElement.remove();
    },
  };
}
