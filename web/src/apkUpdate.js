import { registerPlugin } from "@capacitor/core";
import { httpRequest } from "./http.js";
import { APP_VERSION, isAndroidApp } from "./platform.js";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/QL796907/paperreading_tool/main/updates/android.json";

const ApkUpdater = registerPlugin("ApkUpdater");

function parseVersion(s) {
  return String(s || "0")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
}

function isNewer(remote, local) {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export async function currentAppVersion() {
  if (!isAndroidApp()) return { version: APP_VERSION, versionCode: 0 };
  try {
    return await ApkUpdater.getVersion();
  } catch {
    return { version: APP_VERSION, versionCode: 0 };
  }
}

export async function fetchAndroidManifest() {
  const res = await httpRequest({ method: "GET", url: MANIFEST_URL, timeoutMs: 20000 });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`读不到更新说明（${res.status}）。确认已经推到 GitHub。`);
  }
  const data = JSON.parse(res.text);
  if (!data?.version || !data?.url) throw new Error("更新说明格式不对");
  return data;
}

export async function checkAppUpdate() {
  const [local, remote] = await Promise.all([
    currentAppVersion(),
    fetchAndroidManifest(),
  ]);
  const newer =
    (Number(remote.versionCode) || 0) > (Number(local.versionCode) || 0) ||
    isNewer(remote.version, local.version);
  return {
    current: local.version,
    latest: remote.version,
    newer,
    url: remote.url,
    notes: remote.notes || "",
  };
}

export async function downloadAndInstall(url, onProgress) {
  if (!isAndroidApp()) throw new Error("只有 Android 安装包才能应用内更新");
  const handle = await ApkUpdater.addListener("progress", (info) => {
    onProgress?.(info);
  });
  try {
    const { path } = await ApkUpdater.download({ url });
    await ApkUpdater.install({ path });
    return { ok: true };
  } finally {
    await handle.remove();
  }
}
