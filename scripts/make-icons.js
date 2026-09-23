import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

/**
 * 方案 E「绿框学印」唯一出图脚本。
 * 图形对齐 hy 当初敲定的 Grokbot 示例：奶油圆角方印、森林绿双线框、
 * 中间一本立着的墨色书（封面微掀）、朱红角点在右上。
 * Android / Windows / favicon 都从这里出。
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const PAPER = [0xf4, 0xec, 0xd8, 255];
const SEAL = [0x2f, 0x4f, 0x3e, 255];
const INK = [0x1f, 0x1a, 0x14, 255];
const RULE = [0xc4, 0x5c, 0x48, 255];
const DESK = [0x2c, 0x24, 0x1c, 255];

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(canvas) {
  const { size, data } = canvas;
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    const row = y * (1 + size * 4);
    raw[row] = 0;
    data.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function canvas(size, fill) {
  const data = Buffer.alloc(size * size * 4);
  if (fill) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fill[0];
      data[i + 1] = fill[1];
      data[i + 2] = fill[2];
      data[i + 3] = fill[3];
    }
  }
  return { size, data };
}

function mix(dst, i, color, a) {
  if (a <= 0) return;
  const ia = color[3] / 255 * a;
  const di = i * 4;
  const da = dst[di + 3] / 255;
  const outA = ia + da * (1 - ia);
  if (outA <= 0) return;
  dst[di] = Math.round((color[0] * ia + dst[di] * da * (1 - ia)) / outA);
  dst[di + 1] = Math.round((color[1] * ia + dst[di + 1] * da * (1 - ia)) / outA);
  dst[di + 2] = Math.round((color[2] * ia + dst[di + 2] * da * (1 - ia)) / outA);
  dst[di + 3] = Math.round(outA * 255);
}

function roundedCover(px, py, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const lx = px - x;
  const ly = py - y;
  if (lx < 0 || ly < 0 || lx > w || ly > h) return false;
  if (lx < rr && ly < rr) return (lx - rr) ** 2 + (ly - rr) ** 2 <= rr * rr;
  if (lx > w - rr && ly < rr) return (lx - (w - rr)) ** 2 + (ly - rr) ** 2 <= rr * rr;
  if (lx < rr && ly > h - rr) return (lx - rr) ** 2 + (ly - (h - rr)) ** 2 <= rr * rr;
  if (lx > w - rr && ly > h - rr) return (lx - (w - rr)) ** 2 + (ly - (h - rr)) ** 2 <= rr * rr;
  return true;
}

function fillRounded(c, x, y, w, h, r, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(c.size, Math.ceil(x + w));
  const y1 = Math.min(c.size, Math.ceil(y + h));
  const samples = [0.25, 0.75];
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      let n = 0;
      for (const ox of samples) {
        for (const oy of samples) {
          if (roundedCover(px + ox, py + oy, x, y, w, h, r)) n += 1;
        }
      }
      mix(c.data, py * c.size + px, color, n / 4);
    }
  }
}

function punchRounded(c, x, y, w, h, r, color) {
  fillRounded(c, x, y, w, h, r, color);
}

function inPolygon(px, py, pts) {
  let n = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const yi = pts[i][1];
    const yj = pts[j][1];
    const xi = pts[i][0];
    const xj = pts[j][0];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) n += 1;
  }
  return n % 2 === 1;
}

function fillPolygon(c, pts, color) {
  let minX = c.size;
  let minY = c.size;
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(c.size, Math.ceil(maxX));
  const y1 = Math.min(c.size, Math.ceil(maxY));
  const samples = [0.25, 0.75];
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      let n = 0;
      for (const ox of samples) {
        for (const oy of samples) {
          if (inPolygon(px + ox, py + oy, pts)) n += 1;
        }
      }
      mix(c.data, py * c.size + px, color, n / 4);
    }
  }
}

function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = x1 + t * dx;
  const qy = y1 + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function strokePolyline(c, pts, width, color) {
  const hw = width / 2;
  let minX = c.size;
  let minY = c.size;
  let maxX = 0;
  let maxY = 0;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const x0 = Math.max(0, Math.floor(minX - hw - 1));
  const y0 = Math.max(0, Math.floor(minY - hw - 1));
  const x1 = Math.min(c.size, Math.ceil(maxX + hw + 1));
  const y1 = Math.min(c.size, Math.ceil(maxY + hw + 1));
  const samples = [0.25, 0.75];
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      let n = 0;
      for (const ox of samples) {
        for (const oy of samples) {
          const x = px + ox;
          const y = py + oy;
          for (let i = 1; i < pts.length; i += 1) {
            if (distToSeg(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= hw) {
              n += 1;
              break;
            }
          }
        }
      }
      mix(c.data, py * c.size + px, color, n / 4);
    }
  }
}

function drawBook(c, u) {
  // Standing book + lifted cover polyline, traced from the Grokbot example.
  punchRounded(c, 417 * u, 424 * u, 191 * u, 247 * u, 0, INK);
  strokePolyline(
    c,
    [
      [417 * u, 424 * u],
      [508 * u, 348 * u],
      [548 * u, 378 * u],
      [610 * u, 378 * u],
    ],
    13 * u,
    INK,
  );
}

function drawSeal(c, { simplified = false } = {}) {
  const s = c.size;
  const u = s / 1024;
  fillRounded(c, 0, 0, s, s, 112 * u, PAPER);

  if (simplified) {
    const m = s * 0.14;
    const t = Math.max(1.5, s * 0.07);
    punchRounded(c, m, m, s - m * 2, s - m * 2, Math.max(1, s * 0.03), SEAL);
    punchRounded(
      c,
      m + t,
      m + t,
      s - (m + t) * 2,
      s - (m + t) * 2,
      Math.max(0.5, s * 0.02),
      PAPER,
    );
    const bw = Math.max(4, s * 0.22);
    const bh = Math.max(6, s * 0.3);
    const bx = (s - bw) / 2;
    const by = s * 0.4;
    punchRounded(c, bx, by, bw, bh, 0, INK);
    strokePolyline(
      c,
      [
        [bx, by],
        [s * 0.52, s * 0.26],
        [s * 0.58, s * 0.32],
        [bx + bw * 0.95, s * 0.32],
      ],
      Math.max(1.4, s * 0.055),
      INK,
    );
    const chop = Math.max(2, s * 0.08);
    punchRounded(c, s * 0.72, s * 0.22, chop, chop, 0, RULE);
    return;
  }

  punchRounded(c, 96 * u, 88 * u, 832 * u, 848 * u, 18 * u, SEAL);
  punchRounded(c, (96 + 8) * u, (88 + 8) * u, (832 - 16) * u, (848 - 16) * u, 12 * u, PAPER);
  punchRounded(c, 124 * u, 116 * u, 776 * u, 792 * u, 14 * u, SEAL);
  punchRounded(c, (124 + 6) * u, (116 + 6) * u, (776 - 12) * u, (792 - 12) * u, 10 * u, PAPER);
  drawBook(c, u);
  punchRounded(c, 807 * u, 167 * u, 43 * u, 43 * u, 0, RULE);
}

function circleMask(src) {
  const c = canvas(src.size);
  const r = src.size / 2;
  const samples = [0.25, 0.75];
  for (let y = 0; y < src.size; y += 1) {
    for (let x = 0; x < src.size; x += 1) {
      let n = 0;
      for (const ox of samples) {
        for (const oy of samples) {
          const dx = x + ox - r;
          const dy = y + oy - r;
          if (dx * dx + dy * dy <= r * r) n += 1;
        }
      }
      const a = n / 4;
      const i = (y * src.size + x) * 4;
      c.data[i] = src.data[i];
      c.data[i + 1] = src.data[i + 1];
      c.data[i + 2] = src.data[i + 2];
      c.data[i + 3] = Math.round(src.data[i + 3] * a);
    }
  }
  return c;
}

function composeCentered(bg, fg, fgSize) {
  const out = canvas(bg.size, null);
  bg.data.copy(out.data);
  const x0 = Math.round((bg.size - fgSize) / 2);
  const y0 = x0;
  // fg is fgSize canvas
  for (let y = 0; y < fgSize; y += 1) {
    for (let x = 0; x < fgSize; x += 1) {
      const dx = x0 + x;
      const dy = y0 + y;
      if (dx < 0 || dy < 0 || dx >= bg.size || dy >= bg.size) continue;
      const si = y * fgSize + x;
      const di = dy * bg.size + dx;
      const a = fg.data[si * 4 + 3] / 255;
      mix(out.data, di, [fg.data[si * 4], fg.data[si * 4 + 1], fg.data[si * 4 + 2], 255], a);
    }
  }
  return out;
}

function makeIcon(size) {
  const c = canvas(size);
  drawSeal(c, { simplified: size <= 48 });
  return c;
}

function makeForeground(size) {
  // Adaptive safe zone ~66%. Full seal already has ~14% cream margin;
  // drawing the full icon into the 72% center keeps the green frame inside a circle crop.
  const c = canvas(size);
  const inner = Math.round(size * 0.78);
  const icon = canvas(inner);
  drawSeal(icon, { simplified: inner <= 48 });
  const x0 = Math.round((size - inner) / 2);
  for (let y = 0; y < inner; y += 1) {
    for (let x = 0; x < inner; x += 1) {
      const si = (y * inner + x) * 4;
      const di = ((y + x0) * size + (x + x0)) * 4;
      icon.data.copy(c.data, di, si, si + 4);
    }
  }
  return c;
}

function makeDeskPreview(size = 1024) {
  const bg = canvas(size, DESK);
  const inner = Math.round(size * 0.62);
  const icon = canvas(inner);
  drawSeal(icon);
  return composeCentered(bg, icon, inner);
}

function packIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const entries = pngBuffers.map((buf) => {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    const entry = {
      width: width >= 256 ? 0 : width,
      height: height >= 256 ? 0 : height,
      buf,
      offset,
      size: buf.length,
    };
    offset += buf.length;
    return entry;
  });
  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(count, 4);
  let cursor = 6;
  for (const entry of entries) {
    out[cursor] = entry.width;
    out[cursor + 1] = entry.height;
    out[cursor + 2] = 0;
    out[cursor + 3] = 0;
    out.writeUInt16LE(1, cursor + 4);
    out.writeUInt16LE(32, cursor + 6);
    out.writeUInt32LE(entry.size, cursor + 8);
    out.writeUInt32LE(entry.offset, cursor + 12);
    cursor += 16;
  }
  for (const entry of entries) entry.buf.copy(out, entry.offset);
  return out;
}

function writePng(file, c) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(c));
}

function writeAndroid() {
  const res = path.join(root, "android", "app", "src", "main", "res");
  const densities = [
    { name: "mdpi", launcher: 48, foreground: 108 },
    { name: "hdpi", launcher: 72, foreground: 162 },
    { name: "xhdpi", launcher: 96, foreground: 216 },
    { name: "xxhdpi", launcher: 144, foreground: 324 },
    { name: "xxxhdpi", launcher: 192, foreground: 432 },
  ];
  for (const d of densities) {
    const dir = path.join(res, `mipmap-${d.name}`);
    const square = makeIcon(d.launcher);
    writePng(path.join(dir, "ic_launcher.png"), square);
    writePng(path.join(dir, "ic_launcher_round.png"), circleMask(square));
    writePng(path.join(dir, "ic_launcher_foreground.png"), makeForeground(d.foreground));
  }

  fs.writeFileSync(
    path.join(res, "values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#F4ECD8</color>
</resources>
`,
  );

  const splashXml = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/ic_launcher_background" />
    <item>
        <bitmap
            android:gravity="center"
            android:src="@mipmap/ic_launcher" />
    </item>
</layer-list>
`;
  fs.writeFileSync(path.join(res, "drawable", "splash.xml"), splashXml);

  const splashPngs = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory() && name.startsWith("drawable")) walk(full);
      else if (name === "splash.png") splashPngs.push(full);
    }
  }
  walk(res);
  for (const file of splashPngs) fs.unlinkSync(file);

  fs.writeFileSync(
    path.join(res, "drawable", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#F4ECD8" />
</shape>
`,
  );

  const robot = path.join(res, "drawable-v24", "ic_launcher_foreground.xml");
  if (fs.existsSync(robot)) fs.unlinkSync(robot);
}

function writeWebAndWindows() {
  const publicIcons = path.join(root, "web", "public", "icons");
  const buildDir = path.join(root, "build");
  const electronDir = path.join(root, "electron");
  fs.mkdirSync(publicIcons, { recursive: true });
  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(electronDir, { recursive: true });

  const sizes = [16, 32, 48, 192, 256, 512, 1024];
  const pngBySize = {};
  for (const size of sizes) {
    const c = makeIcon(size);
    const buf = encodePng(c);
    pngBySize[size] = buf;
    fs.writeFileSync(path.join(publicIcons, `icon-${size}.png`), buf);
  }
  writePng(path.join(publicIcons, "icon-on-desk.png"), makeDeskPreview(1024));

  const ico = packIco([
    pngBySize[16],
    pngBySize[32],
    pngBySize[48],
    pngBySize[256],
    pngBySize[512],
  ]);
  fs.writeFileSync(path.join(root, "web", "public", "favicon.ico"), ico);
  fs.writeFileSync(path.join(buildDir, "icon.ico"), ico);
  fs.writeFileSync(path.join(electronDir, "icon.ico"), ico);
  fs.writeFileSync(path.join(buildDir, "icon.png"), pngBySize[512]);
  fs.writeFileSync(path.join(electronDir, "tray.png"), pngBySize[32]);
}

function writeMasterSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="术语本">
  <rect width="1024" height="1024" rx="112" fill="#F4ECD8"/>
  <rect x="96" y="88" width="832" height="848" rx="18" fill="none" stroke="#2F4F3E" stroke-width="8"/>
  <rect x="124" y="116" width="776" height="792" rx="14" fill="none" stroke="#2F4F3E" stroke-width="6"/>
  <rect x="417" y="424" width="191" height="247" fill="#1F1A14"/>
  <polyline points="417,424 508,348 548,378 610,378" fill="none" stroke="#1F1A14" stroke-width="13" stroke-linejoin="miter" stroke-linecap="square"/>
  <rect x="807" y="167" width="43" height="43" fill="#C45C48"/>
</svg>
`;
  fs.writeFileSync(path.join(root, "web", "public", "icon.svg"), svg);
  fs.writeFileSync(
    path.join(root, "web", "public", "favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="术语本">
  <rect width="32" height="32" rx="4" fill="#F4ECD8"/>
  <rect x="4" y="4" width="24" height="24" rx="1.2" fill="none" stroke="#2F4F3E" stroke-width="1.7"/>
  <rect x="12.4" y="13.4" width="7.2" height="9.4" fill="#1F1A14"/>
  <polyline points="12.4,13.4 16.2,10.8 17.6,12 19.8,12" fill="none" stroke="#1F1A14" stroke-width="1.4" stroke-linejoin="miter" stroke-linecap="square"/>
  <rect x="22.2" y="7.2" width="2.4" height="2.4" fill="#C45C48"/>
</svg>
`,
  );
}

function writePreviews() {
  const out = path.join(root, "web", "public", "icons");
  const winBg = canvas(720, DESK);
  const winIcon = makeIcon(160);
  const win = composeCentered(winBg, winIcon, 160);
  writePng(path.join(out, "preview-windows.png"), win);

  const phoneBg = canvas(720, [24, 24, 28, 255]);
  const phoneIcon = makeIcon(176);
  const phone = composeCentered(phoneBg, phoneIcon, 176);
  writePng(path.join(out, "preview-android.png"), phone);

  const phoneRound = composeCentered(phoneBg, circleMask(makeIcon(176)), 176);
  writePng(path.join(out, "preview-android-round.png"), phoneRound);
}

writeMasterSvg();
writeWebAndWindows();
writePreviews();
if (fs.existsSync(path.join(root, "android", "app", "src", "main", "res"))) {
  writeAndroid();
}
console.log("已按 Grokbot 示例重出绿框立书图标。");
