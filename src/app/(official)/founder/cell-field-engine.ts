import * as THREE from "three";

export type CellSceneController = { dispose(): void; syncMotion(): void };

// An authored optical sculpture, deliberately independent of cellular anatomy.
function opticalFacet() {
  const outline = new THREE.Shape();
  outline.moveTo(-.94, -.69);
  outline.lineTo(.92, -.54);
  outline.lineTo(.15, .94);
  outline.closePath();
  const aperture = new THREE.Path();
  aperture.moveTo(-.42, -.36);
  aperture.lineTo(.15, .42);
  aperture.lineTo(.45, -.29);
  aperture.closePath();
  outline.holes.push(aperture);
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: .22, bevelEnabled: true, bevelSize: .06, bevelThickness: .06,
    bevelSegments: 6, steps: 1, curveSegments: 1,
  });
  geometry.translate(0, 0, -.11);
  return geometry;
}

function opticalMaterial(color: number) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness: .48, roughness: .13, transmission: .27,
    thickness: .28, ior: 1.48, attenuationColor: new THREE.Color(color),
    attenuationDistance: 1.7, clearcoat: 1, clearcoatRoughness: .065,
    envMapIntensity: 1.8, iridescence: .18,
    iridescenceIOR: 1.32, iridescenceThicknessRange: [160, 310],
  });
}

function opticalEnvironment(renderer: THREE.WebGLRenderer) {
  const studio = new THREE.Scene(); studio.background = new THREE.Color(0x061426);
  const panels: THREE.Mesh[] = [];
  const panel = (width: number, height: number, color: number, intensity: number, position: THREE.Vector3) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    (mesh.material as THREE.MeshBasicMaterial).color.multiplyScalar(intensity);
    mesh.position.copy(position); mesh.lookAt(0, 0, 0); studio.add(mesh); panels.push(mesh);
  };
  panel(1.3, 6, 0xb5edff, 4, new THREE.Vector3(-3, 3, 4));
  panel(5, 1.2, 0x6e99e8, 2, new THREE.Vector3(1, -3, 4));
  panel(.7, 5, 0xbcefff, 5, new THREE.Vector3(4, 1, -2));
  const pmrem = new THREE.PMREMGenerator(renderer);
  try { return pmrem.fromScene(studio, .025); }
  finally { pmrem.dispose(); panels.forEach(mesh => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }); }
}

export async function mountCellScene(host: HTMLDivElement, isPaused: () => boolean, signal: AbortSignal, onContextLost: () => void): Promise<CellSceneController> {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setClearColor(0x020817, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12; renderer.domElement.setAttribute("aria-hidden", "true");
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  let environment: THREE.WebGLRenderTarget | undefined;
  let cleanup = () => {
    geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
    environment?.dispose(); renderer.dispose(); renderer.domElement.remove();
  };
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, .1, 40);
    camera.position.set(0, 0, 8); environment = opticalEnvironment(renderer); scene.environment = environment.texture;
    const key = new THREE.DirectionalLight(0xd6f4ff, 3.2); key.position.set(-3, 4, 6);
    const rim = new THREE.DirectionalLight(0x58baff, 3.5); rim.position.set(4, 2, -2);
    const fill = new THREE.DirectionalLight(0x4174ba, .7); fill.position.set(1, -3, 4);
    scene.add(key, rim, fill);
    const coarse = matchMedia("(max-width: 900px), (pointer: coarse)");
    const facet = opticalFacet(); geometries.add(facet);
    const hero = new THREE.Group();
    const plates = [0x48a8c9, 0x628ed5, 0xc9e9f0].map((color, index) => {
      const material = opticalMaterial(color); materials.add(material);
      const plate = new THREE.Mesh(facet, material);
      const edgeGeometry = new THREE.EdgesGeometry(facet, 28); geometries.add(edgeGeometry);
      const edgeMaterial = new THREE.LineBasicMaterial({ color: index === 1 ? 0x90b6ff : 0xc9efff, transparent: true, opacity: .24 });
      materials.add(edgeMaterial);
      plate.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
      hero.add(plate); return plate;
    });
    scene.add(hero); host.appendChild(renderer.domElement);
    let visible = false, disposed = false, contextUnavailable = false;
    let frame = 0, lastTime = 0, lastRender = 0, elapsed = 0, renders = 0, heroX = 0, heroY = 0;
    const render = () => {
      if (disposed || contextUnavailable) return;
      const phase = elapsed * Math.PI * 2 / 12;
      hero.rotation.set(.32 + Math.sin(phase) * .16, -.48 + Math.sin(phase + .5) * .4, -.2);
      hero.position.set(heroX, heroY + Math.sin(phase) * .035, 0);
      plates.forEach((plate, index) => {
        const lane = index - 1, opening = .5 - .5 * Math.cos(phase);
        plate.position.set(lane * (.14 + opening * .16), lane * (.06 + opening * .09), lane * (.2 + opening * .19));
        plate.rotation.y = lane * (.15 + opening * .24);
        plate.rotation.z = lane * (.18 + opening * .12);
      });
      renderer.render(scene, camera); host.dataset.renderCount = String(++renders);
    };
    const animate = (timestamp: number) => {
      frame = 0;
      if (disposed || contextUnavailable || !visible || document.hidden || isPaused()) { lastTime = 0; return; }
      if (lastTime) elapsed += Math.min((timestamp - lastTime) / 1000, .1); lastTime = timestamp;
      if (timestamp - lastRender >= 1000 / (coarse.matches ? 24 : 30)) { render(); lastRender = timestamp; }
      frame = requestAnimationFrame(animate);
    };
    const syncMotion = () => {
      cancelAnimationFrame(frame); frame = 0; lastTime = 0;
      if (!disposed && !contextUnavailable && visible && !document.hidden && !isPaused()) frame = requestAnimationFrame(animate);
    };
    const resize = () => {
      const { width, height } = host.getBoundingClientRect(); if (!width || !height) return;
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
      const viewHeight = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), narrow = camera.aspect < 1.35;
      hero.scale.setScalar(viewHeight * (narrow ? .30 : .36));
      heroX = viewHeight * camera.aspect * (narrow ? .13 : .25);
      heroY = viewHeight * (narrow ? .19 : .16); render();
    };
    const resizeObserver = new ResizeObserver(resize);
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncMotion(); });
    const contextLost = (event: Event) => { event.preventDefault(); contextUnavailable = true; syncMotion(); onContextLost(); };
    const releaseResources = cleanup;
    const dispose = () => {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame); resizeObserver.disconnect(); visibility.disconnect();
      document.removeEventListener("visibilitychange", syncMotion); renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      releaseResources(); delete host.dataset.renderCount;
    };
    cleanup = dispose; resizeObserver.observe(host); visibility.observe(host);
    document.addEventListener("visibilitychange", syncMotion); renderer.domElement.addEventListener("webglcontextlost", contextLost);
    resize(); return { syncMotion, dispose };
  } catch (error) { cleanup(); throw error; }
}
