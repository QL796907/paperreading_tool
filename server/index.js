import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { store } from "./store.js";
import { explainTerm } from "./ai.js";
import {
  getSyncStatus,
  queuePush,
  setSyncListener,
  startSyncLoop,
  syncNow,
  testConnection,
} from "./sync.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3780;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

const sseClients = new Set();

function broadcast(payload) {
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) client.write(line);
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "术语本", port: PORT });
});

app.get("/api/state", asyncHandler(async (_req, res) => {
  const [terms, settings] = await Promise.all([
    store.allTerms(),
    store.getSettings(),
  ]);
  res.json({ terms, settings, sync: getSyncStatus(settings) });
}));

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write("data: {\"type\":\"hello\"}\n\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

app.post("/api/terms", asyncHandler(async (req, res) => {
  const { term, created } = await store.upsertTerm(req.body || {});
  const settings = await store.getSettings();
  const shouldExplain =
    (req.body?.autoExplain === true ||
      (req.body?.autoExplain !== false && settings.autoExplain)) &&
    !term.definition;

  if (shouldExplain) {
    try {
      const definition = await explainTerm(term, settings);
      const updated = await store.updateTerm(term.id, {
        definition,
        definitionSource: "ai",
      });
      broadcast({ type: "changed", id: updated.id });
      queuePush("local-change");
      res.status(created ? 201 : 200).json({ term: updated, created });
      return;
    } catch (err) {
      broadcast({ type: "changed", id: term.id });
      queuePush("local-change");
      res.status(created ? 201 : 200).json({
        term,
        created,
        explainError: err.message,
      });
      return;
    }
  }

  broadcast({ type: "changed", id: term.id });
  queuePush("local-change");
  res.status(created ? 201 : 200).json({ term, created });
}));

app.patch("/api/terms/:id", asyncHandler(async (req, res) => {
  const term = await store.updateTerm(req.params.id, req.body || {});
  broadcast({ type: "changed", id: term.id });
  queuePush("local-change");
  res.json({ term });
}));

app.delete("/api/terms/:id", asyncHandler(async (req, res) => {
  await store.deleteTerm(req.params.id);
  broadcast({ type: "changed", id: req.params.id });
  queuePush("local-change");
  res.json({ ok: true });
}));

app.post("/api/terms/:id/explain", asyncHandler(async (req, res) => {
  const term = await store.getTerm(req.params.id);
  if (!term) {
    const error = new Error("找不到这个词条");
    error.status = 404;
    throw error;
  }
  const settings = await store.getSettings();
  const definition = await explainTerm(term, settings);
  const updated = await store.updateTerm(term.id, {
    definition,
    definitionSource: "ai",
  });
  broadcast({ type: "changed", id: updated.id });
  queuePush("local-change");
  res.json({ term: updated });
}));

app.put("/api/settings", asyncHandler(async (req, res) => {
  const settings = await store.saveSettings(req.body || {});
  broadcast({ type: "settings" });
  if (settings.webdavEnabled) queuePush("local-change");
  res.json({ settings, sync: getSyncStatus(settings) });
}));

app.get("/api/sync", asyncHandler(async (_req, res) => {
  const settings = await store.getSettings();
  res.json({ sync: getSyncStatus(settings) });
}));

app.post("/api/sync/test", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const settings = await store.getSettings();
  const result = await testConnection({
    webdavUrl: body.webdavUrl ?? settings.webdavUrl,
    webdavUser: body.webdavUser ?? settings.webdavUser,
    webdavPassword: body.webdavPassword || settings.webdavPassword,
    webdavPath: body.webdavPath ?? settings.webdavPath,
  });
  res.json(result);
}));

app.post("/api/sync/now", asyncHandler(async (_req, res) => {
  const result = await syncNow("manual");
  broadcast({ type: "sync" });
  res.json(result);
}));

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "服务器出错了" });
});

let httpServer = null;

function attachStatic() {
  const distDir =
    process.env.GLOSSARY_DIST_DIR || path.join(__dirname, "..", "web", "dist");
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res.type("html").send(`<!doctype html>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=http://127.0.0.1:5173/">
<p>正在打开术语本。开发模式请使用 <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a>。若打不开，请先运行 <code>npm run dev</code>。</p>`);
    });
  }
}

export function startServer() {
  if (httpServer) {
    return Promise.resolve({ server: httpServer, port: PORT });
  }
  attachStatic();
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, "127.0.0.1", () => {
      console.log(`术语本已启动：http://127.0.0.1:${PORT}`);
      setSyncListener(() => broadcast({ type: "sync" }));
      startSyncLoop();
      httpServer = server;
      resolve({ server, port: PORT });
    });
    server.on("error", reject);
  });
}

if (!process.versions.electron) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
