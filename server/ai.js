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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
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
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      const error = new Error(
        `模型接口返回 ${response.status}：${raw.slice(0, 280) || response.statusText}`,
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
  } catch (err) {
    if (err.name === "AbortError") {
      const error = new Error("模型请求超时，请稍后重试");
      error.status = 504;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
