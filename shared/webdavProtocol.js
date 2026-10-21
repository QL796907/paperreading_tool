/**
 * WebDAV 协议：拼地址、测账号、建父目录、下载和上传术语本。
 * request 负责把请求发出去，并返回 { status, text, etag, lastModified, location }。
 * 电脑用 Node fetch（redirect: manual），手机 WebDAV 的 httpRequest 也要 redirect: manual。
 * 传输不在这里。301/302/307/308 在这里按原方法重放，并且不跨主机。
 * 传输层若自己跟随，跳转落地的 200/201/204 会被当成上传或下载成功，应用密码也可能被带到别的网站。
 * MKCOL 被跟随的话还会被改成 GET，文件夹建不出来，「测试连接」只 PROPFIND 根目录却仍然显示成功。
 */

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function joinDavUrl(baseUrl, remotePath = "") {
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

function mapAuthError(status) {
  if (status === 401 || status === 403) {
    return fail(
      "账号或应用密码不对。坚果云请用「应用密码」，不是登录密码。",
      401,
    );
  }
  return null;
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>`;

const SAME_METHOD_REDIRECT = new Set([301, 302, 307, 308]);
const MAX_REDIRECTS = 5;

function resolveRedirect(from, location) {
  if (!location) throw fail("网盘返回了跳转，但没有新地址", 502);
  let next;
  let fromUrl;
  try {
    fromUrl = new URL(from);
    next = new URL(location, from);
  } catch {
    throw fail("网盘返回的跳转地址不合法", 502);
  }
  if (next.protocol !== "https:" && next.protocol !== "http:") {
    throw fail("网盘跳转到了不支持的地址", 502);
  }
  if (next.host !== fromUrl.host) {
    throw fail("网盘跳到了别的网站，已停止同步，以免把应用密码发出去", 502);
  }
  return next.href;
}

function collectionUrl(url, acc) {
  const href = joinDavUrl(url, acc);
  return href.endsWith("/") ? href : `${href}/`;
}

export function createDavClient(request) {
  async function call(options) {
    let current = options;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const res = await request(current);
      const status = Number(res?.status);
      const redirect = status === 303 || SAME_METHOD_REDIRECT.has(status);
      if (!redirect) return res;
      if (hop === MAX_REDIRECTS) break;
      const nextUrl = resolveRedirect(current.url, res.location);
      current =
        status === 303
          ? { ...current, method: "GET", url: nextUrl, body: undefined }
          : { ...current, url: nextUrl };
    }
    throw fail("网盘跳转次数过多，同步已停止", 502);
  }

  async function testDav({ url, user, password, remotePath }) {
    if (!String(user || "").trim() || !String(password || "")) {
      throw fail("请填写账号和应用密码");
    }

    const baseHref = joinDavUrl(url);
    const probe = await call({
      method: "PROPFIND",
      url: baseHref,
      user,
      password,
      headers: {
        Depth: "0",
        "Content-Type": "application/xml; charset=utf-8",
      },
      body: PROPFIND_BODY,
    });

    const authErr = mapAuthError(probe.status);
    if (authErr) throw authErr;

    if ([200, 207].includes(probe.status)) {
      return { ok: true, message: "WebDAV 能连上，账号可用。" };
    }

    // 有的网盘不让 PROPFIND 根目录，再试目标文件：401 才算真失败，404 说明认证过了。
    const fileHref = joinDavUrl(url, remotePath || "paper-glossary/terms.json");
    const get = await call({
      method: "GET",
      url: fileHref,
      user,
      password,
    });
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
      const href = collectionUrl(url, acc);
      const res = await call({
        method: "MKCOL",
        url: href,
        user,
        password,
      });
      const authErr = mapAuthError(res.status);
      if (authErr) throw authErr;
      if ([201, 200, 204, 405].includes(res.status)) continue;
      // 坚果云对已有目录常回 409。再 PROPFIND：207/200 才是真的已经在。
      if (res.status === 409) {
        const probe = await call({
          method: "PROPFIND",
          url: href,
          user,
          password,
          headers: {
            Depth: "0",
            "Content-Type": "application/xml; charset=utf-8",
          },
          body: PROPFIND_BODY,
        });
        const probeAuth = mapAuthError(probe.status);
        if (probeAuth) throw probeAuth;
        if ([200, 207].includes(probe.status)) continue;
        throw fail(
          "网盘上还没有上一级文件夹，请先在坚果云建好目录，或把远程路径改成已有文件夹下的文件",
          502,
        );
      }
      throw fail(`没法在网盘上创建文件夹（${res.status}）`, 502);
    }
  }

  async function downloadTerms({ url, user, password, remotePath }) {
    const href = joinDavUrl(url, remotePath);
    const res = await call({
      method: "GET",
      url: href,
      user,
      password,
    });
    const authErr = mapAuthError(res.status);
    if (authErr) throw authErr;
    if (res.status === 404) return null;
    if (res.status !== 200) {
      throw fail(`下载术语本失败（网盘返回 ${res.status}）`, 502);
    }
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

  async function uploadTerms({ url, user, password, remotePath }, envelope) {
    await ensureParents({ url, user, password, remotePath });
    const href = joinDavUrl(url, remotePath);
    const body = JSON.stringify(
      {
        terms: envelope.terms || [],
        updatedAt: envelope.updatedAt || new Date().toISOString(),
      },
      null,
      2,
    );
    const res = await call({
      method: "PUT",
      url: href,
      user,
      password,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body,
    });
    const authErr = mapAuthError(res.status);
    if (authErr) throw authErr;
    if (![200, 201, 204].includes(res.status)) {
      throw fail(`上传术语本失败（网盘返回 ${res.status}）`, 502);
    }
    return { etag: res.etag, lastModified: res.lastModified };
  }

  return { joinDavUrl, testDav, downloadTerms, uploadTerms };
}
