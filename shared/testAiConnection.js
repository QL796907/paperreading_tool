/**
 * 设置里的「测试连接」只探一次 OpenAI 兼容接口，不跑术语解析。
 * 请求里出现的字段（包括空字符串）以请求为准；没带的字段才用已保存设置。
 * 清空 API Key 再点测试，不会拿旧密钥去连。
 * post({ url, headers, body, timeoutMs }) 与 explainTerm 相同，超时抛 AbortError。
 */

export const aiTestTimeoutMs = 20 * 1000;

export function normalizeAiTestCredentials(body, settings) {
  const input = body && typeof body === "object" ? body : {};
  const saved = settings && typeof settings === "object" ? settings : {};
  return {
    apiBaseUrl: input.apiBaseUrl ?? saved.apiBaseUrl ?? "",
    apiKey: input.apiKey ?? saved.apiKey ?? "",
    model: input.model ?? saved.model ?? "",
  };
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function clipBody(raw, statusText, key) {
  let text = String(raw || "").slice(0, 280) || statusText || "";
  const secret = String(key || "");
  if (secret.length >= 8 && text.includes(secret)) {
    text = text.split(secret).join("***");
  }
  return text;
}

export async function testAiConnection(body, savedSettings, post) {
  const creds = normalizeAiTestCredentials(body, savedSettings);
  const base = String(creds.apiBaseUrl || "").trim().replace(/\/$/, "");
  const key = String(creds.apiKey || "").trim();
  const model = String(creds.model || "").trim();

  if (!base) throw fail("请先填写 API 地址", 400);
  if (!isHttpUrl(base)) throw fail("API 地址需要以 http:// 或 https:// 开头", 400);
  if (!key) throw fail("请先填写 API Key", 400);
  if (!model) throw fail("请先填写模型名", 400);

  let res;
  try {
    res = await post({
      url: `${base}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      timeoutMs: aiTestTimeoutMs,
    });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw fail("模型请求超时，请稍后重试", 504);
    }
    throw err;
  }

  const raw = typeof res?.text === "string" ? res.text : "";
  if (res?.status === 401 || res?.status === 403) {
    throw fail("密钥不对，或这个地址不接受这把密钥", 502);
  }
  if (res?.status < 200 || res?.status >= 300) {
    throw fail(
      `模型接口返回 ${res?.status}：${clipBody(raw, res?.statusText, key)}`,
      502,
    );
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw fail("模型接口返回了无法解析的内容", 502);
  }
  if (!Array.isArray(data?.choices) || data.choices.length === 0) {
    throw fail("模型接口没有返回可用的回复", 502);
  }
  return { ok: true, message: `接口能连上，模型 ${model} 有回应。` };
}
