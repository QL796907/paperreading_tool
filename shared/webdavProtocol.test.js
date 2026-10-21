import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { uploadTerms as nodeUploadTerms } from "../server/webdav.js";
import { createDavClient } from "./webdavProtocol.js";

const creds = {
  url: "https://dav.example/dav/",
  user: "me",
  password: "app-secret",
  remotePath: "paper-glossary/terms.json",
};

function scripted(handler) {
  const seen = [];
  const request = async (options) => {
    seen.push({
      method: options.method,
      url: options.url,
      body: options.body,
    });
    return handler(options, seen.length - 1);
  };
  return { request, seen };
}

test("MKCOL follows 301 with the same method and a trailing slash", async () => {
  const { request, seen } = scripted((options) => {
    if (options.method === "MKCOL" && options.url.endsWith("/paper-glossary/")) {
      return {
        status: 301,
        location: "https://dav.example/dav/col/",
        text: "",
      };
    }
    if (options.method === "MKCOL" && options.url === "https://dav.example/dav/col/") {
      return { status: 201, text: "" };
    }
    if (options.method === "PUT") return { status: 201, text: "", etag: "t" };
    throw new Error(`unexpected ${options.method} ${options.url}`);
  });
  const { uploadTerms } = createDavClient(request);
  await uploadTerms(creds, { terms: [{ term: "词" }], updatedAt: "2026-10-21T00:00:00.000Z" });

  assert.deepEqual(
    seen.map((item) => `${item.method} ${item.url}`),
    [
      "MKCOL https://dav.example/dav/paper-glossary/",
      "MKCOL https://dav.example/dav/col/",
      "PUT https://dav.example/dav/paper-glossary/terms.json",
    ],
  );
  assert.equal(seen.some((item) => item.method === "GET"), false);
});

test("relative Location stays on the same host and keeps PUT body", async () => {
  const { request, seen } = scripted((options) => {
    if (options.method === "MKCOL") return { status: 201, text: "" };
    if (options.method === "PUT" && !options.url.includes("final=1")) {
      return { status: 302, location: "/dav/paper-glossary/terms.json?final=1", text: "" };
    }
    if (options.method === "PUT") return { status: 204, text: "" };
    throw new Error(`unexpected ${options.method} ${options.url}`);
  });
  const { uploadTerms } = createDavClient(request);
  await uploadTerms(creds, { terms: [], updatedAt: "2026-10-21T00:00:00.000Z" });
  const puts = seen.filter((item) => item.method === "PUT");
  assert.equal(puts.length, 2);
  assert.equal(puts[0].body, puts[1].body);
  assert.equal(puts[1].url, "https://dav.example/dav/paper-glossary/terms.json?final=1");
});

test("409 plus PROPFIND 207 means the folder already exists", async () => {
  const { request, seen } = scripted((options) => {
    if (options.method === "MKCOL") return { status: 409, text: "" };
    if (options.method === "PROPFIND") return { status: 207, text: "<multistatus/>" };
    if (options.method === "PUT") return { status: 204, text: "" };
    throw new Error(`unexpected ${options.method} ${options.url}`);
  });
  const { uploadTerms } = createDavClient(request);
  await uploadTerms(creds, { terms: [], updatedAt: "2026-10-21T00:00:00.000Z" });
  assert.deepEqual(
    seen.map((item) => item.method),
    ["MKCOL", "PROPFIND", "PUT"],
  );
  assert.equal(seen[1].url, "https://dav.example/dav/paper-glossary/");
});

test("409 plus PROPFIND 404 does not upload", async () => {
  const { request, seen } = scripted((options) => {
    if (options.method === "MKCOL") return { status: 409, text: "" };
    if (options.method === "PROPFIND") return { status: 404, text: "" };
    throw new Error(`unexpected ${options.method} ${options.url}`);
  });
  const { uploadTerms } = createDavClient(request);
  await assert.rejects(
    () => uploadTerms(creds, { terms: [], updatedAt: "2026-10-21T00:00:00.000Z" }),
    (err) => /上一级文件夹/.test(err.message),
  );
  assert.equal(seen.some((item) => item.method === "PUT"), false);
});

