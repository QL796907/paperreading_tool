// 可变高度窗口：未挂上的条目用占位高度撑开滚动条，CSS gap 仍由父级 flex 负责。

export function flowWindow({ count, sizeAt, gap, viewStart, viewEnd }) {
  const sizes = new Array(count);
  const tops = new Array(count);
  let y = 0;
  for (let i = 0; i < count; i += 1) {
    const size = sizeAt(i);
    sizes[i] = size;
    tops[i] = y;
    y += size;
    if (i < count - 1) y += gap;
  }
  const total = count === 0 ? 0 : y;

  let start = count;
  let end = 0;
  for (let i = 0; i < count; i += 1) {
    const top = tops[i];
    const bottom = top + sizes[i];
    if (bottom > viewStart && top < viewEnd) {
      if (i < start) start = i;
      if (i + 1 > end) end = i + 1;
    }
  }
  if (end <= start) {
    return { sizes, tops, total, start: 0, end: 0, topSpacer: total, bottomSpacer: 0 };
  }
  return { sizes, tops, total, ...spacersForRange({ tops, total }, start, end, gap) };
}

export function spacersForRange(layout, start, end, gap) {
  const count = layout.tops.length;
  const safeStart = Math.max(0, Math.min(start, count));
  const safeEnd = Math.max(safeStart, Math.min(end, count));
  if (safeStart === safeEnd) {
    return { start: safeStart, end: safeEnd, topSpacer: layout.total, bottomSpacer: 0 };
  }
  const topSpacer = safeStart > 0 ? Math.max(0, layout.tops[safeStart] - gap) : 0;
  const bottomSpacer = safeEnd < count ? Math.max(0, layout.total - layout.tops[safeEnd]) : 0;
  return { start: safeStart, end: safeEnd, topSpacer, bottomSpacer };
}

export function anchorDelta({ count, oldSizeAt, newSizeAt, gap, viewStart }) {
  let oldY = 0;
  let newY = 0;
  for (let i = 0; i < count; i += 1) {
    const oldHeight = oldSizeAt(i);
    const newHeight = newSizeAt(i);
    if (oldY + oldHeight > viewStart) return newY - oldY;
    const gutter = i < count - 1 ? gap : 0;
    oldY += oldHeight + gutter;
    newY += newHeight + gutter;
  }
  return newY - oldY;
}
