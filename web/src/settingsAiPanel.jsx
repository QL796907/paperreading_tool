import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { isNativeApp } from "./platform.js";

export default function SettingsAiPanel({ draft, setField, busy, setError }) {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiNote, setAiNote] = useState("");
  const [showKey, setShowKey] = useState(false);
  const aiFeedbackRef = useRef(null);
  const native = isNativeApp();

  useEffect(() => {
    if (!aiError && !aiNote) return;
    aiFeedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [aiError, aiNote]);

  async function testAi() {
    setAiBusy(true);
    setError("");
    setAiError("");
    setAiNote("");
    try {
      const data = await api.testAi({
        apiBaseUrl: draft.apiBaseUrl,
        apiKey: draft.apiKey,
        model: draft.model,
      });
      setAiNote(data.message || "连接成功");
    } catch (err) {
      setAiError(err.message || "测试失败");
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <>
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
      <div className="sync-actions">
        <button type="button" className="ghost" onClick={testAi} disabled={aiBusy || busy}>
          {aiBusy ? "测试中…" : "测试连接"}
        </button>
      </div>
      {aiError || aiNote ? (
        <p ref={aiFeedbackRef} className={aiError ? "field-error" : "sync-note"}>
          {aiError || aiNote}
        </p>
      ) : null}
      <label>
        系统提示词
        <textarea
          rows={4}
          value={draft.systemPrompt}
          onChange={(e) => setField("systemPrompt", e.target.value)}
        />
      </label>
      {native ? null : (
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(draft.autoExplain)}
            onChange={(e) => setField("autoExplain", e.target.checked)}
          />
          Zotero 新词自动解析
        </label>
      )}
    </>
  );
}
