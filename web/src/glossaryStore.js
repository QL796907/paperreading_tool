import {
  DEFAULT_SETTINGS,
  mergeSettings,
  patchTermInList,
  upsertTermInList,
} from "./glossaryLogic.js";

const TERMS_FILE = "terms.json";
const SETTINGS_FILE = "settings.json";

export function createGlossaryStore({ readJson, writeJson }) {
  return {
    async readEnvelope() {
      const data = await readJson(TERMS_FILE, { terms: [], updatedAt: null });
      return {
        terms: Array.isArray(data.terms) ? data.terms : [],
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
      };
    },

    async writeEnvelope(envelope) {
      await writeJson(TERMS_FILE, {
        terms: envelope.terms || [],
        updatedAt: envelope.updatedAt || new Date().toISOString(),
      });
    },

    async allTerms() {
      const { terms } = await this.readEnvelope();
      return terms;
    },

    async saveTerms(terms) {
      await this.writeEnvelope({
        terms,
        updatedAt: new Date().toISOString(),
      });
    },

    async getSettings() {
      // 只留 DEFAULT_SETTINGS 里的键，和 saveSettings 写回的形状一致。
      const saved = await readJson(SETTINGS_FILE, {});
      return mergeSettings(DEFAULT_SETTINGS, saved);
    },

    async saveSettings(patch) {
      const next = mergeSettings(await this.getSettings(), patch);
      await writeJson(SETTINGS_FILE, next);
      return next;
    },

    async upsertTerm(input) {
      const terms = await this.allTerms();
      const result = upsertTermInList(terms, input);
      await this.saveTerms(result.terms);
      return { term: result.term, created: result.created };
    },

    async updateTerm(id, patch) {
      const result = patchTermInList(await this.allTerms(), id, patch);
      await this.saveTerms(result.terms);
      return result.term;
    },

    async deleteTerm(id) {
      const terms = await this.allTerms();
      const next = terms.filter((t) => t.id !== id);
      if (next.length === terms.length) {
        const error = new Error("找不到这个词条");
        error.status = 404;
        throw error;
      }
      await this.saveTerms(next);
    },

    async getTerm(id) {
      const terms = await this.allTerms();
      return terms.find((t) => t.id === id) || null;
    },
  };
}
