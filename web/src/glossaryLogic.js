export const DEFAULT_SETTINGS = {
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
  githubMirrorEnabled: true,
};

export function localDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function normalizeWord(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

export function wordKey(s) {
  return normalizeWord(s).toLowerCase();
}

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

export function upsertTermInList(terms, input) {
  const word = normalizeWord(input.word);
  if (!word) {
    const error = new Error("请填写术语");
    error.status = 400;
    throw error;
  }

  const now = new Date().toISOString();
  const key = wordKey(word);
  const existing = terms.find((t) => wordKey(t.word) === key);
  const source = cleanSource(input.source);
  const next = [...terms];

  if (existing) {
    const term = { ...existing };
    if (source && !hasSameSource(term.sources, source)) {
      term.sources = [...(term.sources || []), source];
    }
    if (input.context) term.context = String(input.context).trim();
    if (input.definition != null && String(input.definition).trim()) {
      term.definition = String(input.definition).trim();
      term.definitionSource = input.definitionSource || "manual";
    }
    term.updatedAt = now;
    const index = next.findIndex((t) => t.id === term.id);
    next[index] = term;
    return { terms: next, term, created: false };
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
  next.unshift(term);
  return { terms: next, term, created: true };
}

export function patchTermInList(terms, id, patch) {
  const index = terms.findIndex((t) => t.id === id);
  if (index < 0) {
    const error = new Error("找不到这个词条");
    error.status = 404;
    throw error;
  }
  const term = { ...terms[index] };
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
      patch.definitionSource || (term.definition ? "manual" : "empty");
  }
  if (patch.context != null) term.context = String(patch.context).trim();
  if (patch.noteDate && /^\d{4}-\d{2}-\d{2}$/.test(patch.noteDate)) {
    term.noteDate = patch.noteDate;
  }
  term.updatedAt = new Date().toISOString();
  const next = [...terms];
  next[index] = term;
  return { terms: next, term };
}

export function mergeSettings(current, patch) {
  const next = { ...current };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key)) {
      next[key] = patch[key];
    }
  }
  return next;
}
