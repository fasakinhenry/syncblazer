// Generates the PWA/app icons from scratch as real PNGs (no native deps),
// so installability works reliably across Android/iOS/desktop without relying
// on an external image tool. Re-run with `bun run scripts/generate-icons.mjs`
// whenever the brand mark changes.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");
const iconsDir = path.join(publicDir, "icons");
mkdirSync(iconsDir, { recursive: true });

const BRAND_BLUE = [0x28, 0x7b, 0xff];
const OFF_WHITE = [0xf8, 0xfa, 0xfc];

// --- Minimal PNG encoder (IHDR + single IDAT + IEND, 8-bit RGBA) ---
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Flame glyph: a smooth closed silhouette (Catmull-Rom through key
// points, one side tapered, the other with a flicker lobe) rasterized with
// ray-casting point-in-polygon + supersampled anti-aliasing ---

// y-up, roughly [-1, 1]. Asymmetric: smooth taper on the right, a pinched
// "flicker" notch on the left so it actually reads as fire, not a blob.
const OUTER_KEY_POINTS = [
  { x: 0.0, y: 0.9 }, // tip
  { x: 0.16, y: 0.52 },
  { x: 0.34, y: 0.18 }, // right shoulder
  { x: 0.3, y: -0.2 },
  { x: 0.16, y: -0.55 },
  { x: 0.0, y: -0.68 }, // bottom
  { x: -0.18, y: -0.52 },
  { x: -0.36, y: -0.18 }, // left shoulder (widest)
  { x: -0.2, y: 0.1 }, // waist pinch (flicker notch)
  { x: -0.32, y: 0.34 }, // flicker lobe
  { x: -0.12, y: 0.55 },
];
const INNER_KEY_POINTS = OUTER_KEY_POINTS.map((p) => ({ x: p.x * 0.5, y: p.y * 0.5 - 0.08 }));

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const x =
    0.5 *
    (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const y =
    0.5 *
    (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return { x, y };
}

function buildSmoothClosedPolygon(points, samplesPerSegment = 14) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < samplesPerSegment; s++) {
      out.push(catmullRomPoint(p0, p1, p2, p3, s / samplesPerSegment));
    }
  }
  return out;
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const OUTER_POLY = buildSmoothClosedPolygon(OUTER_KEY_POINTS);
const INNER_POLY = buildSmoothClosedPolygon(INNER_KEY_POINTS);

function flameCoverage(nx, ny) {
  // nx, ny roughly in [-1, 1]; returns 0..1 coverage for outer (white) and
  // inner (background cutout) so the flame reads as two-tone.
  const SS = 2;
  let outer = 0;
  let inner = 0;
  for (let sy = 0; sy < SS; sy++) {
    for (let sx = 0; sx < SS; sx++) {
      const ox = nx + (sx / (SS - 1) - 0.5) * (1 / 48);
      const oy = ny + (sy / (SS - 1) - 0.5) * (1 / 48);
      if (pointInPolygon(ox, oy, OUTER_POLY)) outer++;
      if (pointInPolygon(ox, oy, INNER_POLY)) inner++;
    }
  }
  const outerCoverage = outer / (SS * SS);
  const innerCoverage = inner / (SS * SS);
  return { outerCoverage, innerCoverage };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function renderIcon({ size, glyphScale, cornerRadius, background = BRAND_BLUE }) {
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // rounded-square background mask
      let bgAlpha = 1;
      if (cornerRadius > 0) {
        const px = x + 0.5;
        const py = y + 0.5;
        const rx = Math.min(px, size - px);
        const ry = Math.min(py, size - py);
        if (rx < cornerRadius && ry < cornerRadius) {
          const dx = cornerRadius - rx;
          const dy = cornerRadius - ry;
          const dist = Math.sqrt(dx * dx + dy * dy);
          bgAlpha = dist <= cornerRadius ? 1 : Math.max(0, 1 - (dist - cornerRadius));
        }
      }

      let r = background[0];
      let g = background[1];
      let b = background[2];

      // normalized coords centered at 0, scaled by glyphScale so the glyph
      // stays inside a maskable-safe circle when needed (glyphScale > 1 shrinks it)
      const nx = ((x + 0.5) / size - 0.5) * 2 * glyphScale;
      const ny = ((y + 0.5) / size - 0.5) * 2 * glyphScale;

      const { outerCoverage, innerCoverage } = flameCoverage(nx, ny);
      if (outerCoverage > 0) {
        r = lerp(r, OFF_WHITE[0], outerCoverage);
        g = lerp(g, OFF_WHITE[1], outerCoverage);
        b = lerp(b, OFF_WHITE[2], outerCoverage);
      }
      if (innerCoverage > 0) {
        r = lerp(r, background[0], innerCoverage);
        g = lerp(g, background[1], innerCoverage);
        b = lerp(b, background[2], innerCoverage);
      }

      rgba[idx] = Math.round(r);
      rgba[idx + 1] = Math.round(g);
      rgba[idx + 2] = Math.round(b);
      rgba[idx + 3] = Math.round(255 * bgAlpha);
    }
  }

  return encodePng(size, size, rgba);
}

const targets = [
  { name: "icon-192.png", size: 192, glyphScale: 1.15, cornerRadius: 192 * 0.18, dir: iconsDir },
  { name: "icon-512.png", size: 512, glyphScale: 1.15, cornerRadius: 512 * 0.18, dir: iconsDir },
  // maskable: full-bleed background, glyph shrunk to sit inside the safe zone
  { name: "icon-maskable-512.png", size: 512, glyphScale: 1.5, cornerRadius: 0, dir: iconsDir },
];

for (const t of targets) {
  const png = renderIcon(t);
  writeFileSync(path.join(t.dir, t.name), png);
  console.log(`wrote ${path.join("public", "icons", t.name)}`);
}

// apple-touch-icon: iOS applies its own rounding, so keep it a full square
const appleTouch = renderIcon({ size: 180, glyphScale: 1.15, cornerRadius: 0 });
writeFileSync(path.join(publicDir, "apple-touch-icon.png"), appleTouch);
console.log("wrote public/apple-touch-icon.png");
