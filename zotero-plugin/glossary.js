PaperGlossary = {
  PLUGIN_ID: "paper-glossary@local",
  PREF_URL: "extensions.paper-glossary.apiUrl",
  id: null,
  version: null,
  rootURI: null,
  addedElementIDs: [],
  lastSelection: { text: "", reader: null },

  init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    if (!Zotero.Prefs.get(this.PREF_URL, true)) {
      Zotero.Prefs.set(this.PREF_URL, "http://127.0.0.1:3780", true);
    }

    Zotero.PreferencePanes.register({
      pluginID: this.PLUGIN_ID,
      src: rootURI + "preferences.html",
      label: "术语本",
    });

    Zotero.Reader.registerEventListener(
      "renderTextSelectionPopup",
      this.onTextSelectionPopup,
      this.PLUGIN_ID,
    );
    Zotero.Reader.registerEventListener(
      "createViewContextMenu",
      this.onViewContextMenu,
      this.PLUGIN_ID,
    );
    Zotero.Reader.registerEventListener(
      "renderToolbar",
      this.onRenderToolbar,
      this.PLUGIN_ID,
    );

    this.addToAllWindows();
  },

  uninit() {
    this.removeFromAllWindows();
    try {
      Zotero.Reader.unregisterEventListener(
        "renderTextSelectionPopup",
        this.onTextSelectionPopup,
      );
      Zotero.Reader.unregisterEventListener(
        "createViewContextMenu",
        this.onViewContextMenu,
      );
      Zotero.Reader.unregisterEventListener("renderToolbar", this.onRenderToolbar);
    } catch (err) {
      Zotero.debug("PaperGlossary uninit: " + err);
    }
  },

  apiUrl() {
    return (
      Zotero.Prefs.get(this.PREF_URL, true) || "http://127.0.0.1:3780"
    ).replace(/\/$/, "");
  },

  addToAllWindows() {
    for (const win of Zotero.getMainWindows()) this.addToWindow(win);
  },

  removeFromAllWindows() {
    for (const win of Zotero.getMainWindows()) this.removeFromWindow(win);
  },

  addToWindow(window) {
    const doc = window.document;
    if (doc.getElementById("paper-glossary-open")) return;
    const menuitem = doc.createXULElement("menuitem");
    menuitem.id = "paper-glossary-open";
    menuitem.setAttribute("label", "打开术语本");
    menuitem.addEventListener("command", () => {
      Zotero.launchURL(this.apiUrl() + "/");
    });
    const tools = doc.getElementById("menu_ToolsPopup");
    if (tools) {
      tools.appendChild(menuitem);
      this.addedElementIDs.push(menuitem.id);
    }
  },

  removeFromWindow(window) {
    const doc = window.document;
    for (const id of this.addedElementIDs) {
      doc.getElementById(id)?.remove();
    }
  },

  selectedText(event) {
    const params = event.params || {};
    return String(params.annotation?.text || params.text || "")
      .replace(/\s+/g, " ")
      .trim();
  },

  ensurePopupStyle(doc) {
    if (doc.getElementById("paper-glossary-popup-style")) return;
    const style = doc.createElement("style");
    style.id = "paper-glossary-popup-style";
    style.textContent = `
      .selection-popup button.paper-glossary-add {
        appearance: none;
        -moz-appearance: none;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        width: 100%;
        height: auto;
        min-height: 30px;
        margin: 0;
        padding: 6px 10px;
        border: 1px solid #243f32;
        border-radius: 6px;
        background: #2f4f3e;
        color: #f4ecd8;
        font: 600 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
        cursor: pointer;
        user-select: none;
        box-shadow: 0 1px 2px rgba(31, 26, 20, 0.22);
      }
      .selection-popup button.paper-glossary-add:hover:not(:disabled) {
        background: #3a6350;
        border-color: #243f32;
      }
      .selection-popup button.paper-glossary-add:active:not(:disabled) {
        background: #243f32;
      }
      .selection-popup button.paper-glossary-add:focus-visible {
        outline: 2px solid #2f4f3e;
        outline-offset: 2px;
      }
      .selection-popup button.paper-glossary-add:disabled {
        cursor: default;
      }
      .selection-popup button.paper-glossary-add.is-busy {
        opacity: 0.72;
      }
      .selection-popup button.paper-glossary-add.is-done {
        background: #e4ede7;
        border-color: #2f4f3e;
        color: #2f4f3e;
        box-shadow: none;
        opacity: 1;
      }
      .selection-popup button.paper-glossary-add.is-error {
        background: #8b3a2f;
        border-color: #6e2e26;
        color: #f4ecd8;
        opacity: 1;
      }
    `;
    (doc.head || doc.documentElement).appendChild(style);
  },

  setPopupButtonState(btn, state) {
    btn.classList.remove("is-busy", "is-done", "is-error");
    if (state) btn.classList.add(state);
  },

  onTextSelectionPopup: (event) => {
    const self = PaperGlossary;
    const { reader, doc, append } = event;
    const text = self.selectedText(event);
    if (!text) return;
    self.lastSelection = { text, reader };
    self.ensurePopupStyle(doc);

    const btn = doc.createElement("button");
    btn.type = "button";
    btn.className = "paper-glossary-add";
    btn.textContent = "加入术语本";
    btn.title = "把选中的术语写入本地术语笔记本";
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const idle = "加入术语本";
      btn.disabled = true;
      self.setPopupButtonState(btn, "is-busy");
      btn.textContent = "加入中…";
      try {
        await self.addTerm(text, reader);
        self.setPopupButtonState(btn, "is-done");
        btn.textContent = "已加入";
        setTimeout(() => {
          btn.textContent = idle;
          self.setPopupButtonState(btn, "");
          btn.disabled = false;
        }, 1200);
      } catch (err) {
        btn.disabled = false;
        self.setPopupButtonState(btn, "is-error");
        btn.textContent = "加入失败";
        self.notify("未能加入术语本", err.message || String(err), true);
      }
    });

    append(btn);
  },

  onViewContextMenu: (event) => {
    const self = PaperGlossary;
    const text = self.lastSelection.text;
    if (!text) return;
    event.append({
      label: `加入术语本：「${text.length > 24 ? text.slice(0, 24) + "…" : text}」`,
      onCommand: () => {
        self.addTerm(text, self.lastSelection.reader).catch((err) => {
          self.notify("未能加入术语本", err.message || String(err), true);
        });
      },
    });
  },

  onRenderToolbar: (event) => {
    const self = PaperGlossary;
    const { doc, append } = event;
    const btn = doc.createElement("button");
    btn.className = "toolbar-button";
    btn.textContent = "术语本";
    btn.title = "打开本地术语笔记本";
    btn.addEventListener("click", () => {
      Zotero.launchURL(self.apiUrl() + "/");
    });
    append(btn);
  },

  paperMeta(reader) {
    if (!reader?.itemID) return null;
    const item = Zotero.Items.get(reader.itemID);
    if (!item) return null;
    const parent = item.parentItem || item;
    const date = parent.getField("date") || parent.getField("year") || "";
    const year = String(date).match(/\d{4}/)?.[0] || "";
    const creators = parent
      .getCreators()
      .map((c) => c.lastName)
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");
    return {
      title: parent.getDisplayTitle(),
      itemKey: parent.key,
      itemId: parent.id,
      year,
      creators,
    };
  },

  notify(title, body, isError) {
    try {
      const pw = new Zotero.ProgressWindow({ closeOnClick: true });
      pw.changeHeadline(title);
      pw.addDescription(body);
      pw.show();
      pw.startCloseTimer(isError ? 5000 : 2500);
    } catch (err) {
      Zotero.debug("PaperGlossary notify: " + err);
    }
  },

  async addTerm(text, reader) {
    const word = String(text || "").replace(/\s+/g, " ").trim();
    if (!word) throw new Error("没有选中文字");
    const url = this.apiUrl() + "/api/terms";
    const body = {
      word,
      source: this.paperMeta(reader),
    };
    // The selection is the headword. Do not store it again as context
    // until a surrounding sentence exists.
    // One POST. explainClientWaitMs is the model timeout plus the tail
    // the server needs to answer after that timeout. Do not send it again.
    const budget =
      typeof PaperGlossaryBudget === "undefined" ? null : PaperGlossaryBudget;
    const timeout = budget && budget.explainClientWaitMs;
    if (!Number.isFinite(timeout)) {
      throw new Error("术语本插件缺少解析超时预算");
    }
    let xhr;
    try {
      xhr = await this.postTerm(url, body, timeout);
    } catch (err) {
      // successCodes also rejects 4xx/5xx, which still carry {error}.
      // No response body means nothing is listening on this same URL.
      if (
        typeof PaperGlossaryOffline === "undefined" ||
        !PaperGlossaryOffline.isUnreachable(err)
      ) {
        throw new Error(this.apiErrorMessage(err));
      }
      const saved = await this.writeTermsFile(body);
      this.notify(
        saved.created ? "已写入术语本" : "术语本里已有此词，已补上来源",
        `${saved.term.word || word}。下次打开术语本就能看到，自动解析也要等那时再做。`,
      );
      return { term: saved.term, created: saved.created, offline: true };
    }
    const data = JSON.parse(xhr.responseText || "{}");
    if (data.error) throw new Error(data.error);
    const term = data.term || {};
    this.notify(
      data.created ? "已写入术语本" : "术语本已有此词，已补上来源",
      term.word || word,
    );
    return data;
  },

  postTerm(url, body, timeout) {
    return Zotero.HTTP.request("POST", url, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      timeout,
      successCodes: [200, 201],
    });
  },

  writeTermsFile(body) {
    const run = this._offlineWrite || Promise.resolve();
    const next = run.then(
      () => this.writeTermsFileNow(body),
      () => this.writeTermsFileNow(body),
    );
    this._offlineWrite = next;
    return next;
  },

  async writeTermsFileNow(body) {
    const roaming = this.windowsRoamingDir();
    if (!roaming || typeof PaperGlossaryOffline === "undefined" || typeof IOUtils === "undefined") {
      throw new Error("连不上本地服务，确认术语本已打开");
    }
    const file = PaperGlossaryOffline.termsPath(roaming);
    const dir = file.slice(0, file.lastIndexOf("\\"));
    await IOUtils.makeDirectory(dir, { ignoreExisting: true });
    let raw = "";
    try {
      raw = await IOUtils.readUTF8(file);
    } catch (err) {
      if (!this.isMissingFile(err)) {
        throw new Error("读不到术语本的词条文件，没有写入：" + (err.message || err));
      }
    }
    const saved = PaperGlossaryOffline.apply(raw, body);
    try {
      await IOUtils.writeUTF8(file, saved.text, { tmpPath: `${file}.tmp` });
    } catch (err) {
      throw new Error("词条没能写入术语本：" + (err.message || err));
    }
    return saved;
  },

  windowsRoamingDir() {
    try {
      if (typeof Services === "undefined" || !Services.dirsvc || !Services.appinfo) return "";
      if (Services.appinfo.OS !== "WINNT") return "";
      return Services.dirsvc.get("AppData", Ci.nsIFile).path;
    } catch (err) {
      return "";
    }
  },

  isMissingFile(err) {
    const name = err && err.name;
    if (name === "NotFoundError") return true;
    return /NS_ERROR_FILE_NOT_FOUND|NotFoundError|does not exist/i.test(
      String((err && err.message) || err || ""),
    );
  },

  apiErrorMessage(err) {
    const raw =
      err && err.xmlhttp && typeof err.xmlhttp.responseText === "string"
        ? err.xmlhttp.responseText.trim()
        : "";
    if (!raw) return "连不上本地服务，确认术语本已打开";
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (parseErr) {
      data = null;
    }
    if (data && data.error != null && String(data.error).trim()) {
      return String(data.error).trim();
    }
    return raw;
  },
};
