import {
  AgXToneMapping, AnimationMixer, Color, HemisphereLight, LinearFilter, LinearSRGBColorSpace, SRGBColorSpace,
  Mesh, MeshStandardMaterial, PerspectiveCamera, PMREMGenerator,
  Scene, ShaderChunk, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget,
  type Material, type Object3D, type Texture,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type HallController = { setPaused: (paused: boolean) => void; dispose: () => void };
const ASSETS = "/interactive/future-hall/";
const MAX_PIXELS = 2_300_000;

/** Releases shared geometry, skinning textures and material maps exactly once. */
function release(root: Object3D, ownedTargets: Set<Texture> = new Set()) {
  const geometries = new Set<Mesh["geometry"]>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse(object => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    if ("skeleton" in mesh) (mesh as Mesh & { skeleton: { dispose(): void } }).skeleton.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
  });
  materials.forEach(material => {
    Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
    material.dispose();
  });
  textures.forEach(texture => {
    if (ownedTargets.has(texture)) return;
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) texture.image.close();
    texture.dispose();
  });
  geometries.forEach(geometry => geometry.dispose());
}

/** Cycles irradiance keeps contact shadows; Three retains view-dependent PBR reflections. */
function restoreBakedLight(material: MeshStandardMaterial) {
  if (!material.userData.future_hall_baked_full || !material.emissiveMap) return;
  material.lightMap = material.emissiveMap;
  // New atlases encode irradiance as sRGB for shadow precision. Legacy linear
  // atlases must not inherit the sRGB label from glTF's emission transport.
  material.lightMap.colorSpace = material.userData.future_hall_lightmap_encoding === "srgb" ? SRGBColorSpace : LinearSRGBColorSpace;
  material.lightMap.needsUpdate = true;
  material.lightMapIntensity = Math.PI * (material.userData.future_hall_lightmap_scale ?? 1);
  material.emissiveMap = null;
  const original = material.userData.future_hall_emissive as number[] | undefined;
  material.emissive.setRGB(original?.[0] ?? 0, original?.[1] ?? 0, original?.[2] ?? 0);
  material.emissiveIntensity = 1;
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <lights_fragment_maps>", ShaderChunk.lights_fragment_maps.replace(
        "iblIrradiance += getIBLIrradiance( geometryNormal );", ""
      ))
      .replace("#include <lights_fragment_begin>", "#include <lights_fragment_begin>\nirradiance = vec3( 0.0 );")
      .replace("#include <lights_fragment_end>", "#include <lights_fragment_end>\nreflectedLight.directDiffuse = vec3( 0.0 );\nreflectedLight.directSpecular = vec3( 0.0 );");
  };
  material.customProgramCacheKey = () => "future-hall-cycles-full-v1";
  material.needsUpdate = true;
}

