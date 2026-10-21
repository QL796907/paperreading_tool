/**
 * 手机端 WebDAV 传输：走 httpRequest（PROPFIND / MKCOL 经原生插件）。
 * 测连、下载、上传、建目录和拼地址在 webdavProtocol.js。
 */

import { basicAuth, httpRequest } from "./http.js";
import { createDavClient } from "./webdavProtocol.js";

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
    location: get("location"),
  };
}

export const { joinDavUrl, testDav, downloadTerms, uploadTerms } =
  createDavClient(davRequest);
