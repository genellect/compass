import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

// node scripts/contact-entry/encode.mjs FRAMES_DIRECTORY FFMPEG [one-target-layout]
const [frameDirectory, ffmpeg, only] = process.argv.slice(2);
if (!frameDirectory || !ffmpeg) throw new Error("Provide the frame directory and ffmpeg executable.");
const output = path.resolve("public/media/contact-entry");
mkdirSync(output, { recursive: true });
// Camera-derived hit areas travel with the rendered assets, avoiding hand-aligned UI.
const projectionFiles = ["desktop", "mobile"].map(layout => path.join(frameDirectory, `projection-${layout}.json`));
if (projectionFiles.every(existsSync)) {
  const projection = Object.fromEntries(["desktop", "mobile"].map((layout, i) => [layout, JSON.parse(readFileSync(projectionFiles[i], "utf8"))]));
  for (const layout of Object.values(projection)) for (const area of Object.values(layout)) {
    if (![area.left, area.top, area.width, area.height].every(Number.isFinite) || area.left < 0 || area.top < 0 || area.width <= 0 || area.height <= 0 || area.left + area.width > 100 || area.top + area.height > 100) throw new Error("Door projection leaves the rendered frame.");
  }
  writeFileSync("src/app/(official)/contact/contact-door-projection.json", JSON.stringify(projection, null, 2) + "\n");
}
for (const layout of ["desktop", "mobile"]) {
  for (const target of ["representative", "compass"]) {
    const key = `${target}-${layout}`;
    if (only && only !== key) continue;
    for (let frame=1; frame<=48; frame++) {
      const framePath = path.join(frameDirectory,`${key}-${String(frame).padStart(4,"0")}.png`);
      if (!existsSync(framePath)) throw new Error(`Incomplete render: ${key}, frame ${frame}`);
      const stats = await sharp(framePath).stats();
      if (stats.channels.slice(0,3).every(channel => channel.mean < 1)) throw new Error(`Black render rejected: ${key}, frame ${frame}`);
    }
    execFileSync(ffmpeg, ["-hide_banner","-loglevel","error","-y","-framerate","24","-i",path.join(frameDirectory,`${key}-%04d.png`),"-frames:v","48","-c:v","libx264","-preset","medium","-crf","20","-pix_fmt","yuv420p","-movflags","+faststart","-an",path.join(output,`${key}.mp4`)], { stdio:"inherit" });
    if (target === "representative") await sharp(path.join(frameDirectory,`${key}-0001.png`)).webp({quality:90}).toFile(path.join(output,`lobby-${layout}.webp`));
    console.log(`Encoded ${key}: 48 frames / 24 fps / 2 seconds`);
  }
}
const files=["lobby-desktop.webp","lobby-mobile.webp",...['desktop','mobile'].flatMap(layout=>['representative','compass'].map(target=>`${target}-${layout}.mp4`))];
if (files.every(file=>existsSync(path.join(output,file)))) {
  const assets=files.map(file=>{const bytes=readFileSync(path.join(output,file));return {file,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")};});
  writeFileSync(path.join(output,"manifest.json"),JSON.stringify({author:"Yuto Matsui / CONTACT",source:"scripts/contact-entry/render.py",frames:48,fps:24,durationSeconds:2,assets},null,2)+"\n");
}