export async function createFutureHall(host: HTMLElement, signal: AbortSignal, onFallback: () => void): Promise<HallController> {
  const started = performance.now();
  const stage = (name: string) => { host.dataset.loadStage = name; host.dataset.loadElapsed = String(Math.round(performance.now() - started)); };
  stage("renderer");
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  const assetRequest = new AbortController();
  const abortAssets = () => assetRequest.abort(signal.reason);
  signal.addEventListener("abort", abortAssets, { once: true });
  if (signal.aborted) abortAssets();
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = Math.pow(2, -.3);
  renderer.info.autoReset = false;
  const canvas = renderer.domElement;
  canvas.className = "future-hall__canvas";
  canvas.setAttribute("aria-hidden", "true");
  const scene = new Scene();
  scene.background = new Color(0x050b13);
  const camera = new PerspectiveCamera(45, 1.6, .1, 250);
  const cameraPosition = new Vector3(-7.8, 4.9, -12.4);
  const target = new Vector3(3, 3.2, 5);
  let authoredFov = 2 * Math.atan(36 / 1.6 / (2 * 24));
  let environment: WebGLRenderTarget | undefined;
  let exteriorEnvironment: WebGLRenderTarget | undefined;
  let sky: Texture | undefined;
  let mixer: AnimationMixer | undefined;
  const lightSurfaces = new Set<MeshStandardMaterial>();
  const composer = new EffectComposer(renderer);
  const scenePass = new RenderPass(scene, camera);
  const outputPass = new OutputPass();
  composer.addPass(scenePass); composer.addPass(outputPass);
  let disposed = false, frame = 0, previous = 0, paused = false, intersecting = true, elapsed = 0, count = 0;
  let resizeObserver: ResizeObserver | undefined;
  let visibilityObserver: IntersectionObserver | undefined;
  const desiredPointer = new Vector2(), pointer = new Vector2(), cameraOffset = new Vector3();
  const hero = host.closest<HTMLElement>("section")!;
  const stop = () => { cancelAnimationFrame(frame); frame = 0; previous = 0; };
  function dispose() {
    if (disposed) return;
    disposed = true; stop();
    signal.removeEventListener("abort", abortAssets); assetRequest.abort();
    resizeObserver?.disconnect(); visibilityObserver?.disconnect();
    document.removeEventListener("visibilitychange", sync);
    hero.removeEventListener("pointermove", onPointer); hero.removeEventListener("pointerleave", resetPointer);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    mixer?.stopAllAction();
    if (mixer) mixer.uncacheRoot(mixer.getRoot());
    const ownedTargets = new Set<Texture>();
    if (exteriorEnvironment) ownedTargets.add(exteriorEnvironment.texture);
    release(scene, ownedTargets);
    environment?.dispose(); exteriorEnvironment?.dispose(); sky?.dispose(); scene.clear();
    scenePass.dispose(); outputPass.dispose(); composer.dispose();
    renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
  }
  function onContextLost(event: Event) {
    event.preventDefault();
    host.dataset.renderState = "fallback"; host.dataset.motionState = "paused";
    dispose(); onFallback();
  }
  function onPointer(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    const rect = host.getBoundingClientRect();
    desiredPointer.set((event.clientX - rect.left) / rect.width - .5, (event.clientY - rect.top) / rect.height - .5);
  }
  function resetPointer() { desiredPointer.set(0, 0); }
  function render(delta = 0) {
    if (disposed) return;
    elapsed += delta;
    mixer?.update(delta);
    lightSurfaces.forEach(material => { material.emissiveIntensity = 1 + .018 * Math.sin(elapsed * .24); });
    pointer.lerp(desiredPointer, .04);
    cameraOffset.set(
      pointer.x * .12 + .28 * Math.sin(elapsed * .18),
      -pointer.y * .06 + .025 * Math.sin(elapsed * .12),
      .18 * Math.sin(elapsed * .12),
    );
    camera.position.copy(cameraPosition).add(cameraOffset);
    camera.lookAt(target);
    renderer.info.reset();
    composer.render();
    host.dataset.frameCount = String(++count);
    host.dataset.sceneTime = elapsed.toFixed(2);
    host.dataset.drawCalls = String(renderer.info.render.calls);
    host.dataset.triangles = String(renderer.info.render.triangles);
  }
  function animate(timestamp: number) {
    if (disposed) return;
    if (!previous || timestamp - previous >= 1000 / 30) {
      const delta = previous ? Math.min((timestamp - previous) / 1000, .1) : 0;
      previous = timestamp; render(delta);
    }
    frame = requestAnimationFrame(animate);
  }
  function sync() {
    stop();
    if (disposed) return;
    if (!paused && intersecting && document.visibilityState === "visible") {
      host.dataset.motionState = "running"; frame = requestAnimationFrame(animate);
    } else host.dataset.motionState = "paused";
  }
  try {
    stage("asset-fetch");
    const load = async (file: string) => {
      const response = await fetch(ASSETS + file, { signal: assetRequest.signal });
      if (!response.ok) throw new Error("Lecture hall asset unavailable");
      return response.arrayBuffer();
    };
    // A failed sky or reflection asset can fall back before decoding the model.
    const [bytes, hdrBytes, skyBytes] = await Promise.all([
      load("lecture-hall.glb"), load("room-light.hdr"), load("sky.hdr"),
    ]);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    stage("model-parse");
    const asset = await loader.parseAsync(bytes, ASSETS);
    stage("model-ready");
    scene.add(asset.scene);
    asset.scene.updateMatrixWorld(true);
    const authoredCamera = asset.cameras.find(value => value instanceof PerspectiveCamera) as PerspectiveCamera | undefined;
    if (authoredCamera) {
      authoredCamera.getWorldPosition(cameraPosition);
      authoredCamera.getWorldDirection(target).multiplyScalar(20).add(cameraPosition);
      authoredFov = authoredCamera.fov * Math.PI / 180;
    }
    signal.throwIfAborted();
    asset.scene.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material instanceof MeshStandardMaterial) {
          restoreBakedLight(material);
          if (/^(warm|cyan)/.test(material.name)) lightSurfaces.add(material);
        }
      }
    });
    const hdr = new HDRLoader().parse(hdrBytes);
    // HDRLoader.parse returns pixel data; load it into the supported DataTexture shape.
    const { DataTexture, EquirectangularReflectionMapping } = await import("three");
    const texture = new DataTexture(hdr.data, hdr.width, hdr.height, hdr.format, hdr.type);
    if (hdr.colorSpace) texture.colorSpace = hdr.colorSpace;
    // Preserve HDRLoader's top-to-bottom orientation and linear filtering.
    texture.flipY = true; texture.minFilter = LinearFilter; texture.magFilter = LinearFilter;
    texture.mapping = EquirectangularReflectionMapping; texture.needsUpdate = true;
    const pmrem = new PMREMGenerator(renderer);
    stage("lighting-prefilter");
    environment = pmrem.fromEquirectangular(texture);
    texture.dispose(); pmrem.dispose();
    scene.environment = environment.texture;
    const skyData = new HDRLoader().parse(skyBytes);
    sky = new DataTexture(skyData.data, skyData.width, skyData.height, skyData.format, skyData.type);
    if (skyData.colorSpace) sky.colorSpace = skyData.colorSpace;
    sky.flipY = true; sky.minFilter = LinearFilter; sky.magFilter = LinearFilter;
    sky.mapping = EquirectangularReflectionMapping; sky.needsUpdate = true;
    scene.background = sky;
    const exteriorPmrem = new PMREMGenerator(renderer);
    stage("sky-prefilter");
    exteriorEnvironment = exteriorPmrem.fromEquirectangular(sky); exteriorPmrem.dispose();
    asset.scene.traverse(object => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || !mesh.morphTargetInfluences) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (material instanceof MeshStandardMaterial) material.envMap = exteriorEnvironment!.texture;
      }
    });
    signal.throwIfAborted();
    // Static interior diffuse lighting is baked; this fills the animated water.
    scene.add(new HemisphereLight(0xd5dfdf, 0x302b25, .4));
    mixer = new AnimationMixer(asset.scene);
    for (const clip of asset.animations) mixer.clipAction(clip).play();
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height || disposed) return;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(MAX_PIXELS / (width * height))));
      renderer.setSize(width, height, false);
      composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(width, height);
      camera.aspect = width / height;
      // The exported Blender camera is the single source of composition.
      camera.fov = 2 * Math.atan(Math.tan(authoredFov / 2) * Math.min(1, 1.6 / camera.aspect)) * 180 / Math.PI;
      camera.updateProjectionMatrix(); render();
      host.dataset.renderPixels = String(canvas.width * canvas.height);
    };
    host.append(canvas);
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host);
    visibilityObserver = new IntersectionObserver(([entry]) => { intersecting = entry?.isIntersecting ?? false; sync(); });
    visibilityObserver.observe(host);
    document.addEventListener("visibilitychange", sync);
    hero.addEventListener("pointermove", onPointer, { passive: true }); hero.addEventListener("pointerleave", resetPointer);
    canvas.addEventListener("webglcontextlost", onContextLost);
    stage("first-frame");
    resize(); sync();
    stage("complete");
    return { setPaused(value) { paused = value; sync(); }, dispose };
  } catch (error) { dispose(); throw error; }
}
