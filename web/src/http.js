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

// 超时在这里标成 AbortError。文案保持坚果云那句；模型超时的句子只在 explainTerm 里换。
function isNetworkTimeout(err) {
  if (!err) return false;
  if (err.name === "AbortError" || err.status === 504) return true;
  return /timeout|timed out|超时/i.test(String(err.message || ""));
}

function networkTimeout() {
  const error = new Error("连接超时，请检查网络");
  error.name = "AbortError";
  return error;
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
      if (isNetworkTimeout(err)) throw networkTimeout();
      throw fail(readableNetworkError(err), 502);
    }
  }

  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
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
      if (isNetworkTimeout(err)) throw networkTimeout();
      throw fail(err?.message || "网络请求失败", 502);
    }
  }

  throw fail("只能在 Android 应用里发这个请求");
}

export function basicAuth(user, password) {
  const raw = `${user}:${password}`;
  return `Basic ${btoa(unescape(encodeURIComponent(raw)))}`;
}
