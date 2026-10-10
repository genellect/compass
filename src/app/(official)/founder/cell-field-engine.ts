import * as THREE from "three";

export type CellSceneController = { dispose(): void; syncMotion(): void };

// Original deterministic artwork; not measured or reconstructed biological data.
function membraneGeometry(detail: number) {
  const geometry = new THREE.SphereGeometry(1, detail, Math.round(detail * .7));
  const positions = geometry.attributes.position, p = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    const angle = Math.atan2(p.y, p.x), radial = Math.hypot(p.x, p.y);
    // A spread cell's shallow optical surface: broad asymmetry, not a swollen orb.
    const outline = 1 + .105 * Math.sin(angle * 3 + .4) + .055 * Math.cos(angle * 5 - .8)
      + .035 * Math.sin(angle * 2 - .6);
    const edge = radial ** 4;
    const drape = .16 * Math.sin(angle * 3 + .6) * edge
      + .06 * Math.cos(angle * 6 - .9) * edge;
    const saddle = .15 * p.x * p.y + .065 * Math.sin(p.x * 4 + p.y * 2) * radial;
    const opticalFolds = .018 * Math.sin(p.x * 19 + p.y * 8 + Math.sin(p.y * 5) * 2)
      + .009 * Math.sin(p.y * 31 - p.x * 7 + Math.sin(p.x * 4));
    const thickness = .034 * p.z * (1 + .12 * Math.cos(p.x * 5 - p.y * 3));
    positions.setXYZ(i, p.x * outline * 1.24, p.y * outline * .89, thickness + drape + saddle + opticalFolds * radial);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function membraneMaterial(time: THREE.IUniform<number>) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x639ebd, metalness: .08, roughness: .22,
    transmission: .48, thickness: .08,
    attenuationColor: new THREE.Color(0x4e96d0), attenuationDistance: 2.5, ior: 1.34,
    clearcoat: .12, clearcoatRoughness: .32, side: THREE.FrontSide, envMapIntensity: .85,
    iridescence: .32, iridescenceIOR: 1.3, iridescenceThicknessRange: [140, 280],
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.cellTime = time;
    shader.vertexShader = "uniform float cellTime; varying vec3 cellSurface;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
      #include <begin_vertex>
      float drift = sin(position.x * 3.2 + position.y * 2.1 + cellTime * .25);
      transformed.z += drift * .003;
      cellSurface = position;
    `);
    shader.fragmentShader = "varying vec3 cellSurface;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `
      #include <normal_fragment_maps>
      float relief = sin(cellSurface.x * 46.0 + sin(cellSurface.y * 9.0) * 3.0)
        * cos(cellSurface.y * 39.0 + sin(cellSurface.x * 7.0) * 2.0);
      normal = normalize(normal + vec3(dFdx(relief), dFdy(relief), 0.0) * .055);
    `);
  };
  material.customProgramCacheKey = () => "cytellect-spread-membrane-v2";
  return material;
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
    const time = { value: 0 }, coarse = matchMedia("(max-width: 900px), (pointer: coarse)");
    const outerGeometry = membraneGeometry(coarse.matches ? 96 : 128);
    geometries.add(outerGeometry);
    const membrane = membraneMaterial(time); materials.add(membrane);
    const hero = new THREE.Mesh(outerGeometry, membrane);
    scene.add(hero); host.appendChild(renderer.domElement);
    let visible = false, disposed = false, contextUnavailable = false;
    let frame = 0, lastTime = 0, lastRender = 0, elapsed = 0, renders = 0, heroX = 0, heroY = 0;
    const render = () => {
      if (disposed || contextUnavailable) return;
      const phase = elapsed * Math.PI * 2 / 16; time.value = elapsed;
      // Reveal thickness by changing incidence, never by inflating the silhouette.
      hero.rotation.set(.82 + Math.sin(phase) * .19, -.32 + Math.sin(phase + .6) * .28, -.38 + Math.sin(phase - .4) * .1);
      hero.position.set(heroX + Math.sin(phase) * .055, heroY + Math.sin(phase + .5) * .05, 0);
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
      hero.scale.setScalar(viewHeight * (narrow ? .30 : .45));
      heroX = viewHeight * camera.aspect * (narrow ? .16 : .23);
      heroY = viewHeight * (narrow ? .2 : .18); render();
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
