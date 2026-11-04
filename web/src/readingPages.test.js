import assert from "node:assert/strict";
import test from "node:test";
import { packTermPages, termMeasureKey } from "./readingPages.js";

test("packs cards with the 14px gap and gives an oversized card its own page", () => {
  const items = [
    { id: "a", height: 40 },
    { id: "b", height: 40 },
    { id: "c", height: 40 },
    { id: "d", height: 150 },
    { id: "e", height: 30 },
  ];
  assert.deepEqual(packTermPages(items, 100), [["a", "b"], ["c"], ["d"], ["e"]]);
});

test("a card that exactly fills the remaining gap stays on the page", () => {
  const items = [
    { id: "a", height: 50 },
    { id: "b", height: 36 },
  ];
  assert.deepEqual(packTermPages(items, 100), [["a", "b"]]);
});

test("measure key changes when the definition changes", () => {
  const term = { id: "1", word: "注意力", definition: "短", context: "", sources: [] };
  const edited = { ...term, definition: "长了很多的解析" };
  assert.notEqual(termMeasureKey(term), termMeasureKey(edited));
});
