// Path-A stub for @waggle/core — the ONLY 2 symbols runAgentLoop's runtime chain
// needs (createCoreLogger via turn-context.ts, scanForInjection via injection-scanner.ts).
// Re-exported from hive-mind-core's DB-free deep paths, bypassing the index barrel
// whose `export { MindDB } from './mind/db.js'` eagerly loads better-sqlite3/sqlite-vec.
// Proven (2026-05-22) to import runAgentLoop with zero native deps. See ../spike-waggle-worker/.
export { createCoreLogger } from "@waggle/hive-mind-core/dist/logger.js";
export { scanForInjection } from "@waggle/hive-mind-core/dist/injection-scanner.js";
