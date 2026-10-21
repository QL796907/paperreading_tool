import assert from "node:assert/strict";
import { mock, test } from "node:test";

if (typeof mock.module !== "function") {
  test(
    "mobile WebDAV hands redirects back",
    {
      skip: "node --experimental-test-module-mocks --test web/src/webdavClient.test.js",
    },
    () => {},
  );
} else {
  await loadAndroidRedirectTests();
}

async function loadAndroidRedirectTests() {
  const httpCalls = [];
  const pluginCalls = [];
  const handlers = {
    capacitor() {
      return { status: 500, data: "", headers: {} };
    },
    plugin() {
      return { status: 500, text: "", headers: {} };
    },
  };

  mock.module("@capacitor/core", {
    namedExports: {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
      },
      CapacitorHttp: {
        async request(options) {
          httpCalls.push(options);
          return handlers.capacitor(options);
        },
      },
      registerPlugin: () => ({
        async request(options) {
          pluginCalls.push(options);
          return handlers.plugin(options);
        },
      }),
    },
  });

  const creds = {
    url: "https://dav.example/dav/",
    user: "me",
    password: "app-secret",
    remotePath: "paper-glossary/terms.json",
  };

  test("PUT redirect is returned to the protocol with the original method", async () => {
    httpCalls.length = 0;
    pluginCalls.length = 0;
    handlers.plugin = () => ({ status: 201, text: "", headers: {} });
    handlers.capacitor = (options) => {
      if (!String(options.url).includes("final=1")) {
        return {
          status: 302,
          data: "",
          headers: { Location: "/dav/paper-glossary/terms.json?final=1" },
        };
      }
      return { status: 204, data: "", headers: { ETag: '"t"' } };
    };

    const { uploadTerms } = await import("./webdavClient.js");
    const saved = await uploadTerms(creds, {
      terms: [{ term: "词" }],
      updatedAt: "2026-10-21T00:00:00.000Z",
    });

    assert.equal(saved.etag, '"t"');
    assert.deepEqual(
      pluginCalls.map((item) => item.method),
      ["MKCOL"],
    );
    assert.equal(httpCalls.length, 2);
    assert.equal(httpCalls[0].method, "PUT");
    assert.equal(httpCalls[1].method, "PUT");
    assert.equal(httpCalls[0].disableRedirects, true);
    assert.equal(httpCalls[1].disableRedirects, true);
    assert.equal(httpCalls[0].data, httpCalls[1].data);
    assert.equal(
      httpCalls[1].url,
      "https://dav.example/dav/paper-glossary/terms.json?final=1",
    );
  });

  test("glossary GET stays on CapacitorHttp and still sees a redirect", async () => {
    httpCalls.length = 0;
    pluginCalls.length = 0;
    const body = JSON.stringify({
      terms: [{ term: "词" }],
      updatedAt: "2026-10-21T00:00:00.000Z",
    });
    handlers.capacitor = (options) => {
      if (!String(options.url).includes("final=1")) {
        return {
          status: 302,
          data: "",
          headers: { Location: "/dav/paper-glossary/terms.json?final=1" },
        };
      }
      return {
        status: 200,
        data: body,
        headers: { "Last-Modified": "Tue, 21 Oct 2026 00:00:00 GMT" },
      };
    };

    const { downloadTerms } = await import("./webdavClient.js");
    const downloaded = await downloadTerms(creds);

    assert.equal(pluginCalls.length, 0);
    assert.equal(httpCalls.length, 2);
    assert.deepEqual(
      httpCalls.map((item) => item.method),
      ["GET", "GET"],
    );
    assert.equal(
      httpCalls.every((item) => item.disableRedirects === true),
      true,
    );
    assert.equal(downloaded.envelope.terms[0].term, "词");
    assert.equal(downloaded.lastModified, "Tue, 21 Oct 2026 00:00:00 GMT");
  });

  test("AI POST and the update manifest GET keep following redirects", async () => {
    httpCalls.length = 0;
    const { httpRequest } = await import("./http.js");
    handlers.capacitor = () => ({ status: 200, data: "{}", headers: {} });

    await httpRequest({
      method: "POST",
      url: "https://api.example/v1/chat",
      body: "{}",
    });
    await httpRequest({
      method: "GET",
      url: "https://raw.githubusercontent.com/QL796907/paperreading_tool/main/updates/android.json",
    });

    assert.equal(httpCalls.length, 2);
    assert.equal("disableRedirects" in httpCalls[0], false);
    assert.equal("disableRedirects" in httpCalls[1], false);
    assert.equal(pluginCalls.length, 0);
  });
}
