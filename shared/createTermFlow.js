import { writeAiDefinition } from "./writeAiDefinition.js";

/**
 * 新建或合并词条之后，按本次请求和设置决定要不要自动生成释义。
 * 释义失败仍返回已经保存的词条，并带上 explainError。
 * 写回走 writeAiDefinition。桌面的 SSE 广播和 HTTP 状态码留在 POST /api/terms。
 */
export async function createTermWithAutoExplain({
  body,
  withLock,
  store,
  explainTerm,
}) {
  const { term, created } = await withLock(() => store.upsertTerm(body || {}));
  const settings = await store.getSettings();
  const shouldExplain =
    (body?.autoExplain === true ||
      (body?.autoExplain !== false && settings.autoExplain)) &&
    !term.definition;

  if (!shouldExplain) return { term, created };

  try {
    const updated = await writeAiDefinition({
      id: term.id,
      withLock,
      store,
      explainTerm,
    });
    return { term: updated, created };
  } catch (err) {
    return { term, created, explainError: err.message };
  }
}
