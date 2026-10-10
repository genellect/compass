import * as THREE from "three";

export type CellSceneController = { dispose(): void; syncMotion(): void };

// Original deterministic artwork; not measured or reconstructed biological data.
function membraneGeometry(detail: number, inner = false) {
  const geometry = new THREE.SphereGeometry(1, detail, Math.round(detail * .7));
  const positions = geometry.attributes.position, p = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    const shoulder = .085 * Math.sin(p.x * 3.6 + p.y * 2.1) * Math.cos(p.z * 3.2 - .5);
    const hollow = .13 * Math.exp(-((p.x + .45) ** 2 + (p.y - .55) ** 2 + (p.z - .55) ** 2) * 7);
    const folds = inner ? .045 * Math.sin(p.x * 14 + p.z * 8) * Math.sin(p.y * 10 - p.z * 4)
      : .007 * Math.sin(p.x * 15 + p.y * 5) * Math.cos(p.z * 12 - p.y * 8);
    const radius = 1 + shoulder - hollow + folds;
    positions.setXYZ(i, p.x * radius * 1.08, p.y * radius * .86, p.z * radius * .73);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function membraneMaterial(time: THREE.IUniform<number>, secondary = false) {
  const material = new THREE.MeshPhysicalMaterial({
    color: secondary ? 0x427eb6 : 0x9ad8e9, metalness: 0, roughness: .22,
    transmission: secondary ? .5 : .88, thickness: .24,
    attenuationColor: new THREE.Color(0x6eafd6), attenuationDistance: 3.5, ior: 1.34,
    clearcoat: .25, clearcoatRoughness: .3, side: THREE.FrontSide, envMapIntensity: .65,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.cellTime = time;
    shader.vertexShader = "uniform float cellTime; varying vec3 cellSurface;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
      #include <begin_vertex>
      float drift = sin(position.x * 3.2 + position.y * 2.1 + cellTime * .55)
        * cos(position.z * 3.8 - cellTime * .38);
      transformed += objectNormal * drift * .012;
      cellSurface = position;
    `);
    shader.fragmentShader = "varying vec3 cellSurface;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `
      #include <normal_fragment_maps>
      float relief = sin(dot(cellSurface, vec3(32.0, 19.0, 27.0)))
        * cos(dot(cellSurface, vec3(-23.0, 31.0, 17.0)))
        + .45 * sin(dot(cellSurface, vec3(71.0, -43.0, 53.0)));
      normal = normalize(normal + vec3(dFdx(relief), dFdy(relief), 0.0) * .12);
    `);
  };
  material.customProgramCacheKey = () => "cytellect-membrane-field-v1";
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
    const outerGeometry = membraneGeometry(coarse.matches ? 80 : 112), innerGeometry = membraneGeometry(64, true);
    geometries.add(outerGeometry); geometries.add(innerGeometry);
    const membrane = membraneMaterial(time), distantMembrane = membraneMaterial(time, true);
    const interior = new THREE.MeshPhysicalMaterial({ color: 0x1a467d, roughness: .38, metalness: 0, clearcoat: .18, envMapIntensity: .6 });
    materials.add(membrane); materials.add(distantMembrane); materials.add(interior);
    const createCell = (shellMaterial: THREE.MeshPhysicalMaterial) => {
      const group = new THREE.Group(), inside = new THREE.Mesh(innerGeometry, interior);
      inside.scale.set(.47, .52, .49); inside.position.set(-.13, .06, -.06); inside.rotation.set(.28, -.3, .25);
      group.add(inside, new THREE.Mesh(outerGeometry, shellMaterial)); return group;
    };
    const hero = createCell(membrane), distant = createCell(distantMembrane);
    scene.add(hero, distant); host.appendChild(renderer.domElement);
    let visible = false, disposed = false, contextUnavailable = false;
    let frame = 0, lastTime = 0, lastRender = 0, elapsed = 0, renders = 0, heroX = 0, heroY = 0;
    const render = () => {
      if (disposed || contextUnavailable) return;
      const phase = elapsed * Math.PI * 2 / 14; time.value = elapsed;
      hero.rotation.set(.2 + Math.sin(phase + .6) * .14, -.28 + Math.sin(phase - .75) * .6, -.24 + Math.cos(phase) * .07);
      hero.position.set(heroX + Math.sin(phase) * .07, heroY + Math.sin(phase + .5) * .1, 0);
      distant.rotation.set(-.2, .5 - phase * .35, .28); distant.position.y = heroY + .8 + Math.cos(phase + .8) * .12;
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
      hero.scale.setScalar(viewHeight * (narrow ? .36 : .4));
      heroX = viewHeight * camera.aspect * .22; heroY = viewHeight * .08;
      distant.scale.setScalar(viewHeight * (narrow ? .18 : .2));
      distant.position.set(heroX - viewHeight * .55, heroY + .8, -2.2); render();
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
