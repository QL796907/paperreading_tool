import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import TermCard from "./TermCard.jsx";
import ReadingMode from "./ReadingMode.jsx";
import {
  AddModal,
  SettingsModal,
  ConfirmDelete,
  Toast,
  EmptyState,
} from "./overlays.jsx";
import {
  todayStamp,
  formatDirDate,
  formatBigDate,
  monthLabel,
  matchesQuery,
} from "./dates.js";

export default function App() {
  const [terms, setTerms] = useState([]);
  const [settings, setSettings] = useState(null);
  const [query, setQuery] = useState("");
  const [activeDate, setActiveDate] = useState(todayStamp());
  const [flashId, setFlashId] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [toastRetry, setToastRetry] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [reading, setReading] = useState(false);
  const [drawer, setDrawer] = useState(false);

  const searching = Boolean(query.trim());

  const load = useCallback(async () => {
    const data = await api.state();
    setTerms(data.terms);
    setSettings(data.settings);
    setLoading(false);
    setToastRetry(null);
  }, []);

  useEffect(() => {
    load().catch((err) => {
      setLoading(false);
      setToast(err.message);
      setToastRetry(() => () => {
        setToast("");
        load().catch((e) => setToast(e.message));
      });
    });
  }, [load]);

  useEffect(() => {
    const stream = new EventSource("/api/events");
    stream.onmessage = () => {
      load().catch(() => {});
    };
    return () => stream.close();
  }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const dates = useMemo(() => {
    const map = new Map();
    for (const term of terms) {
      map.set(term.noteDate, (map.get(term.noteDate) || 0) + 1);
    }
    const today = todayStamp();
    if (!map.has(today)) map.set(today, 0);
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [terms]);

  useEffect(() => {
    if (!dates.length) return;
    if (!dates.some(([d]) => d === activeDate)) {
      setActiveDate(dates[0][0]);
    }
  }, [dates, activeDate]);

  const visibleTerms = useMemo(() => {
    const filtered = terms.filter((term) => matchesQuery(term, query.trim()));
    if (searching) return filtered;
    return filtered.filter((term) => term.noteDate === activeDate);
  }, [terms, query, activeDate, searching]);

  const groupedMonths = useMemo(() => {
    const groups = [];
    for (const [date, count] of dates) {
      const label = monthLabel(date);
      const last = groups[groups.length - 1];
      if (!last || last.label !== label) groups.push({ label, items: [[date, count]] });
      else last.items.push([date, count]);
    }
    return groups;
  }, [dates]);

  const enterReading = useCallback(() => {
    if (searching || showAdd || showSettings || pendingDelete) return;
    setDrawer(false);
    setReading(true);
  }, [searching, showAdd, showSettings, pendingDelete]);

  const openAdd = useCallback(() => {
    if (reading) setReading(false);
    setShowAdd(true);
  }, [reading]);

  const openSettings = useCallback(() => {
    if (reading) setReading(false);
    setShowSettings(true);
  }, [reading]);

  useEffect(() => {
    function onKey(ev) {
      const inField = ["INPUT", "TEXTAREA"].includes(ev.target.tagName);
      if (reading) {
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k") {
          ev.preventDefault();
          setReading(false);
          setTimeout(() => document.getElementById("glossary-search")?.focus(), 0);
        }
        if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "n") {
          ev.preventDefault();
          openAdd();
        }
        return;
      }
      if (ev.key === "Escape") {
        if (showAdd) setShowAdd(false);
        else if (showSettings) setShowSettings(false);
        else if (pendingDelete) setPendingDelete(null);
        else if (drawer) setDrawer(false);
        else if (searching) setQuery("");
        return;
      }
      if (inField) return;
      if (ev.key === "/" || ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "k")) {
        ev.preventDefault();
        document.getElementById("glossary-search")?.focus();
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "n") {
        ev.preventDefault();
        openAdd();
      }
      if (ev.key.toLowerCase() === "f") {
        ev.preventDefault();
        enterReading();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reading, showAdd, showSettings, pendingDelete, drawer, searching, enterReading, openAdd]);

  async function handleDeleted(id) {
    setTerms((prev) => prev.filter((item) => item.id !== id));
    setPendingDelete(null);
    setToast("已删除");
    await load();
  }

  const dayCount = dates.filter(([, n]) => n > 0).length;

  if (reading) {
    return (
      <>
        <ReadingMode
          terms={terms}
          startDate={activeDate}
          onExit={() => setReading(false)}
          onDateChange={setActiveDate}
          onChanged={(next) => {
            setTerms((prev) => prev.map((item) => (item.id === next.id ? next : item)));
          }}
          onRequestDelete={setPendingDelete}
          onToast={setToast}
        />
        {pendingDelete ? (
          <ConfirmDelete
            term={pendingDelete}
            onCancel={() => setPendingDelete(null)}
            onConfirm={async () => {
              try {
                await api.deleteTerm(pendingDelete.id);
                await handleDeleted(pendingDelete.id);
              } catch (err) {
                setToast(err.message);
              }
            }}
          />
        ) : null}
        {showAdd ? (
          <AddModal
            settings={settings}
            onClose={() => setShowAdd(false)}
            onCreated={async (data) => {
              setShowAdd(false);
              setActiveDate(data.term.noteDate);
              setToast(data.created ? "已加入术语本" : "重复词，已合并来源");
              await load();
            }}
          />
        ) : null}
        <Toast message={toast} onRetry={toastRetry} />
      </>
    );
  }

  return (
    <div className="desk">
      <div className={`book ${drawer ? "drawer-open" : ""}`}>
        <aside className="index">
          <div className="brand">
            <h1>术语本</h1>
            <p className="eyebrow">Paper Glossary</p>
          </div>
          <nav className="dates" aria-label="按日期浏览">
            {groupedMonths.map((group) => (
              <section key={group.label}>
                <h2>{group.label}</h2>
                {group.items.map(([date, count]) => (
                  <button
                    key={date}
                    className={date === activeDate && !searching ? "active" : date === activeDate ? "active dim" : ""}
                    onClick={() => {
                      setQuery("");
                      setActiveDate(date);
                      setDrawer(false);
                    }}
                    onDoubleClick={() => {
                      setQuery("");
                      setActiveDate(date);
                      setDrawer(false);
                      setReading(true);
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") {
                        ev.preventDefault();
                        setQuery("");
                        setActiveDate(date);
                        setReading(true);
                      }
                    }}
                  >
                    <span>{formatDirDate(date)}</span>
                    <em>{count} 词</em>
                  </button>
                ))}
              </section>
            ))}
          </nav>
          <p className="index-foot">
            共 {dayCount} 天 · {terms.length} 词
          </p>
        </aside>

        <div className="gutter" aria-hidden="true" />

        <main
          className="page"
          onDoubleClick={(ev) => {
            if (ev.target.closest("button, input, textarea, a, .entry, .search")) return;
            enterReading();
          }}
        >
          <header className="page-head">
            <button type="button" className="text-btn drawer-toggle" onClick={() => setDrawer(true)}>
              目录
            </button>
            <h2>
              {searching
                ? `搜索「${query.trim()}」· ${visibleTerms.length} 条`
                : formatBigDate(activeDate)}
            </h2>
            <div className="toolbar">
              <label className="search">
                <span className="sr">搜索</span>
                <input
                  id="glossary-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜术语、解析或论文名"
                />
                {query ? (
                  <button
                    type="button"
                    className="clear"
                    aria-label="清空搜索"
                    onClick={() => setQuery("")}
                  >
                    ×
                  </button>
                ) : null}
              </label>
              <button type="button" className="solid" onClick={openAdd}>
                添加术语
              </button>
              {searching ? null : (
                <button
                  type="button"
                  className="ghost"
                  title="放大本页，像读书一样翻页（F）"
                  onClick={enterReading}
                >
                  展页阅读
                </button>
              )}
              <button type="button" className="ghost" onClick={openSettings}>
                设置
              </button>
            </div>
          </header>

          {loading ? (
            <p className="muted">正在打开笔记本…</p>
          ) : visibleTerms.length ? (
            <div className="entries">
              {visibleTerms.map((term) => (
                <TermCard
                  key={term.id}
                  term={term}
                  showDate={searching}
                  flashed={term.id === flashId}
                  onChanged={(next) => {
                    setTerms((prev) =>
                      prev.map((item) => (item.id === next.id ? next : item)),
                    );
                    setFlashId(next.id);
                  }}
                  onRequestDelete={setPendingDelete}
                  onToast={setToast}
                  onJumpDate={(date, id) => {
                    setQuery("");
                    setActiveDate(date);
                    setFlashId(id);
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              searching={searching}
              onRead={searching ? undefined : enterReading}
            />
          )}
        </main>
      </div>

      {drawer ? (
        <button type="button" className="drawer-scrim" aria-label="关闭目录" onClick={() => setDrawer(false)} />
      ) : null}

      {showAdd ? (
        <AddModal
          settings={settings}
          onClose={() => setShowAdd(false)}
          onCreated={async (data) => {
            setShowAdd(false);
            setActiveDate(data.term.noteDate);
            setQuery("");
            setFlashId(data.term.id);
            setToast(data.created ? "已加入术语本" : "重复词，已合并来源");
            await load();
          }}
        />
      ) : null}

      {showSettings && settings ? (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(next) => {
            setSettings(next);
            setShowSettings(false);
            setToast("设置已保存");
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDelete
          term={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            try {
              await api.deleteTerm(pendingDelete.id);
              await handleDeleted(pendingDelete.id);
            } catch (err) {
              setToast(err.message);
            }
          }}
        />
      ) : null}

      <Toast message={toast} onRetry={toastRetry} />
    </div>
  );
}
