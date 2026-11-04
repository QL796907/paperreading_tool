export const READING_CARD_GAP = 14;
export const READING_PROBE_LIMIT = 8;

export function termMeasureKey(term) {
  const sources = Array.isArray(term.sources) ? term.sources.length : 0;
  return [term.id, term.word || "", term.definition || "", term.context || "", sources].join("\n");
}

// 与原先按测量节点逐条装箱的规则相同：间距 14，单条超高独占一页。
export function packTermPages(items, available, gap = READING_CARD_GAP) {
  const packed = [];
  let current = [];
  let used = 0;
  for (const item of items) {
    const height = item.height;
    if (!current.length) {
      current = [item.id];
      used = height;
      if (height > available) {
        packed.push(current);
        current = [];
        used = 0;
      }
      continue;
    }
    if (used + gap + height > available) {
      packed.push(current);
      current = [item.id];
      used = height;
    } else {
      current.push(item.id);
      used += gap + height;
    }
  }
  if (current.length) packed.push(current);
  return packed.length ? packed : [[]];
}

export function sameIdPages(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (a.length !== b.length) return false;
    for (let j = 0; j < a.length; j += 1) {
      if (a[j] !== b[j]) return false;
    }
  }
  return true;
}
