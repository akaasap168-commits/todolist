// Generates public/icon-192.png and public/icon-512.png without dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const table = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function draw(size) {
  const s = size / 64;
  const rects = [
    // [x0, y0, x1, y1, color] in 64-unit space, later ones on top
    [14, 14, 30, 50, '#8fb3ff'],
    [34, 22, 50, 50, '#f3c969'],
    [14, 30, 30, 32, '#2f3a4a'],
    [34, 36, 50, 38, '#2f3a4a'],
  ];
  const bg = hex('#2f3a4a');
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let col = bg;
      const ux = (x + 0.5) / s;
      const uy = (y + 0.5) / s;
      for (const [x0, y0, x1, y1, c] of rects) {
        if (ux >= x0 && ux < x1 && uy >= y0 && uy < y1) col = hex(c);
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), draw(size));
console.log('icons written');
