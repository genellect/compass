# CONTACT sky-office entry

The entry is an original, fictional sky-office made in Blender. It includes a high-rise skyline, an infinity pool, a furnished study/library, a three-display high-performance workstation, server racks and a conference area. The smart sliding doors have physical Japanese/English signs and matching accessible Web buttons. This is a visual destination metaphor, not an authentication mechanism.

The two destinations begin on the same rendered camera frame. Each has desktop (1280×720) and mobile (720×960) variants at 24 fps, 48 frames / 2 seconds. After entry the film is unmounted and the existing white form is shown. No WebGL scene remains in the form.

## Reproduction

Use Blender 4.5 LTS and Python script `scripts/contact-entry/render.py`. Set `CONTACT_JAPANESE_FONT` to a licensed Japanese font available on the rendering machine (the original render used Windows Yu Gothic). Text is converted to mesh; font files are not redistributed. Set `CONTACT_RENDER_ENGINE=CYCLES` for optional path-traced output, or use the default EEVEE renderer.

```
blender -b -t 8 -P scripts/contact-entry/render.py -- --output /absolute/render/output --target representative --layout desktop
```

Repeat for `compass` and `mobile`. `--still` renders the lobby frame. `--preview` halves resolution. All geometry and materials are procedural; no external photos, HDRIs, textures or third-party models are used.

The delivered representative desktop film used `--samples 24`; the other three used the default 12 samples. Each render also saves an editable `.blend` scene. Run `node scripts/contact-entry/encode.mjs /absolute/render/output /path/to/ffmpeg` from the repository root to encode all branches and generate the asset hash manifest.

Encode each PNG sequence to H.264 MP4 with yuv420p and faststart at 24 fps; encode frame 1 of each layout to WebP. The published media directory is `/media/contact-entry/`. Camera frames of the two branches must remain identical at frame 1.

## State and delivery contract

`ContactEntrance` only owns presentation state. Door activation first invokes the existing `updateTarget`; then it plays the corresponding muted inline movie. Entry completion reveals the form and focuses its heading. Normal entry bypass preserves the standard destination radios. Reduced motion, Save-Data, rejected playback, media failure, a slow start, tab hiding and timeout all reach the same idempotent completion path. Only the selected movie is fetched; movies are not preloaded before selection.

`ContactForm` retains its field state and existing verification invalidation rules. It is never remounted for navigation or destination changes. The schema, API, GAS and contact request payload are unchanged. Header logo, CONTACT label, four navigation CTAs and Yuto Matsui copyright remain.

## Verification

`contact-entry.spec.ts` covers actual film playback/metadata, both destinations and framing variants, keyboard skip, rejected/missing/slow media, reduced motion, Save-Data, no pre-selection film requests, normal bypass and input preservation. Existing Contact gallery/navigation and responsive contracts are adapted to the entry screen. All form delivery is mocked or blocked by the responsive fixture.

Local validation on 2026-09-10: the production build (including TypeScript) passed, 96 registration/contact unit tests passed, and all 51 Contact-matching Playwright contracts passed against the final static export. The published media hashes match the export; the public-source scan passed for 546 source files. Real delivery was not exercised. The repository-wide static verification remains blocked by the existing reviewed `_routes.json` boundary mismatch; this change does not edit routing controls or claim a green full repository gate. Unrelated routes and Windows visual baselines were not rerun locally because changes are confined to Contact and its tests.
