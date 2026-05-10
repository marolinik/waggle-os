# Wave 1 Cleanup Brief — Windows MCP Hook Spawn Fix

**Date:** 2026-04-30
**Authored:** 2026-04-30 (PM amendments ratified)
**Status:** Local patch shipped; structural cleanup REQUIRED before Waggle Solo tier launch — **LOCKED for execution post-Phase-5-§0-PASS**
**Owner:** Marko Markovic
**Commit:** `cf6e6c5` on `everything-claude-code` marketplace clone (`~/.claude/plugins/marketplaces/everything-claude-code`)
**Triggering session:** hive-mind diagnostic — "is hive-mind active" → discovered all `mcp__hive-mind__*` calls blocked by health-check hook

---

## 1. What was patched (Wave 1, complete)

`scripts/hooks/mcp-health-check.js::probeCommandServer` now sets `shell: true` + `windowsHide: true` when `process.platform === 'win32'`. Without this, Node's `child_process.spawn("hive-mind-cli", …)` returns `ENOENT` because Windows requires `cmd.exe` to resolve `.cmd` / `.bat` shims (the npm-generated wrappers for any globally-installed CLI).

The hook was failing → marking the server unhealthy → quarantining for backoff (30s → 10min) → blocking every subsequent MCP tool call until the quarantine expired. POSIX paths are unchanged: Linux and macOS resolve shebangs natively without `shell: true`.

**Mirrored copies (md5 `25164dada93b36019e05ddadfac92733`):**
- `~/.claude/plugins/marketplaces/everything-claude-code/scripts/hooks/mcp-health-check.js` (canonical, git-tracked, committed)
- `~/.claude/plugins/cache/everything-claude-code/everything-claude-code/1.9.0/scripts/hooks/mcp-health-check.js` (running copy)
- `~/.claude/scripts/hooks/mcp-health-check.js` (user override)

**Quarantine state file (`~/.claude/mcp-health-cache.json`) cleared for:**
- `hive-mind` — was `spawn hive-mind-cli ENOENT`, now resolves
- `chrome-devtools` — was `spawn npx ENOENT`, **same bug**, also fixed by this patch (bonus)
- `composio` — left in place (real HTTP 401, unrelated auth issue)

**Verification (live, this session):**
- `mcp__hive-mind__get_identity` returned `{ "configured": false, "message": "..." }` — clean RPC, no ENOENT
- `mcp__hive-mind__save_memory` → frame ID **23** persisted at `2026-04-29 11:27:42`
- `mcp__hive-mind__recall_memory` → returned frame 23 with the probe content intact

---

## 2. Why the local patch is not enough

The patch is on **Marko's local clone** of the marketplace. It will be lost the next time:
- The plugin is reinstalled
- The marketplace is `git pull`-ed and a merge conflict drops the change
- A new Windows user installs `everything-claude-code` for the first time
- Cache eviction triggers a re-clone from upstream

**Implication for Waggle Solo tier launch:** every Windows customer who installs Waggle's hive-mind-backed memory layer will hit `spawn ENOENT` on first MCP tool call, see the server quarantined, and conclude that "memory is broken." This is a zero-engagement failure mode — the product appears not to work at all, with no error visible at the UI level (the hook silently blocks; the model just gets a 404-equivalent).

This is unacceptable for a paid tier. We need structural fixes that survive plugin reinstall.

---

## 3. Required Wave 2 work (structural)

### 3.1 Upstream the patch (HIGH priority)
- Open PR against `everything-claude-code` upstream with the same diff, exactly as committed in `cf6e6c5`. Title: `fix(mcp-health-check): resolve Windows .cmd shims in probeCommandServer`.
- Reference issue search: check upstream issue tracker for `ENOENT` / `Windows` / `spawn` reports before opening — there are likely duplicates.
- Acceptance: PR merged + version bumped + Windows users get the fix on next plugin update.
- **Risk if delayed:** every Windows session continues to be a ticking time bomb until the user manually quarantines the bug. Solo tier users will not know to do this.

### 3.2 hive-mind-cli installer hardening (HIGH priority)
The installer (`hive-mind-cli` from `D:\Projects\hive-mind\packages\cli`) currently does nothing about the host's hook environment. It assumes the MCP plumbing "just works." It should not.

**Add to post-install:**
- Detect presence of `everything-claude-code` (or any plugin with a known-buggy `mcp-health-check.js` on Windows) by version
- If buggy version detected on `win32`: emit a clear warning + offer a one-line override fix (drop a corrected `mcp-health-check.js` into `~/.claude/scripts/hooks/` which already takes precedence)
- Optional: register hive-mind-cli's own diagnostic command — `hive-mind-cli doctor` — that runs a smoke test (spawn self, save+recall a test frame, report fail/pass) without depending on the upstream hook being correct
- Acceptance: `npm install -g hive-mind-cli` on a fresh Windows machine + `claude mcp add hive-mind -- hive-mind-cli mcp start` ⇒ working in zero manual debug steps

### 3.3 Health-check hook robustness (MEDIUM priority)
The hook itself has design issues that compounded this incident:
- **It silently blocks.** No surface to the user — Marko had to grep error strings to discover it. Add a top-level `[MCPHealthCheck] Windows Note: ...` line when a `spawn ENOENT` is detected, suggesting the `.cmd` cause.
- **Backoff is aggressive.** A single `ENOENT` puts a server out for ~30s minimum, doubling each retry. For a transient init hiccup that's punishing. Consider: don't quarantine at all on the first ENOENT during a session if the MCP daemon itself reports `Connected` (cross-validation against `claude mcp list` state).
- **No fallback if the binary works via the daemon but fails the spawn check.** That's the exact split-brain we hit: daemon connected, hook quarantines anyway. The hook should treat "daemon reports Connected" as a stronger signal than "my spawn probe failed."

