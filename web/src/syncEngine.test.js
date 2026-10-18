import assert from "node:assert/strict";
import test from "node:test";
import { createSyncEngine, normalizeTestCredentials } from "./syncEngine.js";

const saved = {
  webdavUrl: "https://dav.example/dav/",
  webdavUser: "saved-user",
  webdavPassword: "saved-secret",
  webdavPath: "paper-glossary/terms.json",
};

test("explicit blank password stays blank", () => {
  const creds = normalizeTestCredentials(
    {
      webdavUrl: "https://dav.example/dav/",
      webdavUser: "me",
      webdavPassword: "",
      webdavPath: "paper-glossary/terms.json",
    },
    saved,
  );
  assert.equal(creds.webdavPassword, "");
  assert.equal(creds.webdavUser, "me");
});

test("omitted password falls back to saved settings", () => {
  const creds = normalizeTestCredentials(
    {
      webdavUrl: "https://other.example/dav/",
      webdavUser: "me",
    },
    saved,
  );
  assert.equal(creds.webdavPassword, "saved-secret");
  assert.equal(creds.webdavUrl, "https://other.example/dav/");
  assert.equal(creds.webdavPath, saved.webdavPath);
});

test("null body uses saved credentials", () => {
  const creds = normalizeTestCredentials(null, saved);
  assert.deepEqual(creds, saved);
});

function engineWith(testDav) {
  return createSyncEngine({
    readEnvelope: async () => ({ terms: [], updatedAt: null }),
    writeEnvelope: async () => {},
    getSettings: async () => saved,
    downloadTerms: async () => null,
    uploadTerms: async () => {},
    testDav,
  });
}

test("testConnection does not substitute a cleared password", async () => {
  let seen;
  const engine = engineWith(async (creds) => {
    seen = creds;
    if (!String(creds.user || "").trim() || !String(creds.password || "")) {
      const error = new Error("请填写账号和应用密码");
      error.status = 400;
      throw error;
    }
    return { ok: true, message: "WebDAV 能连上，账号可用。" };
  });

  await assert.rejects(
    () =>
      engine.testConnection({
        webdavUrl: saved.webdavUrl,
        webdavUser: "me",
        webdavPassword: "",
        webdavPath: saved.webdavPath,
      }),
    (err) => err.message === "请填写账号和应用密码",
  );
  assert.equal(seen.password, "");
  assert.equal(seen.user, "me");
});

test("testConnection uses the saved password when the field is omitted", async () => {
  let seen;
  const engine = engineWith(async (creds) => {
    seen = creds;
    return { ok: true, message: "WebDAV 能连上，账号可用。" };
  });

  const result = await engine.testConnection({
    webdavUrl: saved.webdavUrl,
    webdavUser: "me",
    webdavPath: saved.webdavPath,
  });
  assert.equal(result.ok, true);
  assert.equal(seen.password, "saved-secret");
});
