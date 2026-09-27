import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  dialog,
  Notification,
  shell,
} from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import updater from "electron-updater";
import { GITHUB_MIRROR_PREFIX } from "../web/src/githubMirror.js";

const autoUpdater = updater.autoUpdater ?? updater;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3780;
const UPDATE_OWNER = "QL796907";
const UPDATE_REPO = "paperreading_tool";

let mainWindow = null;
let tray = null;
let httpServer = null;
let quitting = false;
let trayHintShown = false;
let manualUpdateCheck = false;
let updateReady = false;

app.setName("术语本");
app.setAppUserModelId("com.ql796907.paper-glossary");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });
}

function isDevUi() {
  return Boolean(process.env.ELECTRON_DEV) && !app.isPackaged;
}

function iconPath(file) {
  const packaged = path.join(process.resourcesPath, file);
  const local = path.join(__dirname, file);
  if (app.isPackaged && fs.existsSync(packaged)) return packaged;
  if (fs.existsSync(local)) return local;
  return path.join(projectRoot, "build", file);
}

function loadNativeIcon(file) {
  const full = iconPath(file);
  if (!fs.existsSync(full)) return nativeImage.createEmpty();
  return nativeImage.createFromPath(full);
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showWindow();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 840,
    minHeight: 560,
    show: false,
    backgroundColor: "#2c241c",
    autoHideMenuBar: true,
    icon: iconPath("icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  Menu.setApplicationMenu(null);

  const url = isDevUi()
    ? "http://127.0.0.1:5173/"
    : `http://127.0.0.1:${PORT}/`;
  mainWindow.loadURL(url);

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!trayHintShown && tray) {
      trayHintShown = true;
      tray.displayBalloon?.({
        iconType: "info",
        title: "术语本还在运行",
        content: "已收到托盘里。Zotero 划词仍可用。右键托盘图标可以退出。",
      });
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray() {
  const image = loadNativeIcon("tray.png");
  tray = new Tray(image.isEmpty() ? loadNativeIcon("icon.ico") : image);
  tray.setToolTip("术语本");
  tray.on("click", () => showWindow());
  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  if (!tray) return;
  const login = app.getLoginItemSettings();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "打开术语本", click: () => showWindow() },
      { type: "separator" },
      {
        label: "检查更新",
        click: () => checkForUpdates(true),
      },
      {
        label: "开机启动",
        type: "checkbox",
        checked: Boolean(login.openAtLogin),
        click: (item) => {
          app.setLoginItemSettings({ openAtLogin: item.checked });
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          quitting = true;
          if (updateReady && app.isPackaged) {
            installDownloadedUpdate();
            return;
          }
          app.quit();
        },
      },
    ]),
  );
}

function githubMirrorEnabled() {
  try {
    const dir = process.env.GLOSSARY_DATA_DIR;
    if (!dir) return true;
    const saved = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
    if (Object.prototype.hasOwnProperty.call(saved, "githubMirrorEnabled")) {
      return saved.githubMirrorEnabled !== false;
    }
  } catch {
    /* 还没写出设置文件时默认开镜像 */
  }
  return true;
}

function applyUpdateFeed() {
  if (githubMirrorEnabled()) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: `${GITHUB_MIRROR_PREFIX}https://github.com/${UPDATE_OWNER}/${UPDATE_REPO}/releases/latest/download`,
    });
    return;
  }
  autoUpdater.setFeedURL({
    provider: "github",
    owner: UPDATE_OWNER,
    repo: UPDATE_REPO,
  });
}

function prepareQuitForUpdate() {
  quitting = true;
  try {
    httpServer?.close();
  } catch {
    /* ignore */
  }
  try {
    tray?.destroy();
  } catch {
    /* ignore */
  }
  tray = null;
}

function installDownloadedUpdate() {
  prepareQuitForUpdate();
  autoUpdater.quitAndInstall(false, true);
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
    return;
  }
  tray?.displayBalloon?.({ title, content: body });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.disableDifferentialDownload = true;
  applyUpdateFeed();

  autoUpdater.on("update-available", (info) => {
    if (manualUpdateCheck) {
      notify("术语本", `发现新版本 ${info.version}，正在后台下载。`);
    }
  });

  autoUpdater.on("update-not-available", () => {
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showMessageBox({
        type: "info",
        title: "术语本",
        message: "已经是最新版本。",
      });
    }
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateReady = true;
    rebuildTrayMenu();
    notify("术语本已准备好更新", `新版本 ${info.version} 已下载，需要退出后才会安装。`);
    dialog
      .showMessageBox({
        type: "info",
        title: "术语本",
        message: `新版本 ${info.version} 已下载完成。`,
        detail: "关掉窗口不会安装。请选现在退出并安装，或以后在托盘里点「退出」。",
        buttons: ["现在退出并安装", "以后再说"],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        manualUpdateCheck = false;
        if (result.response === 0) installDownloadedUpdate();
      });
  });

  autoUpdater.on("error", (err) => {
    if (manualUpdateCheck) {
      manualUpdateCheck = false;
      dialog.showErrorBox("检查更新失败", err?.message || String(err));
    }
  });

  if (!app.isPackaged) return;
  checkForUpdates(false);
  setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000);
}

async function checkForUpdates(manual) {
  if (!app.isPackaged) {
    if (manual) {
      await dialog.showMessageBox({
        type: "info",
        title: "术语本",
        message: "开发模式不检查更新。",
        detail: "安装包会从 GitHub Releases 下载新版本，后台装好，退出后生效。",
      });
    }
    return;
  }
  manualUpdateCheck = manual;
  try {
    applyUpdateFeed();
    await autoUpdater.checkForUpdates();
  } catch (err) {
    if (manual) {
      manualUpdateCheck = false;
      dialog.showErrorBox("检查更新失败", err?.message || String(err));
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return;
    } catch {
      /* 服务还在起来 */
    }
    await sleep(150);
  }
  throw new Error("本地服务没有启动起来");
}

async function startLocalServer() {
  const { startServer } = await import("../server/index.js");
  let lastErr = null;
  for (let i = 0; i < 8; i += 1) {
    try {
      const started = await startServer();
      await waitForHealth(4000);
      return started;
    } catch (err) {
      lastErr = err;
      if (err?.code !== "EADDRINUSE") throw err;
      await sleep(400);
    }
  }
  throw lastErr;
}

app.whenReady().then(async () => {
  if (!gotLock) return;

  process.env.GLOSSARY_DATA_DIR = app.isPackaged
    ? app.getPath("userData")
    : path.join(projectRoot, "data");
  process.env.GLOSSARY_DIST_DIR = path.join(projectRoot, "web", "dist");

  try {
    const started = await startLocalServer();
    httpServer = started.server;
  } catch (err) {
    const busy = err && err.code === "EADDRINUSE";
    await dialog.showMessageBox({
      type: "error",
      title: "术语本无法启动",
      message: busy ? `端口 ${PORT} 已被占用。` : err?.message || "启动失败",
      detail: busy
        ? "右下角托盘里可能还有一份术语本。请右键它点「退出」，再打开。"
        : String(err),
    });
    quitting = true;
    app.quit();
    return;
  }

  createTray();
  createWindow();
  setupAutoUpdater();
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("window-all-closed", () => {
  // 关掉窗口仍留在托盘，Zotero 才能继续连本地接口。
});

app.on("will-quit", () => {
  try {
    httpServer?.close();
  } catch {
    /* ignore */
  }
});
