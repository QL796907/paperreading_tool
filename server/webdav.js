/**
 * 电脑端 WebDAV 传输：Node 18 自带的 fetch。
 * 测连、下载、上传、建目录和拼地址在 shared/webdavProtocol.js。
 */

import { createDavClient } from "../shared/webdavProtocol.js";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function authHeader(user, password) {
  return `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;
}

async function davRequest({
  method,
  url,
  user,
  password,
  body,
  headers = {},
  timeoutMs = 25000,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(user, password),
        "User-Agent": "paper-glossary/1.0",
        ...headers,
      },
      body,
      // 不让 fetch 自己跟随。301/302 会把 MKCOL / PUT 改成 GET，文件夹建不出来。
      redirect: "manual",
      signal: controller.signal,
    });
    const text = await res.text();
    return {
      status: res.status,
      text,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      location: res.headers.get("location"),
    };
  } catch (err) {
    if (err.name === "AbortError") {
      throw fail("连接网盘超时，请检查网络", 504);
    }
    throw fail("连不上 WebDAV 服务，请检查地址和网络", 502);
  } finally {
    clearTimeout(timer);
  }
}

export const { joinDavUrl, testDav, downloadTerms, uploadTerms } =
  createDavClient(davRequest);
