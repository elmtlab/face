/**
 * PM tool sync — public API.
 *
 * Re-exports the key functions for consuming code.
 */

// Types
export type {
  PMSyncProvider,
  PMSyncProviderConfig,
  PMSyncProviderFactory,
  PMProjectInput,
  PMTaskInput,
  PMSyncResult,
  SyncReference,
  SyncItemType,
  SyncStatus,
} from "./types";

// Registry
export {
  registerPMSyncProvider,
  createPMSyncProvider,
  availablePMSyncProviders,
} from "./registry";

// Manager (config + provider lifecycle)
export {
  getActivePMSyncProvider,
  addPMSyncProvider,
  listPMSyncConfigs,
  getActivePMSyncProviderName,
  setActivePMSyncProvider,
  removePMSyncProvider,
  updatePMSyncProvider,
} from "./manager";

// Sync state store
export {
  getSyncReference,
  listSyncReferences,
  upsertSyncReference,
  updateSyncStatus,
  removeSyncReference,
  getFailedSyncReferences,
} from "./store";

// Background worker
export {
  syncProject,
  syncTask,
  retryFailed,
} from "./worker";
