# Background asset credits

Verified: 2026-09-25. Original architecture, arrangement and camera path: COMPASS. The sources below remain under their own licenses; COMPASS does not claim authorship of their photographs or footage.

| Source | License | Use and modifications |
| --- | --- | --- |
| [Brushed Concrete — Poly Haven](https://polyhaven.com/a/brushed_concrete) | [CC0](https://polyhaven.com/license) | Photographic colour, roughness and OpenGL normal maps in the Blender model. Resized, colour map darkened and desaturated; baked into the delivered backgrounds. |
| [Rock 06 — Rob Tuytel / Poly Haven](https://polyhaven.com/a/rock_06) | [CC0](https://polyhaven.com/license) | Photographic coastal stone colour, roughness and normal maps on authored rock geometry, baked into the delivered backgrounds. |
| [Qwantani Night — Greg Zaal (photography), Jarod Guest (processing) / Poly Haven](https://polyhaven.com/a/qwantani_night) | [CC0](https://polyhaven.com/license) | Photographed night panorama resized to 1024×512 HDR for lighting; tone-mapped, dark blue camera-ray grade baked into the distant sky. |
| [Serene Reflections on Rippling Water Surface — Everett Bumstead / Pexels](https://www.pexels.com/video/serene-reflections-on-rippling-water-surface-34435555/) | [Pexels License](https://www.pexels.com/license/) | 12-second extract, grayscale, 640×360, 15fps, no audio. Used as a changing reflection/displacement signal inside the original 3D scene, not distributed as a stock-footage product. |

The website never requests source APIs at runtime. Downloads are authoring inputs outside `public/`. No NASA material is included in this background package. Existing mobile and `/3d/` media are separate and unchanged.

## Source retrieval and processing

Poly Haven file manifests:

- <https://api.polyhaven.com/files/brushed_concrete>
- <https://api.polyhaven.com/files/rock_06>
- <https://api.polyhaven.com/files/qwantani_night>

Take the 1K JPG Diffuse/Rough/nor_gl maps and the 2K HDR; rename as listed in README. Concrete's colour map uses brightness 0.22 and saturation 0.2 before resizing. The Blender script packs all required inputs into its editable `.blend` and exports the delivery assets.

Original water video: <https://videos.pexels.com/video-files/34435555/14590697_3840_2160_24fps.mp4>

```sh
ffmpeg -ss 1 -t 12 -i water-reflections-source.mp4 -an -vf "scale=640:360,fps=15,eq=saturation=0:brightness=-0.1" -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart reflections.mp4
ffmpeg -i reflections.mp4 -frames:v 1 water-frame.png
```

The derivative clip is one rendering input alongside the original geometry, photographic materials and lighting. Credit links are preserved even where the source license does not require attribution. There is no implied endorsement by the photographers or source platforms.
