# cytellect artwork and renderer attribution

Source: https://github.com/genellect/cytellect/tree/599f0daa28b5926dee9d9f1fe6a5c6ece29b4420

Imported 2026-10-04 from commit `599f0daa28b5926dee9d9f1fe6a5c6ece29b4420`:

- `apps/web/public/marketing/cell-sculpture.glb`
- `apps/web/public/marketing/cell-sculpture-poster.webp`
- `apps/web/public/marketing/cell-sculpture-provenance.json`
- `apps/web/src/components/cell-scene-engine.ts` (adapted in Founder products)

Copyright (c) 2026 Yuto Matsui. Assets and source licensed under Apache-2.0;
the accompanying LICENSE preserves the upstream license. The original asset
provenance is retained unchanged, including creation commit and SHA-256 hashes.
The GLB and poster are unmodified. Renderer adaptations change asset paths,
card camera framing and the 30fps desktop / 24fps mobile ceiling; material,
lighting and subtle rocking motion retain the cytellect presentation.

This is authored microscopy-inspired artwork, not measured biological data.
No research datasets or runtime dependency on the cytellect deployment are included.

## Founder optical sculpture — 2026-10-10

The Founder card now uses original procedural artwork authored for this site in
`src/app/(official)/founder/cell-field-engine.ts`, rather than the imported GLB.
Three beveled geometric optical facets are generated deterministically in
Three.js. Their separation, alignment and changing reflections form the motion;
no cell membranes, organelles, organic deformation or microscopy imagery are used.
Its desktop and mobile WebP posters capture that same renderer.
No microscopy specimens, experimental data, external textures or AI-generated
images are used. The original imported assets and provenance above are retained.
Copyright (c) 2026 Yuto Matsui.
