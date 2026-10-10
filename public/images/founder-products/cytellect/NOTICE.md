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

## Founder molecular observation — 2026-10-10

The Founder card uses original scientific cinematography rendered in Blender
4.5.9 LTS (Eevee), not the imported cell GLB or the earlier metal-lamella study.
The measured DNA atomic coordinates of PDB entry **1BNA** are rendered with
independently authored materials, lights, spatial composition and two cameras.
The observation camera and focus move through a ten-second, 24fps loop.
The atomic structure itself is not deformed or animated.

Data source: https://files.rcsb.org/download/1BNA.pdb
Entry: https://www.rcsb.org/structure/1BNA
License: **CC0 1.0**, https://www.rcsb.org/pages/policies
Citation: Drew, H.R., Wing, R.M., Takano, T., Broka, C., Tanaka, S., Itakura, K.,
Dickerson, R.E. (1981). Structure of a B-DNA dodecamer: conformation and dynamics.
PNAS 78:2179–2183. https://doi.org/10.1073/pnas.78.4.2179

`scripts/art-data/1BNA.pdb` retains the original file and source credits.
`scripts/render-cytellect-science.py` contains the original rendering and
separate desktop/mobile cameras. Render using `--variant 0 --animate` and
`--mobile` for the mobile camera.
`scripts/encode-cytellect-art.mjs` produces H.264 MP4 files (without audio) and
WebP posters decoded from each film's first delivered frame. Offline encoding
used FFmpeg 7.1 from the PyPI imageio-ffmpeg 0.6.0 wheel; these authoring tools
are not website dependencies.

Lila.ai was a visual reference for scientific cinematography, scale and depth.
No Lila models, videos, imagery, code or other assets are used. No external
textures, fonts or AI-generated images are used. The artistic placements of
multiple coordinate instances and observer motion are not a biological
simulation, microscopy capture, scientific claim or a Cytellect research result.
The original imported assets and provenance above are retained, but are not
used by the current Founder card. The earlier kinetic study is also retained
as unused authoring history, not loaded by the website.
Copyright (c) 2026 Yuto Matsui.
