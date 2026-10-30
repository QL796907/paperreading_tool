import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { localDate, upsertTermInList } from "../shared/glossaryLogic.js";

const source = fs.readFileSync(new URL("./offlineTerms.js", import.meta.url), "utf8");
const sandbox = {};
vm.runInNewContext(source, sandbox);
const offline = sandbox.PaperGlossaryOffline;

const iso = "2026-10-30T10:15:00.000Z";
const id = "11111111-1111-4111-8111-111111111111";
const clock = { id, now: iso, noteDate: localDate(new Date(iso)) };
const paper = {
  title: "A Paper",
  itemKey: "ITEM1",
  itemId: 7,
  year: "2024",
  creators: "Ada",
};

function withLiveClock(fn) {
  const RealDate = globalThis.Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(iso);
      else super(...args);
    }
    static now() {
      return new RealDate(iso).getTime();
    }
  }
  const realUUID = globalThis.crypto.randomUUID;
  globalThis.Date = FixedDate;
  globalThis.crypto.randomUUID = () => id;
  try {
    return fn();
  } finally {
    globalThis.Date = RealDate;
    globalThis.crypto.randomUUID = realUUID;
  }
}

function liveUpsert(terms, input) {
  return withLiveClock(() => upsertTermInList(terms, input));
}

test("offline apply matches upsertTermInList for a new word", () => {
  const input = { word: "  Ontology  ", source: paper };
  const saved = offline.apply("  ", input, clock);
  const live = liveUpsert([], input);
  const envelope = JSON.parse(saved.text);
  assert.equal(saved.created, true);
  assert.equal(live.created, true);
  assert.deepEqual(envelope.terms, live.terms);
  assert.equal(envelope.updatedAt, iso);
  assert.equal(envelope.terms[0].definitionSource, "empty");
  assert.equal(envelope.terms[0].word, "Ontology");
});

test("offline apply merges a new source and keeps the same word", () => {
  const first = offline.apply("", { word: "Ontology", source: paper }, clock);
  const other = { ...paper, itemKey: "ITEM2", title: "Another Paper" };
  const saved = offline.apply(first.text, { word: "ontology", source: other }, clock);
  const live = liveUpsert(JSON.parse(first.text).terms, {
    word: "ontology",
    source: other,
  });
  assert.equal(saved.created, false);
  assert.deepEqual(JSON.parse(saved.text).terms, live.terms);
  assert.equal(JSON.parse(saved.text).terms[0].sources.length, 2);
});

test("the same source is not stored twice", () => {
  const first = offline.apply("", { word: "Ontology", source: paper }, clock);
  const saved = offline.apply(first.text, { word: "Ontology", source: paper }, clock);
  assert.equal(JSON.parse(saved.text).terms[0].sources.length, 1);
});

test("a damaged terms file is left untouched", () => {
  assert.throws(() => offline.apply("{", { word: "Ontology" }, clock), /损坏/);
  assert.throws(() => offline.apply("[]", { word: "Ontology" }, clock), /损坏/);
  assert.throws(
    () => offline.apply('{"terms":{}}', { word: "Ontology" }, clock),
    /损坏/,
  );
});

test("a timeout or an HTTP error is not treated as the app being closed", () => {
  assert.equal(offline.isUnreachable({ message: "Request timed out" }), false);
  assert.equal(
    offline.isUnreachable({ message: "连接超时", xmlhttp: { status: 0, responseText: "" } }),
    false,
  );
  assert.equal(
    offline.isUnreachable({
      message: "status",
      xmlhttp: { status: 502, responseText: '{"error":"模型请求超时，请稍后重试"}' },
    }),
    false,
  );
  assert.equal(
    offline.isUnreachable({ message: "NS_ERROR_CONNECTION_REFUSED", xmlhttp: { status: 0, responseText: "" } }),
    true,
  );
});

test("terms.json lives in the packaged userData directory", () => {
  assert.equal(
    offline.termsPath("C:\\Users\\ql\\AppData\\Roaming"),
    "C:\\Users\\ql\\AppData\\Roaming\\术语本\\terms.json",
  );
});
