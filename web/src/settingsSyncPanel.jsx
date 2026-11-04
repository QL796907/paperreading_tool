import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

export default function SettingsSyncPanel({ draft, setField, busy, setError, initialNote }) {
  const [testBusy, setTestBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [davError, setDavError] = useState("");
  const [note, setNote] = useState(initialNote || "");
  const [showDav, setShowDav] = useState(false);
  const davFeedbackRef = useRef(null);

  useEffect(() => {
    if (!davError && !note) return;
    davFeedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [davError, note]);

  async function test() {
    setTestBusy(true);
    setError("");
    setDavError("");
    setNote("");
    try {
      const data = await api.testSync({
        webdavUrl: draft.webdavUrl,
        webdavUser: draft.webdavUser,
        webdavPassword: draft.webdavPassword,
        webdavPath: draft.webdavPath,
      });
      setNote(data.message || "连接成功");
    } catch (err) {
      setDavError(err.message || "测试失败");
    } finally {
      setTestBusy(false);
    }
  }

  async function runSync() {
    setSyncBusy(true);
    setError("");
    setDavError("");
    setNote("");
    try {
      await api.saveSettings(draft);
      const data = await api.syncNow();
      setNote(data.message || "同步完成");
    } catch (err) {
      setDavError(err.message || "同步失败");
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <section className="settings-block">
      <h3>坚果云同步</h3>
      <p className="hint">
        只同步术语本，不同步 API Key。在坚果云网页打开「账户信息 → 安全选项」，开通
        WebDAV，再生成应用密码填到下面。手机和电脑之后都会读写同一个
        <code>terms.json</code>。
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={Boolean(draft.webdavEnabled)}
          onChange={(e) => setField("webdavEnabled", e.target.checked)}
        />
        启用 WebDAV 同步
      </label>
      <label>
        服务器地址
        <input
          className="mono"
          value={draft.webdavUrl || ""}
          onChange={(e) => setField("webdavUrl", e.target.value)}
          placeholder="https://dav.jianguoyun.com/dav/"
          autoComplete="off"
        />
      </label>
      <label>
        账号
        <input
          value={draft.webdavUser || ""}
          onChange={(e) => setField("webdavUser", e.target.value)}
          placeholder="坚果云登录邮箱"
          autoComplete="off"
        />
      </label>
      <label>
        应用密码
        <span className="key-row">
          <input
            className="mono"
            type={showDav ? "text" : "password"}
            value={draft.webdavPassword || ""}
            onChange={(e) => setField("webdavPassword", e.target.value)}
            placeholder="不是登录密码"
            autoComplete="new-password"
          />
          <button type="button" className="text-btn" onClick={() => setShowDav((v) => !v)}>
            {showDav ? "隐藏" : "显示"}
          </button>
        </span>
      </label>
      <label>
        远程文件路径
        <input
          className="mono"
          value={draft.webdavPath || ""}
          onChange={(e) => setField("webdavPath", e.target.value)}
          placeholder="paper-glossary/terms.json"
        />
      </label>
      <div className="sync-actions">
        <button type="button" className="ghost" onClick={test} disabled={testBusy || busy}>
          {testBusy ? "测试中…" : "测试连接"}
        </button>
        <button type="button" className="ghost" onClick={runSync} disabled={syncBusy || busy}>
          {syncBusy ? "同步中…" : "立即同步"}
        </button>
      </div>
      {davError || note ? (
        <p ref={davFeedbackRef} className={davError ? "field-error" : "sync-note"}>
          {davError || note}
        </p>
      ) : null}
    </section>
  );
}
