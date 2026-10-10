/** Offline authoring only. Requires FFmpeg, Blender-rendered frames and existing sharp.
 * node scripts/encode-cytellect-art.mjs --ffmpeg /path/to/ffmpeg.exe
 * Use scripts/render-cytellect-science.py with --animate for each camera.
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
  for (let frame = 1; frame <= 240; frame++) {
    const file = resolve(root, `.review/science-film/${camera}/frame-${String(frame).padStart(4, "0")}.png`);
    if (!statSync(file).isFile()) throw new Error(`Missing ${camera} frame ${frame}`);
  }
}
for (const camera of ["desktop", "mobile"]) {
  const frames = resolve(root, `.review/science-film/${camera}`);
  const result = spawnSync(ffmpeg, [
    "-y", "-framerate", "24", "-i", `${frames}/frame-%04d.png`,
    "-frames:v", "240", "-vf", "hqdn3d=1:1:2:2", "-c:v", "libx264",
    "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
    `${output}/science-${camera}.mp4`,
  ], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Encoding ${camera} failed`);
  // The still is decoded from the actual first delivered frame, not a separate mockup.
  const decoded = resolve(frames, "delivered-first-frame.png");
  const poster = spawnSync(ffmpeg, ["-y", "-i", `${output}/science-${camera}.mp4`, "-frames:v", "1", decoded], { stdio: "inherit" });
  if (poster.status !== 0) throw new Error(`Poster ${camera} failed`);
  await sharp(decoded).webp({ quality: 90 }).toFile(`${output}/cell-field-${camera === "mobile" ? "mobile-" : ""}poster.webp`);
}
const assets = ["science-desktop.mp4", "science-mobile.mp4", "cell-field-poster.webp", "cell-field-mobile-poster.webp"];
writeFileSync(`${output}/science-art-provenance.json`, JSON.stringify({
  artwork: "Molecular observation — original scientific cinematography", author: "Yuto Matsui", created: "2026-10-10",
  tools: { blender: "4.5.9 LTS", renderer: "Eevee", ffmpeg: "7.1", fps: 24, frames: 240 },
  sources: ["scripts/render-cytellect-science.py", "scripts/encode-cytellect-art.mjs"],
  externalAssets: [{ file: "scripts/art-data/1BNA.pdb", url: "https://files.rcsb.org/download/1BNA.pdb", entry: "https://www.rcsb.org/structure/1BNA", license: "CC0-1.0", citation: "Drew et al. (1981), PNAS 78:2179–2183, doi:10.1073/pnas.78.4.2179", sha256: createHash("sha256").update(readFileSync(resolve(root, "scripts/art-data/1BNA.pdb"))).digest("hex") }],
  interpretation: "Coordinates are experimental. Materials, spatial placements, lighting and observer motion are artistic, not a biological simulation or a Cytellect research result. No reference-site assets used.",
  assets: assets.map(file => ({ file, bytes: statSync(`${output}/${file}`).size, sha256: createHash("sha256").update(readFileSync(`${output}/${file}`)).digest("hex") })),
}, null, 2) + "\n");
