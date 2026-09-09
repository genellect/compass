# Mobile space media

Status: Preview approved on 2026-09-10; Production release verification in progress.

## Authored direction

The user selected actual photographed space footage as the principal Mobile material on
2026-09-10. This supersedes the provisional Blender interiors, CG city and generated planet
for Mobile. All nine parent sections use ISS photography. Hero and Community use eight-second
photographic timelapse extracts; these are real photographs assembled by NASA, not real-time
camera footage or simulated 3D. No AI generation, invented stars, frame interpolation, or
synthetic planets are used. Minor crops and delivery encoding do not change the pictured events.

Desktop/qualifying landscape iPad retain the existing renderer, gate, scene, audio and assets.
The original Blender master and /habitat/v3 are not overwritten. Blender 4.5.13 LTS is installed
and operational; no Blender work is necessary to replace actual space photography.

## Source register and attribution

All sources were checked on 2026-09-10. Credit NASA; the SVS source specifically credits the
Earth Science and Remote Sensing Unit, NASA Johnson Space Center. The parent Mobile footer
groups all three NASA sources in a compact disclosure. There are no section attribution CTAs.
Use follows https://www.nasa.gov/nasa-brand-center/images-and-media/ .
No NASA endorsement, partnership, logo or association with COMPASS is claimed.
The selected photographs contain no identifiable people or third-party copyright notice.

- https://svs.gsfc.nasa.gov/31375/ : ISS aurora, photographed 2025-11-12, 07:13–07:35 UTC.
  The source page's isolated 2026 caption conflicts with its main description and dataset;
  use the dataset's 2025 date. Original 3840×2160, H.264, 30 fps, 88.033 seconds.
  Direct movie: https://svs.gsfc.nasa.gov/vis/a030000/a031300/a031375/ISS_20251112_071350-20251112_073549_2160p30.mp4
  Hero extract starts at 8 seconds; Community at 54 seconds. Download twelve seconds for
  each working clip with FFmpeg (-ss before -i, -t 12 -an -c:v copy). The authoring script
  encodes the first eight seconds to 24 fps without interpolation. Source clips retain
  source keyframes; negative preroll is removed during decoding/encoding.
  Original still: https://svs.gsfc.nasa.gov/vis/a030000/a031300/a031375/ISS_20251112_073015.tif
- https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?mission=ISS061&roll=E&frame=110527 :
  ISS061-E-110527, actual star field and atmospheric limb, 2019-12-30, Expedition 61.
  5568×3712 original: https://eol.jsc.nasa.gov/DatabaseImages/ESC/large/ISS061/ISS061-E-110527.JPG
- https://www.nasa.gov/international-space-station/desktop-and-mobile-wallpapers/ :
  NASA's image-only 1080×1920 photographic crops, without calendar, text or logo.
  `jet.png`: Luminous Lights of LEO, photograph by NASA astronaut Nichole Ayers.
  `sunset.png`: Sunset Silhouettes, orbital sunset over the Pacific.
  `wispy.png`: A Wispy Aurora, aurora australis above the Indian Ocean.
  Direct file names (under https://www.nasa.gov/wp-content/uploads/2026/03/):
  `luminous-lights-of-leo-–-mobile-–-image-only.png`,
  `sunset-silhouettes-–-mobile-–-image-only.png`,
  `a-wispy-aurora-–-mobile-–-image-only.png`.

Source originals stay outside the public repository. `public/habitat/mobile-v1/manifest.json`
records the source URL, file SHA-256, crop selection, output sizes and media properties.

## Rebuild

Requires Node with the repository's sharp and an FFmpeg build with libx264, outside Web builds.

```sh
node scripts/habitat/prepare-mobile.mjs SOURCE_DIR FFMPEG_PATH
```

SOURCE_DIR contains `aurora-hero-source.mp4`, `aurora-community-source.mp4`,
`aurora-full.tif`, `ISS061-E-110527.jpg`, `jet.png`, `sunset.png`, `wispy.png`.
Video crop: 1152×2048, y=0, x=1050 (Hero), x=1700 (Community). This retains the actual
horizon and crops away NASA's burned-in acquisition timestamp; the source link is kept
visibly on the page. No retouching of photographed objects is performed.

The script emits 720/1080 portrait WebP and 768/1080 3:4 alternatives. Both 720×1280 and
1080×1920 H.264 films are eight seconds, 24 fps, silent, fast-start MP4. First/end posters
are decoded from the delivered 1080 movie, so playback does not jump back at completion.
Outputs enforce 250 KB Hero poster, 2.5 MB selected still set, and 4 MB per movie budgets.
The manifest records explicit approval of this Preview on 2026-09-10.

## Browser contract

`MobileHabitat` uses the exact existing DESKTOP_QUERY, portals only onto the parent route,
no realtime 3D import, one playing film, lazy images, once-per-visit playback, final posters,
session pause choice, menu/visibility/offscreen pause, reduced-motion/save-data/2g stills,
and a three-second failed-start/stall fallback. No external media requests occur for visitors.
Attribution links are grouped in the Mobile footer; the existing editorial copy/links/order stay intact.
Related official Mobile changes are restricted to header/footer/navigation colors.
Independent sites, backend, analytics payloads and form bodies are excluded.

## Acceptance evidence

See the accompanying implementation report for checks and residual limitations. Emulated
WebKit/Chromium do not constitute physical iPhone, Android or iPad acceptance.
