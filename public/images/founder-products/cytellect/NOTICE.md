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

## Founder kinetic architecture — 2026-10-10

The Founder card uses independently authored kinetic architecture rendered in
Blender 4.5.9 LTS (Eevee), not the imported cell GLB. Seventeen curved metal
lamellae form a spacious aperture. Their changing pitch, separation and studio
reflections are synchronized into a seamless six-second, 24fps loop.

`scripts/render-cytellect-art.py` contains the original geometry, materials,
lighting, animation and separate desktop/mobile cameras. Render both using
`--variant 2 --eevee --animate` and `--mobile` for the mobile camera.
`scripts/encode-cytellect-art.mjs` produces H.264 MP4 files (without audio) and
WebP posters decoded from each film's first delivered frame. Offline encoding
used FFmpeg 7.1 from the PyPI imageio-ffmpeg 0.6.0 wheel; these authoring tools
are not website dependencies.

The Lila.ai website was a visual reference for scale, material quality and
composition only. No Lila models, videos, imagery, code or other assets are used.
No microscopy specimens, experimental data, external textures, fonts or
AI-generated images are used. The original imported assets and provenance above
are retained, but are not used by the current Founder card.
Copyright (c) 2026 Yuto Matsui.
