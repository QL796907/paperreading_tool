var PaperGlossary;

function log(msg) {
  Zotero.debug("PaperGlossary: " + msg);
}

function install() {}

async function startup({ id, version, rootURI }) {
  log("startup");
  Services.scriptloader.loadSubScript(rootURI + "glossary.js");
  PaperGlossary.init({ id, version, rootURI });
}

function onMainWindowLoad({ window }) {
  PaperGlossary.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  PaperGlossary.removeFromWindow(window);
}

function shutdown() {
  log("shutdown");
  if (PaperGlossary) {
    PaperGlossary.uninit();
    PaperGlossary = undefined;
  }
}

function uninstall() {}
