import assert from "node:assert/strict";
import test from "node:test";
import { Directory, Encoding } from "@capacitor/filesystem";
import { createNativeStore } from "./nativeStore.js";

const envelope = {
  terms: [{ id: "1", term: "熵" }],
  updatedAt: "2026-10-21T00:00:00.000Z",
};

function storeWith(overrides) {
  return createNativeStore({
    readFile: async () => {
      throw new Error("should not read");
    },
    writeFile: async () => {
      throw new Error("should not write");
    },
    replace: async () => {
      throw new Error("should not replace");
    },
    ...overrides,
  });
}

test("saving terms writes a temp file then replaces it in one move", async () => {
  const calls = [];
  const store = storeWith({
    writeFile: async (options) => {
      calls.push(["write", options]);
    },
    replace: async (options) => {
      calls.push(["replace", options]);
    },
  });

  await store.writeEnvelope(envelope);

  assert.deepEqual(
    calls.map((entry) => entry[0]),
    ["write", "replace"],
  );
  const write = calls[0][1];
  const replace = calls[1][1];
  assert.equal(write.path, "terms.json.tmp");
  assert.equal(write.directory, Directory.Data);
  assert.equal(write.encoding, Encoding.UTF8);
  assert.equal(
    write.data,
    JSON.stringify(
      { terms: envelope.terms, updatedAt: envelope.updatedAt },
      null,
      2,
    ),
  );
  assert.equal(replace.from, "terms.json.tmp");
  assert.equal(replace.to, "terms.json");
  assert.equal(replace.from.includes("/"), false);
  assert.equal(replace.to.includes("/"), false);
  assert.equal(calls.some((entry) => entry[1].path === "terms.json"), false);
});

test("a failed replace does not write the live terms file", async () => {
  const paths = [];
  const store = storeWith({
    writeFile: async (options) => {
      paths.push(options.path);
    },
    replace: async () => {
      throw new Error("替换词条文件失败");
    },
  });

  await assert.rejects(
    () => store.writeEnvelope(envelope),
    /替换词条文件失败/,
  );
  assert.deepEqual(paths, ["terms.json.tmp"]);
});

test("saving settings uses the same temp-then-replace path", async () => {
  const writes = [];
  const replaces = [];
  const store = storeWith({
    readFile: async () => ({ data: "{}" }),
    writeFile: async (options) => {
      writes.push(options.path);
    },
    replace: async (options) => {
      replaces.push(options);
    },
  });

  await store.saveSettings({});

  assert.deepEqual(writes, ["settings.json.tmp"]);
  assert.deepEqual(replaces, [{ from: "settings.json.tmp", to: "settings.json" }]);
});

test("missing glossary file still loads as empty", async () => {
  for (const message of ["File does not exist", "File does not exist."]) {
    const store = storeWith({
      readFile: async () => {
        throw new Error(message);
      },
    });
    assert.deepEqual(await store.readEnvelope(), { terms: [], updatedAt: null });
  }

  const enoent = storeWith({
    readFile: async () => {
      const err = new Error("ENOENT: no such file");
      err.code = "ENOENT";
      throw err;
    },
  });
  assert.deepEqual(await enoent.readEnvelope(), { terms: [], updatedAt: null });
});

test("corrupt terms.json is not treated as empty", async () => {
  const store = storeWith({
    readFile: async () => ({ data: "{not json" }),
  });
  await assert.rejects(() => store.readEnvelope(), SyntaxError);
});

test("other read failures still throw", async () => {
  const store = storeWith({
    readFile: async () => {
      throw new Error("permission denied");
    },
  });
  await assert.rejects(() => store.readEnvelope(), /permission denied/);
});
