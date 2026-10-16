/**
 * 同步策略：只同步术语（terms.json），不同步 API Key / WebDAV 密码。
 * 手机和电脑各改各的时，谁的整本更新更晚，就以谁为准（last-write-wins）。
 *
 * 两端把各自的 store 端口和现有 dav 函数传进来。循环只留这一份，避免启动同步再分叉。
 */

const PUSH_DEBOUNCE_MS = 1800;
const PULL_EVERY_MS = 5 * 60 * 1000;

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

export function createSyncEngine({
  readEnvelope,
  writeEnvelope,
  getSettings,
  downloadTerms,
  uploadTerms,
  testDav,
}) {
  let onChanged = () => {};
  let busy = false;
  let debounceTimer = null;
  let pullTimer = null;
  let chain = Promise.resolve();

  const status = {
    lastSyncedAt: null,
    lastError: null,
    lastMessage: "",
  };

  function setListener(fn) {
    onChanged = typeof fn === "function" ? fn : () => {};
  }

  // 同步先读整本再写回。词条和设置的读改写必须走这条链，否则快照会盖掉并发保存。
  function withLock(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  function isConfigured(settings) {
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

  function getSyncStatus(settings) {
    return {
      enabled: Boolean(settings?.webdavEnabled),
      configured: isConfigured(settings),
      busy,
      lastSyncedAt: status.lastSyncedAt,
      lastError: status.lastError,
      lastMessage: status.lastMessage,
    };
  }

  async function testConnection(input) {
    return testDav({
      url: input.webdavUrl,
      user: input.webdavUser,
      password: input.webdavPassword,
      remotePath: input.webdavPath,
    });
  }

  async function runSync(reason) {
    const settings = await getSettings();
    if (!isConfigured(settings)) {
      const error = new Error("还没配好坚果云：请先填写地址、账号、应用密码，并勾选启用同步");
      error.status = 400;
      throw error;
    }

    busy = true;
    onChanged();
    try {
      const local = await readEnvelope();
      const remote = await downloadTerms(creds(settings));
      const localTs = envelopeTime(local);
      const remoteTs = remote
        ? envelopeTime(remote.envelope, remote.lastModified)
        : 0;

      let message = "两边已经一致";

      if (!remote) {
        await uploadTerms(creds(settings), local);
        message = "远程还没有文件，已上传本机术语本";
      } else if (remoteTs > localTs) {
        await writeEnvelope({
          terms: remote.envelope.terms,
          updatedAt:
            remote.envelope.updatedAt ||
            (remoteTs ? new Date(remoteTs).toISOString() : new Date().toISOString()),
        });
        message = "已从坚果云取回更新的术语本";
      } else if (localTs > remoteTs || reason === "local-change") {
        await uploadTerms(creds(settings), local);
        message = "已把本机术语本上传到坚果云";
      }

      status.lastSyncedAt = new Date().toISOString();
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

  // 失败已写在 lastError。防抖、启动和定时拉取不往外抛，免得打断记词。
  function runInBackground(reason) {
    return withLock(async () => {
      const settings = await getSettings();
      if (!isConfigured(settings)) return;
      try {
        await runSync(reason);
      } catch {
        /* lastError 已记录 */
      }
    });
  }

  function queuePush(reason = "local-change") {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      runInBackground(reason);
    }, PUSH_DEBOUNCE_MS);
  }

  function syncNow(reason = "manual") {
    return withLock(() => runSync(reason));
  }

  function start() {
    setTimeout(() => {
      runInBackground("startup");
    }, 800);
    clearInterval(pullTimer);
    pullTimer = setInterval(() => {
      runInBackground("pull");
    }, PULL_EVERY_MS);
  }

  return {
    setListener,
    isConfigured,
    getSyncStatus,
    testConnection,
    queuePush,
    syncNow,
    start,
    withLock,
  };
}
