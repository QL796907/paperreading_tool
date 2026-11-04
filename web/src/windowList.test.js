import assert from "node:assert/strict";
import test from "node:test";
import { anchorDelta, flowWindow } from "./windowList.js";

function totalOf(sizes, gap) {
  if (!sizes.length) return 0;
  return sizes.reduce((sum, size) => sum + size, 0) + gap * (sizes.length - 1);
}

function visualTotal(layout, sizes, gap) {
  const parts = [];
  if (layout.topSpacer > 0) parts.push(layout.topSpacer);
  for (let i = layout.start; i < layout.end; i += 1) parts.push(sizes[i]);
  if (layout.bottomSpacer > 0) parts.push(layout.bottomSpacer);
  const gaps = parts.length > 1 ? gap * (parts.length - 1) : 0;
  return parts.reduce((sum, size) => sum + size, 0) + gaps;
}

test("flex gap stays in the total height for every window", () => {
  const sizes = [10, 22, 15, 40, 8, 30];
  const gap = 14;
  const expected = totalOf(sizes, gap);
  const windows = [
    [0, 10],
    [0, 24],
    [20, 50],
    [70, 90],
    [expected - 5, expected + 20],
    [-40, 5],
  ];
  for (const [viewStart, viewEnd] of windows) {
    const layout = flowWindow({
      count: sizes.length,
      sizeAt: (index) => sizes[index],
      gap,
      viewStart,
      viewEnd,
    });
    assert.equal(layout.total, expected);
    assert.equal(visualTotal(layout, sizes, gap), expected);
    for (let i = layout.start; i < layout.end; i += 1) {
      const bottom = layout.tops[i] + sizes[i];
      const intersects = bottom > viewStart && layout.tops[i] < viewEnd;
      assert.equal(intersects, true);
    }
  }
});

test("block layout with no gap uses the same spacer math", () => {
  const sizes = [36, 36, 28, 36];
  const layout = flowWindow({
    count: sizes.length,
    sizeAt: (index) => sizes[index],
    gap: 0,
    viewStart: 40,
    viewEnd: 80,
  });
  assert.equal(visualTotal(layout, sizes, 0), totalOf(sizes, 0));
  assert.ok(layout.end > layout.start);
});

test("anchor keeps the first visible item when an item above it grows", () => {
  const oldSizes = [10, 40, 40];
  const newSizes = [30, 40, 40];
  const delta = anchorDelta({
    count: 3,
    oldSizeAt: (index) => oldSizes[index],
    newSizeAt: (index) => newSizes[index],
    gap: 14,
    viewStart: 30,
  });
  assert.equal(delta, 20);
});
