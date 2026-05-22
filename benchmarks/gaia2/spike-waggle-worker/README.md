# waggle_worker spike — Path A de-risk (PROVEN 2026-05-22)

Proves Waggle's `runAgentLoop` runs with ZERO native deps via a 2-symbol `@waggle/core`
stub (re-exporting the DB-free `createCoreLogger` + `scanForInjection` from hive-mind-core
deep paths), bypassing the `db.js` barrel that eagerly loads `better-sqlite3`/`sqlite-vec`.

Result (isolated dir outside the monorepo, better-sqlite3 NOT resolvable):
  { import_ok: true, runAgentLoop: "function", better_sqlite3: "not-resolvable (clean)" }

→ The `gaia2-waggle` container = node:20-slim + agent dist/ + this 2-symbol stub +
  hive-mind-core/dist/{logger.js,injection-scanner.js}. No native rebuild needed.

To re-run: copy `packages/agent/dist` here as `dist/`, then `node proof.mjs`.
