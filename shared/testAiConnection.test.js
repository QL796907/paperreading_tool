import assert from "node:assert/strict";
import test from "node:test";
import {
  aiTestTimeoutMs,
  normalizeAiTestCredentials,
  testAiConnection,
} from "./testAiConnection.js";

const saved = {
  apiBaseUrl: "https://api.example/v1",
  apiKey: "saved-secret-key",
  model: "saved-model",
};

test("explicit blank key stays blank", () => {
  const creds = normalizeAiTestCredentials(
    {
      apiBaseUrl: "https://other.example/v1",
      apiKey: "",
      model: "demo",
    },
    saved,
  );
  assert.equal(creds.apiKey, "");
  assert.equal(creds.apiBaseUrl, "https://other.example/v1");
  assert.equal(creds.model, "demo");
});

test("omitted key falls back to saved settings", () => {
  const creds = normalizeAiTestCredentials(
    { apiBaseUrl: "https://other.example/v1" },
    saved,
  );
  assert.equal(creds.apiKey, "saved-secret-key");
  assert.equal(creds.model, saved.model);
});

test("blank key does not call the model or reuse the saved key", async () => {
  let called = false;
  await assert.rejects(
    () =>
      testAiConnection(
        { apiBaseUrl: saved.apiBaseUrl, apiKey: "", model: "demo" },
        saved,
        async () => {
          called = true;
          return { status: 200, text: "{}" };
        },
      ),
    (err) => err.status === 400 && err.message === "请先填写 API Key",
  );
  assert.equal(called, false);
});

test("omitted key is sent as the saved key", async () => {
  let seen;
  const result = await testAiConnection(
    { apiBaseUrl: "https://api.example/v1/", model: "demo-model" },
    saved,
    async (req) => {
      seen = req;
      return {
        status: 200,
        text: JSON.stringify({ choices: [{ message: { content: "" } }] }),
      };
    },
  );
  assert.equal(seen.headers.Authorization, "Bearer saved-secret-key");
  assert.equal(seen.timeoutMs, aiTestTimeoutMs);
  assert.equal(seen.url, "https://api.example/v1/chat/completions");
  const body = JSON.parse(seen.body);
  assert.equal(body.model, "demo-model");
  assert.equal(body.max_tokens, 1);
  assert.equal(body.temperature, 0);
  assert.deepEqual(body.messages, [{ role: "user", content: "ping" }]);
  assert.equal(result.ok, true);
  assert.match(result.message, /demo-model/);
  assert.equal(result.message.includes("saved-secret-key"), false);
});

test("401 does not echo the key", async () => {
  await assert.rejects(
    () =>
      testAiConnection(
        {
          apiBaseUrl: "https://api.example/v1",
          apiKey: "saved-secret-key",
          model: "demo",
        },
        saved,
        async () => ({
          status: 401,
          text: "bad key saved-secret-key",
        }),
      ),
    (err) =>
      err.status === 502 &&
      err.message === "密钥不对，或这个地址不接受这把密钥" &&
      !err.message.includes("saved-secret-key"),
  );
});

test("non-2xx redacts the key from the body snippet", async () => {
  await assert.rejects(
    () =>
      testAiConnection(
        {
          apiBaseUrl: "https://api.example/v1",
          apiKey: "saved-secret-key",
          model: "demo",
        },
        {},
        async () => ({
          status: 500,
          statusText: "err",
          text: "upstream saved-secret-key failed",
        }),
      ),
    (err) =>
      err.status === 502 &&
      err.message.includes("模型接口返回 500") &&
      !err.message.includes("saved-secret-key"),
  );
});

test("AbortError becomes the model timeout message", async () => {
  const abort = new Error("连接超时，请检查网络");
  abort.name = "AbortError";
  await assert.rejects(
    () =>
      testAiConnection(
        {
          apiBaseUrl: "https://api.example/v1",
          apiKey: "saved-secret-key",
          model: "demo",
        },
        saved,
        async () => {
          throw abort;
        },
      ),
    (err) => err.status === 504 && err.message === "模型请求超时，请稍后重试",
  );
});

test("non-json and missing choices fail", async () => {
  await assert.rejects(
    () =>
      testAiConnection(
        {
          apiBaseUrl: "https://api.example/v1",
          apiKey: "saved-secret-key",
          model: "demo",
        },
        saved,
        async () => ({ status: 200, text: "not-json" }),
      ),
    (err) => err.message === "模型接口返回了无法解析的内容",
  );
  await assert.rejects(
    () =>
      testAiConnection(
        {
          apiBaseUrl: "https://api.example/v1",
          apiKey: "saved-secret-key",
          model: "demo",
        },
        saved,
        async () => ({ status: 200, text: JSON.stringify({ choices: [] }) }),
      ),
    (err) => err.message === "模型接口没有返回可用的回复",
  );
});

test("a non-http address is rejected before the request", async () => {
  let called = false;
  await assert.rejects(
    () =>
      testAiConnection(
        {
          apiBaseUrl: "ftp://files.example/v1",
          apiKey: "saved-secret-key",
          model: "demo",
        },
        saved,
        async () => {
          called = true;
        },
      ),
    (err) => err.status === 400 && /http/.test(err.message),
  );
  assert.equal(called, false);
});
