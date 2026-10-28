import assert from "node:assert/strict";
import test from "node:test";
import { createTermWithAutoExplain } from "./createTermFlow.js";
import { createGlossaryStore } from "./glossaryStore.js";
import {
  MISSING_TERM_MESSAGE,
  writeAiDefinition,
} from "./writeAiDefinition.js";

function memoryStore(settings = {}) {
  const terms = new Map();
  const state = {
    settings: { autoExplain: true, model: "deepseek-chat", ...settings },
  };
  const patches = [];
  return {
    patches,
    state,
    async getTerm(id) {
      const term = terms.get(id);
      return term ? { ...term } : null;
    },
    async getSettings() {
      return { ...state.settings };
    },
    async upsertTerm(input) {
      const term = {
        id: input.id || "t1",
        word: input.word || "",
        definition: input.definition || "",
      };
      terms.set(term.id, { ...term });
      return { term: { ...term }, created: true };
    },
    async updateTerm(id, patch) {
      const current = terms.get(id);
      if (!current) {
        const error = new Error(MISSING_TERM_MESSAGE);
        error.status = 404;
        throw error;
      }
      const next = { ...current, ...patch };
      terms.set(id, next);
      patches.push({ id, patch });
      return { ...next };
    },
  };
}

function trackingLock() {
  let locked = false;
  const calls = [];
  return {
    calls,
    isLocked: () => locked,
    async withLock(fn) {
      calls.push("lock");
      locked = true;
      try {
        return await fn();
      } finally {
        locked = false;
      }
    },
  };
}

test("missing term throws a plain error and does not explain", async () => {
  const store = memoryStore();
  const lock = trackingLock();
  let explained = false;
  await assert.rejects(
    () =>
      writeAiDefinition({
        id: "missing",
        withLock: lock.withLock,
        store,
        explainTerm: async () => {
          explained = true;
          return "不应该出现";
        },
      }),
    (err) => {
      assert.equal(err.message, MISSING_TERM_MESSAGE);
      assert.equal(err.status, undefined);
      assert.equal(Object.prototype.hasOwnProperty.call(err, "status"), false);
      return true;
    },
  );
  assert.equal(explained, false);
  assert.deepEqual(lock.calls, []);
  assert.deepEqual(store.patches, []);
});

test("explain runs outside the lock and writes definition source ai", async () => {
  const store = memoryStore();
  await store.upsertTerm({ id: "t1", word: "entropy", definition: "" });
  const lock = trackingLock();
  let seen = null;
  const updated = await writeAiDefinition({
    id: "t1",
    withLock: lock.withLock,
    store,
    explainTerm: async (term, settings) => {
      assert.equal(lock.isLocked(), false);
      seen = { word: term.word, model: settings.model };
      return "  一条释义  ";
    },
  });
  assert.deepEqual(seen, { word: "entropy", model: "deepseek-chat" });
  assert.deepEqual(store.patches, [
    {
      id: "t1",
      patch: { definition: "  一条释义  ", definitionSource: "ai" },
    },
  ]);
  assert.equal(updated.definition, "  一条释义  ");
  assert.equal(updated.definitionSource, "ai");
  assert.deepEqual(lock.calls, ["lock"]);
});

test("explain failures propagate and skip the write", async () => {
  const store = memoryStore();
  await store.upsertTerm({ id: "t1", word: "entropy" });
  const lock = trackingLock();
  const failure = new Error("模型没有返回解析内容");
  failure.status = 502;
  await assert.rejects(
    () =>
      writeAiDefinition({
        id: "t1",
        withLock: lock.withLock,
        store,
        explainTerm: async () => {
          throw failure;
        },
      }),
    (err) => {
      assert.equal(err, failure);
      assert.equal(err.status, 502);
      return true;
    },
  );
  assert.deepEqual(lock.calls, []);
  assert.deepEqual(store.patches, []);
});

