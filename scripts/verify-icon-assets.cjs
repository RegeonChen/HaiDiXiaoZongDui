const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { inflateSync } = require('node:zlib');

const root = join(__dirname, '..');
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function readRgbaPng(relativePath, expectedSize) {
  const filePath = join(root, relativePath);
  const bytes = readFileSync(filePath);
  assert.ok(bytes.subarray(0, 8).equals(pngSignature), `${relativePath} must be a real PNG`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    assert.ok(dataEnd + 4 <= bytes.length, `${relativePath} has a truncated ${type} chunk`);

    if (type === 'IHDR') {
      width = bytes.readUInt32BE(dataStart);
      height = bytes.readUInt32BE(dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === 'IDAT') {
      idatChunks.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  assert.equal(width, expectedSize, `${relativePath} width`);
  assert.equal(height, expectedSize, `${relativePath} height`);
  assert.equal(bitDepth, 8, `${relativePath} bit depth`);
  assert.equal(colorType, 6, `${relativePath} must use RGBA pixels`);
  assert.equal(interlace, 0, `${relativePath} must be non-interlaced`);
  assert.ok(idatChunks.length > 0, `${relativePath} must contain image data`);

  const raw = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  assert.equal(raw.length, (stride + 1) * height, `${relativePath} scanline length`);

  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);
  let transparentPixels = 0;
  let opaquePixels = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[sourceOffset];
    sourceOffset += 1;
    const encoded = raw.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;
    const decoded = Buffer.allocUnsafe(stride);

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? decoded[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let prediction = 0;

      if (filter === 1) prediction = left;
      else if (filter === 2) prediction = up;
      else if (filter === 3) prediction = Math.floor((left + up) / 2);
      else if (filter === 4) prediction = paethPredictor(left, up, upLeft);
      else assert.equal(filter, 0, `${relativePath} has unsupported PNG filter ${filter}`);

      decoded[x] = (encoded[x] + prediction) & 0xff;
    }

    for (let x = 3; x < stride; x += bytesPerPixel) {
      if (decoded[x] === 0) transparentPixels += 1;
      if (decoded[x] === 255) opaquePixels += 1;
    }
    previous = decoded;
  }

  assert.ok(transparentPixels > 0, `${relativePath} must contain transparent pixels`);
  assert.ok(opaquePixels > 0, `${relativePath} must contain opaque pixels`);

  return {
    path: relativePath,
    width,
    height,
    bytes: bytes.length,
    transparentPixels,
    opaquePixels
  };
}

const source = readFileSync(join(root, 'art/icon-source.jpg'));
assert.deepEqual(
  [...source.subarray(0, 3)],
  [0xff, 0xd8, 0xff],
  'art/icon-source.jpg must retain the original JPEG source'
);

assert.equal(existsSync(join(root, 'commit-msg.txt')), false, 'temporary commit-msg.txt must not be tracked');
assert.equal(
  existsSync(join(root, 'art/icons/cream-v1-tassel.png')),
  false,
  'duplicate icon source must not be tracked'
);

const results = [
  readRgbaPng('build/icon.png', 1024),
  readRgbaPng('src/public/icon.png', 512),
  readRgbaPng('src/public/favicon.png', 128)
];

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.equal(packageJson.build.icon, 'build/icon.png', 'electron-builder icon path');
assert.ok(
  packageJson.build.files?.includes('!out/renderer/icon.png'),
  'runtime icon must not also be duplicated inside app.asar'
);
assert.ok(
  packageJson.build.extraResources?.some(
    (entry) => entry.from === 'src/public/icon.png' && entry.to === 'icon.png'
  ),
  'runtime icon must be copied outside app.asar'
);

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
assert.match(html, /href="\.\/favicon\.png"/, 'renderer favicon reference');

console.log(`ICON_ASSET_REPORT ${JSON.stringify({ ok: true, icons: results })}`);
