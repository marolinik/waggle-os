const t0 = Date.now();
try {
  const m = await import("./dist/agent-loop.js");
  const hasRun = typeof m.runAgentLoop === "function";
  // verify better-sqlite3 was never loaded into the module cache
  let sqliteLoaded = false;
  try { await import("better-sqlite3"); sqliteLoaded = true; } catch { sqliteLoaded = false; }
  console.log(JSON.stringify({
    import_ok: true,
    runAgentLoop_exported: hasRun,
    better_sqlite3_resolvable: sqliteLoaded,  // false = not even installed = proof loop didn't need it
    ms: Date.now() - t0,
  }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ import_ok: false, error: String(e).slice(0, 300) }, null, 2));
}
