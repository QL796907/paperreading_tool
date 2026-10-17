import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { createGlossaryStore } from "./glossaryStore.js";

function isMissingFile(err) {
  if (err && err.code === "ENOENT") return true;
  const message = err && typeof err.message === "string" ? err.message : "";
  return message === "File does not exist" || message === "File does not exist.";
}

async function readFile(name, fallback) {
  let text;
  try {
    const res = await Filesystem.readFile({
      path: name,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    text = res.data;
  } catch (err) {
    // 只有文件还没建过才当空。读失败若当成空对象，下次 save 会盖掉 terms.json 或 settings.json。
    if (isMissingFile(err)) return fallback;
    throw err;
  }
  return JSON.parse(text);
}

async function writeFile(name, value) {
  await Filesystem.writeFile({
    path: name,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify(value, null, 2),
  });
}

export const nativeStore = createGlossaryStore({
  readJson: readFile,
  writeJson: writeFile,
});
