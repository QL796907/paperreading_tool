import { Capacitor, CapacitorHttp } from "@capacitor/core";

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function httpRequest({
  method,
  url,
  headers = {},
  body,
  timeoutMs = 25000,
}) {
  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.request({
        method,
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
  if (typeof btoa === "function") {
    return `Basic ${btoa(unescape(encodeURIComponent(raw)))}`;
  }
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}
