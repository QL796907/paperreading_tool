import fs from "fs/promises";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import JSZip from "jszip";
import { pluginBudgetSource } from "./pluginBudget.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pluginDir = path.join(root, "zotero-plugin");
const outFile = path.join(root, "paper-glossary.xpi");
const releaseDir = path.join(root, "release");
const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

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

const manifestPath = path.join(pluginDir, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
if (manifest.version !== pkg.version) {
  manifest.version = pkg.version;
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

const budgetPath = path.join(pluginDir, "explainBudget.js");
const budgetSource = pluginBudgetSource();
if ((await fs.readFile(budgetPath, "utf8").catch(() => "")) !== budgetSource) {
  await fs.writeFile(budgetPath, budgetSource);
}

const zip = new JSZip();
await addDir(zip, pluginDir);
const buf = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
});
await fs.writeFile(outFile, buf);
await fs.mkdir(releaseDir, { recursive: true });
await fs.writeFile(path.join(releaseDir, "paper-glossary.xpi"), buf);

const sha = crypto.createHash("sha256").update(buf).digest("hex");
const updates = {
  addons: {
    "paper-glossary@local": {
      updates: [
        {
          version: pkg.version,
          update_link: `https://github.com/QL796907/paperreading_tool/releases/download/v${pkg.version}/paper-glossary.xpi`,
          update_hash: `sha256:${sha}`,
          applications: {
            zotero: { strict_min_version: "7.0" },
          },
        },
      ],
    },
  },
};
await fs.mkdir(path.join(root, "updates"), { recursive: true });
await fs.writeFile(
  path.join(root, "updates", "zotero.json"),
  `${JSON.stringify(updates, null, 2)}\n`,
  "utf8",
);

console.log("已打包插件：", outFile);
console.log("Zotero 更新清单已写入 updates/zotero.json");
