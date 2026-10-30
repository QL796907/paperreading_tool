import { explainTerm as explain } from "../shared/explainTerm.js";
import { testAiConnection as testAi } from "../shared/testAiConnection.js";

async function postChat({ url, headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    return { status: response.status, statusText: response.statusText, text };
  } finally {
    clearTimeout(timer);
  }
}

export function explainTerm(term, settings) {
  return explain(term, settings, postChat);
}

export function testAiConnection(body, settings) {
  return testAi(body, settings, postChat);
}
