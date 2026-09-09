import * as THREE from "three";

export type FilmPhoto = { key: string; src: string; width: number; height: number; alt: string; tone?: string };
export type FilmController = { step: (direction: number) => void; dispose: () => void };

export function mountFilm(host: HTMLDivElement, photos: readonly FilmPhoto[], paused: () => boolean, ready: () => void, failed: () => void): FilmController {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
  camera.position.z = 9.8;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = matchMedia("(pointer: coarse)");
  const loader = new THREE.TextureLoader();
  let length = 0;
  const panels = photos.map(photo => {
    const width = 3.2 * photo.width / photo.height;
    const center = length + width / 2;
    length += width + 0.16;
    // The photo window keeps its native ratio; the carrier and perforations
    // sit outside it. Adjacent carriers meet to form one continuous ribbon.
    const geometry = new THREE.PlaneGeometry(width + 0.16, 3.62, 64, 12);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: { picture: { value: null }, center: { value: 0 }, origin: { value: center }, photoWidth: { value: width }, loaded: { value: 0 }, bend: { value: 0 }, clock: { value: 0 }, tone: { value: photo.tone === "warm" || photo.tone === "tech" ? 0.9 : photo.tone === "lift" ? 0.94 : 1 }, lift: { value: photo.tone === "lift" ? 1.03 : 1 } },
      vertexShader: `
        varying vec2 vLocal;
        varying float vCarrier;
        varying float vDepth;
        varying float vRear;
        uniform float center;
        uniform float origin;
        uniform float bend;
        uniform float clock;
        // One open hairpin: the return run belongs to the same photo sequence.
        // Arc length around the turn matches the straight runs approximately.
        vec3 path(float s) {
          if (s < 8.) return vec3(s, -1. + .14*s, 1. - .008*s*s);
          if (s < 16.) {
            float a = (s - 8.) / 8. * 3.14159265;
            return vec3(8. + 2.55*sin(a), .12 + .8*(1.-cos(a)), .488 - 2.55*(1.-cos(a)));
          }
          float x = 24. - s;
          return vec3(x, 1.72 - .105*(x-8.), -4.612 - .008*(x-6.)*(x-6.));
        }
        void main() {
          vLocal = position.xy;
          vCarrier = position.x + origin;
          float s = position.x + center;
          vec3 p = path(s);
          vec3 tangent = normalize(path(s + .025) - path(s - .025));
          vec3 up = normalize(vec3(-tangent.y, abs(tangent.x) + .2, 0.));
          // The readable foreground stays broad and nearly planar. The carrier
          // twists more strongly at its returning edge, not across central faces.
          float rear = smoothstep(8., 16., s);
          float twist = .10*sin(s*.3 + clock*.36) + rear*.28 + bend*.14;
          up = normalize(up + vec3(0., 0., twist));
          p += position.y * up;
          p.y += .12*sin(s*.21 + clock*.32);
          p.z += .16*sin(s*.17 + clock*.27) + bend*.14*sin(s*.22);
          // Small continuous roll integrates the entire sculpture, not each card.
          float roll = .025*sin(clock*.29);
          p.xy = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * p.xy;
          vDepth = p.z;
          vRear = rear;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
        }`,
      fragmentShader: `
        uniform sampler2D picture;
        uniform float loaded;
        uniform float photoWidth;
        uniform float tone;
        uniform float lift;
        varying vec2 vLocal;
        varying float vCarrier;
        varying float vDepth;
        varying float vRear;
        uniform float clock;
        void main() {
          float edge = abs(vLocal.y);
          bool photo = abs(vLocal.x) < photoWidth * .5 && edge < 1.6;
          if (photo) {
            vec2 photoUv = vLocal / vec2(photoWidth, 3.2) + .5;
            // Double-sided photographic stock: the rear run remains readable.
            if (!gl_FrontFacing) photoUv.x = 1. - photoUv.x;
            vec4 c = texture2D(picture, photoUv);
            float gray = dot(c.rgb, vec3(.2126, .7152, .0722));
            gl_FragColor = vec4(mix(vec3(gray), c.rgb, tone) * lift, c.a * loaded);
          } else {
            // Real transparent rounded perforations, not pale dots painted
            // over the carrier. Their phase travels with the physical film.
            vec2 hole = abs(vec2(mod(vCarrier + .145, .29) - .145, edge - 1.705)) - vec2(.057, .042);
            float cutout = length(max(hole, 0.)) + min(max(hole.x, hole.y), 0.) - .014;
            if (cutout < 0.) discard;
            vec3 carrier = vec3(.012, .024, .030);
            float reflection = pow(.5 + .5*sin(vCarrier*.48 + vDepth*.65 - clock*.32), 6.);
            vec3 silver = mix(vec3(.19,.31,.33), vec3(.48,.38,.22), .5+.5*sin(vCarrier*.17));
            carrier += silver * reflection * .32;
            float rim = smoothstep(1.778, 1.801, edge);
            float aperture = 1. - smoothstep(.002,.012,cutout);
            carrier = mix(carrier, silver, rim*.75 + aperture*.35);
            float tick = step(.276, mod(vCarrier+.06,.29)) * step(1.775,edge);
            carrier += vec3(.23,.28,.27)*tick;
            // A fine inner rebate gives the photo window a precise physical edge.
            float rebate = 1.-smoothstep(.002,.014,edge-1.6);
            carrier *= 1.-.55*rebate;
            gl_FragColor = vec4(carrier, 1.);
          }
          #include <colorspace_fragment>
        }`
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { photo, width, center, mesh, material, texture: null as THREE.Texture | null, loading: false };
  });
  let target = panels[0].center;
  let position = target;
  let manualUntil = 0;
  let frame = 0;
  let last = 0;
  let visible = false;
  let disposed = false;
  let announced = false;
  let motionTime = 0;
  let fieldTick = 0;
  let width = 1;
  let pointer: { id: number; x: number; y: number; start: number; horizontal: boolean } | null = null;
  const wrap = (x: number) => ((x + 19) % length + length) % length - 19;
  const schedule = () => { if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw); };
  const manual = () => { manualUntil = performance.now() + 4000; schedule(); };
  const step = (direction: number) => { manual(); target += direction * 3.4; if (reduced.matches) position = target; };
  function draw(now: number) {
    frame = 0;
    if (disposed || !visible || document.hidden) { last = 0; return; }
    const interval = 1000 / (coarse.matches ? 24 : 40);
    if (last && now - last < interval) { schedule(); return; }
    const dt = last ? Math.min((now - last) / 1000, 0.08) : 0;
    last = now;
    const auto = !paused() && !reduced.matches && !pointer && now > manualUntil;
    if (auto) target += dt * 0.62;
    const distance = target - position;
    position = reduced.matches ? target : position + distance * (1 - Math.exp(-dt * 12));
    if (!reduced.matches && !paused()) motionTime += dt;
    const tension = reduced.matches ? 0 : THREE.MathUtils.clamp(distance, -1, 1);
    // The same clock and drag tension drive the light field and sculptural path.
    if (++fieldTick % 3 === 0 || reduced.matches || paused()) {
      host.parentElement?.style.setProperty("--film-light-x", `${48 + Math.sin(motionTime*.27)*15 + tension*6}%`);
      host.parentElement?.style.setProperty("--film-light-y", `${46 + Math.cos(motionTime*.32)*12}%`);
      host.parentElement?.style.setProperty("--film-shadow-angle", `${-8 + Math.sin(motionTime*.29)*3 + tension*2}deg`);
    }
    panels.forEach(panel => {
      const x = wrap(panel.center - position);
      const nearby = x > -19-panel.width && x < 48+panel.width;
      panel.mesh.visible = nearby;
      panel.material.uniforms.center.value = x;
      panel.material.uniforms.bend.value = tension;
      panel.material.uniforms.clock.value = reduced.matches ? 0 : motionTime;
      if (nearby && !panel.texture && !panel.loading) {
        panel.loading = true;
        loader.load(panel.photo.src, texture => {
          if (disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          panel.texture = texture;
          panel.loading = false;
          panel.material.uniforms.picture.value = texture;
          panel.material.uniforms.loaded.value = 1;
          if (!announced && panels.filter(p => p.mesh.visible).every(p => p.texture)) { announced = true; ready(); }
          schedule();
        }, undefined, () => { if (!disposed) failed(); });
      } else if (!nearby && panel.texture) {
        panel.texture.dispose(); panel.texture = null;
        panel.material.uniforms.picture.value = null; panel.material.uniforms.loaded.value = 0;
      }
    });
    renderer.render(scene, camera);
    if (!reduced.matches && (!paused() || Math.abs(target - position) > 0.001)) schedule();
  }
  const resize = () => { const rect = host.getBoundingClientRect(); width = rect.width; if (!width || !rect.height) return; renderer.setSize(width, rect.height, false); camera.aspect = width / rect.height; camera.updateProjectionMatrix(); schedule(); };
  const sizeObserver = new ResizeObserver(resize); sizeObserver.observe(host); resize();
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = 0; schedule(); }); observer.observe(host);
  const down = (e: PointerEvent) => { if (e.button !== 0) return; pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, start: target, horizontal: false }; manual(); };
  const move = (e: PointerEvent) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
    if (!pointer.horizontal && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { pointer = null; return; }
    if (!pointer.horizontal && Math.abs(dx) > 8) { pointer.horizontal = true; host.setPointerCapture(e.pointerId); }
    if (pointer.horizontal) { target = pointer.start - dx / width * camera.aspect * 5.4; manual(); }
  };
  const up = () => { if (pointer && host.hasPointerCapture(pointer.id)) host.releasePointerCapture(pointer.id); pointer = null; manual(); };
  const wheel = (e: WheelEvent) => {
    if (e.ctrlKey || (!e.shiftKey && Math.abs(e.deltaX) <= Math.abs(e.deltaY))) return;
    e.preventDefault(); const delta = e.shiftKey ? e.deltaY || e.deltaX : e.deltaX;
    target += THREE.MathUtils.clamp(delta * (e.deltaMode === 1 ? 16 : 1), -200, 200) / width * camera.aspect * 5.4; manual();
  };
  const key = (e: KeyboardEvent) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); step(e.key === "ArrowRight" ? 1 : -1); } };
  const resume = () => { last = 0; schedule(); };
  const lost = (e: Event) => { e.preventDefault(); failed(); };
  host.addEventListener("pointerdown", down); host.addEventListener("pointermove", move);
  host.addEventListener("pointerup", up); host.addEventListener("pointercancel", up);
  host.addEventListener("wheel", wheel, { passive: false }); host.addEventListener("keydown", key);
  host.addEventListener("film-motion-change", resume);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", resume); reduced.addEventListener("change", resume);
  return { step, dispose() {
    disposed = true; cancelAnimationFrame(frame); observer.disconnect(); sizeObserver.disconnect();
    host.removeEventListener("pointerdown", down); host.removeEventListener("pointermove", move); host.removeEventListener("pointerup", up); host.removeEventListener("pointercancel", up);
    host.removeEventListener("wheel", wheel); host.removeEventListener("keydown", key); host.removeEventListener("film-motion-change", resume);
    document.removeEventListener("visibilitychange", resume); reduced.removeEventListener("change", resume);
    renderer.domElement.removeEventListener("webglcontextlost", lost);
    panels.forEach(p => { p.texture?.dispose(); p.mesh.geometry.dispose(); p.material.dispose(); });
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  } };
}
