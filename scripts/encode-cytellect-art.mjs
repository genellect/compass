/** Offline authoring only. Requires FFmpeg, Blender-rendered frames and existing sharp.
 * node scripts/encode-cytellect-art.mjs --ffmpeg /path/to/ffmpeg.exe
 * Use scripts/render-cytellect-art.py with --variant 2 --eevee --animate for each camera.
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
for (const camera of ["desktop", "mobile"]) {
  const frames = resolve(root, `.review/kinetic-art/${camera}`);
  const result = spawnSync(ffmpeg, [
    "-y", "-framerate", "24", "-i", `${frames}/frame-%04d.png`,
    "-frames:v", "144", "-vf", "hqdn3d=1.8:1.8:3:3", "-c:v", "libx264",
    "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart",
    `${output}/kinetic-${camera}.mp4`,
  ], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Encoding ${camera} failed`);
  // The still is decoded from the actual first delivered frame, not a separate mockup.
  const decoded = resolve(frames, "delivered-first-frame.png");
  const poster = spawnSync(ffmpeg, ["-y", "-i", `${output}/kinetic-${camera}.mp4`, "-frames:v", "1", decoded], { stdio: "inherit" });
  if (poster.status !== 0) throw new Error(`Poster ${camera} failed`);
  await sharp(decoded).webp({ quality: 90 }).toFile(`${output}/cell-field-${camera === "mobile" ? "mobile-" : ""}poster.webp`);
}
const assets = ["kinetic-desktop.mp4", "kinetic-mobile.mp4", "cell-field-poster.webp", "cell-field-mobile-poster.webp"];
writeFileSync(`${output}/kinetic-art-provenance.json`, JSON.stringify({
  artwork: "Original kinetic architecture", author: "Yuto Matsui", created: "2026-10-10",
  tools: { blender: "4.5.9 LTS", renderer: "Eevee", ffmpeg: "7.1", fps: 24, frames: 144 },
  sources: ["scripts/render-cytellect-art.py", "scripts/encode-cytellect-art.mjs"],
  externalAssets: [],
  assets: assets.map(file => ({ file, bytes: statSync(`${output}/${file}`).size, sha256: createHash("sha256").update(readFileSync(`${output}/${file}`)).digest("hex") })),
}, null, 2) + "\n");