### 3.4 Documentation (MEDIUM)
Add a "Windows Quirks" section to whatever Waggle Solo onboarding doc exists:
- npm-global CLIs are `.cmd` shims — anything that spawns them needs `shell: true` or explicit `.cmd` extension
- How to clear `mcp-health-cache.json` if a server gets stuck quarantined
- How to verify hive-mind is healthy in <10 seconds (`get_identity` should return without ENOENT)

### 3.5 Regression test (LOW but cheap)
Add a Node test that spawns `mcp-health-check.js` with a synthetic input on Windows CI runner (GitHub Actions `windows-latest`), pointing at a fake MCP config whose command is `nonexistent-cli` and one whose command is `npx`. Asserts:
- The npx case probes successfully (proves `.cmd` resolution works)
- The nonexistent case fails cleanly with a useful message (proves the error path is preserved)
- Exit code semantics match what the doc claims

---

## 4. Scope of the patch (what is NOT covered)

- **Other plugins** with their own hook scripts may have the same bug independently. Patch is scoped to `everything-claude-code/scripts/hooks/mcp-health-check.js` only.
- **Reconnect command path** at line 433+ already uses `shell: true` correctly — no change needed there.
- **HTTP-style MCP servers** (the `requestHttp` path) are unaffected — this is purely about stdio command servers.
- **Composio's HTTP 401** is a real auth issue and is left in the quarantine state file. Separate fix.

---

## 5. Open questions — RATIFIED 2026-04-30

1. **Upstream relationship:** does Waggle have a contributor relationship with `everything-claude-code` maintainer?
   **ANSWER (PM ratified 2026-04-30):** No contributor relationship. Per `feedback_memory_install_dead_simple` binding rule (mirror: `D:/Projects/PM-Waggle-OS/memory-mirror/feedback_memory_install_dead_simple.md`), §3.2 (hive-mind-cli's own override) is the **PRIMARY** path, not a backup. Solo launch does **NOT** wait on upstream merge timing. Upstream PR proceeds in parallel as good-citizen contribution but is NEVER on the critical path. If upstream maintainer is responsive, the override can later be retired; until then the override is the source of truth for Windows users.

2. **Solo tier scope:** is hive-mind the *only* MCP server the Solo tier ships, or are there others (e.g., chrome-devtools is also affected)?
   **ANSWER (PM ratified 2026-04-30):** Wave 1 hive-mind is **primary**, but the §3.2 override **MUST** cover all `.cmd` cases regardless of which servers Solo formally ships. The bonus catch on `chrome-devtools` (npx-launched, same `spawn ENOENT` symptom) confirms this is a class of bug, not a single-server bug. Override detection logic operates at the config level: scan every entry in `mcp_servers` whose `command` resolves to a `.cmd` shim on Windows; treat them all as candidates for the patched hook. No allow-listing by server name.

3. **Mac/Linux Solo users:** does the same Solo tier installer also run on POSIX? If yes, the post-install detection in 3.2 must be a no-op there.
   **ANSWER (PM ratified 2026-04-30):** Yes, same installer cross-platform. The post-install script **MUST** short-circuit on POSIX with `if (process.platform !== 'win32') return;` before any detection or override-drop logic runs. This is hard acceptance for §3.2 — Linux/macOS install paths must be zero-touch and zero-impact, otherwise we risk regressing working systems. Verified by automated test on `ubuntu-latest` runner (no override file written, no warnings emitted).

### Schedule decision (PM ratified 2026-04-30)

**No new 2-week scheduled agent created.** Existing remote trigger `trig_013hjgTkpaSvqi89pJvAunt3` ("Phase 5 brief progress + Faza 2 sprint check") armed for 2026-05-13T07:00:00Z (09:00 CEST) is the canonical 2-week PM ping. Wave 2 cleanup status appended as **section 5** to that trigger's prompt metadata via `RemoteTrigger update`. If trigger update fails or trigger gets immutable in future, fall back to manual loop tracking by Marko — do **NOT** create a parallel scheduled agent that could fire out-of-sync with the Phase 5 / Faza 2 cadence.

---

## 6. Definition of done (Wave 2)

- [ ] Upstream PR opened, linked here, merged
- [ ] `hive-mind-cli` post-install detects buggy hook versions on Windows + offers fix
- [ ] `hive-mind-cli doctor` command added with end-to-end smoke (spawn → save → recall)
- [ ] Solo tier onboarding doc has Windows Quirks section
- [ ] Windows CI regression test green on `windows-latest`
- [ ] Acceptance test: fresh Windows VM + 3-step install → working memory in <60s with zero terminal errors

---

## Evidence appendix

- **Patch commit:** `cf6e6c5` (`~/.claude/plugins/marketplaces/everything-claude-code` repo)
- **Memory probe frame:** ID 23, importance `important`, source `tool_verified`, content begins `PROBE-WAVE1-HOOKS-2026-04-29T11:18Z`
- **md5 of all three patched copies:** `25164dada93b36019e05ddadfac92733`
- **Quarantine cleared at:** roughly 2026-04-29T11:27Z (state file edit just before save_memory)
