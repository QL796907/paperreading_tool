import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

/**
 * 方案 E「绿框学印」唯一出图脚本。
 * 图形跟 web/public/icon.svg 同一套几何：奶油底、森林绿双线方印、墨色词条、朱红角点。
 * Android / Windows / favicon 都从这里出，避免再落到 Capacitor 默认蓝标。
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

function drawSeal(c, { simplified = false } = {}) {
  const s = c.size;
  const u = s / 1024;
  fillRounded(c, 0, 0, s, s, 98 * u, PAPER);

  if (simplified) {
    const m = s * 0.16;
    const t = Math.max(1.6, s * 0.08);
    punchRounded(c, m, m, s - m * 2, s - m * 2, Math.max(1, s * 0.04), SEAL);
    punchRounded(
      c,
      m + t,
      m + t,
      s - (m + t) * 2,
      s - (m + t) * 2,
      Math.max(0.5, s * 0.02),
      PAPER,
    );
    const barX = s * 0.3;
    const barW = s * 0.38;
    punchRounded(c, barX, s * 0.32, barW, Math.max(2, s * 0.1), 0, INK);
    punchRounded(c, barX, s * 0.48, barW * 0.82, Math.max(1.5, s * 0.07), 0, INK);
    punchRounded(c, barX, s * 0.6, barW * 0.7, Math.max(1.5, s * 0.07), 0, [...INK.slice(0, 3), 190]);
    const chop = Math.max(2, s * 0.1);
    punchRounded(c, s * 0.68, s * 0.68, chop, chop, 0, RULE);
    return;
  }

  // Match web/public/icon.svg
  punchRounded(c, 148 * u, 148 * u, 728 * u, 728 * u, 18 * u, SEAL);
  punchRounded(c, (148 + 26) * u, (148 + 26) * u, (728 - 52) * u, (728 - 52) * u, 10 * u, PAPER);
  punchRounded(c, 186 * u, 186 * u, 652 * u, 652 * u, 10 * u, SEAL);
  punchRounded(c, (186 + 8) * u, (186 + 8) * u, (652 - 16) * u, (652 - 16) * u, 6 * u, PAPER);
  punchRounded(c, 332 * u, 338 * u, 300 * u, 52 * u, 0, INK);
  punchRounded(c, 332 * u, 428 * u, 248 * u, 22 * u, 0, INK);
  punchRounded(c, 332 * u, 478 * u, 268 * u, 22 * u, 0, [...INK.slice(0, 3), 184]);
  punchRounded(c, 332 * u, 528 * u, 210 * u, 22 * u, 0, [...INK.slice(0, 3), 128]);
  punchRounded(c, 704 * u, 704 * u, 64 * u, 64 * u, 0, RULE);
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
  <rect width="1024" height="1024" rx="98" fill="#F4ECD8"/>
  <rect x="148" y="148" width="728" height="728" rx="18" fill="none" stroke="#2F4F3E" stroke-width="26"/>
  <rect x="186" y="186" width="652" height="652" rx="10" fill="none" stroke="#2F4F3E" stroke-width="8"/>
  <rect x="332" y="338" width="300" height="52" fill="#1F1A14"/>
  <rect x="332" y="428" width="248" height="22" fill="#1F1A14"/>
  <rect x="332" y="478" width="268" height="22" fill="#1F1A14" opacity="0.72"/>
  <rect x="332" y="528" width="210" height="22" fill="#1F1A14" opacity="0.5"/>
  <rect x="704" y="704" width="64" height="64" fill="#C45C48"/>
</svg>
`;
  fs.writeFileSync(path.join(root, "web", "public", "icon.svg"), svg);
  fs.writeFileSync(
    path.join(root, "web", "public", "favicon.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="术语本">
  <rect width="32" height="32" rx="3.5" fill="#F4ECD8"/>
  <rect x="4" y="4" width="24" height="24" rx="1" fill="none" stroke="#2F4F3E" stroke-width="2"/>
  <rect x="9" y="9.5" width="12" height="2.6" fill="#1F1A14"/>
  <rect x="9" y="14" width="10" height="1.8" fill="#1F1A14"/>
  <rect x="9" y="17.4" width="9" height="1.8" fill="#1F1A14" opacity="0.75"/>
  <rect x="21" y="21" width="3.6" height="3.6" fill="#C45C48"/>
</svg>
`,
  );
}

writeMasterSvg();
writeWebAndWindows();
if (fs.existsSync(path.join(root, "android", "app", "src", "main", "res"))) {
  writeAndroid();
}
console.log("已按方案 E「绿框学印」重出 Web / Windows / Android 图标。");
