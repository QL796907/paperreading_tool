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

  onTextSelectionPopup: (event) => {
    const self = PaperGlossary;
    const { reader, doc, append } = event;
    const text = self.selectedText(event);
    if (!text) return;
    self.lastSelection = { text, reader };

    const wrap = doc.createElement("div");
    wrap.style.cssText =
      "display:flex;width:100%;margin-top:6px;padding-top:6px;border-top:1px solid rgba(31,26,20,0.18);";

    const btn = doc.createElement("button");
    btn.className = "toolbar-button wide-button";
    btn.textContent = "加入术语本";
    btn.title = "把选中的术语写入本地术语笔记本";
    btn.style.cssText =
      "background:transparent;box-shadow:none;font-weight:normal;color:#1F1A14;min-height:28px;";
    btn.addEventListener("click", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const idle = "加入术语本";
      btn.disabled = true;
      btn.style.opacity = "0.55";
      btn.style.color = "#6B5E4E";
      btn.textContent = "加入中…";
      try {
        await self.addTerm(text, reader);
        btn.style.opacity = "1";
        btn.style.color = "#2F4F3E";
        btn.textContent = "已加入";
        setTimeout(() => {
          btn.textContent = idle;
          btn.style.color = "#1F1A14";
          btn.disabled = false;
        }, 1200);
      } catch (err) {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.color = "#8B3A2F";
        btn.textContent = "加入失败";
        self.notify("未能加入术语本", err.message || String(err), true);
      }
    });

    wrap.appendChild(btn);
    append(wrap);
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
      context: word,
      source: this.paperMeta(reader),
    };
    let xhr;
    try {
      xhr = await Zotero.HTTP.request("POST", url, {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        timeout: 45000,
        successCodes: [200, 201],
      });
    } catch (err) {
      throw new Error("连不上本地服务，确认术语本已打开");
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
};
