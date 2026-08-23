# @waggle/hive-mind-hooks-cursor

> **Roadmap-only in the current Waggle Windows Solo release.** This package is
> retained for development and future qualification. The production manifest
> does not expose Cursor launch, hook installation, Fleet/task dispatch, or
> direct agent runs. The implementation notes below do not override that gate.

Silent-capture shim that wires **Cursor** lifecycle hooks into
[hive-mind](https://github.com/marolinik/hive-mind) frames. Every Cursor
session deterministically captures sessionStart / beforeSubmitPrompt / stop /
preCompact events into your personal memory via `hive-mind-cli` — the same
every-turn pattern proven by `@waggle/hive-mind-hooks-claude-code`, built on
the shared `@waggle/hive-mind-hooks-core` foundation.

Cursor's hook config is a JSON installer with **create-if-missing** semantics:
`~/.cursor/hooks.json` is optional, and is a **separate file** from Cursor's
`settings.json` (editor preferences) — this shim never touches your editor
prefs.

> **Not hook parity with claude-code.** Cursor renames the four lifecycle
> events and **degrades two** of them. See the Capture fidelity table below.

## Install

```bash
npx @waggle/hive-mind-hooks-cursor install
# Windows / production: pin the CLI path
npx @waggle/hive-mind-hooks-cursor install --cli-path "C:\\path\\to\\hive-mind-cli\\dist\\index.js"
```

The installer additively merges four hook groups into `~/.cursor/hooks.json`
(creating the file with a `{ "version": 1, "hooks": {} }` skeleton if absent),
preserving any existing hooks you have, and writes a pointer + byte-identical
backup so uninstall is exact.

> **Restart required.** Editing `hooks.json` needs a Cursor restart for the
> hooks to take effect. After installing, restart Cursor.

```bash
npx @waggle/hive-mind-hooks-cursor verify     # smoke-check
npx @waggle/hive-mind-hooks-cursor uninstall  # byte-identical restore (or remove if we created it)
```

## Capture fidelity

| Lifecycle | Cursor event | Status | Notes |
|---|---|---|---|
| SessionStart (recall + inject) | `sessionStart` | full | injects recalled frames via `{ additional_context }` (cursor's inject shape) |
| UserPromptSubmit (save temporary) | `beforeSubmitPrompt` | **degraded — save-only** | persists the prompt as a temporary frame; **cannot inject** context (stdout is only `{ continue, user_message }`) |
| Stop (summarize + save) | `stop` | full (transcript-sourced) | the completed turn is read from the base `transcript_path` field (not inline); the reader fails open when transcripts are disabled |
| PreCompact (compact memory) | `preCompact` | **degraded — observational** | cannot block/reorder, so `cleanup_frames` runs **best-effort / fire-and-forget**, not guaranteed before host truncation |

**Degraded events disclosed:**

- `beforeSubmitPrompt` is **save-only** — it persists your prompt but cannot
  inject recalled memory back into the prompt (hive-mind's UserPromptSubmit
  only persists, so this is fully compatible).
- `preCompact` is **observational only** — `compact_memory` runs best-effort
  and is not guaranteed to run before Cursor truncates context.
- `stop` reads the completed turn from `transcript_path` (off disk). When
  Cursor transcripts are disabled the field is absent; the Stop hook then
  saves an empty-response frame and exits 0 (fail-open).

## How it works

Each hook is a short-lived Node subprocess. Cursor pipes the event JSON to the
hook's stdin; the hook shells to `hive-mind-cli` to recall or save frames, then
exits 0. **Fail-open:** if `hive-mind-cli` is unreachable or the payload is
malformed, the hook logs to stderr and exits 0 — Cursor is never blocked.

License: Apache-2.0.
