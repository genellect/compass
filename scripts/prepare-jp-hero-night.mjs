import sharp from "sharp";

// The supplied 6960 × 4640 original: the nose/bridge axis was inspected at
// approximately x=3560. A square master preserves lateral context on phones;
// desktop's portrait frame crops symmetrically around the same axis.
// Keep the lower edge, remove only 240px of empty upper sky. No synthetic fill.
const source = process.argv[2];
if (!source) throw new Error("Pass the original night portrait path.");
const metadata = await sharp(source).metadata();
if (metadata.width !== 6960 || metadata.height !== 4640 || metadata.orientation !== 1) {
  throw new Error("Expected the original, upright 6960 × 4640 night portrait.");
}
await sharp(source)
  .extract({ left: 1360, top: 240, width: 4400, height: 4400 })
  .resize(1800, 1800)
  .webp({ quality: 88 })
  .toFile("public/images/founder-portfolio/yuto-matsui-city-night-hero-composition-20260928.webp");
