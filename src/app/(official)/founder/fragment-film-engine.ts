import * as THREE from "three";

export type FilmPhoto = { key: string; src: string; width: number; height: number; alt: string; tone?: string };
export type FilmController = { step: (direction: number) => void; dispose: () => void };

export function mountFilm(host: HTMLDivElement, photos: readonly FilmPhoto[], paused: () => boolean, ready: () => void, failed: () => void): FilmController {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  camera.position.z = 8.7;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = matchMedia("(pointer: coarse)");
  const loader = new THREE.TextureLoader();
  let length = 0;
  const panels = photos.map(photo => {
    const width = 4 * photo.width / photo.height;
    const center = length + width / 2;
    length += width + 0.16;
    // The photo window keeps its native ratio; the carrier and perforations
    // sit outside it. Adjacent carriers meet to form one continuous ribbon.
    const geometry = new THREE.PlaneGeometry(width + 0.16, 4.76, 48, 16);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { picture: { value: null }, center: { value: 0 }, origin: { value: center }, photoWidth: { value: width }, loaded: { value: 0 }, bend: { value: 0 }, tone: { value: photo.tone === "warm" || photo.tone === "tech" ? 0.9 : photo.tone === "lift" ? 0.94 : 1 }, lift: { value: photo.tone === "lift" ? 1.03 : 1 } },
      vertexShader: `
        varying vec2 vLocal;
        varying float vCarrier;
        varying float vDepth;
        uniform float center;
        uniform float origin;
        uniform float bend;
        void main() {
          vLocal = position.xy;
          vCarrier = position.x + origin;
          float x = position.x + center;
          // Open, asymmetric sweep rather than a closed cylindrical gallery.
          // Every panel shares the same world-space curve, including its edges.
          float twist = .16 * sin(x * .24 - .3);
          float y = position.y * cos(twist);
          float z = position.y * sin(twist);
          y += .115 * x + .32 * sin(x * .38 - .4);
          z += -.018 * x * x + .65 * sin(x * .36 + .25);
          z += bend * .10 * sin(x * .3);
          vDepth = z;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, z, 1.);
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
        void main() {
          float edge = abs(vLocal.y);
          bool photo = abs(vLocal.x) < photoWidth * .5 && edge < 2.;
          if (photo) {
            vec2 photoUv = vLocal / vec2(photoWidth, 4.) + .5;
            vec4 c = texture2D(picture, photoUv);
            float gray = dot(c.rgb, vec3(.2126, .7152, .0722));
            gl_FragColor = vec4(mix(vec3(gray), c.rgb, tone) * lift, c.a * loaded);
          } else {
            // Real transparent rounded perforations, not pale dots painted
            // over the carrier. Their phase travels with the physical film.
            vec2 hole = abs(vec2(mod(vCarrier + .2, .4) - .2, edge - 2.20)) - vec2(.09, .075);
            float cutout = length(max(hole, 0.)) + min(max(hole.x, hole.y), 0.) - .025;
            if (cutout < 0.) discard;
            vec3 carrier = vec3(.008, .016, .021);
            carrier *= 1. + .14 * sin(vDepth * .8);
            float rim = smoothstep(2.34, 2.37, edge);
            carrier = mix(carrier, vec3(.11, .15, .16), rim * .45);
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
  let width = 1;
  let pointer: { id: number; x: number; y: number; start: number; horizontal: boolean } | null = null;
  const wrap = (x: number) => ((x + length / 2) % length + length) % length - length / 2;
  const schedule = () => { if (!disposed && visible && !document.hidden && !frame) frame = requestAnimationFrame(draw); };
  const manual = () => { manualUntil = performance.now() + 4000; schedule(); };
  const step = (direction: number) => { manual(); target += direction * 4.5; if (reduced.matches) position = target; };
  function draw(now: number) {
    frame = 0;
    if (disposed || !visible || document.hidden) { last = 0; return; }
    const interval = 1000 / (coarse.matches ? 24 : 40);
    if (last && now - last < interval) { schedule(); return; }
    const dt = last ? Math.min((now - last) / 1000, 0.08) : 0;
    last = now;
    const auto = !paused() && !reduced.matches && !pointer && now > manualUntil;
    if (auto) target += dt * 0.3;
    const distance = target - position;
    position = reduced.matches ? target : position + distance * (1 - Math.exp(-dt * 12));
    const extent = Math.min(13, camera.aspect * 3.1 + 3.5);
    panels.forEach(panel => {
      const x = wrap(panel.center - position);
      const nearby = Math.abs(x) < extent + panel.width / 2;
      panel.mesh.visible = nearby;
      panel.material.uniforms.center.value = x;
      panel.material.uniforms.bend.value = reduced.matches ? 0 : THREE.MathUtils.clamp(distance, -1, 1);
      if (nearby && !panel.texture && !panel.loading) {
        panel.loading = true;
        loader.load(panel.photo.src, texture => {
          if (disposed) { texture.dispose(); return; }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
          panel.texture = texture;
          panel.loading = false;
          panel.material.uniforms.picture.value = texture;
          panel.material.uniforms.loaded.value = 1;
          if (!announced && panels.filter(p => p.mesh.visible).every(p => p.texture)) { announced = true; ready(); }
          schedule();
        }, undefined, () => { if (!disposed) failed(); });
      } else if (!nearby && Math.abs(x) > extent + panel.width + 6 && panel.texture) {
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
