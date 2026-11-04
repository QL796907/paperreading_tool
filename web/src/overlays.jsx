import { lazy, Suspense, useState } from "react";
import { api } from "./api.js";

const SettingsAiPanel = lazy(() => import("./settingsAiPanel.jsx"));
const SettingsSyncPanel = lazy(() => import("./settingsSyncPanel.jsx"));
const SettingsUpdatePanel = lazy(() => import("./settingsUpdatePanel.jsx"));

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

export function SettingsModal({ settings, sync, onClose, onSaved, onToast }) {
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <Overlay onClose={onClose} wide="wide">
      <form className="sheet-form" onSubmit={submit}>
        <h2>设置</h2>
        <p className="hint">连接 OpenAI 兼容接口。密钥只保存在本机，不会上传。</p>
        <Suspense fallback={<p className="hint" aria-busy="true">正在载入接口设置…</p>}>
          <SettingsAiPanel draft={draft} setField={setField} busy={busy} setError={setError} />
        </Suspense>
        <Suspense
          fallback={
            <section className="settings-block" aria-busy="true">
              <h3>坚果云同步</h3>
            </section>
          }
        >
          <SettingsSyncPanel
            draft={draft}
            setField={setField}
            busy={busy}
            setError={setError}
            initialNote={sync?.lastMessage || ""}
          />
        </Suspense>
        <Suspense
          fallback={
            <section className="settings-block" aria-busy="true">
              <h3>应用更新</h3>
            </section>
          }
        >
          <SettingsUpdatePanel
            draft={draft}
            setField={setField}
            busy={busy}
            setError={setError}
            onToast={onToast}
          />
        </Suspense>
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

export function EmptyState({ searching, onRead, native }) {
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
        {native ? (
          <>
            点「添加术语」记下今天的生词。
            <br />
            在设置里打开坚果云，就能和电脑上的术语本共用一份。
          </>
        ) : (
          <>
            在 Zotero 里选中生词，点「加入术语本」；
            <br />
            或按 Ctrl+N，手写第一条。
          </>
        )}
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
