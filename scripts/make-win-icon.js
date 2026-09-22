import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicIcons = path.join(root, "web", "public", "icons");
const buildDir = path.join(root, "build");
const electronDir = path.join(root, "electron");

function pngSize(buf) {
  if (buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error("不是 PNG");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function packIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;
  const entries = pngBuffers.map((buf) => {
    const { width, height } = pngSize(buf);
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
  for (const entry of entries) {
    entry.buf.copy(out, entry.offset);
  }
  return out;
}

fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(electronDir, { recursive: true });

const sources = ["icon-16.png", "icon-32.png", "icon-48.png", "icon-192.png", "icon-512.png"];
const pngs = sources.map((name) => fs.readFileSync(path.join(publicIcons, name)));
const ico = packIco(pngs);

fs.writeFileSync(path.join(buildDir, "icon.ico"), ico);
fs.writeFileSync(path.join(electronDir, "icon.ico"), ico);
fs.copyFileSync(path.join(publicIcons, "icon-512.png"), path.join(buildDir, "icon.png"));
fs.copyFileSync(path.join(publicIcons, "icon-32.png"), path.join(electronDir, "tray.png"));

console.log("已生成 Windows 图标：build/icon.ico、electron/icon.ico、electron/tray.png");
