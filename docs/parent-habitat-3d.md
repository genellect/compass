# Parent Desktop habitat

Status: Implemented, verification pending. Scope: `/` only; production publication is separate.

## Runtime and content contract

The existing parent composition is wrapped in a route-owned CSS module and a small client
gate. Only `(min-width: 901px) and (pointer: fine) and (hover: hover)` imports the Three.js
engine. Desktop CSS establishes layout before hydration to avoid a theme-induced layout
shift. Mobile keeps the existing layout and particle renderer. Fine-pointer tablets
can qualify. No user-agent identification, new API, account, database or external 3D service.

One WebGL 2 renderer shows a continuous nine-zone habitat. Native scrolling selects actual
section offsets, with a quiet reading interval and a transition near the end of each section.
`ResizeObserver` and font readiness remeasure the tour; initial hash navigation is corrected
after the Desktop layout settles unless the user has interacted. Content, destinations,
headings, disclosures, portraits and analytics remain owned by the existing components.
The user's subsequent direction explicitly permits Desktop layout, contrast and line-break
changes, then expands the scope to information hierarchy, coordinated UI motion and sound.
The Desktop journey now has five navigation chapters: Vision, Experience, Systems,
People and Connect. Systems groups Interactive, Library and Manifesto; People groups
Community and Founder. Section URLs and the original source order remain stable.
Alternating left/right compositions coordinate HTML placement, camera lens shifts and
poster framing. The Experience hub leaves a central visual interval above its four choices.
The Web camera uses the same 26mm lens / 36mm sensor framing as Blender; viewport crops
follow the poster's cover behavior. Offline shift_x values are converted to millimetres
for Three.js filmOffset, avoiding a lens-size jump when changing presentation modes.
Scroll-driven heading arrival is progressive enhancement; reading, pause and reduced-motion
states remain stable. Sound is opt-in and synthesized locally after a user gesture, with
a quiet harmonic bed and chapter cues; there is no autoplay, microphone or audio download.
The sound context closes when leaving Desktop/the route and mutes in hidden tabs.
Only the parent Interactive heading changes to `LET EVERYTHING MOVE`; both
original body paragraphs and the original CTA remain verbatim, including on Mobile.
The parent Desktop header replaces the Technology menu with a direct Interactive link
and omits Technology Core. Its suspended glass/metal surface, explicit primary/secondary
CTA hierarchy and illuminated active state are parent-owned CSS. Native links, click,
ArrowDown, Tab, Escape and focus indicators remain available. Child headers are unchanged.

Reduced motion uses section posters and never fetches GLB or the engine. The motion button
pauses the engine, preserves the choice in sessionStorage, and permits restarting after a
load failure. Failed GLB loading, missing WebGL and context loss dispose the renderer and
retain the poster and HTML. In-flight loads have a 20-second timeout and are aborted on
teardown; decoded obsolete models are disposed. A failed poster retains the preceding
poster or the solid background. There is no blocking loading screen.

The engine retains the active and neighboring zones, sharing architecture geometry and
materials, with one shared campus environment. Following the user's quality-first revision,
the default cap is 6 million pixels / DPR 2, four-sample MSAA (hardware permitting),
4096px shadows and half-resolution bloom. Two consecutive three-second samples below
28fps select the offline poster directly. Automatic degradation to visibly lower-quality
3D is not used. The internal low setting exists for explicit diagnostics only.
Samples start four seconds after model arrival and measure delivered frames, including GPU
stalls. Browser scheduling/occlusion can also cause a safe static fallback; it does not
establish a hardware benchmark.
Hidden tabs stop rendering. React state changes only when the scene state changes.

## Blender source and reproducibility

Authoring uses Blender **4.5.13 LTS**, with deterministic seed 21. All geometry and materials
are original procedural work: mineral deck, panoramic structure, titanium/porcelain core,
furniture, library shelving, botanical leaves and pendants. The revised design uses an
interior viewpoint, vaulted ceiling, stone tile joints, curved upholstery, window gaskets,
slender metal furniture and subtle glazing. Original mineral/fabric/metal surface maps are
embedded in GLB. The fictional planet texture is generated locally, with no external imagery.
One directional shadow map, an authored HDR environment map, MSAA and restrained bloom support the
Web presentation. Per-zone ambient occlusion is baked into 1K atlases; the architectural
atlas is 2K. UV0 carries surface maps and UV1 carries glTF occlusion. Shared terraces,
research towers, planted gardens and structural arches establish foreground/middle/distant
depth outside the rooms. The distant world stays fixed as the camera moves through the campus.
Cycles (48 maximum samples, adaptive threshold 0.035 / minimum 8, denoising, 1920×1080)
produces the fallback images. The first Hero render used the earlier default adaptive
threshold. A 512×256 linear Radiance HDR panorama is rendered from the same packed master
and prefiltered by Three.js at runtime, so metal reflects the authored room lighting.
These are separate
renderers: the real-time output is not a promise of offline path-traced image quality.
There are no purchased assets or add-ons, live reflection passes or full-scene refraction.

