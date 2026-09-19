import { useEffect, useState } from "react";
import { api } from "./api.js";
import { formatWrittenDate, sourceLine } from "./dates.js";

function sealLabel(term, busy) {
  if (busy === "ai") return "解析中";
  if (term.definitionSource === "ai") return "AI 解析";
  if (term.definitionSource === "manual") return "手写";
  return "待解析";
}

function sealClass(term, busy) {
  if (busy === "ai") return "busy";
  if (term.definitionSource === "ai") return "ai";
  if (term.definitionSource === "manual") return "manual";
  return "empty";
}

export default function TermCard({
  term,
  showDate,
  flashed,
  reading = false,
  measure = false,
  onChanged,
  onRequestDelete,
  onToast,
  onJumpDate,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(term.definition || "");
  const [busy, setBusy] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setDraft(term.definition || "");
  }, [term.definition]);

  async function saveDefinition() {
    setBusy("save");
    try {
      const data = await api.updateTerm(term.id, {
        definition: draft,
        definitionSource: draft.trim() ? "manual" : "empty",
      });
      setEditing(false);
      onChanged?.(data.term);
    } catch (err) {
      onToast?.(err.message);
    } finally {
      setBusy("");
    }
  }

  async function explain() {
    setBusy("ai");
    setMenuOpen(false);
    try {
      const data = await api.explainTerm(term.id);
      onChanged?.(data.term);
      onToast?.(`已生成「${term.word}」的解析`);
    } catch (err) {
      onToast?.(err.message);
    } finally {
      setBusy("");
    }
  }

  const sources = (term.sources || []).map(sourceLine).filter(Boolean).join("；");

  return (
    <article
      className={`entry ${flashed ? "flash" : ""} ${reading ? "reading" : ""}`}
      data-term={term.id}
    >
      <div className="entry-top">
        <h3>{term.word}</h3>
        <span className={`seal ${sealClass(term, busy)}`}>{sealLabel(term, busy)}</span>
        {reading && !measure ? (
          <div className="entry-more">
            <button
              className="text-btn more"
              aria-label="词条操作"
              onClick={() => setMenuOpen((v) => !v)}
            >
              ⋯
            </button>
            {menuOpen ? (
              <div className="more-menu">
                <button type="button" onClick={() => { setMenuOpen(false); setEditing(true); }}>
                  改解析
                </button>
                <button type="button" disabled={busy === "ai"} onClick={explain}>
                  AI 解析
                </button>
                <button type="button" className="danger-text" onClick={() => { setMenuOpen(false); onRequestDelete?.(term); }}>
                  删除
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {showDate ? (
        <button
          type="button"
          className="written-at"
          onClick={() => onJumpDate?.(term.noteDate, term.id)}
        >
          写于 {formatWrittenDate(term.noteDate)}
        </button>
      ) : null}

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          placeholder="写下这个术语的解析、公式直觉，或你自己的理解。"
        />
      ) : term.definition ? (
        <p className="definition">{term.definition}</p>
      ) : (
        <p className="definition placeholder">还没有解析。可以手写，也可以让 AI 先起草一则。</p>
      )}

      {term.context ? <blockquote>{term.context}</blockquote> : null}
      {sources ? <p className="sources">出自 {sources}</p> : null}

      {measure ? null : editing ? (
        <div className="entry-actions">
          <button type="button" className="solid" disabled={Boolean(busy)} onClick={saveDefinition}>
            {busy === "save" ? "保存中…" : "保存解析"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setDraft(term.definition || "");
              setEditing(false);
            }}
          >
            取消
          </button>
        </div>
      ) : reading ? null : (
        <p className="entry-links">
          <button type="button" className="text-btn" onClick={() => setEditing(true)}>
            {term.definition ? "改解析" : "手写解析"}
          </button>
          <span aria-hidden="true"> · </span>
          <button type="button" className="text-btn" disabled={busy === "ai"} onClick={explain}>
            {busy === "ai" ? "解析中…" : "AI 解析"}
          </button>
          <span aria-hidden="true"> · </span>
          <button type="button" className="text-btn danger-text" onClick={() => onRequestDelete?.(term)}>
            删除
          </button>
        </p>
      )}
    </article>
  );
}
