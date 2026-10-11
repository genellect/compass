/** Offline authoring only. Requires FFmpeg, Blender-rendered frames and existing sharp.
 * node scripts/encode-cytellect-art.mjs --ffmpeg /path/to/ffmpeg.exe
 * Use scripts/render-cytellect-lattice.py --variant 0 --animate --both-cameras.
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const argument = process.argv.indexOf("--ffmpeg");
if (argument < 0 || !process.argv[argument + 1]) throw new Error("Supply an offline FFmpeg executable with --ffmpeg");
const ffmpeg = resolve(process.argv[argument + 1]);
const output = resolve(root, "public/images/founder-products/cytellect");
// Refuse partial loops: authoring interruption must not produce a short film.
for (const camera of ["desktop", "mobile"]) {
  for (let frame = 1; frame <= 192; frame++) {
    const file = resolve(root, `.review/fcc-film/${camera}/frame-${String(frame).padStart(4, "0")}.png`);
    if (!statSync(file).isFile()) throw new Error(`Missing ${camera} frame ${frame}`);
  }
}
for (const camera of ["desktop", "mobile"]) {
  const frames = resolve(root, `.review/fcc-film/${camera}`);
  const result = spawnSync(ffmpeg, [
    "-y", "-framerate", "24", "-i", `${frames}/frame-%04d.png`,
    "-frames:v", "192", "-vf", "hqdn3d=1:1:2:2", "-c:v", "libx264",
    "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
    `${output}/lattice-${camera}.mp4`,
  ], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Encoding ${camera} failed`);
  // The still is decoded from the actual first delivered frame, not a separate mockup.
  const decoded = resolve(frames, "delivered-first-frame.png");
  const poster = spawnSync(ffmpeg, ["-y", "-i", `${output}/lattice-${camera}.mp4`, "-frames:v", "1", decoded], { stdio: "inherit" });
  if (poster.status !== 0) throw new Error(`Poster ${camera} failed`);
  await sharp(decoded).webp({ quality: 90 }).toFile(`${output}/lattice-${camera === "mobile" ? "mobile-" : ""}poster.webp`);
}
const assets = ["lattice-desktop.mp4", "lattice-mobile.mp4", "lattice-poster.webp", "lattice-mobile-poster.webp"];
writeFileSync(`${output}/lattice-art-provenance.json`, JSON.stringify({
  artwork: "Cubic connection field — original face-centered lattice sculpture", author: "Yuto Matsui", created: "2026-10-11",
  tools: { blender: "4.5.9 LTS", renderer: "Eevee", ffmpeg: "7.1", fps: 24, frames: 192 },
  structure: { variant: 0, cubicCells: 1, cornerSites: 8, faceCenterSites: 6, nearestNeighborSquaredDistance: 0.5, cubicEdgesAdded: true, deformation: "none" },
  sources: ["scripts/render-cytellect-lattice.py", "scripts/encode-cytellect-art.mjs"],
  externalAssets: [],
  interpretation: "Original cubic framework with corner and face-center sites, nearest-neighbor connections and continuous object-space gradient. Inspired by FCC spatial order but with additional cubic edge frames, not a measured atomic structure, biological simulation or Cytellect research result. No third-party models, textures or reference-site assets used.",
  assets: assets.map(file => ({ file, bytes: statSync(`${output}/${file}`).size, sha256: createHash("sha256").update(readFileSync(`${output}/${file}`)).digest("hex") })),
}, null, 2) + "\n");
