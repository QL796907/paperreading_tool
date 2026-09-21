import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
const termsFile = path.join(dataDir, "terms.json");
const settingsFile = path.join(dataDir, "settings.json");

const DEFAULT_SETTINGS = {
  apiBaseUrl: "https://api.deepseek.com/v1",
  apiKey: "",
  model: "deepseek-chat",
  autoExplain: false,
  systemPrompt:
    "你是学术论文阅读助手。请用简洁、准确的中文解释用户给出的专业术语。\n要求：\n1. 先给一句话定义；\n2. 若提供了论文标题或原文上下文，结合该语境说明它在文中可能指什么；\n3. 必要时用一两句点出易混淆概念；\n4. 不要编造参考文献或具体数字；\n5. 全文控制在 180 字以内，不要用 Markdown 标题。",
  webdavEnabled: false,
  webdavUrl: "https://dav.jianguoyun.com/dav/",
  webdavUser: "",
  webdavPassword: "",
  webdavPath: "paper-glossary/terms.json",
};

function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeWord(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function wordKey(s) {
  return normalizeWord(s).toLowerCase();
}

async function ensureDir() {
  await fs.mkdir(dataDir, { recursive: true });
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
    const data = await readJson(termsFile, { terms: [], updatedAt: null });
    return {
      terms: Array.isArray(data.terms) ? data.terms : [],
      updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
    };
  },

  async writeEnvelope(envelope) {
    await writeJson(termsFile, {
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
    const saved = await readJson(settingsFile, {});
    return { ...DEFAULT_SETTINGS, ...saved };
  },

  async saveSettings(patch) {
    const current = await this.getSettings();
    const next = { ...current };
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (patch && Object.prototype.hasOwnProperty.call(patch, key)) {
        next[key] = patch[key];
      }
    }
    await writeJson(settingsFile, next);
    return next;
  },

  async upsertTerm(input) {
    const word = normalizeWord(input.word);
    if (!word) {
      const error = new Error("请填写术语");
      error.status = 400;
      throw error;
    }

    const terms = await this.allTerms();
    const now = new Date().toISOString();
    const key = wordKey(word);
    const existing = terms.find((t) => wordKey(t.word) === key);
    const source = cleanSource(input.source);

    if (existing) {
      if (source && !hasSameSource(existing.sources, source)) {
        existing.sources = [...(existing.sources || []), source];
      }
      if (input.context) existing.context = String(input.context).trim();
      if (input.definition != null && String(input.definition).trim()) {
        existing.definition = String(input.definition).trim();
        existing.definitionSource = input.definitionSource || "manual";
      }
      existing.updatedAt = now;
      await this.saveTerms(terms);
      return { term: existing, created: false };
    }

    const term = {
      id: crypto.randomUUID(),
      word,
      definition: normalizeWord(input.definition),
      definitionSource: input.definition
        ? input.definitionSource || "manual"
        : "empty",
      context: input.context ? String(input.context).trim() : "",
      sources: source ? [source] : [],
      noteDate: localDate(),
      createdAt: now,
      updatedAt: now,
    };
    terms.unshift(term);
    await this.saveTerms(terms);
    return { term, created: true };
  },

  async updateTerm(id, patch) {
    const terms = await this.allTerms();
    const term = terms.find((t) => t.id === id);
    if (!term) {
      const error = new Error("找不到这个词条");
      error.status = 404;
      throw error;
    }
    if (patch.word != null) {
      const word = normalizeWord(patch.word);
      if (!word) {
        const error = new Error("术语不能为空");
        error.status = 400;
        throw error;
      }
      term.word = word;
    }
    if (patch.definition != null) {
      term.definition = String(patch.definition).trim();
      term.definitionSource =
        patch.definitionSource ||
        (term.definition ? "manual" : "empty");
    }
    if (patch.context != null) term.context = String(patch.context).trim();
    if (patch.noteDate && /^\d{4}-\d{2}-\d{2}$/.test(patch.noteDate)) {
      term.noteDate = patch.noteDate;
    }
    term.updatedAt = new Date().toISOString();
    await this.saveTerms(terms);
    return term;
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

function cleanSource(source) {
  if (!source || typeof source !== "object") return null;
  const title = normalizeWord(source.title);
  if (!title && !source.itemKey && !source.itemId) return null;
  return {
    title: title || "未命名文献",
    itemKey: source.itemKey ? String(source.itemKey) : "",
    itemId: source.itemId ?? null,
    year: source.year ? String(source.year) : "",
    creators: source.creators ? String(source.creators) : "",
    addedAt: new Date().toISOString(),
  };
}

function hasSameSource(sources, source) {
  return (sources || []).some((s) => {
    if (source.itemKey && s.itemKey) return s.itemKey === source.itemKey;
    return s.title === source.title;
  });
}
