import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  patchTermInList,
  upsertTermInList,
} from "./glossaryLogic.js";

const TERMS = "terms.json";
const SETTINGS = "settings.json";

async function readFile(name, fallback) {
  try {
    const res = await Filesystem.readFile({
      path: name,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return JSON.parse(res.data);
  } catch {
    return fallback;
  }
}

async function writeFile(name, value) {
  await Filesystem.writeFile({
    path: name,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify(value, null, 2),
  });
}

export const nativeStore = {
  async readEnvelope() {
    const data = await readFile(TERMS, { terms: [], updatedAt: null });
    return {
      terms: Array.isArray(data.terms) ? data.terms : [],
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    };
  },

  async writeEnvelope(envelope) {
    await writeFile(TERMS, {
      terms: envelope.terms || [],
      updatedAt: envelope.updatedAt || new Date().toISOString(),
    });
  },

  async allTerms() {
    return (await this.readEnvelope()).terms;
  },

  async saveTerms(terms) {
    await this.writeEnvelope({ terms, updatedAt: new Date().toISOString() });
  },

  async getSettings() {
    const saved = await readFile(SETTINGS, {});
    return { ...DEFAULT_SETTINGS, ...saved };
  },

  async saveSettings(patch) {
    const next = mergeSettings(await this.getSettings(), patch);
    await writeFile(SETTINGS, next);
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
    return (await this.allTerms()).find((t) => t.id === id) || null;
  },
};
