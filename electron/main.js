import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  dialog,
  Notification,
  shell,
  session,
  ipcMain,
} from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import updater from "electron-updater";
import {
  GITHUB_FILE_HOST_SUFFIXES,
  GITHUB_MIRROR_PREFIX,
  githubMirrorOn,
  withGithubMirror,
} from "./githubMirror.js";

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
let pendingUpdateVersion = null;

app.setName("术语本");
app.setAppUserModelId("com.ql796907.paper-glossary");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });
  // quit() 取消不了已注册的 whenReady，没拿到锁的进程仍会去听 3780 并弹出 EADDRINUSE。
  app.whenReady().then(startPrimaryInstance);
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
  publishPendingUpdate();
}

function bindDesktopWindowControls() {
  const win = () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null);
  ipcMain.on("desktop-window:minimize", () => win()?.minimize());
  ipcMain.on("desktop-window:toggle-maximize", () => {
    const current = win();
    if (!current) return;
    if (current.isMaximized()) current.unmaximize();
    else current.maximize();
  });
  ipcMain.on("desktop-window:close", () => win()?.close());
  ipcMain.handle("desktop-window:is-maximized", () => Boolean(win()?.isMaximized()));
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showWindow();
    return;
  }

  // Windows 系统标题栏会把最小化 / 最大化 / 关闭画得很小。
  // 无边框后由页面按 48×58 画这三个按钮。preload 同时暴露更新条。
  const windowsShell = process.platform === "win32";
  const webPreferences = {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  };
  if (windowsShell) {
    webPreferences.preload = path.join(__dirname, "preload.cjs");
  }

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 840,
    minHeight: 560,
    show: false,
    frame: !windowsShell,
    thickFrame: true,
    backgroundColor: "#2c241c",
    autoHideMenuBar: true,
    icon: iconPath("icon.ico"),
    webPreferences,
  });

  Menu.setApplicationMenu(null);

  const url = isDevUi()
    ? "http://127.0.0.1:5173/"
    : `http://127.0.0.1:${PORT}/`;
  mainWindow.loadURL(url);
  mainWindow.webContents.on("did-finish-load", publishPendingUpdate);

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

  const publishMaximized = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop-window:maximized", mainWindow.isMaximized());
    }
  };
  mainWindow.on("maximize", publishMaximized);
  mainWindow.on("unmaximize", publishMaximized);

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
      ...(pendingUpdateVersion
        ? [{
            label: `安装更新 ${pendingUpdateVersion}`,
            click: () => installDownloadedUpdate(),
          }]
        : []),
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
          // 在菜单回调里直接 quit，Windows 会把退出取消掉，进程留在任务管理器里。
          setImmediate(() => quitApp());
        },
      },
    ]),
  );
}

function githubMirrorEnabled() {
  try {
    const dir = process.env.GLOSSARY_DATA_DIR;
    if (!dir) return githubMirrorOn();
    const saved = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
    return githubMirrorOn(saved);
  } catch {
    /* 还没写出设置文件时默认开镜像 */
  }
  return githubMirrorOn();
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

function setupGithubMirrorIntercept() {
  session.defaultSession.webRequest.onBeforeRequest(
    {
      urls: GITHUB_FILE_HOST_SUFFIXES.flatMap((suffix) => [
        `https://${suffix}/*`,
        `https://*.${suffix}/*`,
      ]),
    },
    (details, callback) => {
      if (!githubMirrorEnabled()) {
        callback({});
        return;
      }
      const next = withGithubMirror(details.url, true);
      if (next === details.url) {
        callback({});
        return;
      }
      callback({ redirectURL: next });
    },
  );
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
    return;
  }
  tray?.displayBalloon?.({ title, content: body });
}

// checkForUpdates 失败会先 emit "error" 再 reject。对话框只写在这里：
// 监听和 catch 都进来时，第一次清掉标志，第二次不再弹框。
function showManualUpdateError(err) {
  if (!manualUpdateCheck) return;
  manualUpdateCheck = false;
  dialog.showErrorBox("检查更新失败", err?.message || String(err));
}

function publishPendingUpdate() {
  if (!pendingUpdateVersion || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("desktop-update:ready", pendingUpdateVersion);
}

function installDownloadedUpdate() {
  if (!pendingUpdateVersion) return;
  // 静默安装：/S，不弹出 NSIS 安装窗口。退出时 before-quit 会拆掉托盘。
  autoUpdater.quitAndInstall(true, true);
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;
  setupGithubMirrorIntercept();
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
    pendingUpdateVersion = info.version;
    manualUpdateCheck = false;
    rebuildTrayMenu();
    publishPendingUpdate();
    const visible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
    if (!visible) {
      notify(
        "术语本已准备好更新",
        `新版本 ${info.version} 已下载。打开术语本后点「现在更新」，不会弹出安装窗口。`,
      );
    }
  });

  autoUpdater.on("error", (err) => {
    showManualUpdateError(err);
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
        detail: "安装包会在应用里下载。下好后点「现在更新」，静默装好并重新打开。",
      });
    }
    return;
  }
  manualUpdateCheck = manual;
  try {
    applyUpdateFeed();
    await autoUpdater.checkForUpdates();
  } catch (err) {
    showManualUpdateError(err);
  }
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
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("本地服务没有启动起来");
}

async function startPrimaryInstance() {
  bindDesktopWindowControls();
  ipcMain.on("desktop-update:install", () => installDownloadedUpdate());
  ipcMain.handle("desktop-update:ready", () => pendingUpdateVersion || "");
  process.env.GLOSSARY_DATA_DIR = app.isPackaged
    ? app.getPath("userData")
    : path.join(projectRoot, "data");
  process.env.GLOSSARY_DIST_DIR = path.join(projectRoot, "web", "dist");

  try {
    const { startServer } = await import("../server/index.js");
    const started = await startServer();
    httpServer = started.server;
    await waitForHealth();
  } catch (err) {
    const busy = err && err.code === "EADDRINUSE";
    await dialog.showMessageBox({
      type: "error",
      title: "术语本无法启动",
      message: busy
        ? `端口 ${PORT} 已被占用。`
        : err?.message || "启动失败",
      detail: busy
        ? "请先关掉另一份术语本，或关掉正在跑的 npm run start / npm run dev。"
        : String(err),
    });
    quitting = true;
    app.quit();
    return;
  }

  createTray();
  createWindow();
  setupAutoUpdater();
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
}

function shutdownServer() {
  const server = httpServer;
  if (!server) return;
  httpServer = null;
  try {
    server.closeAllConnections?.();
  } catch {
    /* ignore */
  }
  try {
    server.close();
  } catch {
    /* ignore */
  }
}

let forceExitArmed = false;

function quitApp() {
  quitting = true;
  destroyTray();
  shutdownServer();
  if (!forceExitArmed) {
    forceExitArmed = true;
    // quit 被托盘或未断开的连接拖住时，进程会一直留着。
    setTimeout(() => app.exit(0), 1000);
  }
  app.quit();
}

app.on("before-quit", () => {
  quitting = true;
  destroyTray();
  shutdownServer();
  if (!forceExitArmed) {
    forceExitArmed = true;
    setTimeout(() => app.exit(0), 1000);
  }
});

app.on("window-all-closed", () => {
  // 关掉窗口仍留在托盘，Zotero 才能继续连本地接口。
});
