import { registerPlugin } from "@capacitor/core";
import { httpRequest } from "./http.js";
import { APP_VERSION, isAndroidApp } from "./platform.js";
import { githubMirrorOn, withGithubMirror } from "../../electron/githubMirror.js";

const MANIFEST_URL =
  "https://raw.githubusercontent.com/QL796907/paperreading_tool/main/updates/android.json";

const ApkUpdater = registerPlugin("ApkUpdater");

export async function currentAppVersion() {
  if (!isAndroidApp()) return { version: APP_VERSION, versionCode: 0 };
  try {
    return await ApkUpdater.getVersion();
  } catch {
    return { version: APP_VERSION, versionCode: 0 };
  }
}

export async function fetchAndroidManifest(settings) {
  const url = withGithubMirror(MANIFEST_URL, githubMirrorOn(settings));
  const res = await httpRequest({ method: "GET", url, timeoutMs: 20000 });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`读不到更新说明（${res.status}）。确认已经推到 GitHub。`);
  }
  const data = JSON.parse(res.text);
  if (!data?.version || !data?.url) throw new Error("更新说明格式不对");
  return data;
}

export async function checkAppUpdate(settings) {
  const useMirror = githubMirrorOn(settings);
  const [local, remote] = await Promise.all([
    currentAppVersion(),
    fetchAndroidManifest(settings),
  ]);
  const newer = (Number(remote.versionCode) || 0) > (Number(local.versionCode) || 0);
  return {
    current: local.version,
    latest: remote.version,
    newer,
    url: withGithubMirror(remote.url, useMirror),
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
