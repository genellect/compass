import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type { SculptureKind } from "./ProductSculpture";
import { PLATFORM_GLYPHS } from "./platform-glyphs";

export function mountSculpture(host: HTMLDivElement, kind: SculptureKind, isPaused: () => boolean, onReady: () => void) {
  const lightStage = kind === "library";
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = lightStage ? 1.0 : 1.3;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, 0, 8.4);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();

  const key = new THREE.DirectionalLight(0xe8f4ff, 5);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(lightStage ? 0xa4bddb : 0x638cff, 3.5);
  rim.position.set(4, 1, -2);
  scene.add(rim);
  const soft = new THREE.DirectionalLight(0xfff4e6, 2);
  soft.position.set(-4, -2, 2);
  scene.add(soft);

  const chrome = new THREE.MeshPhysicalMaterial({ color: 0xd5dce7, metalness: 1, roughness: 0.19, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.8, side: THREE.DoubleSide });
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x294cba, metalness: 0.88, roughness: 0.22, clearcoat: 1, envMapIntensity: 2, side: THREE.DoubleSide });
  const porcelain = new THREE.MeshPhysicalMaterial({ color: 0xf3f5fa, metalness: 0.4, roughness: 0.23, clearcoat: 1, envMapIntensity: 1.25 });
  const darkMetal = new THREE.MeshPhysicalMaterial({ color: 0x313954, metalness: 0.95, roughness: 0.2, clearcoat: 1, envMapIntensity: 1.6 });
  const portalViolet = new THREE.MeshPhysicalMaterial({ color: 0x7568da, metalness: 0.7, roughness: 0.24, clearcoat: 1, envMapIntensity: 1.7, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
  const sculpture = new THREE.Group();
  scene.add(sculpture);
  const moving: THREE.Object3D[] = [];
  const interactiveRibbons: { mesh: THREE.Mesh; material: THREE.ShaderMaterial; lane: number; phase: number }[] = [];
  const manifestoFrames: { frame: THREE.Group; depth: number; phase: number }[] = [];
  const manifestoGold = new THREE.MeshPhysicalMaterial({ color: 0xd6ac69, metalness: 0.76, roughness: 0.2, clearcoat: 1, envMapIntensity: 1.65 });
  const manifestoTraceMaterial = new THREE.MeshBasicMaterial({ color: 0x91e5df, transparent: true, opacity: 0.48, toneMapped: false });
  let manifestoTrace: THREE.Group | null = null;

  if (kind === "interactive") {
    // Kinetic Weave: many independent signals become one responsive field,
    // then open again. The meaning lives in the choreography, not a literal
    // icon, while the translucent material keeps the composition quiet.
    const ribbonGeometry = new THREE.PlaneGeometry(6.2, 0.17, 96, 2);
    for (let index = 0; index < 21; index++) {
      const lane = (index - 10) / 10;
      const phase = index / 21 * Math.PI * 2;
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uLane: { value: lane },
          uPhase: { value: phase },
          uEnergy: { value: 0.5 }
        },
        vertexShader: `
          uniform float uTime;
          uniform float uLane;
          uniform float uPhase;
          uniform float uEnergy;
          varying vec2 vUv;
          varying float vWave;
          void main(){
            vUv=uv;
            vec3 p=position;
            float distanceFromCentre=abs(p.x)/3.1;
            float spread=smoothstep(.08,1.,distanceFromCentre);
            float convergence=.16+spread*.96;
            float wave=sin(p.x*1.18-uTime*.52+uPhase);
            float counter=cos(p.x*.72+uTime*.31-uPhase*.72);
            p.y+=uLane*1.35*convergence+wave*(.08+.13*spread);
            p.z+=counter*(.36+.24*uEnergy)+sin(p.x*1.65+uPhase)*.1+uLane*.18;
            p.x+=sin(uTime*.18+uPhase)*.1*(1.-spread);
            vWave=.5+.5*counter;
            gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
          }`,
        fragmentShader: `
          uniform float uLane;
          uniform float uPhase;
          uniform float uEnergy;
          varying vec2 vUv;
          varying float vWave;
          void main(){
            vec3 silver=vec3(.79,.86,.93);
            vec3 cyan=vec3(.25,.79,.84);
            vec3 violet=vec3(.39,.31,.76);
            float chroma=.5+.5*sin(uPhase*1.7+vUv.x*4.2);
            vec3 colour=mix(mix(violet,cyan,chroma),silver,.32+vWave*.28);
            float edge=smoothstep(0.,.15,vUv.y)*smoothstep(0.,.15,1.-vUv.y);
            float longitudinal=smoothstep(0.,.08,vUv.x)*smoothstep(0.,.08,1.-vUv.x);
            float sheen=.58+.42*sin(vUv.x*11.+uPhase+vWave*1.4);
            gl_FragColor=vec4(colour*(.76+sheen*.32),edge*longitudinal*(.34+uEnergy*.28));
            #include <colorspace_fragment>
          }`
      });
      const mesh = new THREE.Mesh(ribbonGeometry, material);
      mesh.rotation.x = -0.08 + lane * 0.18;
      mesh.rotation.z = lane * 0.035;
      mesh.position.z = lane * 0.055;
      sculpture.add(mesh);
      interactiveRibbons.push({ mesh, material, lane, phase });
    }
    sculpture.rotation.set(-0.18, 0.35, -0.18);
  } else if (kind === "library") {
    const plate = new RoundedBoxGeometry(2.2, 0.115, 1.36, 4, 0.055);
    for (let i = 0; i < 13; i++) {
      const mesh = new THREE.Mesh(plate, i % 5 === 0 ? blue : i % 3 === 0 ? chrome : porcelain);
      mesh.position.y = (i - 6) * 0.18;
      mesh.rotation.y = (i - 6) * 0.15;
      sculpture.add(mesh);
      moving.push(mesh);
    }
    sculpture.rotation.set(0.48, -0.4, -0.3);
  } else if (kind === "platform") {
    chrome.color.setHex(0x43d9ef);
    chrome.metalness = 0.65;
    chrome.roughness = 0.32;
    chrome.clearcoat = 0.3;
    chrome.envMapIntensity = 1;
    blue.color.setHex(0x6652e8);
    blue.metalness = 0.65;
    blue.roughness = 0.32;
    blue.clearcoat = 0.3;
    blue.envMapIntensity = 1;
    renderer.toneMappingExposure = 1.05;
    key.intensity = 2;
    rim.intensity = 2;
    soft.intensity = 1;
    for (const [index, outline] of PLATFORM_GLYPHS.entries()) {
      const svg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${outline}" fill-rule="evenodd"/></svg>`);
      const shapes = svg.paths.flatMap(path => SVGLoader.createShapes(path));
      const geometry = new THREE.ExtrudeGeometry(shapes, { depth: 22, bevelEnabled: true, bevelSize: 3, bevelThickness: 3, bevelSegments: 4, curveSegments: 24, steps: 1 });
      geometry.scale(0.01, -0.01, 0.01);
      geometry.center();
      const glyph = new THREE.Mesh(geometry, index ? [blue, chrome] : [chrome, blue]);
      glyph.position.x = index ? 0.48 : -0.48;
      sculpture.add(glyph);
      moving.push(glyph);
    }
    // The front is legible immediately, including with reduced motion.
    sculpture.rotation.set(-0.07, -0.12, -0.025);
  } else {
    // An open sequence of imperfect frames suggests possible futures rather
    // than a single answer. The viewer looks through the sculpture, so its
    // depth acts as a quiet invitation into the manifesto.
    const horizontal = new RoundedBoxGeometry(2.5, 0.11, 0.12, 4, 0.045);
    const vertical = new RoundedBoxGeometry(0.11, 1.66, 0.12, 4, 0.045);
    const frameMaterials = [chrome, portalViolet, darkMetal, manifestoGold, blue];
    for (let index = 0; index < 10; index++) {
      const frame = new THREE.Group();
      const material = frameMaterials[index % frameMaterials.length];
      const top = new THREE.Mesh(horizontal, material);
      const bottom = new THREE.Mesh(horizontal, material);
      const left = new THREE.Mesh(vertical, material);
      const right = new THREE.Mesh(vertical, material);
      top.position.y = 0.82;
      bottom.position.y = -0.82;
      left.position.x = -1.2;
      right.position.x = 1.2;
      // Alternating openings keep the object from becoming a literal tunnel.
      if (index % 3 !== 0) frame.add(top);
      if (index % 4 !== 1) frame.add(bottom);
      frame.add(left, right);
      const depth = -2.8 + index * 0.62;
      const phase = index / 10 * Math.PI * 2;
      frame.position.z = depth;
      frame.scale.setScalar(0.54 + index * 0.055);
      sculpture.add(frame);
      manifestoFrames.push({ frame, depth, phase });
    }
    manifestoTrace = new THREE.Group();
    for (let index = 0; index < 3; index++) {
      const offset = (index - 1) * 0.34;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.9, -0.6 + offset, -3.1),
        new THREE.Vector3(-0.7, 0.34 + offset * 0.45, -1.2),
        new THREE.Vector3(0.32, -0.12 + offset * 0.2, 0.55),
        new THREE.Vector3(1.72, 0.58 + offset, 2.85)
      ]);
      manifestoTrace.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 72, 0.012, 6, false), manifestoTraceMaterial));
    }
    sculpture.add(manifestoTrace);
    sculpture.rotation.set(-0.13, 0.18, -0.08);
  }

  const targetPointer = new THREE.Vector2();
  const pointer = new THREE.Vector2();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = window.matchMedia("(pointer: coarse)");
  let visible = false;
  let time = 0;
  let last = 0;
  let frame = 0;
  let destroyed = false;
  let contextLost = false;
  let lastPaused = false;
  let needsRender = true;
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = camera.aspect < 0.9 ? 9.5 : 8.4;
    camera.updateProjectionMatrix();
    sculpture.position.set(kind === "interactive" ? 0.5 : 0.52, kind === "interactive" ? 0.68 : 0.08, 0);
    sculpture.scale.setScalar(kind === "interactive" ? 1.18 : 1.12);
    if (width < 450) {
      sculpture.position.set(0.18, 0.72, 0);
      sculpture.scale.setScalar(kind === "interactive" ? 1.12 : 1.03);
    }
    if (kind === "interactive") camera.position.z = camera.aspect < 0.82 ? 9.1 : 8.15;
    if (kind === "platform") {
      camera.position.z = 5.2;
      sculpture.position.set(0, 0, 0);
      // The frontmost copy may overlap this field; the shade protects contrast.
      sculpture.scale.setScalar(Math.min(1.95, camera.aspect * 1.35));
      camera.updateProjectionMatrix();
    }
    needsRender = true;
    schedule();
  };
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(host);
  resize();
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    last = 0;
    if (visible) schedule();
  });
  visibility.observe(host);
  const onPointer = (event: PointerEvent) => {
    if (coarse.matches || reduced.matches) return;
    const rect = host.getBoundingClientRect();
    targetPointer.set((event.clientX - rect.left) / rect.width - 0.5, (event.clientY - rect.top) / rect.height - 0.5);
    if (kind === "platform") targetPointer.clampScalar(-0.5, 0.5);
  };
  const resetPointer = () => targetPointer.set(0, 0);
  const card = host.closest("article");
  card?.addEventListener("pointermove", onPointer as EventListener);
  card?.addEventListener("pointerleave", resetPointer);

  function schedule() {
    if (!frame && !destroyed && !contextLost && visible && !document.hidden &&
      (needsRender || (!reduced.matches && !isPaused()))) frame = requestAnimationFrame(draw);
  }
  function draw(now: number) {
    frame = 0;
    if (destroyed || contextLost || !visible || document.hidden) return;
    const paused = reduced.matches || isPaused();
    const interval = coarse.matches ? 1000 / 24 : 1000 / 40;
    if (last && now - last < interval) { schedule(); return; }
    const delta = last ? Math.min((now - last) / 1000, 0.08) : 0;
    last = now;
    if (!paused) {
      time += delta;
      pointer.lerp(targetPointer, 0.055);
      if (kind === "interactive") {
        const cycle = time * Math.PI * 2 / 10.4;
        const pulse = 0.5 + 0.5 * Math.sin(cycle - 0.45);
        const energy = pulse * pulse * (3 - 2 * pulse);
        sculpture.rotation.x = -0.18 + Math.sin(cycle * 0.37) * 0.055 + pointer.y * 0.11;
        sculpture.rotation.y = 0.35 + Math.sin(cycle * 0.31) * 0.12 + pointer.x * 0.18;
        sculpture.rotation.z = -0.18 + Math.sin(cycle * 0.23) * 0.055;
        interactiveRibbons.forEach(({ mesh, material, lane, phase }, index) => {
          material.uniforms.uTime.value = time;
          material.uniforms.uEnergy.value = energy;
          mesh.position.y = Math.sin(cycle * 0.58 + phase) * 0.045;
          mesh.position.z = lane * 0.055 + Math.cos(cycle * 0.42 - phase) * 0.075;
          mesh.rotation.x = -0.08 + lane * 0.18 + Math.sin(cycle * 0.4 + phase) * 0.04;
          mesh.rotation.z = lane * 0.035 + Math.sin(cycle * 0.28 + index * 0.21) * 0.026;
        });
      } else if (kind === "library") {
        sculpture.rotation.y = -0.4 + Math.sin(time * 0.23) * 0.38 + pointer.x * 0.2;
        moving.forEach((plate, i) => {
          plate.rotation.y = (i - 6) * (0.16 + Math.sin(time * 0.42) * 0.10);
          plate.position.y = (i - 6) * (0.18 + (1 + Math.sin(time * 0.42)) * 0.025);
        });
      } else if (kind === "platform") {
        const phase = time * Math.PI * 2 / 8;
        sculpture.rotation.x = -0.07 + pointer.y * 0.1745;
        sculpture.rotation.y = -0.12 + pointer.x * 0.1745;
        moving.forEach((glyph, i) => {
          const wave = Math.sin(phase) * (i ? -1 : 1);
          // A full turn with a readable hold at the beginning/end of each cycle.
          const turn = THREE.MathUtils.clamp(((time % 8) / 8 - 0.12 - i * 0.06) / 0.68, 0, 1);
          const eased = turn * turn * turn * (turn * (turn * 6 - 15) + 10);
          glyph.rotation.y = eased * Math.PI * 2;
          glyph.rotation.z = wave * 0.1396;
          glyph.position.y = wave * 0.06;
          glyph.position.z = wave * 0.2;
        });
      } else {
        const cycle = time * Math.PI * 2 / 10.8;
        sculpture.rotation.x = -0.13 + Math.sin(cycle * 0.36) * 0.065 + pointer.y * 0.11;
        sculpture.rotation.y = 0.18 + Math.sin(cycle * 0.3) * 0.12 + pointer.x * 0.16;
        sculpture.rotation.z = -0.08 + Math.sin(cycle * 0.24) * 0.045;
        manifestoFrames.forEach(({ frame, depth, phase }, index) => {
          const wave = Math.sin(cycle * 1.12 - phase);
          frame.position.z = depth + wave * 0.2;
          frame.position.x = Math.sin(cycle * 0.48 + phase) * (0.08 + index * 0.008);
          frame.position.y = Math.cos(cycle * 0.42 + phase) * 0.07;
          frame.rotation.z = wave * 0.12 + Math.sin(cycle * 0.24 + phase) * 0.05;
          frame.rotation.y = Math.sin(cycle * 0.68 - phase) * 0.16;
        });
        if (manifestoTrace) {
          manifestoTrace.position.z = Math.sin(cycle * 0.62) * 0.22;
          manifestoTrace.rotation.z = Math.sin(cycle * 0.4) * 0.08;
          manifestoTraceMaterial.opacity = 0.28 + (0.5 + 0.5 * Math.sin(cycle - 0.5)) * 0.34;
        }
      }
    }
    if (!paused || needsRender || lastPaused !== paused) {
      renderer.render(scene, camera);
      needsRender = false;
    }
    lastPaused = paused;
    schedule();
  }
  const onVisibility = () => { last = 0; schedule(); };
  const onMotion = () => {
    if (kind === "interactive" && reduced.matches) {
      sculpture.rotation.set(-0.18, 0.35, -0.18);
      interactiveRibbons.forEach(({ mesh, material, lane }) => {
        material.uniforms.uTime.value = 1.35;
        material.uniforms.uEnergy.value = 0.58;
        mesh.position.set(0, 0, lane * 0.055);
        mesh.rotation.set(-0.08 + lane * 0.18, 0, lane * 0.035);
      });
    }
    if (kind === "platform" && reduced.matches) {
      sculpture.rotation.set(-0.07, -0.12, -0.025);
      moving.forEach(glyph => { glyph.rotation.set(0, 0, 0); glyph.position.y = 0; glyph.position.z = 0; });
    }
    if (kind === "manifesto" && reduced.matches) {
      sculpture.rotation.set(-0.13, 0.18, -0.08);
      manifestoFrames.forEach(({ frame, depth }) => {
        frame.position.set(0, 0, depth);
        frame.rotation.set(0, 0, 0);
      });
      if (manifestoTrace) {
        manifestoTrace.position.set(0, 0, 0);
        manifestoTrace.rotation.set(0, 0, 0);
        manifestoTraceMaterial.opacity = 0.46;
      }
    }
    last = 0; needsRender = true; schedule();
  };
  const onLost = (event: Event) => { event.preventDefault(); contextLost = true; host.dataset.ready = "false"; };
  const onRestored = () => { contextLost = false; host.dataset.ready = "true"; needsRender = true; schedule(); };
  document.addEventListener("visibilitychange", onVisibility);
  reduced.addEventListener("change", onMotion);
  host.addEventListener("sculpture-motion-change", onMotion);
  renderer.domElement.addEventListener("webglcontextlost", onLost);
  renderer.domElement.addEventListener("webglcontextrestored", onRestored);
  renderer.render(scene, camera);
  onReady();

  return () => {
    destroyed = true;
    cancelAnimationFrame(frame);
    visibility.disconnect();
    sizeObserver.disconnect();
    card?.removeEventListener("pointermove", onPointer as EventListener);
    card?.removeEventListener("pointerleave", resetPointer);
    document.removeEventListener("visibilitychange", onVisibility);
    reduced.removeEventListener("change", onMotion);
    host.removeEventListener("sculpture-motion-change", onMotion);
    renderer.domElement.removeEventListener("webglcontextlost", onLost);
    renderer.domElement.removeEventListener("webglcontextrestored", onRestored);
    const geometries = new Set<THREE.BufferGeometry>();
    scene.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) geometries.add(object.geometry); });
    geometries.forEach((geometry) => geometry.dispose());
    interactiveRibbons.forEach(({ material }) => material.dispose());
    [chrome, blue, porcelain, darkMetal, portalViolet, manifestoGold, manifestoTraceMaterial].forEach((material) => material.dispose());
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
