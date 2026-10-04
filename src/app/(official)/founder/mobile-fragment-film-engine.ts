import * as THREE from "three";
import type { FilmPhoto } from "./fragment-film-engine";

export type MobileFilmController = { step(direction: number): void; dispose(): void };

// A separate mobile sculpture. The established desktop camera/path is untouched.
export function mountMobileFilm(host: HTMLDivElement, photos: readonly FilmPhoto[], initialKey: string,
  paused: () => boolean, ready: () => void, failed: () => void, current: (key: string) => void): MobileFilmController {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 50);
  camera.position.set(0, .35, 8.2);
  const loader = new THREE.TextureLoader();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const section = host.closest<HTMLElement>("#fragments");
  let length = 0;
  const panels = photos.map(photo => {
    const width = 2.2 * photo.width / photo.height;
    const center = length + width / 2;
    length += width + .12;
    const geometry = new THREE.PlaneGeometry(width + .12, 2.52, 80, 8);
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, transparent: true,
      uniforms: { picture: { value: null }, loaded: { value: 0 }, center: { value: 0 }, origin: { value: center }, photoWidth: { value: width }, clock: { value: 0 }, tension: { value: 0 } },
      vertexShader: `
        varying vec2 vLocal; varying float vCarrier; varying float vDepth;
        uniform float center; uniform float origin; uniform float clock; uniform float tension;
        vec3 path(float s) {
          if (s < 1.4) return vec3(s, -.76 + .14*s, .7);
          if (s < 8.94) {
            float a = (s-1.4) / 7.54 * 3.14159265;
            return vec3(1.4 + 2.4*sin(a), -.564 + .98*(1.-cos(a)), .7 - 2.4*(1.-cos(a)));
          }
          float x = 10.34 - s;
          return vec3(x, 1.396 - .176*(x-1.4), -4.1);
        }
        void main() {
          vLocal = position.xy; vCarrier = origin + position.x;
          float s = center + position.x;
          vec3 p = path(s);
          vec3 t = normalize(path(s+.01)-path(s-.01));
          // Keep the foreground planar; curvature belongs to the hairpin.
          vec3 up = normalize(vec3(-t.y*sign(t.x), abs(t.x)+.15, .03*sin(s*.3)*smoothstep(2.,9.54,s)));
          p += position.y * up;
          p.y += .025*sin(clock*.35) + tension*.018;
          vDepth = p.z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.);
        }`,
      fragmentShader: `
        uniform sampler2D picture; uniform float loaded; uniform float photoWidth; uniform float clock;
        varying vec2 vLocal; varying float vCarrier; varying float vDepth;
        void main() {
          float edge = abs(vLocal.y);
          if (abs(vLocal.x) < photoWidth*.5 && edge < 1.1) {
            vec2 photoUv = vLocal / vec2(photoWidth, 2.2) + .5;
            if (!gl_FrontFacing) photoUv.x = 1.-photoUv.x;
            gl_FragColor = vec4(texture2D(picture,photoUv).rgb, loaded);
          } else {
            vec2 hole = abs(vec2(mod(vCarrier+.1,.2)-.1,edge-1.18))-vec2(.04,.025);
            float cut = length(max(hole,0.))+min(max(hole.x,hole.y),0.)-.01;
            if (cut < 0.) discard;
            vec3 graphite = vec3(.016,.028,.035);
            vec3 metal = vec3(.34,.46,.5);
            float reflection = pow(.5+.5*sin(vCarrier*.65+vDepth*.6-clock*.4),5.);
            float rim = smoothstep(1.235,1.253,edge);
            graphite += metal*(reflection*.22+rim*.65);
            graphite += metal*.24*(1.-smoothstep(.001,.009,cut));
            gl_FragColor = vec4(graphite,1.);
          }
          #include <colorspace_fragment>
        }`
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { photo, width, center, mesh, material, texture: null as THREE.Texture | null, loading: false };
  });
  let target = (panels.find(p => p.photo.key === initialKey) ?? panels[0]).center;
  let position = target, velocity = 0, manualUntil = 0, clock = 0;
  let frame = 0, last = 0, visible = false, disposed = false, announced = false;
  let width = 1, fieldTick = 0, reported = "";
  let pointer: { id: number; x: number; y: number; start: number; horizontal: boolean; lastX: number; lastTime: number } | null = null;
  const wrap = (s: number) => ((s + 7) % length + length) % length - 7;
  const schedule = () => { if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw); };
  const manual = () => { manualUntil = performance.now() + 4000; schedule(); };
  const nearest = () => panels.reduce((best, p) => Math.abs(wrap(p.center-position)) < Math.abs(wrap(best.center-position)) ? p : best, panels[0]);
  const step = (direction: number) => {
    const p = nearest(), index = panels.indexOf(p);
    const next = panels[(index + direction + panels.length) % panels.length];
    const difference = direction > 0 ? (next.center-p.center+length)%length : -((p.center-next.center+length)%length);
    target = position + wrap(p.center-position) + difference;
    velocity = 0;
    if (reduced.matches) position = target;
    manual();
  };
  function draw(now: number) {
    frame = 0;
    if (disposed || !visible || document.hidden) { last = 0; return; }
    if (last && now-last < 1000/30) { schedule(); return; }
    const dt = last ? Math.min((now-last)/1000,.07) : 0;
    last = now;
    const p = nearest();
    const wanted = panels.filter(panel => { const s = wrap(panel.center-position); return s > -5-panel.width && s < 16+panel.width; });
    const loaded = wanted.every(panel => panel.texture);
    if (loaded && !announced) { announced = true; ready(); }
    const auto = announced && loaded && !paused() && !reduced.matches && !pointer && now > manualUntil;
    if (auto) {
      // One native-width frame in roughly seven seconds; a shallow speed envelope
      // slows the central viewing zone without pausing or snapping to it.
      target += dt*(p.width+.12)/7*(.92+.08*Math.min(1,Math.abs(wrap(p.center-position))));
    } else if (!pointer && !reduced.matches && !paused()) {
      target += velocity*dt; velocity *= Math.exp(-dt*6);
    }
    position = reduced.matches ? target : position+(target-position)*(1-Math.exp(-dt*14));
    if (announced && !reduced.matches && !paused()) clock += dt;
    const tension = THREE.MathUtils.clamp(target-position,-1,1);
    if (++fieldTick % 3 === 0 || reduced.matches) {
      section?.style.setProperty("--mobile-film-flow", `${-position*42}`);
      section?.style.setProperty("--mobile-film-light-x", `${50+Math.sin(position*.18)*15+tension*6}%`);
      section?.style.setProperty("--mobile-film-angle", `${-8+Math.sin(position*.2)*2+tension*2}deg`);
    }
    panels.forEach(panel => {
      const s = wrap(panel.center-position);
      const nearby = wanted.includes(panel);
      panel.mesh.visible = nearby;
      panel.material.uniforms.center.value = s;
      panel.material.uniforms.clock.value = reduced.matches ? 0 : clock;
      panel.material.uniforms.tension.value = reduced.matches ? 0 : tension;
      if (nearby && !panel.texture && !panel.loading) {
        panel.loading = true;
        loader.load(panel.photo.src, texture => {
          if (disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(4,renderer.capabilities.getMaxAnisotropy());
          panel.texture = texture; panel.loading = false;
          panel.material.uniforms.picture.value = texture;
          panel.material.uniforms.loaded.value = 1;
          schedule();
        }, undefined, () => { if (!disposed) failed(); });
      } else if (!nearby && panel.texture) {
        panel.texture.dispose(); panel.texture = null;
        panel.material.uniforms.picture.value = null; panel.material.uniforms.loaded.value = 0;
      }
    });
    // Keep the previous complete frame during a manual seek; never expose a
    // transparent, unloaded photo window in the foreground.
    const complete = panels.filter(p => p.mesh.visible).every(p => p.texture);
    host.dataset.pendingTextures = String(panels.filter(p => p.mesh.visible && !p.texture).length);
    host.dataset.motion = reduced.matches ? "still" : paused() ? "paused" : auto ? "auto" : "manual";
    if (complete) renderer.render(scene,camera);
    const key = nearest().photo.key;
    if (complete && key !== reported) { reported = key; current(key); host.dataset.currentPhoto = key; }
    if (announced && (!reduced.matches && (!paused() || Math.abs(target-position)>.001))) schedule();
  }
  const resize = () => {
    const r = host.getBoundingClientRect(); width = r.width;
    if (!width || !r.height) return;
    renderer.setSize(width,r.height,false); camera.aspect = width/r.height;
    // Wider phones retain the same visual scale, rather than expanding the gap.
    camera.position.z = Math.max(7.8, 3.8/(2*Math.tan(THREE.MathUtils.degToRad(18))*camera.aspect));
    camera.updateProjectionMatrix(); schedule();
  };
  const sizeObserver = new ResizeObserver(resize); sizeObserver.observe(host); resize();
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last=0; if (!visible && frame) { cancelAnimationFrame(frame); frame=0; } schedule(); }); observer.observe(host);
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (pointer) { pointer=null; return; } // leave multitouch/pinch to the browser
    velocity=0; pointer={id:e.pointerId,x:e.clientX,y:e.clientY,start:target,horizontal:false,lastX:e.clientX,lastTime:performance.now()}; manual();
  };
  const move = (e: PointerEvent) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
    if (!pointer.horizontal && Math.abs(dy)>12 && Math.abs(dy)>Math.abs(dx)/1.3) { pointer=null; return; }
    if (!pointer.horizontal && Math.abs(dx)>12 && Math.abs(dx)>1.3*Math.abs(dy)) { pointer.horizontal=true; host.setPointerCapture(e.pointerId); }
    if (pointer.horizontal) {
      const now=performance.now();
      velocity=THREE.MathUtils.clamp(-(e.clientX-pointer.lastX)/Math.max(8,now-pointer.lastTime)*1000/width*3.8,-5,5);
      pointer.lastX=e.clientX; pointer.lastTime=now;
      target=pointer.start-dx/width*3.8;
      if (reduced.matches) position=target;
      manual();
    }
  };
  const up = () => { if (pointer && host.hasPointerCapture(pointer.id)) host.releasePointerCapture(pointer.id); pointer=null; manual(); };
  const key = (e: KeyboardEvent) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1); } };
  const resume = () => {
    // Apply pause / reduced-motion synchronously, cancelling a frame queued
    // under the previous preference before publishing the static field.
    cancelAnimationFrame(frame); frame=0; last=0;
    if (!document.hidden && visible) draw(performance.now());
  };
  const lost = (e: Event) => { e.preventDefault(); failed(); };
  host.addEventListener("pointerdown",down); host.addEventListener("pointermove",move);
  host.addEventListener("pointerup",up); host.addEventListener("pointercancel",up); host.addEventListener("keydown",key);
  host.addEventListener("mobile-film-motion-change",resume);
  document.addEventListener("visibilitychange",resume); reduced.addEventListener("change",resume);
  renderer.domElement.addEventListener("webglcontextlost",lost);
  return { step, dispose() {
    disposed=true; cancelAnimationFrame(frame); observer.disconnect(); sizeObserver.disconnect();
    host.removeEventListener("pointerdown",down); host.removeEventListener("pointermove",move);
    host.removeEventListener("pointerup",up); host.removeEventListener("pointercancel",up); host.removeEventListener("keydown",key);
    host.removeEventListener("mobile-film-motion-change",resume);
    document.removeEventListener("visibilitychange",resume); reduced.removeEventListener("change",resume);
    renderer.domElement.removeEventListener("webglcontextlost",lost);
    panels.forEach(p=>{ p.texture?.dispose(); p.mesh.geometry.dispose(); p.material.dispose(); });
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  } };
}
