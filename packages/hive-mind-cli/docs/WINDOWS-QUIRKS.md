# Windows Quirks — hive-mind-cli on Windows 10/11

> **TL;DR:** Install with `npm install -g @waggle/hive-mind-cli`. The package's
> postinstall script handles all the Windows-specific quirks automatically. If
> you ever see `spawn ENOENT` errors when Claude Code tries to use hive-mind,
> run `hive-mind-cli doctor` — it will diagnose and recover automatically.

## What's different on Windows

Windows command-line behavior diverges from POSIX (Linux + macOS) in three ways
that affect how Claude Code talks to `hive-mind-cli`:

### 1. npm-global CLIs are `.cmd` shims, not symlinks

When you run `npm install -g <package>` on Windows, npm creates a small `.cmd`
file in `%APPDATA%\npm\<package>.cmd` (or `~\AppData\Roaming\npm\<package>.cmd`).
That `.cmd` file invokes Node with the package's actual JS entry point.

POSIX systems use symlinks to the real binary, which `child_process.spawn`
resolves natively without any extra config. Windows requires `cmd.exe` to
resolve the `.cmd` shim — meaning callers must either:

- Pass `shell: true` to `child_process.spawn(...)`, OR
- Add the explicit `.cmd` extension to the binary name (`hive-mind-cli.cmd`)

Most Node code targets POSIX and forgets `shell: true`. When that code runs on
Windows, it hits `spawn <name> ENOENT` even though the binary IS on PATH.

### 2. The Claude Code MCP health-check hook had this bug

Until commit `cf6e6c5d` (April 2026) on the
[`everything-claude-code` marketplace plugin](https://github.com/Affaan-Mustafa/everything-claude-code),
`scripts/hooks/mcp-health-check.js::probeCommandServer` called `spawn(command, args, ...)`
without `shell: true`. Result: every MCP server backed by an npm-installed
CLI (hive-mind-cli, chrome-devtools, etc.) failed the health check on Windows,
got marked "unhealthy," and was quarantined for the backoff window — blocking
every subsequent MCP tool call until quarantine expired.

`@waggle/hive-mind-cli` ships a corrected `mcp-health-check.js` and drops it to
the user override path (`~/.claude/scripts/hooks/mcp-health-check.js`) at install
time on Windows. That override takes precedence over the plugin path in Claude
Code's hook resolution order, so the fix is effective even if the marketplace
plugin still has the bug.

### 3. Quarantine state file must be cleared after first install

If you ran into this bug BEFORE installing `@waggle/hive-mind-cli`, your Claude
Code may have a stale quarantine state for `hive-mind` cached at:

```
~/.claude/mcp-health-cache.json
```

If a server is in `failureQuarantines` or `lastFailureCode = 'spawn ENOENT'`
in that file, Claude Code will continue refusing to call its tools even after
the postinstall fix is in place. Workaround:

```powershell
# Edit the file and remove the hive-mind entry (or any quarantined entries):
notepad $env:USERPROFILE\.claude\mcp-health-cache.json
```

…or simply delete the cache file entirely:

```powershell
Remove-Item $env:USERPROFILE\.claude\mcp-health-cache.json
```

…or run the doctor command (see below) which clears it automatically.

## Verifying hive-mind-cli is healthy in <10 seconds

```powershell
hive-mind-cli doctor
```

Expected output (green path):

```
[hive-mind-cli doctor] Spawning self via Node child_process.spawn… ✓
[hive-mind-cli doctor] Saving probe frame to personal.mind… ✓
[hive-mind-cli doctor] Recalling probe frame… ✓
[hive-mind-cli doctor] Checked mcp-health-cache.json: clean
[hive-mind-cli doctor] PASS — hive-mind-cli is healthy on win32. First MCP call should succeed.
```

If any step fails, the doctor command prints an actionable error message
suggesting the next step (e.g., "Re-run `npm install -g @waggle/hive-mind-cli`
to re-trigger the postinstall override").

## Unsupported Windows configurations

Tested on:

- Windows 10 21H2+ (build 19044+)
- Windows 11 22H2+ (build 22621+)
- Node.js 20.x via official MSI installer

Untested / may need additional config:

- WSL1 (use WSL2 instead — POSIX behavior, no quirks)
- Cygwin / MSYS2 — should work like POSIX but `~` path resolution may differ
- npm with PowerShell 7 default executor change — should work, but test if you
  see spawn errors

## Reporting bugs

If `hive-mind-cli doctor` fails on a configuration not listed above, file an
issue at [`marolinik/waggle-os/issues`](https://github.com/marolinik/waggle-os/issues)
with:

- Output of `hive-mind-cli doctor` (full)
- Output of `node --version` and `npm --version`
- Windows version (`winver` from Run dialog)
- Whether `everything-claude-code` marketplace plugin is installed (`Get-ChildItem $env:USERPROFILE\.claude\plugins\marketplaces`)
