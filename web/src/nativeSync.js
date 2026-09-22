import { nativeStore } from "./nativeStore.js";
import { downloadTerms, testDav, uploadTerms } from "./webdavClient.js";

const PUSH_DEBOUNCE_MS = 1800;
const PULL_EVERY_MS = 5 * 60 * 1000;

let busy = false;
let debounceTimer = null;
let pullTimer = null;
let chain = Promise.resolve();
let onChanged = () => {};

const status = {
  lastSyncedAt: null,
  lastDirection: null,
  lastError: null,
  lastMessage: "",
};

export function setNativeSyncListener(fn) {
  onChanged = typeof fn === "function" ? fn : () => {};
}

function withLock(fn) {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => {},
    () => {},
  );
  return run;
}

function envelopeTime(envelope, fallbackHeader) {
  if (envelope?.updatedAt) {
    const ts = Date.parse(envelope.updatedAt);
    if (!Number.isNaN(ts)) return ts;
  }
  const fromTerms = (envelope?.terms || [])
    .map((term) => Date.parse(term.updatedAt) || 0)
    .reduce((max, n) => Math.max(max, n), 0);
  if (fromTerms) return fromTerms;
  if (fallbackHeader) {
    const ts = Date.parse(fallbackHeader);
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

export function isConfigured(settings) {
  return Boolean(
    settings?.webdavEnabled &&
      String(settings.webdavUrl || "").trim() &&
      String(settings.webdavUser || "").trim() &&
      String(settings.webdavPassword || "") &&
      String(settings.webdavPath || "").trim(),
  );
}

function creds(settings) {
  return {
    url: String(settings.webdavUrl || "").trim(),
    user: String(settings.webdavUser || "").trim(),
    password: String(settings.webdavPassword || ""),
    remotePath: String(settings.webdavPath || "").trim(),
  };
}

export function getSyncStatus(settings) {
  return {
    enabled: Boolean(settings?.webdavEnabled),
    configured: isConfigured(settings),
    busy,
    lastSyncedAt: status.lastSyncedAt,
    lastDirection: status.lastDirection,
    lastError: status.lastError,
    lastMessage: status.lastMessage,
  };
}

export async function testConnection(input) {
  return testDav({
    url: input.webdavUrl,
    user: input.webdavUser,
    password: input.webdavPassword,
    remotePath: input.webdavPath,
  });
}

async function runSync(reason) {
  const settings = await nativeStore.getSettings();
  if (!isConfigured(settings)) {
    const error = new Error("还没配好坚果云：请先填写地址、账号、应用密码，并勾选启用同步");
    error.status = 400;
    throw error;
  }
  busy = true;
  onChanged();
  try {
    const local = await nativeStore.readEnvelope();
    const remote = await downloadTerms(creds(settings));
    const localTs = envelopeTime(local);
    const remoteTs = remote ? envelopeTime(remote.envelope, remote.lastModified) : 0;
    let direction = "equal";
    let message = "两边已经一致";
    if (!remote) {
      await uploadTerms(creds(settings), local);
      direction = "push";
      message = "远程还没有文件，已上传本机术语本";
    } else if (remoteTs > localTs) {
      await nativeStore.writeEnvelope({
        terms: remote.envelope.terms,
        updatedAt:
          remote.envelope.updatedAt ||
          (remoteTs ? new Date(remoteTs).toISOString() : new Date().toISOString()),
      });
      direction = "pull";
      message = "已从坚果云取回更新的术语本";
    } else if (localTs > remoteTs || reason === "local-change") {
      await uploadTerms(creds(settings), local);
      direction = "push";
      message = "已把本机术语本上传到坚果云";
    }
    status.lastSyncedAt = new Date().toISOString();
    status.lastDirection = direction;
    status.lastError = null;
    status.lastMessage = message;
    return { ...getSyncStatus(settings), message };
  } catch (err) {
    status.lastError = err.message;
    status.lastMessage = err.message;
    throw err;
  } finally {
    busy = false;
    onChanged();
  }
}

export function queuePush(reason = "local-change") {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    withLock(async () => {
      const settings = await nativeStore.getSettings();
      if (!isConfigured(settings)) return;
      try {
        await runSync(reason);
      } catch {
        /* lastError 已记录 */
      }
    });
  }, PUSH_DEBOUNCE_MS);
}

export function syncNow(reason = "manual") {
  return withLock(() => runSync(reason));
}

export async function startNativeSyncLoop() {
  setTimeout(() => {
    withLock(async () => {
      const settings = await nativeStore.getSettings();
      if (!isConfigured(settings)) return;
      try {
        await runSync("startup");
      } catch {
        /* ignore */
      }
    });
  }, 800);
  clearInterval(pullTimer);
  pullTimer = setInterval(() => {
    withLock(async () => {
      const settings = await nativeStore.getSettings();
      if (!isConfigured(settings)) return;
      try {
        await runSync("pull");
      } catch {
        /* ignore */
      }
    });
  }, PULL_EVERY_MS);
}
