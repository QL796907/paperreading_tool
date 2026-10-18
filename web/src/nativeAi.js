import { httpRequest } from "./http.js";
import { explainTerm as explain } from "./explainTerm.js";

// http.js 把超时换成自己的文案。改回 AbortError，解析那一层才能统一写成 504。
function isTimeout(err) {
  if (!err) return false;
  if (err.name === "AbortError" || err.status === 504) return true;
  return /timeout|timed out|超时/i.test(String(err.message || ""));
}

async function postChat({ url, headers, body, timeoutMs }) {
  try {
    const res = await httpRequest({
      method: "POST",
      url,
      headers,
      body,
      timeoutMs,
    });
    return { status: res.status, statusText: "", text: res.text };
  } catch (err) {
    if (!isTimeout(err)) throw err;
    const error = new Error(err.message);
    error.name = "AbortError";
    throw error;
  }
}

export function explainTerm(term, settings) {
  return explain(term, settings, postChat);
}
