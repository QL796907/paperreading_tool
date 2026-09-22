import { nativeStore } from "./nativeStore.js";
import { explainTerm as runExplain } from "./nativeAi.js";
import {
  getSyncStatus,
  queuePush,
  startNativeSyncLoop,
  syncNow,
  testConnection,
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
    const { term, created } = await nativeStore.upsertTerm(body || {});
    const settings = await nativeStore.getSettings();
    const shouldExplain =
      (body?.autoExplain === true ||
        (body?.autoExplain !== false && settings.autoExplain)) &&
      !term.definition;
    if (shouldExplain) {
      try {
        const definition = await runExplain(term, settings);
        const updated = await nativeStore.updateTerm(term.id, {
          definition,
          definitionSource: "ai",
        });
        queuePush("local-change");
        return { term: updated, created };
      } catch (err) {
        queuePush("local-change");
        return { term, created, explainError: err.message };
      }
    }
    queuePush("local-change");
    return { term, created };
  },

  async updateTerm(id, body) {
    const term = await nativeStore.updateTerm(id, body || {});
    queuePush("local-change");
    return { term };
  },

  async deleteTerm(id) {
    await nativeStore.deleteTerm(id);
    queuePush("local-change");
    return { ok: true };
  },

  async explainTerm(id) {
    const term = await nativeStore.getTerm(id);
    if (!term) throw new Error("找不到这个词条");
    const settings = await nativeStore.getSettings();
    const definition = await runExplain(term, settings);
    const updated = await nativeStore.updateTerm(id, {
      definition,
      definitionSource: "ai",
    });
    queuePush("local-change");
    return { term: updated };
  },

  async saveSettings(body) {
    const settings = await nativeStore.saveSettings(body || {});
    if (settings.webdavEnabled) queuePush("local-change");
    return { settings, sync: getSyncStatus(settings) };
  },

  testSync: (body) => testConnection(body || {}),
  syncNow: () => syncNow("manual"),
};
