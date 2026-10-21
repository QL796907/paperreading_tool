import { registerPlugin } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { createGlossaryStore } from "../../shared/glossaryStore.js";

// Directory.Data 就是 context.getFilesDir()。临时文件必须和正式文件在同一目录，
// 下面的 replace 才能用一次 rename 盖掉旧文件。
const GlossaryFile = registerPlugin("GlossaryFile");

function isMissingFile(err) {
  if (err && err.code === "ENOENT") return true;
  const message = err && typeof err.message === "string" ? err.message : "";
  return message === "File does not exist" || message === "File does not exist.";
}

export function createNativeStore({
  readFile = (options) => Filesystem.readFile(options),
  writeFile = (options) => Filesystem.writeFile(options),
  replace = (options) => GlossaryFile.replace(options),
} = {}) {
  async function readJson(name, fallback) {
    let text;
    try {
      const res = await readFile({
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

  async function writeJson(name, value) {
    const tmp = `${name}.tmp`;
    await writeFile({
      path: tmp,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: JSON.stringify(value, null, 2),
    });
    // Filesystem.rename 在 Android 上先删目标再 File.renameTo，不是一次替换。
    await replace({ from: tmp, to: name });
  }

  return createGlossaryStore({ readJson, writeJson });
}

export const nativeStore = createNativeStore();