test("create flow writes through the helper when auto explain is on", async () => {
  const store = memoryStore({ autoExplain: false });
  const lock = trackingLock();
  const result = await createTermWithAutoExplain({
    body: { word: "entropy", autoExplain: true },
    withLock: lock.withLock,
    store,
    explainTerm: async (term) => {
      assert.equal(lock.isLocked(), false);
      assert.equal(term.word, "entropy");
      return "热力学术语";
    },
  });
  assert.equal(result.created, true);
  assert.equal(result.explainError, undefined);
  assert.equal(result.term.definition, "热力学术语");
  assert.equal(result.term.definitionSource, "ai");
  assert.deepEqual(lock.calls, ["lock", "lock"]);
});

test("create flow keeps the saved term when explain fails", async () => {
  const store = memoryStore();
  const lock = trackingLock();
  const result = await createTermWithAutoExplain({
    body: { word: "entropy" },
    withLock: lock.withLock,
    store,
    explainTerm: async () => {
      throw new Error("模型请求超时，请稍后重试");
    },
  });
  assert.equal(result.created, true);
  assert.equal(result.term.definition, "");
  assert.equal(result.explainError, "模型请求超时，请稍后重试");
  assert.deepEqual(store.patches, []);
  assert.deepEqual(lock.calls, ["lock"]);
});

test("create flow skips explain when asked not to or a definition exists", async () => {
  const store = memoryStore({ autoExplain: true });
  const lock = trackingLock();
  let explained = 0;
  const explainTerm = async () => {
    explained += 1;
    return "不该写";
  };
  const skipped = await createTermWithAutoExplain({
    body: { word: "entropy", autoExplain: false },
    withLock: lock.withLock,
    store,
    explainTerm,
  });
  assert.equal(skipped.term.definition, "");
  assert.equal(skipped.explainError, undefined);

  const existing = await createTermWithAutoExplain({
    body: { word: "entropy", definition: "手写", autoExplain: true },
    withLock: lock.withLock,
    store,
    explainTerm,
  });
  assert.equal(existing.term.definition, "手写");
  assert.equal(explained, 0);
  assert.deepEqual(store.patches, []);
});

test("create flow follows settings when the request omits autoExplain", async () => {
  const store = memoryStore({ autoExplain: false });
  const lock = trackingLock();
  let explained = 0;
  const skipped = await createTermWithAutoExplain({
    body: { word: "entropy" },
    withLock: lock.withLock,
    store,
    explainTerm: async () => {
      explained += 1;
      return "不该写";
    },
  });
  assert.equal(skipped.term.definition, "");
  assert.equal(explained, 0);

  store.state.settings.autoExplain = true;
  const written = await createTermWithAutoExplain({
    body: { word: "entropy" },
    withLock: lock.withLock,
    store,
    explainTerm: async () => "按设置生成",
  });
  assert.equal(written.term.definition, "按设置生成");
  assert.equal(written.term.definitionSource, "ai");
});

test("real store trims the definition and keeps source ai", async () => {
  const files = new Map();
  const store = createGlossaryStore({
    async readJson(name, fallback) {
      if (!files.has(name)) return fallback;
      return JSON.parse(files.get(name));
    },
    async writeJson(name, data) {
      files.set(name, JSON.stringify(data));
    },
  });
  const { term, created } = await store.upsertTerm({ word: "entropy" });
  assert.equal(created, true);
  let explained = 0;
  const updated = await writeAiDefinition({
    id: term.id,
    withLock: (fn) => fn(),
    store,
    explainTerm: async (loaded) => {
      explained += 1;
      assert.equal(loaded.word, "entropy");
      return "  一条释义  ";
    },
  });
  assert.equal(explained, 1);
  assert.equal(updated.definition, "一条释义");
  assert.equal(updated.definitionSource, "ai");
  const stored = await store.getTerm(term.id);
  assert.equal(stored.definition, "一条释义");
  assert.equal(stored.definitionSource, "ai");

  await assert.rejects(
    () =>
      writeAiDefinition({
        id: "missing",
        withLock: (fn) => fn(),
        store,
        explainTerm: async () => {
          explained += 1;
          return "不该写";
        },
      }),
    (err) => {
      assert.equal(err.message, MISSING_TERM_MESSAGE);
      assert.equal(err.status, undefined);
      return true;
    },
  );
  assert.equal(explained, 1);
});
