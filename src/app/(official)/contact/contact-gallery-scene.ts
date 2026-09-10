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
  const camera = new THREE.PerspectiveCamera(48, 1, .1, 120);
  camera.position.set(0, 5, 19);
  camera.lookAt(0, 2, -8);
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
  // Monumental colonnades recede towards a luminous, navy-framed horizon.
  for (let i = 0; i < 9; i++) {
    const z = 3 - i * 5;
    slab(-9, 2, z, .65, 18, 1.1, stone);
    slab(9, 2, z, .65, 18, 1.1, stone);
    slab(0, 10.7, z, 18.5, .55, 1.1, stone);
    slab(0, -5.4, z, 18.5, .12, .08, edge);
  }
  slab(0, -5.7, -17, 25, .35, 60, stone);
  slab(-7.8, 1, -7, .12, 14, 19, glass);
  slab(7.8, 1, -7, .12, 14, 19, glass);
  slab(0, 1.6, -44, 18, 18, .2, edge);
  const portalGeometry = new THREE.TorusGeometry(5.8, .24, 12, 96);
  const portal = new THREE.Mesh(portalGeometry, stone);
  portal.position.set(0, 5.1, -2);
  portal.rotation.set(.38, -.22, -.17);
  architecture.add(portal);
  const innerPortal = new THREE.Mesh(portalGeometry, glass);
  innerPortal.position.set(0, 5.1, -9);
  innerPortal.scale.setScalar(.84);
  innerPortal.rotation.set(.38, -.22, -.17);
  architecture.add(innerPortal);
  const lightGeometry = new THREE.PlaneGeometry(10, 18);
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xe6fff6 });
  const aperture = new THREE.Mesh(lightGeometry, lightMaterial);
  aperture.position.set(0, 2, -43.7);
  architecture.add(aperture);
  host.append(renderer.domElement);
  let frame = 0;
  let active = true;
  let stopped = false;
  const start = performance.now();
  let targetX = 0;
  let targetY = 0;
  let scrollDepth = 0;
  let editing = false;
  const draw = (now: number) => {
    frame = 0;
    if (stopped || !active || document.hidden) return;
    const intro = Math.max(0, 1 - (now - start) / 1300);
    architecture.rotation.x += (targetX - architecture.rotation.x) * .16;
    architecture.rotation.y += (targetY - architecture.rotation.y) * .16;
    architecture.position.y = -.3 * intro * intro + scrollDepth;
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
    // Crop into the same architecture on mobile instead of shrinking it away.
    camera.position.z = camera.aspect < .7 ? 27 : 19;
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
    if (coarse.matches || !active || editing) return;
    targetY = (event.clientX / innerWidth - .5) * .035;
    targetX = (event.clientY / innerHeight - .5) * .02;
    schedule();
  };
  const scroll = () => {
    if (editing) return;
    scrollDepth = Math.min(window.scrollY, 800) * .0007;
    schedule();
  };
  const focus = (event: FocusEvent) => {
    const element = event.type === "focusout" ? event.relatedTarget : event.target;
    editing = element instanceof HTMLElement && element.matches("input, textarea, select");
    if (editing) { targetX = architecture.rotation.x; targetY = architecture.rotation.y; }
  };
  window.addEventListener("scroll", scroll, { passive: true });
  document.addEventListener("focusin", focus);
  document.addEventListener("focusout", focus);
  const onVisibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else schedule(); };
  const contextLost = (event: Event) => { event.preventDefault(); stopRendering(); };
  window.addEventListener("pointermove", pointer, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  schedule();
  return () => {
    stopRendering();
    window.removeEventListener("scroll", scroll);
    document.removeEventListener("focusin", focus);
    document.removeEventListener("focusout", focus);
    resize.disconnect();
    visibility.disconnect();
    window.removeEventListener("pointermove", pointer);
    document.removeEventListener("visibilitychange", onVisibility);
    renderer.domElement.removeEventListener("webglcontextlost", contextLost);
    portalGeometry.dispose(); lightGeometry.dispose(); lightMaterial.dispose();
    geometry.dispose(); stone.dispose(); glass.dispose(); edge.dispose(); renderer.dispose();
    renderer.domElement.remove();
  };
}
