import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createGlossaryStore } from "../web/src/glossaryStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getDataDir() {
  return process.env.GLOSSARY_DATA_DIR || path.join(__dirname, "..", "data");
}

function filePath(name) {
  return path.join(getDataDir(), name);
}

async function ensureDir() {
  await fs.mkdir(getDataDir(), { recursive: true });
}

async function readJsonFile(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJsonFile(file, value) {
  await ensureDir();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export const store = createGlossaryStore({
  readJson: (name, fallback) => readJsonFile(filePath(name), fallback),
  writeJson: (name, value) => writeJsonFile(filePath(name), value),
});
