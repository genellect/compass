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
  const interactivePieces: {
    mesh: THREE.Mesh;
    aligned: THREE.Vector3;
    scattered: THREE.Vector3;
    alignedQuaternion: THREE.Quaternion;
    scatteredRotation: THREE.Euler;
    phase: number;
  }[] = [];
  const interactiveMaterials: THREE.Material[] = [];
  const interactiveTraceMaterials: THREE.MeshBasicMaterial[] = [];
  let interactiveField: THREE.ShaderMaterial | null = null;
  let interactiveLight: THREE.PointLight | null = null;
  let interactiveTrace: THREE.Group | null = null;
  const manifestoFrames: { frame: THREE.Group; depth: number; phase: number }[] = [];
  const manifestoGold = new THREE.MeshPhysicalMaterial({ color: 0xd6ac69, metalness: 0.76, roughness: 0.2, clearcoat: 1, envMapIntensity: 1.65 });
  const manifestoTraceMaterial = new THREE.MeshBasicMaterial({ color: 0x91e5df, transparent: true, opacity: 0.48, toneMapped: false });
  let manifestoTrace: THREE.Group | null = null;

  if (kind === "interactive") {
    // Anamorphic Light Architecture: separate optical forms periodically
    // resolve into one impossible corridor. The sculpture is the changing
    // relationship between camera, depth and light—not a literal icon.
    renderer.toneMappingExposure = 1.16;
    key.intensity = 4.25;
    rim.color.setHex(0x7189e9);
    rim.intensity = 3.1;
    soft.color.setHex(0xbceff5);
    soft.intensity = 1.8;

    interactiveField = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uConvergence: { value: 0.18 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main(){
          vUv=uv;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform float uConvergence;
        varying vec2 vUv;
        float ray(vec2 p,float offset,float width){
          float axis=p.y-p.x*.46-offset;
          return exp(-pow(abs(axis)/width,2.));
        }
        void main(){
          vec2 p=(vUv-.5)*vec2(1.62,1.0);
          float drift=sin(uTime*.11)*.018;
          float core=ray(p,drift,.018+uConvergence*.008);
          float cyan=ray(p,drift-.028,.012);
          float violet=ray(p,drift+.034,.014);
          float amber=ray(p,drift+.074,.009);
          float halo=ray(p,drift,.15)*(.08+uConvergence*.18);
          float vignette=smoothstep(.92,.18,length(p*vec2(.72,1.0)));
          vec3 colour=vec3(.72,.88,.98)*core*(.26+uConvergence*.66);
          colour+=vec3(.24,.78,.84)*cyan*uConvergence*.42;
          colour+=vec3(.43,.34,.88)*violet*uConvergence*.34;
          colour+=vec3(.85,.62,.31)*amber*uConvergence*.18;
          colour+=vec3(.10,.19,.34)*halo;
          float alpha=min(1.,(core+cyan*.45+violet*.38+amber*.22+halo)*vignette);
          gl_FragColor=vec4(colour*vignette,alpha);
          #include <colorspace_fragment>
        }`
    });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 7.6), interactiveField);
    field.position.set(0.45, 0.45, -4.4);
    scene.add(field);

    const opticalCeramic = new THREE.MeshPhysicalMaterial({
      color: 0x111a2b,
      metalness: 0.72,
      roughness: 0.25,
      clearcoat: 0.84,
      clearcoatRoughness: 0.16,
      envMapIntensity: 1.7,
      side: THREE.DoubleSide
    });
    const opticalChrome = new THREE.MeshPhysicalMaterial({
      color: 0xdce6f1,
      metalness: 1,
      roughness: 0.13,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      envMapIntensity: 2.3,
      side: THREE.DoubleSide
    });
    const opticalGlass = new THREE.MeshPhysicalMaterial({
      color: 0x78d9e3,
      metalness: 0.2,
      roughness: 0.09,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 2.1,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    interactiveMaterials.push(opticalCeramic, opticalChrome, opticalGlass, interactiveField);

    const makeOpticalForm = (width: number, height: number, depth: number, cut: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(-width * 0.5 + cut, -height * 0.5);
      shape.lineTo(width * 0.5, -height * 0.5 + cut * 0.32);
      shape.lineTo(width * 0.5 - cut * 0.16, height * 0.5);
      shape.lineTo(-width * 0.5, height * 0.5 - cut * 0.46);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSegments: 3,
        bevelSize: Math.min(height * 0.09, 0.035),
        bevelThickness: Math.min(depth * 0.12, 0.035),
        curveSegments: 2,
        steps: 1
      });
      geometry.translate(0, 0, -depth * 0.5);
      return geometry;
    };

    const railX = [-1.62, -0.55, 0.55, 1.62];
    let pieceIndex = 0;
    for (const side of [-1, 1]) {
      for (const x of railX) {
        const index = pieceIndex++;
        const alignedY = x * 0.46 + side * 0.48;
        const alignedZ = (index % 4 - 1.5) * 0.36 + side * 0.12;
        const width = 1.18 + (index % 2) * 0.16;
        const height = 0.27 + (index % 3) * 0.035;
        const depth = 0.32 + (index % 2) * 0.09;
        const geometry = makeOpticalForm(width, height, depth, 0.13 + (index % 3) * 0.035);
        const material = index % 4 === 1 ? opticalGlass : index % 3 === 0 ? opticalChrome : opticalCeramic;
        const mesh = new THREE.Mesh(geometry, material);
        const aligned = new THREE.Vector3(x, alignedY, alignedZ);
        const scattered = new THREE.Vector3(
          x + (side < 0 ? -0.58 : 0.58) + Math.sin(index * 1.7) * 0.48,
          alignedY + side * (0.72 + (index % 2) * 0.24),
          alignedZ + Math.cos(index * 1.31) * 1.08
        );
        const alignedQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(side * 0.035, -alignedZ * 0.09, 0.432));
        const scatteredRotation = new THREE.Euler(
          -0.48 + index * 0.13,
          (side * 0.7) + Math.sin(index) * 0.32,
          0.06 + index * 0.39
        );
        mesh.position.copy(scattered);
        mesh.rotation.copy(scatteredRotation);
        sculpture.add(mesh);
        interactivePieces.push({ mesh, aligned, scattered, alignedQuaternion, scatteredRotation, phase: index * 0.91 });
      }
    }

    const refractorGeometry = makeOpticalForm(0.42, 1.78, 0.46, 0.12);
    const refractor = new THREE.Mesh(refractorGeometry, opticalGlass);
    const refractorAligned = new THREE.Vector3(0.08, 0.02, 0.28);
    const refractorScattered = new THREE.Vector3(2.34, -1.03, 1.18);
    const refractorRotation = new THREE.Euler(0.64, -0.78, -0.96);
    refractor.position.copy(refractorScattered);
    refractor.rotation.copy(refractorRotation);
    sculpture.add(refractor);
    interactivePieces.push({
      mesh: refractor,
      aligned: refractorAligned,
      scattered: refractorScattered,
      alignedQuaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.04, -0.08, -1.138)),
      scatteredRotation: refractorRotation,
      phase: 7.73
    });

    interactiveTrace = new THREE.Group();
    const traceColours = [0xe9fbff, 0x5ed8e1, 0x7665dc, 0xd7a95f];
    traceColours.forEach((colour, index) => {
      const offset = (index - 1.5) * 0.035;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.45, -1.14 + offset, 0.95),
        new THREE.Vector3(-0.92, -0.49 + offset, 0.32),
        new THREE.Vector3(0.74, 0.35 + offset, -0.18),
        new THREE.Vector3(2.45, 1.16 + offset, -0.82)
      ]);
      const material = new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0.02,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      const trace = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, index === 0 ? 0.018 : 0.011, 6, false), material);
      interactiveTrace?.add(trace);
      interactiveTraceMaterials.push(material);
    });
    sculpture.add(interactiveTrace);
    interactiveLight = new THREE.PointLight(0x8be4ee, 0.5, 8, 1.8);
    interactiveLight.position.set(0.15, 0.12, 1.25);
    scene.add(interactiveLight);
    sculpture.rotation.set(-0.08, 0.16, -0.04);
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
  const workingEuler = new THREE.Euler();
  const workingQuaternion = new THREE.Quaternion();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarse = window.matchMedia("(pointer: coarse)");
  let visible = false;
  let time = kind === "interactive" ? 5.15 : 0;
  let last = 0;
  let frame = 0;
  let destroyed = false;
  let contextLost = false;
  let lastPaused = false;
  let needsRender = true;
  let interactionTarget = 0;
  let interaction = 0;
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
  const onPointerEnter = () => {
    if (kind === "interactive" && !coarse.matches && !reduced.matches) interactionTarget = 0.94;
  };
  const resetPointer = () => {
    targetPointer.set(0, 0);
    interactionTarget = 0;
  };
  const card = host.closest("article");
  card?.addEventListener("pointerenter", onPointerEnter);
  card?.addEventListener("pointermove", onPointer as EventListener);
  card?.addEventListener("pointerleave", resetPointer);

  const ease = (value: number) => {
    const clamped = THREE.MathUtils.clamp(value, 0, 1);
    return clamped * clamped * (3 - 2 * clamped);
  };

  function applyInteractiveComposition(sceneTime: number, convergence: number, motionScale: number) {
    const cycle = sceneTime * Math.PI * 2 / 13;
    sculpture.rotation.x = -0.08 + Math.sin(cycle * 0.31) * 0.025 * motionScale + pointer.y * 0.055;
    sculpture.rotation.y = 0.16 + Math.sin(cycle * 0.23) * 0.045 * motionScale + pointer.x * 0.08;
    sculpture.rotation.z = -0.04 + Math.sin(cycle * 0.19) * 0.018 * motionScale;
    interactivePieces.forEach(({ mesh, aligned, scattered, alignedQuaternion, scatteredRotation, phase }, index) => {
      mesh.position.set(
        scattered.x + Math.sin(sceneTime * (0.19 + index * 0.006) + phase) * 0.11 * motionScale,
        scattered.y + Math.cos(sceneTime * (0.16 + index * 0.005) - phase) * 0.08 * motionScale,
        scattered.z + Math.sin(sceneTime * 0.13 + phase * 0.7) * 0.13 * motionScale
      ).lerp(aligned, convergence);
      workingEuler.set(
        scatteredRotation.x + Math.sin(sceneTime * 0.17 + phase) * 0.09 * motionScale,
        scatteredRotation.y + Math.cos(sceneTime * 0.14 - phase) * 0.11 * motionScale,
        scatteredRotation.z + Math.sin(sceneTime * 0.12 + phase) * 0.08 * motionScale
      );
      workingQuaternion.setFromEuler(workingEuler);
      mesh.quaternion.copy(workingQuaternion).slerp(alignedQuaternion, convergence);
      const breathing = 1 + Math.sin(sceneTime * 0.24 + phase) * 0.012 * motionScale * (1 - convergence);
      mesh.scale.setScalar(breathing);
    });
    if (interactiveTrace) {
      interactiveTrace.position.z = Math.sin(cycle * 0.42) * 0.1 * motionScale;
      interactiveTrace.rotation.y = Math.sin(cycle * 0.28) * 0.035 * motionScale;
      interactiveTrace.rotation.z = Math.sin(cycle * 0.21) * 0.016 * motionScale;
    }
    interactiveTraceMaterials.forEach((material, index) => {
      const weight = index === 0 ? 0.72 : index === 1 ? 0.46 : index === 2 ? 0.34 : 0.2;
      material.opacity = 0.015 + convergence * weight;
    });
    if (interactiveField) {
      interactiveField.uniforms.uTime.value = sceneTime;
      interactiveField.uniforms.uConvergence.value = convergence;
    }
    if (interactiveLight) interactiveLight.intensity = 0.35 + convergence * 4.1;
  }

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
        const phase = time % 13;
        const arrive = ease((phase - 3.35) / 2.2);
        const release = 1 - ease((phase - 7.25) / 2.7);
        const automatic = arrive * release;
        interaction += (interactionTarget - interaction) * Math.min(1, delta * 3.2);
        applyInteractiveComposition(time, Math.max(automatic, interaction), 1);
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
      pointer.set(0, 0);
      interaction = 0;
      interactionTarget = 0;
      applyInteractiveComposition(6.25, 0.78, 0);
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
  if (kind === "interactive") applyInteractiveComposition(5.15, 0.7, reduced.matches ? 0 : 1);
  renderer.render(scene, camera);
  onReady();

  return () => {
    destroyed = true;
    cancelAnimationFrame(frame);
    visibility.disconnect();
    sizeObserver.disconnect();
    card?.removeEventListener("pointerenter", onPointerEnter);
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
    interactiveTraceMaterials.forEach((material) => material.dispose());
    interactiveMaterials.forEach((material) => material.dispose());
    [chrome, blue, porcelain, darkMetal, portalViolet, manifestoGold, manifestoTraceMaterial].forEach((material) => material.dispose());
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
