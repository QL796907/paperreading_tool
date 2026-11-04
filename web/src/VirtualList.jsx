import { useLayoutEffect, useRef, useState } from "react";
import { anchorDelta, flowWindow, spacersForRange } from "./windowList.js";

function readGap(list) {
  const raw = parseFloat(getComputedStyle(list).rowGap);
  return Number.isFinite(raw) ? raw : 0;
}

function offsetWithin(parent, child) {
  const parentRect = parent.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  return childRect.top - parentRect.top + parent.scrollTop;
}

export default function VirtualList({
  items,
  getKey,
  estimateSize,
  overscan = 240,
  className,
  scrollParent,
  renderItem,
  scrollToKey = "",
  focusKey = "",
  onFocusKey,
}) {
  const listRef = useRef(null);
  const heightsRef = useRef(new Map());
  const itemsRef = useRef(items);
  const scrollJob = useRef({ key: "", settled: false });
  const [measuredAt, setMeasuredAt] = useState(0);
  const [metrics, setMetrics] = useState({
    scrollTop: 0,
    viewport: 640,
    listOffset: 0,
    gap: 0,
  });
  itemsRef.current = items;

  function resolveParent() {
    if (scrollParent === "self") return listRef.current;
    if (scrollParent && typeof scrollParent === "object" && "current" in scrollParent) {
      return scrollParent.current;
    }
    return null;
  }

  useLayoutEffect(() => {
    const parent = resolveParent();
    const list = listRef.current;
    if (!parent || !list) return undefined;
    const previousAnchor = parent.style.overflowAnchor;
    parent.style.overflowAnchor = "none";
    let frame = 0;
    const read = () => {
      setMetrics({
        scrollTop: parent.scrollTop,
        viewport: parent.clientHeight || 640,
        listOffset: parent === list ? 0 : offsetWithin(parent, list),
        gap: readGap(list),
      });
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        read();
      });
    };
    read();
    parent.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(read);
    observer.observe(parent);
    if (parent !== list) observer.observe(list);
    return () => {
      parent.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      parent.style.overflowAnchor = previousAnchor;
    };
  }, [scrollParent, items.length]);

  const sizeAt = (index) => {
    const key = getKey(items[index]);
    const known = measuredAt >= 0 ? heightsRef.current.get(key) : undefined;
    if (known != null) return known;
    return estimateSize(items[index], index);
  };

  const natural = flowWindow({
    count: items.length,
    sizeAt,
    gap: metrics.gap,
    viewStart: metrics.scrollTop - metrics.listOffset - overscan,
    viewEnd: metrics.scrollTop - metrics.listOffset + metrics.viewport + overscan,
  });

  let layout = natural;
  const pinKey = focusKey || (scrollJob.current.key === scrollToKey && !scrollJob.current.settled ? scrollToKey : "");
  if (pinKey) {
    const pinIndex = items.findIndex((item) => getKey(item) === pinKey);
    if (pinIndex >= 0 && (pinIndex < natural.start || pinIndex >= natural.end)) {
      const around = spacersForRange(natural, pinIndex - 2, pinIndex + 3, metrics.gap);
      layout = { ...natural, ...around };
    }
  }
  useLayoutEffect(() => {
    const list = listRef.current;
    const parent = resolveParent();
    if (!list || !parent) return;
    const currentItems = itemsRef.current;
    const gap = readGap(list);
    const listOffset = parent === list ? 0 : offsetWithin(parent, list);
    const viewStart = parent.scrollTop - listOffset;
    const before = new Map(heightsRef.current);
    let changed = false;
    for (const node of list.querySelectorAll("[data-vkey]")) {
      const key = node.getAttribute("data-vkey");
      const next = Math.round(node.getBoundingClientRect().height);
      const prev = heightsRef.current.get(key);
      if (prev == null || Math.abs(prev - next) >= 1) {
        heightsRef.current.set(key, next);
        changed = true;
      }
    }
    if (!changed) return;
    const delta = anchorDelta({
      count: currentItems.length,
      oldSizeAt: (index) => {
        const key = getKey(currentItems[index]);
        return before.has(key) ? before.get(key) : estimateSize(currentItems[index], index);
      },
      newSizeAt: (index) => {
        const key = getKey(currentItems[index]);
        return heightsRef.current.has(key)
          ? heightsRef.current.get(key)
          : estimateSize(currentItems[index], index);
      },
      gap,
      viewStart,
    });
    if (Math.abs(delta) >= 1) parent.scrollTop += delta;
    setMeasuredAt((value) => value + 1);
  });

  useLayoutEffect(() => {
    const parent = resolveParent();
    const list = listRef.current;
    if (!parent || !list) return;
    if (scrollToKey) {
      if (scrollJob.current.key !== scrollToKey) {
        scrollJob.current = { key: scrollToKey, settled: false };
      }
    } else {
      scrollJob.current = { key: "", settled: false };
    }
    if (scrollToKey && !scrollJob.current.settled) {
      const index = items.findIndex((item) => getKey(item) === scrollToKey);
      if (index >= 0) {
        const listOffset = parent === list ? 0 : offsetWithin(parent, list);
        const top = listOffset + layout.tops[index];
        const bottom = top + sizeAt(index);
        const viewTop = parent.scrollTop;
        const viewBottom = viewTop + parent.clientHeight;
        if (top < viewTop - 1 || bottom > viewBottom + 1) {
          parent.scrollTop = Math.max(0, top - 8);
          setMetrics((prev) => ({ ...prev, scrollTop: parent.scrollTop }));
        }
        if (heightsRef.current.has(scrollToKey)) scrollJob.current.settled = true;
      }
    }
    if (!focusKey) return;
    const node = list.querySelector(`[data-vkey="${CSS.escape(focusKey)}"] button`);
    if (!node) return;
    node.focus();
    onFocusKey?.(focusKey);
  });

  return (
    <div ref={listRef} className={className}>
      {layout.topSpacer > 0 ? (
        <div aria-hidden="true" style={{ height: layout.topSpacer, flex: "0 0 auto" }} />
      ) : null}
      {items.slice(layout.start, layout.end).map((item, offset) => {
        const key = getKey(item);
        return (
          <div key={key} data-vkey={key} style={{ display: "flow-root" }}>
            {renderItem(item, layout.start + offset)}
          </div>
        );
      })}
      {layout.bottomSpacer > 0 ? (
        <div aria-hidden="true" style={{ height: layout.bottomSpacer, flex: "0 0 auto" }} />
      ) : null}
    </div>
  );
}
