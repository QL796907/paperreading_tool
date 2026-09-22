import { basicAuth, httpRequest } from "./http.js";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function joinDavUrl(baseUrl, remotePath = "") {
  const base = String(baseUrl || "").trim();
  if (!base) throw fail("请填写 WebDAV 地址");
  const rel = String(remotePath || "").trim();
  if (/^https?:\/\//i.test(rel)) return rel;
  try {
    const root = base.endsWith("/") ? base : `${base}/`;
    if (!rel) return new URL(root).href;
    const encoded = rel
      .replace(/^\/+/, "")
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    return new URL(encoded, root).href;
  } catch {
    throw fail("WebDAV 地址不是合法网址");
  }
}

async function davRequest({ method, url, user, password, body, headers = {} }) {
  const res = await httpRequest({
    method,
    url,
    body,
    headers: {
      Authorization: basicAuth(user, password),
      "User-Agent": "paper-glossary/1.0",
      ...headers,
    },
  });
  const hdrs = res.headers || {};
  const get = (name) => hdrs[name] || hdrs[name.toLowerCase()] || null;
  return {
    status: res.status,
    text: res.text,
    etag: get("etag"),
    lastModified: get("last-modified"),
  };
}

function mapAuthError(status) {
  if (status === 401 || status === 403) {
    return fail("账号或应用密码不对。坚果云请用「应用密码」，不是登录密码。", 401);
  }
  return null;
}

export async function testDav({ url, user, password, remotePath }) {
  if (!String(user || "").trim() || !String(password || "")) {
    throw fail("请填写账号和应用密码");
  }
  const baseHref = joinDavUrl(url);
  const probe = await davRequest({
    method: "PROPFIND",
    url: baseHref,
    user,
    password,
    headers: {
      Depth: "0",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>`,
  });
  const authErr = mapAuthError(probe.status);
  if (authErr) throw authErr;
  if ([200, 207, 301, 302].includes(probe.status)) {
    return { ok: true, message: "WebDAV 能连上，账号可用。" };
  }
  const fileHref = joinDavUrl(url, remotePath || "paper-glossary/terms.json");
  const get = await davRequest({ method: "GET", url: fileHref, user, password });
  const getAuth = mapAuthError(get.status);
  if (getAuth) throw getAuth;
  if ([200, 404].includes(get.status)) {
    return {
      ok: true,
      message:
        get.status === 404
          ? "账号可用。远程还没有术语本文件，第一次同步时会自动创建。"
          : "WebDAV 能连上，已经找到远程术语本。",
    };
  }
  throw fail(`网盘返回 ${probe.status}，地址可能不对`, 502);
}

async function ensureParents({ url, user, password, remotePath }) {
  const parts = String(remotePath || "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  parts.pop();
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    const res = await davRequest({
      method: "MKCOL",
      url: joinDavUrl(url, acc),
      user,
      password,
    });
    const authErr = mapAuthError(res.status);
    if (authErr) throw authErr;
    if (![201, 200, 301, 302, 405, 409].includes(res.status)) {
      throw fail(`没法在网盘上创建文件夹（${res.status}）`, 502);
    }
  }
}

export async function downloadTerms({ url, user, password, remotePath }) {
  const res = await davRequest({
    method: "GET",
    url: joinDavUrl(url, remotePath),
    user,
    password,
  });
  const authErr = mapAuthError(res.status);
  if (authErr) throw authErr;
  if (res.status === 404) return null;
  if (res.status !== 200) throw fail(`下载术语本失败（网盘返回 ${res.status}）`, 502);
  if (!res.text.trim()) return null;
  let data;
  try {
    data = JSON.parse(res.text);
  } catch {
    throw fail("远程文件不是合法 JSON，已停止覆盖，以免冲掉本机词条", 502);
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.terms)) {
    throw fail("远程文件不是术语本格式，已停止覆盖，以免冲掉本机词条", 502);
  }
  return {
    envelope: {
      terms: data.terms,
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    },
    lastModified: res.lastModified,
    etag: res.etag,
  };
}

export async function uploadTerms({ url, user, password, remotePath }, envelope) {
  await ensureParents({ url, user, password, remotePath });
  const body = JSON.stringify(
    {
      terms: envelope.terms || [],
      updatedAt: envelope.updatedAt || new Date().toISOString(),
    },
    null,
    2,
  );
  const res = await davRequest({
    method: "PUT",
    url: joinDavUrl(url, remotePath),
    user,
    password,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body,
  });
  const authErr = mapAuthError(res.status);
  if (authErr) throw authErr;
  if (![200, 201, 204].includes(res.status)) {
    throw fail(`上传术语本失败（网盘返回 ${res.status}）`, 502);
  }
  return { etag: res.etag, lastModified: res.lastModified };
}
