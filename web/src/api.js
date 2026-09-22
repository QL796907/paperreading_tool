import { isNativeApp } from "./platform.js";
import { nativeApi } from "./nativeApi.js";

const headers = { "Content-Type": "application/json" };

function fail(err) {
  if (err instanceof TypeError) {
    return new Error("连不上本地服务，确认术语本已打开");
  }
  return err;
}

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function request(url, options) {
  try {
    const res = await fetch(url, options);
    return await readJson(res);
  } catch (err) {
    throw fail(err);
  }
}

const httpApi = {
  state: () => request("/api/state"),
  createTerm: (body) =>
    request("/api/terms", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  updateTerm: (id, body) =>
    request(`/api/terms/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
  deleteTerm: (id) => request(`/api/terms/${id}`, { method: "DELETE" }),
  explainTerm: (id) => request(`/api/terms/${id}/explain`, { method: "POST" }),
  saveSettings: (body) =>
    request("/api/settings", {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    }),
  testSync: (body) =>
    request("/api/sync/test", {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    }),
  syncNow: () => request("/api/sync/now", { method: "POST" }),
};

export const api = new Proxy(httpApi, {
  get(_target, prop) {
    const backend = isNativeApp() ? nativeApi : httpApi;
    return backend[prop];
  },
});
