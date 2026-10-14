import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  patchTermInList,
  upsertTermInList,
} from "../web/src/glossaryLogic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getDataDir() {
  return process.env.GLOSSARY_DATA_DIR || path.join(__dirname, "..", "data");
}

function termsPath() {
  return path.join(getDataDir(), "terms.json");
}

function settingsPath() {
  return path.join(getDataDir(), "settings.json");
}

async function ensureDir() {
  await fs.mkdir(getDataDir(), { recursive: true });
}

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file, value) {
  await ensureDir();
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export const store = {
  async readEnvelope() {
    const data = await readJson(termsPath(), { terms: [], updatedAt: null });
    return {
      terms: Array.isArray(data.terms) ? data.terms : [],
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    };
  },

  async writeEnvelope(envelope) {
    await writeJson(termsPath(), {
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
    const saved = await readJson(settingsPath(), {});
    return { ...DEFAULT_SETTINGS, ...saved };
  },

  async saveSettings(patch) {
    const next = mergeSettings(await this.getSettings(), patch);
    await writeJson(settingsPath(), next);
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