From the repository, with a Blender executable on PATH (use absolute output paths):

```sh
npm run habitat:planet
blender --background --python scripts/habitat/create_habitat.py -- \
  --output /absolute/workspace/compass/public/habitat/v1 \
  --master /absolute/workspace/deliverables/compass-habitat.blend --bake
blender --background /absolute/workspace/deliverables/compass-habitat.blend \
  --python scripts/habitat/render_master.py -- \
  --output /absolute/workspace/compass/public/habitat/v1
blender --background /absolute/workspace/deliverables/compass-habitat.blend \
  --python scripts/habitat/render_environment.py -- \
  --output /absolute/workspace/compass/public/habitat/v1/room.hdr
npm run habitat:prepare
```

`habitat:prepare` converts PNGs to WebP and retains the original renders in the workspace
outside `public/`. The editable `.blend` is a separate deliverable, not a website asset.
Texture images are packed into the master for a self-contained handoff.
`scripts/habitat/render_master.py` can rerender the packed master without regenerating it.
Normal development, builds and CI require only committed GLB/WebP/HDR and do not run Blender.
Regenerate the model and posters together; the manifest records exact byte/triangle counts.
Run `node scripts/habitat/inspect-assets.mjs /absolute/output/asset-report.json` after
preparation to verify embedded dependencies, GLB triangles, texture dimensions, poster
resolution, file hashes and the aggregate transfer budget.

The master contains all zones 22m apart on the X axis; exported files retain local origins.
Blender Z-up becomes glTF Y-up. `Spin_*` and `Float_*` meshes are retained separately for
motion. Other meshes are joined by material to bound draw calls. Camera positions and
section IDs live in `scene-config.ts`; generated manifest camera data documents the source.
The quality-first transfer targets are 40MB for all assets and 8MB per GLB, replacing the
initial bandwidth-first plan. No extra paid service is introduced. Transfer, rendering and
GPU memory remain separate constraints; Wi-Fi does not establish GPU capability.

| Section | Space |
| --- | --- |
| top | Central atrium and COMPASS core |
| vision | Observation deck |
| experience | Four exhibition plinths |
| technology | AI laboratory and compute workstations |
| resources | Library and study desks |
| manifesto | Open-frame idea gallery |
| community | Communal table and planted lounge |
| founder | Maker workspace |
| contact | Observation lounge; footer holds this view |

## Verification and release

```sh
npm run test:habitat
npm run check
npm run check:responsive:full
```

The last command is Windows-only. Linux uses `check:responsive:cloud` and the Windows
Responsive Quality Gate for visual baselines. `test:responsive:habitat` explicitly tests
moving WebGL, all nine zones, pause, mobile no-fetch, deep links, reduced motion, failure,
resize/disposal, destination changes during download and context loss; reduced-motion
snapshots alone cannot verify live 3D. `scripts/habitat/audit.mjs` records viewport/renderer
evidence without updating baselines. Use `--headed=true --channel=msedge` for a real-window
run; record concurrent workloads, and do not conflate it with a headless run.

Review changed parent Desktop screenshots before replacing those two baselines. Do not
update other routes or Mobile baselines to conceal a regression. Record actual hardware,
browser renderer, viewport/DPR, performance and untested browsers in the delivery report.
Headless SwiftShader is functional evidence, not Iris Xe acceptance.
Runtime `triangles` counts visible geometry once per mesh; `submittedTriangles` records
all submitted render/shadow passes. `drawCalls` includes those passes. These measures
must not be presented as interchangeable polygon budgets.

The normal deliverable is a Draft PR and a Cloudflare Pages Preview. Use the repository's
existing reviewed non-production build profile; do not deploy a mock administrator route
as a production application. Production must remain untouched until explicitly requested.
The versioned habitat files are static assets and do not need a Pages Function. No root
host routing, Founder routing, OAuth, form backend or analytics changes belong to this work.
