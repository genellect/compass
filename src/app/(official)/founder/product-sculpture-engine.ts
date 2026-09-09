import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import type { SculptureKind } from "./ProductSculpture";
import { PLATFORM_GLYPHS } from "./platform-glyphs";

// A closed, bevelled ribbon swept along a three-lobed spatial curve. The profile,
// torsion and changing width are modelled here rather than loaded from a stock asset.
class FoldedOrbit extends THREE.Curve<THREE.Vector3> {
  constructor(private phase = 0, private form = 1) { super(); }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    const r = 1.30 + 0.42 * Math.cos(3 * a + this.phase);
    return target.set(r * Math.cos(2 * a), r * Math.sin(2 * a), 0.66 * Math.sin(3 * a + this.phase) * this.form);
  }
}

function ribbonGeometry(phase: number, form = 1) {
  const curve = new FoldedOrbit(phase, form);
  const segments = 240;
  const sides = 16;
  const frames = curve.computeFrenetFrames(segments, true);
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const twist = Math.sin(t * Math.PI * 6 + phase) * 0.48;
    const n = frames.normals[i].clone().applyAxisAngle(frames.tangents[i], twist);
    const b = new THREE.Vector3().crossVectors(frames.tangents[i], n);
    const width = 0.24 + 0.075 * Math.sin(t * Math.PI * 6 + phase);
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      // Superellipse gives a broad machined face with soft, reflective edges.
      const x = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.42) * width;
      const y = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.42) * 0.065;
      const v = p.clone().addScaledVector(n, x).addScaledVector(b, y);
      vertices.push(v.x, v.y, v.z);
      if (i < segments && j < sides) {
        const k = i * (sides + 1) + j;
        indices.push(k, k + sides + 1, k + 1, k + 1, k + sides + 1, k + sides + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

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
  const sculpture = new THREE.Group();
  scene.add(sculpture);
  const moving: THREE.Object3D[] = [];
  const inferenceField = new THREE.Group();
  const signals: THREE.Mesh[] = [];
  const signalPath = new FoldedOrbit(0);
  const networkMaterial = new THREE.LineBasicMaterial({ color: 0xa9c7ff, transparent: true, opacity: 0.38 });
  const signalMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe2eeff, metalness: 0.65, roughness: 0.16, emissive: 0x6b96ed, emissiveIntensity: 0.25 });

  if (kind === "interactive") {
    const ribbon = new THREE.Mesh(ribbonGeometry(0), chrome);
    sculpture.add(ribbon);
    const inner = new THREE.Mesh(ribbonGeometry(Math.PI, 0.78), blue);
    inner.scale.setScalar(0.82);
    inner.rotation.z = Math.PI / 3;
    sculpture.add(inner);
    moving.push(ribbon, inner);
    // A faceted computational core and a connected spatial mesh, not a flat
    // particle overlay. Travelling signals follow the modelled ribbon paths.
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 1), blue);
    inferenceField.add(core);
    const nodes = Array.from({ length: 56 }, (_, i) => {
      const y = 1 - 2 * (i + 0.5) / 56;
      const a = i * Math.PI * (3 - Math.sqrt(5));
      const r = Math.sqrt(1 - y * y);
      return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(0.88);
    });
    const edges: number[] = [];
    nodes.forEach((node, i) => {
      const neighbors = nodes.map((other, j) => ({ j, distance: node.distanceToSquared(other) }))
        .filter(({ j }) => j !== i).sort((a, b) => a.distance - b.distance).slice(0, 3);
      neighbors.forEach(({ j }) => {
        if (j > i) edges.push(node.x, node.y, node.z, nodes[j].x, nodes[j].y, nodes[j].z);
      });
    });
    const meshGeometry = new THREE.BufferGeometry();
    meshGeometry.setAttribute("position", new THREE.Float32BufferAttribute(edges, 3));
    inferenceField.add(new THREE.LineSegments(meshGeometry, networkMaterial));
    const dots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.026, 0), signalMaterial, nodes.length);
    const matrix = new THREE.Matrix4();
    nodes.forEach((node, i) => dots.setMatrixAt(i, matrix.makeTranslation(node.x, node.y, node.z)));
    inferenceField.add(dots);
    sculpture.add(inferenceField);
    const bead = new THREE.IcosahedronGeometry(0.043, 1);
    for (let i = 0; i < 8; i++) {
      const signal = new THREE.Mesh(bead, signalMaterial);
      signalPath.getPoint(i / 8, signal.position);
      sculpture.add(signal);
      signals.push(signal);
    }
    sculpture.rotation.set(0.4, -0.34, -0.35);
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
    const body = new THREE.Mesh(ribbonGeometry(1.2, 0.4), chrome);
    body.scale.set(1, 1, 0.85);
    sculpture.add(body);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 4), darkMetal);
    sculpture.add(core);
    moving.push(body, core);
    sculpture.rotation.set(0.3, 0.6, 0.2);
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
    sculpture.position.set(kind === "interactive" ? 0.38 : 0.52, kind === "interactive" ? 0.65 : 0.08, 0);
    sculpture.scale.setScalar(kind === "interactive" ? 1.13 : 1.12);
    if (width < 450) {
      sculpture.position.set(0.28, 0.65, 0);
      sculpture.scale.setScalar(kind === "interactive" ? 1.05 : 1.03);
    }
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
        sculpture.rotation.y = -0.34 + time * 0.12 + pointer.x * 0.2;
        sculpture.rotation.x = 0.4 + Math.sin(time * 0.28) * 0.2 + pointer.y * 0.15;
        moving[1].rotation.z = Math.PI / 3 + Math.sin(time * 0.42) * 0.48;
        moving[1].scale.setScalar(0.82 + Math.sin(time * 0.42) * 0.09);
        inferenceField.rotation.set(time * 0.17, -time * 0.23, time * 0.08);
        inferenceField.scale.setScalar(1 + Math.sin(time * 0.84) * 0.07);
        networkMaterial.opacity = 0.32 + (1 + Math.sin(time * 0.84)) * 0.12;
        signals.forEach((signal, i) => {
          signalPath.getPoint((time / 14 + i / 8) % 1, signal.position);
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
        sculpture.rotation.y = 0.6 + time * 0.09 + pointer.x * 0.18;
        moving[0].rotation.z = Math.sin(time * 0.3) * 0.32;
        moving[1].rotation.y = -time * 0.18;
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
    if (kind === "platform" && reduced.matches) {
      sculpture.rotation.set(-0.07, -0.12, -0.025);
      moving.forEach(glyph => { glyph.rotation.set(0, 0, 0); glyph.position.y = 0; glyph.position.z = 0; });
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
    [chrome, blue, porcelain, darkMetal, networkMaterial, signalMaterial].forEach((material) => material.dispose());
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
