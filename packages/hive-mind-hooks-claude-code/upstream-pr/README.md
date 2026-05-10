# Upstream PR materials — `everything-claude-code` mcp-health-check.js Windows .cmd shim fix

This directory bundles the patch + context for the upstream PR against
[`everything-claude-code`](https://github.com/Affaan-Mustafa/everything-claude-code) (the
Claude Code plugin marketplace). The fix is currently shipped as a postinstall override
by `@waggle/hive-mind-cli` (see `packages/hive-mind-cli/postinstall.js`); once upstream
merges the PR, the override can be retired.

Per `feedback_memory_install_dead_simple` binding rule (mirror at
`D:/Projects/PM-Waggle-OS/memory-mirror/feedback_memory_install_dead_simple.md`), the
override is the **PRIMARY** path — Solo $19/mo Waggle launch does NOT wait on upstream
merge timing. The upstream PR proceeds in parallel as good-citizen contribution.

## The bug

`scripts/hooks/mcp-health-check.js::probeCommandServer` calls `child_process.spawn(command, args, { ... })`
without `shell: true`. On Windows, this means npm-installed CLI shims (`.cmd` / `.bat`
wrappers, e.g., `hive-mind-cli`) fail with `spawn <name> ENOENT` because Windows requires
`cmd.exe` to resolve them.

The hook then marks the MCP server unhealthy, quarantines it for the entire backoff
window (30s → 10min, doubling each retry), and blocks every subsequent MCP tool call
until the quarantine expires.

This is a zero-engagement failure mode for any Claude Code user with an npm-installed
MCP server CLI on Windows — `hive-mind-cli`, `npx`-launched chrome-devtools, etc.

## The fix

Set `shell: true` and `windowsHide: true` on `spawnOptions` when `process.platform === 'win32'`.
POSIX behavior is preserved (Linux + macOS handle shebangs natively without `shell: true`).

## Files in this directory

- `0001-fix-resolve-windows-cmd-shims.patch` — `git format-patch` output of commit
  `cf6e6c5d` on the everything-claude-code marketplace clone. Apply upstream with
  `git am 0001-fix-resolve-windows-cmd-shims.patch`.

## How to submit

CC does NOT push the upstream PR — Marko handles the GitHub interaction directly. To
submit:

1. Fork [`everything-claude-code`](https://github.com/Affaan-Mustafa/everything-claude-code)
   on GitHub if not already forked.
2. Clone the fork locally: `git clone https://github.com/<your-fork>/everything-claude-code.git`
3. Apply the patch: `git am 0001-fix-resolve-windows-cmd-shims.patch`
4. Push: `git push origin main` (or a feature branch).
5. Open PR against `Affaan-Mustafa/everything-claude-code` with title:
   ```
   fix(mcp-health-check): resolve Windows .cmd shims in probeCommandServer
   ```
6. Reference issue search before opening — check upstream issue tracker for `ENOENT` /
   `Windows` / `spawn` reports and link them in the PR body.

## Verification (already done locally on Marko's machine 2026-04-29)

- `mcp__hive-mind__get_identity` returned clean RPC, no ENOENT
- `mcp__hive-mind__save_memory` → frame ID 23 persisted at 2026-04-29 11:27:42
- `mcp__hive-mind__recall_memory` → returned frame 23 with the probe content intact
- `chrome-devtools` MCP server (npx-launched) also recovered (same bug class)

## License

The patch is MIT (matches upstream `everything-claude-code` LICENSE — original by
Affaan Mustafa, modified by Marko Markovic at Egzakta Group d.o.o. per commit
`cf6e6c5d` on the marketplace clone). MIT and Apache 2.0 are bidirectionally compatible
for distribution; the @waggle/hive-mind-cli postinstall bundles the patched hook with
the upstream MIT notice preserved.

## Related

- `packages/hive-mind-cli/postinstall.js` — postinstall script that drops the override
- `packages/hive-mind-cli/assets/mcp-health-check-fixed.js` — bundled patched hook (MIT)
- `packages/hive-mind-cli/docs/WINDOWS-QUIRKS.md` — user-facing Windows install notes
- Wave 1 cleanup brief: `D:/Projects/PM-Waggle-OS/briefs/2026-04-29-wave1-hooks-cleanup-brief.md`
