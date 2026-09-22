import { httpRequest } from "./http.js";

export async function explainTerm(term, settings) {
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

  const res = await httpRequest({
    method: "POST",
    url: `${base}/chat/completions`,
    timeoutMs: 60000,
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: settings.model || "deepseek-chat",
      temperature: 0.3,
      messages: [
        { role: "system", content: settings.systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`模型接口返回 ${res.status}：${res.text.slice(0, 280)}`);
  }

  let data;
  try {
    data = JSON.parse(res.text);
  } catch {
    throw new Error("模型接口返回了无法解析的内容");
  }
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("模型没有返回解析内容");
  return text;
}
