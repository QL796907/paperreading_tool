import { nativeStore } from "./nativeStore.js";
import { explainTerm as runExplain } from "./nativeAi.js";
import { createTermWithAutoExplain } from "../../shared/createTermFlow.js";
import { writeAiDefinition } from "../../shared/writeAiDefinition.js";
import {
  getSyncStatus,
  queuePush,
  startNativeSyncLoop,
  syncNow,
  testConnection,
  withLock,
} from "./nativeSync.js";

let loopStarted = false;

function ensureLoop() {
  if (loopStarted) return;
  loopStarted = true;
  startNativeSyncLoop();
}

export const nativeApi = {
  async state() {
    ensureLoop();
    const [terms, settings] = await Promise.all([
      nativeStore.allTerms(),
      nativeStore.getSettings(),
    ]);
    return { terms, settings, sync: getSyncStatus(settings) };
  },

  async createTerm(body) {
    const result = await createTermWithAutoExplain({
      body,
      withLock,
      store: nativeStore,
      explainTerm: runExplain,
    });
    queuePush("local-change");
    return result;
  },

  async updateTerm(id, body) {
    const term = await withLock(() => nativeStore.updateTerm(id, body || {}));
    queuePush("local-change");
    return { term };
  },

  async deleteTerm(id) {
    await withLock(() => nativeStore.deleteTerm(id));
    queuePush("local-change");
    return { ok: true };
  },

  async explainTerm(id) {
    const term = await writeAiDefinition({
      id,
      withLock,
      store: nativeStore,
      explainTerm: runExplain,
    });
    queuePush("local-change");
    return { term };
  },

  async saveSettings(body) {
    const settings = await withLock(() => nativeStore.saveSettings(body || {}));
    if (settings.webdavEnabled) queuePush("local-change");
    return { settings, sync: getSyncStatus(settings) };
  },

  // 口令整理在 syncEngine.normalizeTestCredentials，和电脑 POST /api/sync/test 同一套。
  testSync: (body) => testConnection(body || {}),
  syncNow: () => syncNow("manual"),
};
