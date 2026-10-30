// 术语本进程没在听 3780 时，划词直接改安装包那份词条文件。
// 不启动程序。规则和 shared/glossaryLogic.js 的 upsertTermInList 对齐，
// clock 只给测试固定 id 和时间。
var PaperGlossaryOffline = {
  appDirName: "术语本",
  fileName: "terms.json",

  joinWin(...parts) {
    return parts
      .map((part, index) => {
        const text = String(part || "");
        if (index === 0) return text.replace(/[\\/]+$/g, "");
        return text.replace(/^[\\/]+|[\\/]+$/g, "");
      })
      .filter(Boolean)
      .join("\\");
  },

  termsPath(roaming) {
    return this.joinWin(roaming, this.appDirName, this.fileName);
  },

  // 没有 HTTP 正文才是术语本没开。超时和 4xx/5xx 不能当成没开。
  isUnreachable(err) {
    const xhr = err && err.xmlhttp;
    if (xhr && xhr.status) return false;
    const message = String((err && err.message) || err || "");
    if (/timeout|timed out|超时/i.test(message)) return false;
    const raw =
      xhr && typeof xhr.responseText === "string" ? xhr.responseText.trim() : "";
    return !raw;
  },

  apply(rawText, input, clock) {
    const envelope = this.readEnvelope(rawText);
    const timed = clock || this.clock();
    const result = this.upsert(envelope.terms, input || {}, timed);
    return {
      text: JSON.stringify({ terms: result.terms, updatedAt: timed.now }, null, 2),
      term: result.term,
      created: result.created,
    };
  },

  readEnvelope(rawText) {
    const raw = String(rawText || "").trim();
    if (!raw) return { terms: [] };
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      throw new Error("术语本的词条文件已损坏，没有写入，以免盖掉原来的内容");
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.terms)) {
      throw new Error("术语本的词条文件已损坏，没有写入，以免盖掉原来的内容");
    }
    return { terms: data.terms };
  },

  clock() {
    const now = new Date();
    return {
      id: this.newId(),
      now: now.toISOString(),
      noteDate: this.localDate(now),
    };
  },

  newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      const v = ch === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  localDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  normalizeWord(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  },

  wordKey(s) {
    return this.normalizeWord(s).toLowerCase();
  },

  cleanSource(source, now) {
    if (!source || typeof source !== "object") return null;
    const title = this.normalizeWord(source.title);
    if (!title && !source.itemKey && !source.itemId) return null;
    return {
      title: title || "未命名文献",
      itemKey: source.itemKey ? String(source.itemKey) : "",
      itemId: source.itemId ?? null,
      year: source.year ? String(source.year) : "",
      creators: source.creators ? String(source.creators) : "",
      addedAt: now,
    };
  },

  hasSameSource(sources, source) {
    return (sources || []).some((s) => {
      if (source.itemKey && s.itemKey) return s.itemKey === source.itemKey;
      return s.title === source.title;
    });
  },

  upsert(terms, input, clock) {
    const word = this.normalizeWord(input.word);
    if (!word) throw new Error("请填写术语");
    const now = clock.now;
    const key = this.wordKey(word);
    const existing = terms.find((t) => this.wordKey(t.word) === key);
    const source = this.cleanSource(input.source, now);
    const next = [...terms];

    if (existing) {
      const term = { ...existing };
      if (source && !this.hasSameSource(term.sources, source)) {
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
      id: clock.id,
      word,
      definition: this.normalizeWord(input.definition),
      definitionSource: input.definition ? input.definitionSource || "manual" : "empty",
      context: input.context ? String(input.context).trim() : "",
      sources: source ? [source] : [],
      noteDate: clock.noteDate,
      createdAt: now,
      updatedAt: now,
    };
    next.unshift(term);
    return { terms: next, term, created: true };
  },
};
