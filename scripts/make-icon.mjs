// Génère resources/icon.png (256×256) : carré arrondi bleu, flèche vers le bas et « M » en blanc.
// Dessin vectoriel simple rastérisé avec suréchantillonnage 4×4 ; aucun fichier externe.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const N = 256;
const S = 4;

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inPoly(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// « M » en trait épais (4 segments) et flèche.
const M = [
  [56, 168], [56, 88], [96, 128], [136, 88], [136, 168],
];
function inStroke(x, y, pts, w) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    if ((x - (ax + t * dx)) ** 2 + (y - (ay + t * dy)) ** 2 <= (w / 2) ** 2) return true;
  }
  return false;
}
const arrowStem = (x, y) => x >= 178 && x <= 198 && y >= 88 && y <= 140;
const arrowHead = (x, y) => inPoly(x, y, [[160, 132], [216, 132], [188, 172]]);

const raw = Buffer.alloc((N * 4 + 1) * N);
for (let py = 0; py < N; py++) {
  raw[py * (N * 4 + 1)] = 0;
  for (let px = 0; px < N; px++) {
    let bg = 0;
    let fg = 0;
    for (let sy = 0; sy < S; sy++) {
      for (let sx = 0; sx < S; sx++) {
        const x = px + (sx + 0.5) / S;
        const y = py + (sy + 0.5) / S;
        if (inRoundRect(x, y, 12, 12, 244, 244, 44)) {
          bg++;
          if (inStroke(x, y, M, 20) || arrowStem(x, y) || arrowHead(x, y)) fg++;
        }
      }
    }
    const total = S * S;
    const a = bg / total;
    const f = bg ? fg / bg : 0;
    // dégradé vertical bleu
    const k = py / N;
    const r = 47 + (30 - 47) * k;
    const g = 125 + (84 - 125) * k;
    const b = 225 + (170 - 225) * k;
    const o = py * (N * 4 + 1) + 1 + px * 4;
    raw[o] = Math.round(r + (255 - r) * f);
    raw[o + 1] = Math.round(g + (255 - g) * f);
    raw[o + 2] = Math.round(b + (255 - b) * f);
    raw[o + 3] = Math.round(a * 255);
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(root, 'resources', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('Icône écrite :', out, `${png.length} octets`);

// Icône Windows (.ico) contenant le PNG 256×256 tel quel (format accepté depuis Windows Vista).
const ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico[6] = 0; // 256 px
ico[7] = 0;
ico[8] = 0;
ico[9] = 0;
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
const icoPath = path.join(root, 'resources', 'icon.ico');
fs.writeFileSync(icoPath, Buffer.concat([ico, png]));
console.log('Icône Windows écrite :', icoPath);