test("redirect to another host is not followed", async () => {
  const { request, seen } = scripted(() => ({
    status: 301,
    location: "https://evil.example/steal",
    text: "",
  }));
  const { uploadTerms } = createDavClient(request);
  await assert.rejects(
    () => uploadTerms(creds, { terms: [], updatedAt: "2026-10-21T00:00:00.000Z" }),
    (err) => /别的网站/.test(err.message),
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://dav.example/dav/paper-glossary/");
});

test("too many redirects stops", async () => {
  const { request } = scripted(() => ({
    status: 302,
    location: "/dav/again/",
    text: "",
  }));
  const { uploadTerms } = createDavClient(request);
  await assert.rejects(
    () => uploadTerms(creds, { terms: [], updatedAt: "2026-10-21T00:00:00.000Z" }),
    (err) => /跳转次数过多/.test(err.message),
  );
});

test("303 drops the body and switches to GET", async () => {
  const { request, seen } = scripted((options) => {
    if (options.method === "MKCOL") return { status: 201, text: "" };
    if (options.method === "PUT") {
      return { status: 303, location: "/dav/paper-glossary/terms.json", text: "" };
    }
    if (options.method === "GET") return { status: 204, text: "" };
    throw new Error(`unexpected ${options.method} ${options.url}`);
  });
  const { uploadTerms } = createDavClient(request);
  await uploadTerms(creds, { terms: [{ term: "词" }], updatedAt: "2026-10-21T00:00:00.000Z" });
  assert.deepEqual(
    seen.map((item) => item.method),
    ["MKCOL", "PUT", "GET"],
  );
  assert.ok(seen[1].body);
  assert.equal(seen[2].body, undefined);
});

test("PROPFIND 207 does not create folders", async () => {
  const { request, seen } = scripted(() => ({ status: 207, text: "" }));
  const { testDav } = createDavClient(request);
  const result = await testDav(creds);
  assert.equal(result.ok, true);
  assert.deepEqual(
    seen.map((item) => item.method),
    ["PROPFIND"],
  );
});

test("Node fetch replays MKCOL after 301 instead of turning it into GET", async () => {
  const methods = [];
  let stored = "";
  const server = http.createServer((req, res) => {
    methods.push(`${req.method} ${req.url}`);
    if (req.method === "MKCOL" && req.url === "/dav/paper-glossary/") {
      res.writeHead(301, { Location: "/dav/col/" });
      res.end();
      return;
    }
    if (req.method === "MKCOL" && req.url === "/dav/col/") {
      res.writeHead(201);
      res.end();
      return;
    }
    if (req.method === "PUT" && req.url === "/dav/paper-glossary/terms.json") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        stored = Buffer.concat(chunks).toString("utf8");
        res.writeHead(201);
        res.end();
      });
      return;
    }
    res.writeHead(500);
    res.end("unexpected");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await nodeUploadTerms(
      {
        url: `http://127.0.0.1:${port}/dav/`,
        user: "me",
        password: "app-secret",
        remotePath: "paper-glossary/terms.json",
      },
      { terms: [{ term: "词" }], updatedAt: "2026-10-21T00:00:00.000Z" },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.deepEqual(methods, [
    "MKCOL /dav/paper-glossary/",
    "MKCOL /dav/col/",
    "PUT /dav/paper-glossary/terms.json",
  ]);
  assert.match(stored, /词/);
});

test("nested path creates each parent with a trailing slash", async () => {
  const { request, seen } = scripted((options) => {
    if (options.method === "MKCOL") return { status: 201, text: "" };
    if (options.method === "PUT") return { status: 201, text: "" };
    throw new Error(`unexpected ${options.method}`);
  });
  const { uploadTerms } = createDavClient(request);
  await uploadTerms(
    { ...creds, remotePath: "a/b/terms.json" },
    { terms: [], updatedAt: "2026-10-21T00:00:00.000Z" },
  );
  assert.deepEqual(
    seen.map((item) => `${item.method} ${item.url}`),
    [
      "MKCOL https://dav.example/dav/a/",
      "MKCOL https://dav.example/dav/a/b/",
      "PUT https://dav.example/dav/a/b/terms.json",
    ],
  );
});
