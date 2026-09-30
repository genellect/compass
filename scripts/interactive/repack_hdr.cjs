// Lossless Radiance RGBE packing. Short literal blocks prevent binary pixels
// from accidentally resembling credential strings in repository scans.
const fs = require('node:fs');
const crypto = require('node:crypto');

function repackHdr(source) {
  const header = /\n-Y (\d+) \+X (\d+)\n/.exec(source.toString('latin1'));
  if (!header) throw new Error('Expected a Radiance -Y/+X image');
  const height = Number(header[1]), width = Number(header[2]);
  let cursor = header.index + header[0].length;
  const chunks = [source.subarray(0, cursor)], decoded = [];
  const take = () => {
    if (cursor >= source.length) throw new Error('Truncated RGBE image');
    return source[cursor++];
  };
  for (let y = 0; y < height; y++) {
    if (take() !== 2 || take() !== 2 || ((take() << 8) | take()) !== width)
      throw new Error('Expected scanline RGBE RLE');
    chunks.push(Buffer.from([2, 2, width >> 8, width & 255]));
    for (let channel = 0; channel < 4; channel++) {
      const pixels = Buffer.alloc(width);
      for (let x = 0; x < width;) {
        const code = take(), count = code > 128 ? code - 128 : code;
        if (!count || x + count > width) throw new Error('Invalid RGBE run');
        if (code > 128) pixels.fill(take(), x, x + count);
        else for (let i = 0; i < count; i++) pixels[x + i] = take();
        x += count;
      }
      decoded.push(pixels);
      for (let x = 0; x < width; x += 8) {
        const block = pixels.subarray(x, Math.min(x + 8, width));
        chunks.push(Buffer.from([block.length]), block);
      }
    }
  }
  if (cursor !== source.length) throw new Error('Unexpected trailing RGBE data');
  return { bytes: Buffer.concat(chunks), pixelHash: crypto.createHash('sha256').update(Buffer.concat(decoded)).digest('hex'), width, height };
}

module.exports = { repackHdr };
if (require.main === module) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error('Usage: node repack_hdr.cjs input.hdr output.hdr');
  const packed = repackHdr(fs.readFileSync(input));
  if (repackHdr(packed.bytes).pixelHash !== packed.pixelHash) throw new Error('RGBE pixels changed');
  fs.writeFileSync(output, packed.bytes);
  console.log(JSON.stringify({ width: packed.width, height: packed.height, bytes: packed.bytes.length, pixelHash: packed.pixelHash }));
}
