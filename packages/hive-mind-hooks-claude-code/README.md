# @hive-mind/claude-code-hooks

> Silent memory capture for [Anthropic Claude Code](https://claude.com/claude-code) — every session writes to your local `~/.hive-mind/global.mind`, no cloud, no opt-in per session.

**Status**: Wave 1 MVP, pre-1.0.
**License**: Apache-2.0.
**Peer dependency**: `@hive-mind/cli` >= 0.1.0 (must be on PATH).

## What it does

Patches `~/.claude/settings.json` with four hook entries that route Claude Code lifecycle events into hive-mind via the [shim-core CLI bridge](../shim-core):

| Hook | What we do |
|---|---|
| `SessionStart` | Resolve workspace, switch to it, recall the top-N frames, inject as additional context. |
| `UserPromptSubmit` | Save the user prompt as a `temporary` frame scoped to the current session. |
| `Stop` | Deterministically summarize the just-completed turn and save it as an `important` frame, parented to the prompt frame. |
| `PreCompact` | Run `compact_memory` so superseded P/B frames merge before Claude's own context truncation. |

All hooks **fail open**: if `hive-mind-cli` is unreachable or any step throws, the hook logs a warning to stderr and exits 0. Claude Code never sees a hook failure.

## Quickstart

```bash
# One-time: install hive-mind-cli globally and init the .mind file
npm install -g @hive-mind/cli
hive-mind-cli init

# Per-machine: install the Claude Code shim
npx @hive-mind/claude-code-hooks install
```

### Windows / pinned CLI path

On Windows, `hive-mind-cli` is published as an `npm` `.cmd` shim that cannot be exec'd directly from a hook. Pin the path at install time:

```bash
# Find the upstream CLI's compiled JS entry point
npx @hive-mind/claude-code-hooks install \
  --cli-path "C:\\Users\\<you>\\AppData\\Roaming\\npm\\node_modules\\@hive-mind\\cli\\dist\\index.js"
```

The path is recorded in `~/.claude/hive-mind-install.json` and threaded into every generated hook command as `--cli-path "..."`. Production users on POSIX may omit the flag if `hive-mind-cli` is reliably on `$PATH` at hook invocation time.

Output:

```
hive-mind/claude-code-hooks: install
  - settings:    /Users/you/.claude/settings.json
  - backup:      /Users/you/.claude/settings.json.hive-mind-backup.2026-04-28T...
  - pointer:     /Users/you/.claude/hive-mind-install.json
  - added hooks: session-start, user-prompt-submit, stop, pre-compact
  - cli path:    (default — hive-mind-cli on PATH)

Done. New Claude Code sessions will silently capture to hive-mind.
Run "claude-code-hooks verify" to inspect, "claude-code-hooks uninstall" to revert.
```

## Reversibility

Install writes a timestamped, byte-identical backup of `~/.claude/settings.json` *before* any modification, plus a small pointer file `~/.claude/hive-mind-install.json`. Uninstall reads the pointer, copies the backup back over `settings.json`, and refuses to remove the backup until the round-trip content matches. The result is a SHA-256-identical pre-install state.

```bash
npx @hive-mind/claude-code-hooks uninstall
```

## Coexistence with `MEMORY.md`

This shim handles the **episodic** layer (actual conversation turns, captured automatically as frames). It does **not** touch your existing `MEMORY.md` — that file is the **semantic** layer (distilled rules and preferences) and stays under your manual control. The two layers complement each other; nothing is moved or rewritten.

## Verify

```bash
npx @hive-mind/claude-code-hooks verify
```

Checks:
- `~/.claude/settings.json` exists and is valid JSON.
- All four hive-mind hook entries are present and reference compiled `dist/hooks/*.js` files that actually exist.
- `hive-mind-cli` is on PATH and answers `--version`.

## License

Apache-2.0 — see [the repo root](https://github.com/marolinik/hive-mind-clients/blob/main/LICENSE).
