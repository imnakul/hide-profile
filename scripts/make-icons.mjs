// Renders the extension icons to icons/*.png with no dependencies.
// Usage: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const SS = 4; // supersampling per axis

const lerp = (a, b, t) => a + (b - a) * t;
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// Returns [r, g, b, a] for a point in unit space.
function shade(x, y) {
  // Rounded-square background.
  const r = 0.22, q = (v) => Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
  if (Math.hypot(q(x), q(y)) > r) return [0, 0, 0, 0];
  const bg = [lerp(0x2a, 0x0b, y), lerp(0x2a, 0x0b, y), lerp(0x2f, 0x0e, y), 255];
  const white = [250, 250, 250, 255];

  const slash = segDist(x, y, 0.25, 0.25, 0.75, 0.75);
  if (slash < 0.034) return white;
  if (slash < 0.072) return bg; // gap cut out of the figure

  const inFrame = Math.hypot(x - 0.5, y - 0.5) < 0.32;
  const head = Math.hypot(x - 0.5, y - 0.37) < 0.13;
  const body = ((x - 0.5) / 0.24) ** 2 + ((y - 0.79) / 0.18) ** 2 < 1;
  return inFrame && (head || body) ? white : bg;
}

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((i + (sx + 0.5) / SS) / size, (j + (sy + 0.5) / SS) / size);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const o = (j * size + i) * 4;
      px[o] = a ? r / a : 0;
      px[o + 1] = a ? g / a : 0;
      px[o + 2] = a ? b / a : 0;
      px[o + 3] = a / (SS * SS);
    }
  }
  return encodePNG(size, px);
}

function encodePNG(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of SIZES) {
  writeFileSync(new URL(`../icons/icon${size}.png`, import.meta.url), render(size));
}
console.log('Wrote', SIZES.map((s) => `icon${s}.png`).join(', '));
