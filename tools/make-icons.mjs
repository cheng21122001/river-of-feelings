/* make-icons.mjs — 图标：几道水纹，加一个光点。
   用的是 app 自己的形状语言（横杠 = 平静的水，实心点 = 快乐的光），
   而不是把首页那条流体缩小塞进方块里——那样在小尺寸下只会像一块肉。
   自己写 PNG 编码，不引任何依赖。

   用法：node tools/make-icons.mjs
*/

import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "icons");
mkdirSync(OUT, { recursive: true });

/* ---------- 画 ---------- */

const smooth = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// 一块灰瓷砖：中性偏暖的灰底，纹路往深里压。
// 和 app 日间模式同一套语言（深色形状落在浅色纸上），不是发亮的白。
const BG   = [143, 143, 137];
const MARK = [42, 42, 38];

function render(size) {
  const W = size, H = size;
  const px = new Float32Array(W * H * 3);

  for (let i = 0; i < W * H; i++) {
    px[i * 3] = BG[0]; px[i * 3 + 1] = BG[1]; px[i * 3 + 2] = BG[2];
  }

  // a = 覆盖度 0–1，把底色往 MARK 方向压，而不是加亮
  const add = (x, y, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
    if (a > 1) a = 1;
    const i = (Math.floor(y) * W + Math.floor(x)) * 3;
    px[i]     += (MARK[0] - px[i])     * a;
    px[i + 1] += (MARK[1] - px[i + 1]) * a;
    px[i + 2] += (MARK[2] - px[i + 2]) * a;
  };

  // 四道水纹。上下两道暗一些，中间两道亮——像水面被光照到的一段。
  const lines = [
    { y: 0.355, a: 0.42, ph: 0.0 },
    { y: 0.470, a: 0.90, ph: 1.5 },
    { y: 0.585, a: 1.00, ph: 3.0 },
    { y: 0.700, a: 0.55, ph: 4.4 }
  ];

  const x0 = W * 0.17, x1 = W * 0.83;
  const half = Math.max(0.75, size * 0.017);      // 线的半宽
  const amp = size * 0.030;
  const lambda = W * 0.62;
  const fade = (x1 - x0) * 0.22;                  // 两端淡出

  for (const ln of lines) {
    const baseY = H * ln.y;
    for (let x = Math.floor(x0); x <= x1; x++) {
      const taper = Math.min(smooth((x - x0) / fade), smooth((x1 - x) / fade));
      if (taper <= 0) continue;
      const yc = baseY + amp * Math.sin((x / lambda) * Math.PI * 2 + ln.ph);
      const lo = Math.floor(yc - half - 1), hi = Math.ceil(yc + half + 1);
      for (let y = lo; y <= hi; y++) {
        const cov = Math.max(0, Math.min(1, half + 0.5 - Math.abs(y + 0.5 - yc)));
        if (cov > 0) add(x, y, cov * ln.a * taper);
      }
    }
  }

  // 一个光点：黑暗里的一点光
  const dx = W * 0.735, dy = H * 0.255, dr = size * 0.042;
  for (let y = Math.floor(dy - dr * 3); y <= dy + dr * 3; y++) {
    for (let x = Math.floor(dx - dr * 3); x <= dx + dr * 3; x++) {
      const d = Math.hypot(x + 0.5 - dx, y + 0.5 - dy);
      if (d < dr) {
        add(x, y, Math.min(1, (dr - d) * 1.6));              // 实心
      } else {
        const g = Math.max(0, 1 - (d - dr) / (dr * 2));      // 一圈晕
        if (g > 0) add(x, y, Math.pow(g, 2) * 0.30);
      }
    }
  }

  // 打包成 RGBA
  const raw = Buffer.alloc(H * (1 + W * 4));
  let o = 0;
  for (let y = 0; y < H; y++) {
    raw[o++] = 0;                       // filter: none
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      raw[o++] = clamp(px[i]);
      raw[o++] = clamp(px[i + 1]);
      raw[o++] = clamp(px[i + 2]);
      raw[o++] = 255;
    }
  }
  return { raw, W, H };
}

const clamp = v => Math.max(0, Math.min(255, Math.round(v)));

/* ---------- PNG 编码 ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function png(raw, W, H) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------- 输出 ---------- */

// 1024 是给 macOS .icns 用的（Retina 下的 512@2x），网页本身用不到
for (const [size, name] of [[1024, "icon-1024.png"], [512, "icon-512.png"], [192, "icon-192.png"], [180, "apple-touch-icon.png"]]) {
  const { raw, W, H } = render(size);
  writeFileSync(join(OUT, name), png(raw, W, H));
  console.log("wrote", name, size + "×" + size);
}
