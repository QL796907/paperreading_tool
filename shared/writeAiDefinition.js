/**
 * 读出词条、请求释义，再在调用方已有的 withLock 里写回
 * definition 和 definitionSource:"ai"。
 * 找不到词条时抛普通 Error，不带 HTTP status。
 * 桌面的 404 和 SSE 留在 POST /api/terms/:id/explain。
 */
export const MISSING_TERM_MESSAGE = "找不到这个词条";

export async function writeAiDefinition({ id, withLock, store, explainTerm }) {
  const term = await store.getTerm(id);
  if (!term) throw new Error(MISSING_TERM_MESSAGE);
  const settings = await store.getSettings();
  const definition = await explainTerm(term, settings);
  return withLock(() =>
    store.updateTerm(term.id, {
      definition,
      definitionSource: "ai",
    }),
  );
}
