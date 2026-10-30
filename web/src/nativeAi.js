import { httpRequest } from "./http.js";
import { explainTerm as explain } from "../../shared/explainTerm.js";
import { testAiConnection as testAi } from "../../shared/testAiConnection.js";

async function postChat({ url, headers, body, timeoutMs }) {
  const res = await httpRequest({
    method: "POST",
    url,
    headers,
    body,
    timeoutMs,
  });
  return { status: res.status, statusText: "", text: res.text };
}

export function explainTerm(term, settings) {
  return explain(term, settings, postChat);
}

export function testAiConnection(body, settings) {
  return testAi(body, settings, postChat);
}
