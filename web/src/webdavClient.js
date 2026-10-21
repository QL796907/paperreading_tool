/**
 * 手机端 WebDAV 传输：走 httpRequest。
 * PROPFIND / MKCOL 经原生插件。GET / PUT 留在 CapacitorHttp，但 redirect 为 manual，
 * 301/302 交回 webdavProtocol.js。术语本 GET 不走插件，插件会把响应体截到 1MB。
 * 测连、下载、上传、建目录和拼地址在 webdavProtocol.js。
 */

import { basicAuth, httpRequest } from "./http.js";
import { createDavClient } from "./webdavProtocol.js";

function headerValue(headers, name) {
  if (!headers || typeof headers !== "object") return null;
  const want = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (String(key).toLowerCase() !== want) continue;
    const value = headers[key];
    const text = Array.isArray(value)
      ? value.find((item) => item != null && item !== "")
      : value;
    if (text == null || text === "") return null;
    return String(text).trim();
  }
  return null;
}

async function davRequest({ method, url, user, password, body, headers = {} }) {
  const res = await httpRequest({
    method,
    url,
    body,
    redirect: "manual",
    headers: {
      Authorization: basicAuth(user, password),
      "User-Agent": "paper-glossary/1.0",
      ...headers,
    },
  });
  return {
    status: res.status,
    text: res.text,
    etag: headerValue(res.headers, "etag"),
    lastModified: headerValue(res.headers, "last-modified"),
    location: headerValue(res.headers, "location"),
  };
}

export const { joinDavUrl, testDav, downloadTerms, uploadTerms } =
  createDavClient(davRequest);
