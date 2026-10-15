import { Capacitor, CapacitorHttp, registerPlugin } from "@capacitor/core";

const WebDav = registerPlugin("WebDav");

// Android HttpURLConnection（CapacitorHttp 用的那层）不认这些方法。
const SYSTEM_METHODS = new Set([
  "GET",
  "POST",
  "HEAD",
  "OPTIONS",
  "PUT",
  "DELETE",
  "PATCH",
  "TRACE",
]);

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readableNetworkError(err) {
  const msg = String(err?.message || "");
  if (/invalid http method|unknown method|PROPFIND|MKCOL/i.test(msg)) {
    return "手机系统发不出这个 WebDAV 请求，请更新术语本后再试";
  }
  if (/not implemented/i.test(msg)) {
    return "这版应用还不能连坚果云，请更新后再试";
  }
  return msg || "网络请求失败";
}

export async function httpRequest({
  method,
  url,
  headers = {},
  body,
  timeoutMs = 25000,
}) {
  const verb = String(method || "GET").toUpperCase();
  if (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android" &&
    !SYSTEM_METHODS.has(verb)
  ) {
    try {
      const res = await WebDav.request({
        method: verb,
        url,
        headers,
        body: body ?? "",
        timeoutMs,
      });
      return {
        status: res.status,
        text: typeof res.text === "string" ? res.text : "",
        headers: res.headers || {},
      };
    } catch (err) {
      throw fail(readableNetworkError(err), 502);
    }
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.request({
        method: verb,
        url,
        headers,
        data: body ?? undefined,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });
      const data = res.data;
      const text =
        typeof data === "string" ? data : data == null ? "" : JSON.stringify(data);
      return {
        status: res.status,
        text,
        headers: res.headers || {},
      };
    } catch (err) {
      throw fail(err?.message || "网络请求失败", 502);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    const hdrs = {};
    res.headers.forEach((value, key) => {
      hdrs[key] = value;
    });
    return { status: res.status, text, headers: hdrs };
  } catch (err) {
    if (err.name === "AbortError") throw fail("连接超时，请检查网络", 504);
    throw fail("连不上服务器，请检查地址和网络", 502);
  } finally {
    clearTimeout(timer);
  }
}

export function basicAuth(user, password) {
  const raw = `${user}:${password}`;
  return `Basic ${btoa(unescape(encodeURIComponent(raw)))}`;
}
