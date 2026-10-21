import { nativeStore } from "./nativeStore.js";
import { downloadTerms, testDav, uploadTerms } from "./webdavClient.js";
import { createSyncEngine } from "../../shared/syncEngine.js";

const sync = createSyncEngine({
  readEnvelope: () => nativeStore.readEnvelope(),
  writeEnvelope: (envelope) => nativeStore.writeEnvelope(envelope),
  getSettings: () => nativeStore.getSettings(),
  downloadTerms,
  uploadTerms,
  testDav,
});

export const setNativeSyncListener = sync.setListener;
export const isConfigured = sync.isConfigured;
export const getSyncStatus = sync.getSyncStatus;
export const testConnection = sync.testConnection;
export const queuePush = sync.queuePush;
export const syncNow = sync.syncNow;
export const startNativeSyncLoop = sync.start;
export const withLock = sync.withLock;
