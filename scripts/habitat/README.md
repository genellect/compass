# COMPASS root habitat — authoring

Status: **Implemented, verification pending**. Revision 3 is under visual review;
it is not an assertion of photorealism or a production release. See the release
report for actual browser, hardware and viewport measurements.

Only the root page imports `Habitat`. Its small client gate loads the Three.js
engine on screens at least 901 CSS pixels wide with a fine, hover-capable pointer.
Mobile keeps the existing page. HTML copy and links remain real DOM content.

## Authoring inputs

- Blender **4.5.13 LTS**, including its bundled Open Image Denoise library.
- The Node dependencies in the repository lockfile.
- `@gltf-transform/cli` **4.5.0**, an authoring tool, not a visitor dependency.
- The 24 checksum-pinned inputs in `source-assets.json`; licenses and authors are
  listed in [ASSET_CREDITS.md](ASSET_CREDITS.md). They are supporting assets, not
  original COMPASS photography or modelling.

`node scripts/habitat/download-sources.mjs ../habitat-source-materials` verifies
existing files and fetches only missing ones. Mismatched existing files cause an
error instead of being overwritten. Network access is confined to authoring.
The editable master packs all required material images; no private credentials,
visitor data or external service runtime is involved.

## Production of assets

1. Run `create_habitat.py` with `--source-materials`, `--output`, `--master` and
   `--bake`. This generates the full facility, nine room poses, UV0 material maps,
   UV1 occlusion atlases, raw GLBs and a packed `.blend` master.
2. Open the packed master with Blender and run `bake_indirect.py --mode full
   --include-architecture --samples 32 --output RAW_LIGHTING_DIR`. Each room has
   its own diffuse illumination and furniture shadows. The shared architecture
   uses one geometry asset with separate room lightmaps. The `top` room uses the
   map embedded in `architecture.glb`.
3. The bake script denoises linear radiance using Blender's bundled OIDN before
   glTF export. The current authoring helper resolves Blender's Windows DLLs;
   authoring on other operating systems requires configuring that library path.
   Ordinary website builds do not require Blender or OIDN.
4. Render the master with `render_master.py` for nine 1920×1080 posters and
   `render_environment.py` for its reflection panorama. Camera position, target,
   focal length and film offset correspond to the web camera.
5. Prepare the NASA Earth map using `prepare-source-materials.mjs`. Use
   `compress-assets.mjs CLI_ENTRY --directory=PUBLIC_DIR --originals=RAW_DIR
   --reuse-originals` for material WebP and Meshopt conversion. Keep the uncompressed
   sources outside `public/`. Supporting material maps are 1K; the Earth map is 4K
   and lighting atlases are 2K/4K.
   The distant skyline alone is simplified with a 0.75 target vertex ratio and
   0.0015 maximum relative geometric error before compression. The interiors and
   core retain their authored geometry. Keep the packed master and raw exports
   for lossless editing; review skyline silhouettes in the browser after export.
6. Extract room architectural maps with `prepare-lightmaps.mjs CLI_ENTRY
   RAW_LIGHTING_DIR PUBLIC_DIR`. Then run `habitat:prepare` and
   `inspect-assets.mjs REPORT_PATH`. These reject missing room posters/lightmaps,
   inconsistent asset sizes and the selected 40MB total/8MB per-model limits.

The direct/indirect diffuse bake is carried by glTF's emissive texture slot and
identified with material extras. The loader restores authored emission, binds
the texture as a light map, and prevents duplicate diffuse illumination. PBR
specular reflections remain dependent on the viewing direction. This shader
hook is specific to the installed Three.js shader chunks and needs revalidation
when Three.js changes.

## Validation

- `check-camera-path.mjs CLI_ENTRY RAW_DIR REPORT_PATH` checks the actual geometry
  along the room transitions. It does not replace reviewing the moving camera.
- `npm run test:habitat` and `npm run test:responsive:habitat` cover the section
  mapping, native scroll, fit, pause, fallbacks and Mobile network isolation.
- Run the repository gates in `AGENTS.md`. Record existing unrelated failures;
  do not modify other routes or image baselines just to make this feature green.
- `measure-scene.mjs --url=URL --out=REPORT_DIR --section=top` uses headed Edge and
  its real maximized viewport. Stop authoring/build work first. It records GPU,
  visibility, current section and fresh frame-rate samples. A DOM test or a
  headless screenshot is not evidence of hardware frame rate or visual quality.

The original 4MB initial/20MB total budgets were superseded by the user's later
quality-first Desktop direction. The selected 40MB total and 8MB/model caps are
implementation limits, not measured delivery size or a universal performance
guarantee. Report actual asset bytes and each tested hardware condition at release.
