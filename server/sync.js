import { store } from "./store.js";
import { downloadTerms, uploadTerms, testDav } from "./webdav.js";
import { createSyncEngine } from "../web/src/syncEngine.js";

const sync = createSyncEngine({
  readEnvelope: () => store.readEnvelope(),
  writeEnvelope: (envelope) => store.writeEnvelope(envelope),
  getSettings: () => store.getSettings(),
  downloadTerms,
  uploadTerms,
  testDav,
});

export const setSyncListener = sync.setListener;
export const isConfigured = sync.isConfigured;
export const getSyncStatus = sync.getSyncStatus;
export const testConnection = sync.testConnection;
export const queuePush = sync.queuePush;
export const syncNow = sync.syncNow;
export const startSyncLoop = sync.start;
export const withLock = sync.withLock;
