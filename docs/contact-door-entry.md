# CONTACT residence entry

## Revised implementation plan

The arrival hall, two enclosed rooms and an outdoor pool terrace form one original Blender residence. A continuous floor, tall skylight, side openings and oblique camera establish depth. The study contains its own library, workstation and server alcove; the meeting room has its own table and seating. Doors sit in real wall openings and slide into wall pockets. Original procedural CG is used; this is not live-action footage or a depiction of an actual property.

Large HTML destination cards have been removed. The room names are physical signs in the render; the Yuto Matsui / COMPASS lettering is enlarged from .22 to .62 scene units for readability. Transparent native buttons use camera-projected door bounds; only hover/focus adds a restrained outline. The existing お問い合わせ heading and destination question occupy the clear ceiling area with a restrained dark gradient for contrast. The residence fills the entry width, with its image continuing behind the lower copy instead of white outer margins. Accessible text alternatives, skip and playback status stay below the film. At small widths, controls maintain at least 44px tap targets. Form copy, fields, identity, header/footer and backend are preserved.

After selection, a two-second film moves through the chosen doorway into its room, then reveals the existing white form. The film loads only after selection. Reduced motion, Save-Data, failed/rejected/slow media, hidden tabs and skip reach the same completion path. Form state is not remounted; header focus is retained if used during playback.

The header CONTACT link returns from the input screen to the residence without clearing the draft. Selecting the same destination keeps its current verification state; selecting another uses the existing destination-change validation. After a completed submission, the ordinary Contact link starts a fresh visit. The footer's existing Back to top behavior remains.

## Reproduction

Blender 4.5 LTS, EEVEE, baked indirect lighting. The source is `scripts/contact-entry/render.py`. Set `CONTACT_JAPANESE_FONT` to a licensed Japanese font (Windows Yu Gothic was used). Lettering is converted to meshes and the font file is not redistributed. All geometry/materials are original procedural work; no third-party photos, HDRIs or models are embedded.

```sh
blender -b -t 8 -P scripts/contact-entry/render.py -- --output /absolute/frames --target representative --layout desktop --samples 16
```

Repeat for `compass` and `mobile`. The films are 48 frames at 24fps, 1280×720 desktop and 720×960 mobile. `--still` renders one frame; `--frame 32` inspects the approach; `--preview` halves dimensions; `--prepare-only` saves geometry/projection without baking or rendering. `CONTACT_RENDER_ENGINE=CYCLES` selects optional path tracing.

```sh
node scripts/contact-entry/encode.mjs /absolute/frames /path/to/ffmpeg
```

The encoder produces four H.264 films, two WebP posters, SHA256 metadata and `contact-door-projection.json`. Every source frame is checked for all-black render failures. Both camera projection files must travel with the frame set. The JSON maps the first-frame geometry into accessible HTML controls, avoiding manual placement.

## Verification boundary

`contact-entry.spec.ts` exercises real playback/metadata, both destinations and layouts, keyboard skip, fallback paths, input retention, clear door hit areas and outside-image alternatives. The responsive fixture blocks or mocks real form delivery. Production submission and real email are not exercised.

Initial architecture validation on 2026-09-10: production build and TypeScript passed; 96 registration/contact tests passed; all 55 Contact-matching Playwright contracts passed against the final static export, including real two-second films for both destinations/layouts, clear hit areas, outside-image alternatives and portrait-film rotation. The public-source scan passed for 548 files. All 192 source frames passed the black-frame check and six media hashes matched the export. Desktop/Mobile screenshots and the local in-app browser were inspected. Full results are recorded in the PR. Previously identified repository-wide blockers are the `_routes.json` reviewed Function-boundary mismatch and installed dependency audit findings. This revision does not edit those boundaries or dependencies. It does not claim a green full repository gate or a production release.

### Final rendering workflow

The delivered films use 16 EEVEE samples and Blender compositor color denoising. To isolate light-probe baking from animation rendering on the integrated GPU, create each scene with `--samples 16 --bake-only`, then render it in a fresh process:

```sh
blender -b /absolute/frames/representative-desktop.blend -P scripts/contact-entry/render-saved.py -- /absolute/frames representative-desktop
```

Repeat for all four destination/layout combinations, then run the encoder. `render-saved.py` is part of the reproduction source and applies the final denoising compositor.


Release refinements: 40 focused Contact and Mobile browser contracts passed, including header return with draft/verification preservation. The final four re-rendered films passed actual playback checks after encoding. Unrelated detailed tests were stopped at the user's request to prioritize production publication. Form/backend tests (96), public-source scan (550 files), production build and TypeScript passed.
