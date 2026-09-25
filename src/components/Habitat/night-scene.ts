import * as THREE from 'three';
import authored from '../../../public/habitat/night-v1/manifest.json';
import type { SceneController } from './scene-engine';
import type { Quality, SceneState, TourPosition } from './scene-config';

const base = '/habitat/night-v1/';
type Plate = { color: THREE.Texture; data: THREE.Texture; images: ImageBitmap[] };

/** Blender computes the expensive lighting. One WebGL pass animates depth, light and filmed water. */
export function createScene(host: HTMLElement, onState: (state: SceneState) => void): SceneController {
  for (const key of ['fallbackReason', 'fps', 'fpsAt', 'filmTime', 'filmFrames', 'sceneTime']) delete host.dataset[key];
  let disposed = false, paused = false, ready = false, frame = 0, elapsed = 0, last = 0;
  let sampleAt = 0, frames = 0, slowWindows = 0, generation = 0;
  let quality: Quality = 'standard';
  let position: TourPosition = { index: 0, next: 1, blend: 0, local: 0 };
  let shown = position;
  const abort = new AbortController();
  const cache = new Map<number, Promise<Plate>>();
  const resources = new Set<Plate>();
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'default' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true'); host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
  const pointer = new THREE.Vector2(), drift = new THREE.Vector2();
  const empty = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); empty.needsUpdate = true;
  const film = document.createElement('video');
  film.muted = true; film.loop = true; film.playsInline = true; film.preload = 'none';
  const filmTexture = new THREE.VideoTexture(film);
  filmTexture.wrapS = filmTexture.wrapT = THREE.RepeatWrapping;
  const uniforms = {
    colorA: { value: empty as THREE.Texture }, colorB: { value: empty as THREE.Texture }, mapA: { value: empty as THREE.Texture }, mapB: { value: empty as THREE.Texture },
    water: { value: empty as THREE.Texture }, cover: { value: new THREE.Vector2(1, 1) },
    pointer: { value: drift }, time: { value: 0 }, blend: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, uniforms,
    vertexShader: 'varying vec2 uvPlate; void main(){uvPlate=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `
      precision highp float;
      varying vec2 uvPlate;
      uniform sampler2D colorA,colorB,mapA,mapB,water;
      uniform vec2 cover,pointer;
      uniform float time,blend;
      vec3 plate(sampler2D photograph,sampler2D data,vec2 uv){
        vec3 info=texture2D(data,uv).rgb;
        // Actual Blender distance controls parallax; distant stars move least.
        vec2 movement=pointer+vec2(sin(time*.12)*.065,cos(time*.09)*.025);
        vec2 p=clamp(uv+movement*(.008+(info.r-.35)*.003),vec2(.001),vec2(.999));
        float mask=smoothstep(.45,.85,texture2D(data,p).g);
        vec2 filmUV=p*vec2(2.3,1.7)+vec2(time*.003,0.);
        float h=texture2D(water,filmUV).r;
        vec2 slope=vec2(texture2D(water,filmUV+vec2(.006,0.)).r-h,
                        texture2D(water,filmUV+vec2(0.,.008)).r-h);
        vec2 ripples=vec2(sin(p.y*220.+time*.8),cos(p.x*110.+p.y*70.+time*.55))*.0008;
        vec3 color=texture2D(photograph,clamp(p+(slope*.024+ripples)*mask,vec2(.001),vec2(.999))).rgb;
        // The filmed surface breaks the authored reflection into changing highlights.
        color*=1.+mask*(h-.5)*.16;
        color+=mask*pow(h,4.)*vec3(.002,.004,.004);
        color*=1.+info.b*sin(time*.24)*.045;
        return color;
      }
      void main(){
        vec2 uv=(uvPlate-.5)*cover+.5;
        vec3 color=plate(colorA,mapA,uv);
        if(blend>.001)color=mix(color,plate(colorB,mapB,uv),smoothstep(0.,1.,blend));
        gl_FragColor=vec4(color,1.);
        #include <colorspace_fragment>
      }`,
  });
  const geometry = new THREE.PlaneGeometry(2, 2); scene.add(new THREE.Mesh(geometry, material));

  const loadTexture = async (url: string, color: boolean) => {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) throw new Error('Background unavailable');
    const image = await createImageBitmap(await response.blob(), { imageOrientation: 'flipY' });
    if (disposed) { image.close(); throw new Error('Disposed'); }
    const texture = new THREE.Texture(image); texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false; texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.needsUpdate = true; return { texture, image };
  };
  const loadPlate = (index: number) => {
    let entry = cache.get(index);
    if (!entry) {
      entry = (async () => {
        const id = authored.sections[index].id;
        const loaded = await Promise.allSettled([loadTexture(base + id + '.webp', true), loadTexture(base + id + '.map.webp', false)]);
        if (loaded.some(result => result.status === 'rejected')) {
          for (const result of loaded) if (result.status === 'fulfilled') { result.value.texture.dispose(); result.value.image.close(); }
          throw new Error('Background unavailable');
        }
        const [color, data] = loaded.map(result => (result as PromiseFulfilledResult<Awaited<ReturnType<typeof loadTexture>>>).value);
        const plate = { color: color.texture, data: data.texture, images: [color.image, data.image] };
        if (disposed) { plate.color.dispose(); plate.data.dispose(); plate.images.forEach(image => image.close()); throw new Error('Disposed'); }
        resources.add(plate); return plate;
      })(); cache.set(index, entry);
    }
    return entry;
  };
  const select = async () => {
    const token = ++generation, pending = position;
    const [a, b] = await Promise.all([loadPlate(pending.index), loadPlate(pending.next)]);
    if (disposed || token !== generation || pending.index !== position.index || pending.next !== position.next) return;
    shown = position;
    uniforms.colorA.value = a.color; uniforms.mapA.value = a.data;
    uniforms.colorB.value = b.color; uniforms.mapB.value = b.data;
    uniforms.blend.value = position.blend;
    if (ready && paused) draw(0);
    // Keep only the current neighbourhood; CPU/GPU bitmaps are disposed together.
    for (const [index, promise] of cache) if (Math.abs(index - pending.index) > 2) {
      cache.delete(index); void promise.then(plate => {
        if (!resources.delete(plate)) return;
        plate.color.dispose(); plate.data.dispose(); plate.images.forEach(image => image.close());
      }).catch(() => {});
    }
  };
  const draw = (delta: number) => {
    drift.lerp(pointer, delta ? 1 - Math.exp(-delta * 3) : 1);
    uniforms.time.value = elapsed;
    renderer.render(scene, camera);
    host.dataset.drawCalls = String(renderer.info.render.calls);
    host.dataset.triangles = host.dataset.submittedTriangles = String(renderer.info.render.triangles);
    const a = authored.sections[shown.index], b = authored.sections[shown.next];
    host.dataset.cameraPosition = a.camera.map((v,i) => THREE.MathUtils.lerp(v,b.camera[i],shown.blend).toFixed(3)).join(',');
    host.dataset.cameraLookAt = a.target.map((v,i) => THREE.MathUtils.lerp(v,b.target[i],shown.blend).toFixed(3)).join(',');
    host.dataset.filmTime = film.currentTime.toFixed(3);
    host.dataset.filmFrames = String(film.getVideoPlaybackQuality?.().totalVideoFrames ?? 0);
    host.dataset.sceneTime = elapsed.toFixed(3);
  };
  const tick = (now: number) => {
    frame = 0;
    if (disposed || paused || document.hidden || !ready) return;
    const delta = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
    elapsed += delta; draw(delta); frames++;
    if (now - sampleAt > 2500) {
      const fps = frames * 1000 / (now - sampleAt);
      host.dataset.fps = fps.toFixed(1); host.dataset.fpsAt = String(now);
      slowWindows = fps < 28 ? slowWindows + 1 : 0; sampleAt = now; frames = 0;
      if (slowWindows >= 3) { host.dataset.fallbackReason = 'sustained-frame-budget'; onState('static'); return; }
    }
    frame = requestAnimationFrame(tick);
  };
  const resume = () => {
    cancelAnimationFrame(frame); frame = 0; last = sampleAt = performance.now(); frames = 0; slowWindows = 0;
    if (ready && !paused && !document.hidden && !disposed) {
      frame = requestAnimationFrame(tick);
      if (film.src) void film.play().catch(() => { if (!disposed) host.dataset.filmState = 'unavailable'; });
    } else { film.pause(); if (!disposed) host.dataset.filmState = 'paused'; }
  };
  film.addEventListener('playing', () => { if (!disposed) { uniforms.water.value = filmTexture; host.dataset.filmState = 'playing'; } });
  film.addEventListener('error', () => { if (!disposed) host.dataset.filmState = 'unavailable'; });
  const resize = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight), aspect = w / h;
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? 1 : 1.25, Math.sqrt(1_200_000 / (w*h))));
    renderer.setSize(w,h,false); uniforms.cover.value.set(Math.min(1,aspect/(16/9)), Math.min(1,(16/9)/aspect));
    if (ready && paused) draw(0);
  };
  const move = (event: PointerEvent) => { if (event.pointerType === 'mouse') pointer.set(event.clientX / innerWidth - .5, .5 - event.clientY / innerHeight); };
  const lost = (event: Event) => { event.preventDefault(); if (!disposed) { ready = false; cancelAnimationFrame(frame); onState('failed'); } };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  window.addEventListener('pointermove', move, { passive: true }); document.addEventListener('visibilitychange', resume);
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  return {
    async start() {
      const timeout = window.setTimeout(() => abort.abort(), 15000);
      try {
        // A navigation during download must prepare its new destination before ready.
        do { await select(); } while (!disposed && (shown.index !== position.index || shown.next !== position.next));
        if (disposed) return;
        ready = true; host.dataset.quality = quality; draw(0); onState(paused ? 'paused' : 'ready');
        film.src = base + authored.reflectionFilm; host.dataset.filmState = 'loading'; resume();
      } catch { if (!disposed) onState('failed'); }
      finally { clearTimeout(timeout); }
    },
    update(value) {
      const changed = value.index !== position.index || value.next !== position.next;
      position = value; host.dataset.travel = String(value.blend);
      if (changed && ready) void select().catch(() => { if (!disposed) onState('failed'); });
      if (shown.index === value.index && shown.next === value.next) { shown = value; uniforms.blend.value = value.blend; if (ready && paused) draw(0); }
    },
    setPaused(value) { paused = value; if (ready) { if (paused) draw(0); onState(paused ? 'paused' : 'ready'); } resume(); },
    setQuality(value) { quality = value; host.dataset.quality = value; resize(); },
    dispose() {
      if (disposed) return; disposed = true; generation++; abort.abort(); cancelAnimationFrame(frame); observer.disconnect();
      film.pause(); film.removeAttribute('src'); film.load(); host.dataset.filmState = 'disposed'; filmTexture.dispose(); empty.dispose();
      for (const plate of resources) { plate.color.dispose(); plate.data.dispose(); plate.images.forEach(image => image.close()); }
      resources.clear(); cache.clear();
      window.removeEventListener('pointermove',move); document.removeEventListener('visibilitychange',resume);
      renderer.domElement.removeEventListener('webglcontextlost',lost);
      geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}
