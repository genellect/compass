import * as THREE from "three";

/** Decorative and event-driven: no form state or perpetual animation loop. */
export function mountContactGallery(host: HTMLDivElement): () => void {
  const coarse = matchMedia("(pointer: coarse)");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", { alpha: true, antialias: !coarse.matches, powerPreference: "low-power" });
  if (!context) return () => {};
  const renderer = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: !coarse.matches, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, coarse.matches ? 1 : 1.5));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .1, 80);
  camera.position.set(0, 1.3, 14);
  camera.lookAt(0, 0, 0);
  const architecture = new THREE.Group();
  scene.add(architecture, new THREE.HemisphereLight(0xfaffff, 0x344958, 3));
  const daylight = new THREE.DirectionalLight(0xe5faf9, 4);
  daylight.position.set(-6, 8, 8);
  scene.add(daylight);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const stone = new THREE.MeshStandardMaterial({ color: 0xe0e8e5, roughness: .7, metalness: .08 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x97bbb9, transparent: true, opacity: .38, roughness: .28, metalness: .25, depthWrite: false });
  const edge = new THREE.MeshStandardMaterial({ color: 0x304a56, roughness: .45, metalness: .4 });
  function slab(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, angle = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.rotation.y = angle;
    architecture.add(mesh);
  }
  for (let i = 0; i < 3; i++) {
    const z = -i * 1.6;
    slab(-6.2 + i * .3, 0, z, .24, 12, 1.3, stone, -.22);
    slab(6.2 - i * .3, 0, z, .24, 12, 1.3, stone, .22);
    slab(0, 4.3 + i * .15, z, 12.6, .18, 1.3, stone);
  }
  slab(5.6, 1, 1, 1.4, 8, .08, glass, -.32);
  slab(-5.4, -.5, .4, 1.2, 10, .08, glass, .34);
  slab(6.35, 0, .8, .045, 12, .07, edge);
  slab(-6.35, 0, .8, .045, 12, .07, edge);
  host.append(renderer.domElement);
  let frame = 0;
  let active = true;
  let stopped = false;
  const start = performance.now();
  let targetX = 0;
  let targetY = 0;
  const draw = (now: number) => {
    frame = 0;
    if (stopped || !active || document.hidden) return;
    const intro = Math.max(0, 1 - (now - start) / 1300);
    architecture.rotation.x += (targetX - architecture.rotation.x) * .16;
    architecture.rotation.y += (targetY - architecture.rotation.y) * .16;
    architecture.position.y = -.16 * intro * intro;
    try { renderer.render(scene, camera); } catch { stopRendering(); return; }
    if (intro > 0 || Math.abs(targetX - architecture.rotation.x) + Math.abs(targetY - architecture.rotation.y) > .0001) schedule();
  };
  function schedule() { if (!frame && !stopped && active && !document.hidden) frame = requestAnimationFrame(draw); }
  function stopRendering() { stopped = true; cancelAnimationFrame(frame); frame = 0; renderer.domElement.style.display = "none"; }
  const resize = new ResizeObserver(() => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height || stopped) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // Keep the architecture at the edges on portrait screens.
    camera.position.z = camera.aspect < 1 ? 14 / camera.aspect : 14;
    camera.updateProjectionMatrix();
    schedule();
  });
  resize.observe(host);
  const visibility = new IntersectionObserver(([entry]) => {
    active = entry.isIntersecting;
    if (active) schedule(); else { cancelAnimationFrame(frame); frame = 0; }
  });
  visibility.observe(host);
  const pointer = (event: PointerEvent) => {
    if (coarse.matches || !active) return;
    targetY = (event.clientX / innerWidth - .5) * .035;
    targetX = (event.clientY / innerHeight - .5) * .02;
    schedule();
  };
  const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); };
  const contextLost = (event: Event) => { event.preventDefault(); stopRendering(); };
  window.addEventListener("pointermove", pointer, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  schedule();
  return () => {
    stopRendering();
    resize.disconnect();
    visibility.disconnect();
    window.removeEventListener("pointermove", pointer);
    document.removeEventListener("visibilitychange", onVisibility);
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    geometry.dispose(); stone.dispose(); glass.dispose(); edge.dispose(); renderer.dispose();
    renderer.domElement.remove();
  };
}
