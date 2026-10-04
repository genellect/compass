// Measured on the unmodified 1600 × 2400 lake master. Keeping source pixels
// makes the framing independent of screen size and of slide transition motion.
export const lakePortraitAnchors = {
  sourceWidth: 1600, sourceHeight: 2400,
  noseX: 785, headY: 1048, thighY: 1880,
  leftElbowX: 550, rightElbowX: 1008, handsY: 1494
} as const;

export function lakePortraitComposition(width: number, height: number) {
  const a = lakePortraitAnchors;
  const composed = height * .8 / (a.thighY - a.headY);
  const elbowLimit = width * .44 / Math.max(a.noseX - a.leftElbowX, a.rightElbowX - a.noseX);
  const cover = Math.max(width / a.sourceWidth, height / a.sourceHeight);
  const scale = Math.max(cover, Math.min(composed, elbowLimit));
  const imageWidth = a.sourceWidth * scale;
  const imageHeight = a.sourceHeight * scale;
  return {
    width: imageWidth, height: imageHeight,
    left: Math.max(width - imageWidth, Math.min(0, width * .5 - a.noseX * scale)),
    top: Math.max(height - imageHeight, Math.min(0, height * .2 - a.headY * scale))
  };
}
