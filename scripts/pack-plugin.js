import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import JSZip from "jszip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pluginDir = path.join(root, "zotero-plugin");
const outFile = path.join(root, "paper-glossary.xpi");

async function addDir(zip, dir, prefix = "") {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.endsWith(".xpi") || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await addDir(zip, full, rel);
    else zip.file(rel, await fs.readFile(full));
  }
}

const zip = new JSZip();
await addDir(zip, pluginDir);
const buf = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
});
await fs.writeFile(outFile, buf);
console.log("已打包插件：", outFile);
