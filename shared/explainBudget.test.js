import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { explainTerm } from "./explainTerm.js";
import {
  explainClientMarginMs,
  explainClientWaitMs,
  explainTimeoutMs,
} from "./explainBudget.js";
import { pluginBudgetSource } from "../scripts/pluginBudget.js";

test("plugin wait is the model timeout plus one margin", () => {
  assert.equal(explainTimeoutMs, 60 * 1000);
  assert.equal(explainClientMarginMs, 5 * 1000);
  assert.equal(explainClientWaitMs, explainTimeoutMs + explainClientMarginMs);
  assert.ok(explainClientWaitMs > explainTimeoutMs);
});

test("checked-in plugin script is that same budget", () => {
  const source = pluginBudgetSource();
  const committed = fs.readFileSync(
    new URL("../zotero-plugin/explainBudget.js", import.meta.url),
    "utf8",
  );
  assert.equal(committed, source);
  const sandbox = {};
  vm.runInNewContext(source, sandbox);
  assert.equal(sandbox.PaperGlossaryBudget.explainTimeoutMs, explainTimeoutMs);
  assert.equal(sandbox.PaperGlossaryBudget.explainClientMarginMs, explainClientMarginMs);
  assert.equal(sandbox.PaperGlossaryBudget.explainClientWaitMs, explainClientWaitMs);
});

test("zotero addTerm waits on that budget once", () => {
  const glossary = fs.readFileSync(
    new URL("../zotero-plugin/glossary.js", import.meta.url),
    "utf8",
  );
  const bootstrap = fs.readFileSync(
    new URL("../zotero-plugin/bootstrap.js", import.meta.url),
    "utf8",
  );
  assert.match(glossary, /budget\.explainClientWaitMs/);
  assert.match(glossary, /typeof PaperGlossaryBudget === "undefined"/);
  assert.doesNotMatch(glossary, /timeout:\s*\d/);
  assert.equal(glossary.split("Zotero.HTTP.request").length - 1, 1);
  const budgetAt = bootstrap.indexOf('loadSubScript(rootURI + "explainBudget.js")');
  const glossaryAt = bootstrap.indexOf('loadSubScript(rootURI + "glossary.js")');
  assert.ok(budgetAt >= 0 && glossaryAt > budgetAt);
});

test("explainTerm aborts the model call on the shared timeout", async () => {
  let timeoutMs;
  const text = await explainTerm(
    { word: "ontology", sources: [], context: "" },
    {
      apiBaseUrl: "https://example.test/v1",
      apiKey: "k",
      model: "m",
      systemPrompt: "sys",
    },
    async (req) => {
      timeoutMs = req.timeoutMs;
      return {
        status: 200,
        statusText: "OK",
        text: JSON.stringify({
          choices: [{ message: { content: "定义" } }],
        }),
      };
    },
  );
  assert.equal(text, "定义");
  assert.equal(timeoutMs, explainTimeoutMs);
});
