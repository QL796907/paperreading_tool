import { useState } from "react";
import { APP_VERSION, isAndroidApp } from "./platform.js";
import { GITHUB_MIRROR_DOCS, githubMirrorOn } from "../../electron/githubMirror.js";

export default function SettingsUpdatePanel({ draft, setField, busy, setError, onToast }) {
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateNote, setUpdateNote] = useState("");
  const android = isAndroidApp();

  async function checkUpdate() {
    setUpdateBusy(true);
    setError("");
    setUpdateNote("正在检查…");
    try {
      // 只在点「检查并安装」时取。这个面板打开时不要把 Capacitor 拉进桌面。
      const { checkAppUpdate, downloadAndInstall } = await import("./apkUpdate.js");
      const info = await checkAppUpdate(draft);
      if (!info.newer) {
        setUpdateNote(`已经是最新版 ${info.current}`);
        return;
      }
      setUpdateNote(`发现 ${info.latest}，正在下载…`);
      await downloadAndInstall(info.url, (p) => {
        if (!p?.total) return;
        const pct = Math.min(99, Math.round((p.received / p.total) * 100));
        setUpdateNote(`正在下载 ${info.latest}（${pct}%）`);
      });
      setUpdateNote("已开始安装。系统会弹出安装确认。");
      onToast?.("正在安装新版本");
    } catch (err) {
      setError(err.message);
      setUpdateNote("");
    } finally {
      setUpdateBusy(false);
    }
  }

  return (
    <section className="settings-block">
      <h3>应用更新</h3>
      <p className="hint">
        当前版本 {APP_VERSION}。安装包从 GitHub Releases 下载。
        {android
          ? " 手机点下面检查并安装。Zotero 插件不走这里，它在 Zotero 的「插件」里自己更新。"
          : " 电脑版在后台下载。下好后点页面上的「现在更新」，会静默装好并重新打开，不弹出安装窗口。从托盘退出时也会静默安装。只关窗口不会退出。"}
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={githubMirrorOn(draft)}
          onChange={(e) => setField("githubMirrorEnabled", e.target.checked)}
        />
        使用镜像下载更新
      </label>
      <p className="hint">
        默认勾选。走{" "}
        <a href={GITHUB_MIRROR_DOCS} target="_blank" rel="noreferrer">
          gh.4o.pw
        </a>{" "}
        代下 GitHub 文件，国内网络更稳。说明见该页。取消勾选则直连 GitHub。电脑上请先保存，再检查更新。
      </p>
      {android ? (
        <>
          <div className="sync-actions">
            <button
              type="button"
              className="ghost"
              onClick={checkUpdate}
              disabled={updateBusy || busy}
            >
              {updateBusy ? "请稍候…" : "检查并安装更新"}
            </button>
          </div>
          {updateNote ? <p className="sync-note">{updateNote}</p> : null}
        </>
      ) : null}
    </section>
  );
}
