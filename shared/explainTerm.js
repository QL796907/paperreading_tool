import { explainTimeoutMs } from "./explainBudget.js";

/**
 * 术语解析的请求体和回复解析只留这一份，避免电脑和手机各写一套再分叉。
 * post({ url, headers, body, timeoutMs }) 发出请求，返回 { status, statusText, text }。
 * 超时抛 name 为 AbortError 的错误。手机上这条错误的文案仍是「连接超时，请检查网络」，
 * 只有这里换成 504 和「模型请求超时，请稍后重试」。
 * 模型等待的毫秒数在 explainBudget.js，Zotero 那一次 POST 用同一份预算加余量。
 */

export async function explainTerm(term, settings, post) {
  const base = String(settings.apiBaseUrl || "").replace(/\/$/, "");
  if (!base) {
    const error = new Error("请先在设置中填写 API 地址");
    error.status = 400;
    throw error;
  }

  const sources = (term.sources || [])
    .map((s) => {
      const who = [s.creators, s.year].filter(Boolean).join(", ");
      return who ? `${s.title}（${who}）` : s.title;
    })
    .filter(Boolean);

  const userContent = [
    `术语：${term.word}`,
    sources.length ? `来源论文：${sources.join("；")}` : "",
    term.context ? `原文上下文：${term.context}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let res;
  try {
    res = await post({
      url: `${base}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        ...(settings.apiKey
          ? { Authorization: `Bearer ${settings.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        model: settings.model || "deepseek-chat",
        temperature: 0.3,
        messages: [
          { role: "system", content: settings.systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
      timeoutMs: explainTimeoutMs,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      const error = new Error("模型请求超时，请稍后重试");
      error.status = 504;
      throw error;
    }
    throw err;
  }

  const raw = res.text;
  if (res.status < 200 || res.status >= 300) {
    const error = new Error(
      `模型接口返回 ${res.status}：${raw.slice(0, 280) || res.statusText || ""}`,
    );
    error.status = 502;
    throw error;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    const error = new Error("模型接口返回了无法解析的内容");
    error.status = 502;
    throw error;
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    const error = new Error("模型没有返回解析内容");
    error.status = 502;
    throw error;
  }
  return text;
}
