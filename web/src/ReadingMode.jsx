import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import TermCard from "./TermCard.jsx";
import { EmptyState } from "./overlays.jsx";
import { formatBigDate } from "./dates.js";
import { isAndroidApp } from "./platform.js";
import {
  READING_CARD_GAP,
  READING_PROBE_LIMIT,
  packTermPages,
  sameIdPages,
  termMeasureKey,
} from "./readingPages.js";

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
  const [pageIds, setPageIds] = useState([[]]);
  const [probeIds, setProbeIds] = useState([]);
  const [measuredPass, setMeasuredPass] = useState(0);
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
  const measureRef = useRef(null);
  const measuredRef = useRef(new Map());
  const viewportRef = useRef(viewport);
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

    if (viewportRef.current !== viewport) {
      viewportRef.current = viewport;
      measuredRef.current.clear();
    }

    const style = window.getComputedStyle(paper);
    const available = Math.max(
      120,
      paper.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    );

    let learned = false;
    for (const node of measure.querySelectorAll("[data-term]")) {
      const id = node.getAttribute("data-term");
      const term = dayTerms.find((item) => item.id === id);
      if (!term) continue;
      const key = termMeasureKey(term);
      const height = node.getBoundingClientRect().height;
      const prev = measuredRef.current.get(key);
      if (prev == null || Math.abs(prev - height) >= 0.5) {
        measuredRef.current.set(key, height);
        learned = true;
      }
    }

    const known = [...measuredRef.current.values()];
    const average = known.length
      ? known.reduce((sum, height) => sum + height, 0) / known.length
      : 160;
    const sized = dayTerms.map((term) => ({
      id: term.id,
      height: measuredRef.current.get(termMeasureKey(term)) ?? average,
    }));
    const packed = dayTerms.length ? packTermPages(sized, available, READING_CARD_GAP) : [[]];
    setPageIds((prev) => (sameIdPages(prev, packed) ? prev : packed));
    setPageIndex((current) => {
      const last = Math.max(0, packed.length - 1);
      if (wantLast.current) {
        const allKnown = dayTerms.every((term) => measuredRef.current.has(termMeasureKey(term)));
        if (allKnown) wantLast.current = false;
        return last;
      }
      return Math.min(current, last);
    });

    const probe = [];
    for (const term of dayTerms) {
      if (probe.length >= READING_PROBE_LIMIT) break;
      if (measuredRef.current.has(termMeasureKey(term))) continue;
      probe.push(term.id);
    }
    setProbeIds((prev) => (prev.length === probe.length && prev.every((id, i) => id === probe[i]) ? prev : probe));
    if (learned) setMeasuredPass((value) => value + 1);
  }, [dayTerms, viewport, measuredPass, probeIds]);

  useEffect(() => {
    onDateChange?.(date);
  }, [date, onDateChange]);

  const pageCount = Math.max(1, pageIds.length);
  const safeIndex = Math.min(pageIndex, pageCount - 1);
  const pageTerms = (pageIds[safeIndex] || [])
    .map((id) => dayTerms.find((term) => term.id === id))
    .filter(Boolean);
  const probeTerms = probeIds
    .map((id) => dayTerms.find((term) => term.id === id))
    .filter(Boolean);

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
          {pageIds.map((_, i) => (
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
        <div className="reader-body">
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
            <EmptyState native={isAndroidApp()} />
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
        <p className="reader-foot" onClick={(e) => e.stopPropagation()}>
          共 {counts.total} 词 · 手写 {counts.hand} · AI {counts.ai}
        </p>
      ) : null}

      <div className="measure-sheet" ref={measureRef} aria-hidden="true">
        {probeTerms.map((term) => (
          <TermCard key={term.id} term={term} reading measure />
        ))}
      </div>
    </div>
  );
}
