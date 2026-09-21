import { useState } from "react";
import { api } from "./api.js";

export function Overlay({ children, onClose, wide }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className={`sheet ${wide || ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

export function AddModal({ settings, onClose, onCreated }) {
  const [word, setWord] = useState("");
  const [definition, setDefinition] = useState("");
  const [context, setContext] = useState("");
  const [paper, setPaper] = useState("");
  const [autoExplain, setAutoExplain] = useState(Boolean(settings?.autoExplain));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wordError, setWordError] = useState(false);

  async function submit(ev) {
    ev.preventDefault();
    if (!word.trim()) {
      setWordError(true);
      setError("写一个术语");
      return;
    }
    setBusy(true);
    setError("");
    setWordError(false);
    try {
      const data = await api.createTerm({
        word,
        definition,
        context,
        autoExplain,
        source: paper.trim() ? { title: paper.trim() } : null,
        definitionSource: definition.trim() ? "manual" : "empty",
      });
      onCreated(data);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose}>
      <form className="sheet-form" onSubmit={submit}>
        <h2>添加术语</h2>
        <label>
          术语
          <input
            autoFocus
            className={wordError ? "invalid" : ""}
            value={word}
            onChange={(e) => {
              setWord(e.target.value);
              setWordError(false);
            }}
            placeholder="例如 attention residual"
          />
        </label>
        <label>
          解析
          <textarea
            rows={4}
            value={definition}
            onChange={(e) => setDefinition(e.target.value)}
            placeholder="可稍后写"
          />
        </label>
        <label>
          上下文
          <textarea
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="论文里出现它的原句，可选"
          />
        </label>
        <label>
          来源论文
          <input
            value={paper}
            onChange={(e) => setPaper(e.target.value)}
            placeholder="可选。Zotero 加入时会自动带上"
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={autoExplain}
            onChange={(e) => setAutoExplain(e.target.checked)}
          />
          保存后立刻 AI 解析
        </label>
        {error ? <p className="field-error">{error}</p> : null}
        <div className="sheet-actions">
          <button type="button" className="ghost" onClick={onClose}>
            取消
          </button>
          <button className="solid" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

export function SettingsModal({ settings, sync, onClose, onSaved }) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState(sync?.lastMessage || "");
  const [showKey, setShowKey] = useState(false);
  const [showDav, setShowDav] = useState(false);

  function setField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(ev) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api.saveSettings(draft);
      onSaved(data.settings, data.sync);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function test() {
    setTestBusy(true);
    setError("");
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
      setError(err.message);
    } finally {
      setTestBusy(false);
    }
  }

  async function runSync() {
    setSyncBusy(true);
    setError("");
    setNote("");
    try {
      await api.saveSettings(draft);
      const data = await api.syncNow();
      setNote(data.message || "同步完成");
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} wide="wide">
      <form className="sheet-form" onSubmit={submit}>
        <h2>设置</h2>
        <p className="hint">连接 OpenAI 兼容接口。密钥只保存在本机，不会上传。</p>
        <label>
          API 地址
          <input
            className="mono"
            value={draft.apiBaseUrl}
            onChange={(e) => setField("apiBaseUrl", e.target.value)}
            placeholder="https://api.deepseek.com/v1"
          />
        </label>
        <label>
          API Key
          <span className="key-row">
            <input
              className="mono"
              type={showKey ? "text" : "password"}
              value={draft.apiKey}
              onChange={(e) => setField("apiKey", e.target.value)}
              placeholder="只保存在本机"
            />
            <button type="button" className="text-btn" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "隐藏" : "显示"}
            </button>
          </span>
        </label>
        <label>
          模型名
          <input
            className="mono"
            value={draft.model}
            onChange={(e) => setField("model", e.target.value)}
            placeholder="deepseek-chat"
          />
        </label>
        <label>
          系统提示词
          <textarea
            rows={4}
            value={draft.systemPrompt}
            onChange={(e) => setField("systemPrompt", e.target.value)}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(draft.autoExplain)}
            onChange={(e) => setField("autoExplain", e.target.checked)}
          />
          Zotero 新词自动解析
        </label>

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
          {note ? <p className="sync-note">{note}</p> : null}
        </section>

        {error ? <p className="field-error">{error}</p> : null}
        <div className="sheet-actions">
          <button type="button" className="ghost" onClick={onClose}>
            取消
          </button>
          <button className="solid" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

export function ConfirmDelete({ term, onCancel, onConfirm }) {
  return (
    <Overlay onClose={onCancel} wide="confirm">
      <div className="sheet-form confirm">
        <p>
          删除「{term.word}」？此操作不可撤销。
        </p>
        <div className="sheet-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="danger-btn" onClick={onConfirm}>
            删除
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function Toast({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="text-btn toast-retry" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ searching, onRead }) {
  if (searching) {
    return (
      <section className="empty">
        <p>没有找到相关术语。换个写法，或检查论文名拼写。</p>
      </section>
    );
  }
  return (
    <section className="empty">
      <p className="empty-lead">今天的纸页还是空白。</p>
      <p>
        在 Zotero 里选中生词，点「加入术语本」；
        <br />
        或按 Ctrl+N，手写第一条。
      </p>
      <i className="empty-rule" />
      {onRead ? (
        <button type="button" className="text-btn" onClick={onRead}>
          展页阅读
        </button>
      ) : null}
    </section>
  );
}
