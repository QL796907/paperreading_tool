import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import TermCard from "./TermCard.jsx";
import { EmptyState } from "./overlays.jsx";
import { formatBigDate } from "./dates.js";

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export default function ReadingMode({
  terms,
  startDate,
  onExit,
  onDateChange,
  onChanged,
  onRequestDelete,
  onToast,
}) {
  const [date, setDate] = useState(startDate);
  const [pageIndex, setPageIndex] = useState(0);
  const [pages, setPages] = useState([[]]);
  const [dir, setDir] = useState("none");
  const [showIndex, setShowIndex] = useState(false);
  const [edge, setEdge] = useState("");
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    const onResize = () => setViewport((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const paperRef = useRef(null);
  const bodyRef = useRef(null);
  const measureRef = useRef(null);
  const pointer = useRef(null);
  const wantLast = useRef(false);
  const toastedEdge = useRef({ start: false, end: false });

  function adjacentDate(from, dirSign) {
    const occupied = [...new Set(terms.map((t) => t.noteDate))].sort();
    if (occupied.includes(from)) {
      return occupied[occupied.indexOf(from) + dirSign] || null;
    }
    const all = [...new Set([...occupied, from])].sort();
    const next = all[all.indexOf(from) + dirSign];
    return next || null;
  }

  const dayTerms = useMemo(
    () => terms.filter((t) => t.noteDate === date),
    [terms, date],
  );

  useLayoutEffect(() => {
    const paper = paperRef.current;
    const measure = measureRef.current;
    if (!paper || !measure) return;

    const style = window.getComputedStyle(paper);
    const available = Math.max(
      120,
      paper.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    );
    const nodes = [...measure.querySelectorAll("[data-term]")];
    if (!nodes.length) {
      setPages([[]]);
      setPageIndex(0);
      return;
    }

    const packed = [];
    let current = [];
    let used = 0;
    const gap = 14;

    for (const node of nodes) {
      const h = node.getBoundingClientRect().height;
      const id = node.getAttribute("data-term");
      if (!current.length) {
        current = [id];
        used = h;
        if (h > available) {
          packed.push(current);
          current = [];
          used = 0;
        }
        continue;
      }
      if (used + gap + h > available) {
        packed.push(current);
        current = [id];
        used = h;
      } else {
        current.push(id);
        used += gap + h;
      }
    }
    if (current.length) packed.push(current);

    const mapped = packed.map((ids) =>
      ids.map((id) => dayTerms.find((t) => t.id === id)).filter(Boolean),
    );
    const nextPages = mapped.length ? mapped : [[]];
    setPages(nextPages);
    setPageIndex((i) => {
      if (wantLast.current) {
        wantLast.current = false;
        return Math.max(0, nextPages.length - 1);
      }
      return Math.min(i, Math.max(0, nextPages.length - 1));
    });
  }, [dayTerms, viewport]);

  useEffect(() => {
    onDateChange?.(date);
  }, [date, onDateChange]);

  const pageCount = Math.max(1, pages.length);
  const safeIndex = Math.min(pageIndex, pageCount - 1);
  const pageTerms = pages[safeIndex] || [];

  function goToDate(nextDate, nextPage) {
    setDate(nextDate);
    setPageIndex(nextPage);
  }

  function bumpEdge(kind) {
    setEdge(kind);
    window.setTimeout(() => setEdge(""), 280);
    if (!toastedEdge.current[kind]) {
      toastedEdge.current[kind] = true;
      onToast?.(kind === "start" ? "已经是最早一页" : "已经是最新一页");
    }
  }

  function nextPage() {
    if (safeIndex < pageCount - 1) {
      setDir("next");
      setPageIndex(safeIndex + 1);
      return;
    }
    const next = adjacentDate(date, 1);
    if (next) {
      setDir("next");
      goToDate(next, 0);
      return;
    }
    bumpEdge("end");
  }

  function prevPage() {
    if (safeIndex > 0) {
      setDir("prev");
      setPageIndex(safeIndex - 1);
      return;
    }
    const prev = adjacentDate(date, -1);
    if (prev) {
      wantLast.current = true;
      setDir("prev");
      goToDate(prev, 0);
      return;
    }
    bumpEdge("start");
  }

  useEffect(() => {
    function onKey(ev) {
      if (["INPUT", "TEXTAREA"].includes(ev.target.tagName)) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        onExit();
      } else if (ev.key === "ArrowRight" || ev.key === "PageDown" || ev.key === " ") {
        ev.preventDefault();
        nextPage();
      } else if (ev.key === "ArrowLeft" || ev.key === "PageUp") {
        ev.preventDefault();
        prevPage();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onPointerDown(ev) {
    if (ev.pointerType === "mouse" && ev.button !== 0) return;
    pointer.current = { x: ev.clientX, y: ev.clientY };
  }

  function onPointerUp(ev) {
    if (!pointer.current) return;
    const dx = ev.clientX - pointer.current.x;
    pointer.current = null;
    if (Math.abs(dx) < 56) return;
    if (dx < 0) nextPage();
    else prevPage();
  }

  const counts = {
    total: dayTerms.length,
    hand: dayTerms.filter((t) => t.definitionSource === "manual").length,
    ai: dayTerms.filter((t) => t.definitionSource === "ai").length,
  };

  const motion = reducedMotion() ? "fade" : dir;

  return (
    <div
      className={`desk reading-desk ${edge ? `edge-${edge}` : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onExit();
      }}
    >
      <header className="reader-bar" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="text-btn" onClick={onExit}>
          返回
        </button>
        <h1>{formatBigDate(date)}</h1>
        <button
          type="button"
          className="text-btn page-num"
          onClick={() => setShowIndex((v) => !v)}
          aria-label="选择页码"
        >
          {safeIndex + 1} / {pageCount}
        </button>
      </header>

      {showIndex ? (
        <div className="page-picker" onClick={(e) => e.stopPropagation()}>
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              className={i === safeIndex ? "active" : ""}
              onClick={() => {
                setDir(i > safeIndex ? "next" : "prev");
                setPageIndex(i);
                setShowIndex(false);
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="hotzone left"
        aria-label="上一页"
        onClick={(e) => {
          e.stopPropagation();
          prevPage();
        }}
      >
        ‹
      </button>

      <article
        className={`reader-paper ${motion} ${edge ? "bounce" : ""}`}
        ref={paperRef}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        <div className="reader-body" ref={bodyRef}>
          {pageTerms.length ? (
            pageTerms.map((term) => (
              <TermCard
                key={term.id}
                term={term}
                reading
                onChanged={onChanged}
                onRequestDelete={onRequestDelete}
                onToast={onToast}
              />
            ))
          ) : (
            <EmptyState />
          )}
        </div>
      </article>

      <button
        type="button"
        className="hotzone right"
        aria-label="下一页"
        onClick={(e) => {
          e.stopPropagation();
          nextPage();
        }}
      >
        ›
      </button>

      {dayTerms.length ? (
        <p className="reader-foot">
          共 {counts.total} 词 · 手写 {counts.hand} · AI {counts.ai}
        </p>
      ) : null}

      <div className="measure-sheet" ref={measureRef} aria-hidden="true">
        {dayTerms.map((term) => (
          <TermCard key={term.id} term={term} reading measure />
        ))}
      </div>
    </div>
  );
}
