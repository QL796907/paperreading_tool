import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const androidDir = path.join(root, "android");
const releaseDir = path.join(root, "release");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const isWin = process.platform === "win32";
const gradle = path.join(androidDir, isWin ? "gradlew.bat" : "gradlew");

if (!fs.existsSync(gradle)) {
  console.error("还没有 Android 工程。请先运行 npm run android:setup");
  process.exit(1);
}

const keystore = path.join(androidDir, "glossary.keystore");
if (!fs.existsSync(keystore)) {
  console.error(`
【换电脑提醒】缺少 android/glossary.keystore。
请从旧电脑拷来签名钥匙后再打包，不要重新生成。
`);
  process.exit(1);
}

const result = spawnSync(gradle, ["assembleRelease", "-I", "mirror.init.gradle"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
});
if (result.status !== 0) process.exit(result.status ?? 1);

const built = path.join(
  androidDir,
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk",
);
if (!fs.existsSync(built)) {
  console.error("没有找到 app-release.apk");
  process.exit(1);
}
fs.mkdirSync(releaseDir, { recursive: true });
const dest = path.join(releaseDir, `paper-glossary-${pkg.version}.apk`);
fs.copyFileSync(built, dest);
console.log("已生成安装包：", dest);
