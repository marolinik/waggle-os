# @waggle/hive-mind-hooks-codex

Silent-capture shim that wires **OpenAI Codex** lifecycle hooks into
[hive-mind](https://github.com/marolinik/hive-mind) frames. Every Codex
session deterministically captures SessionStart / UserPromptSubmit / Stop /
PreCompact events into your personal memory via `hive-mind-cli` — the same
every-turn pattern proven by `@waggle/hive-mind-hooks-claude-code`, built on
the shared `@waggle/hive-mind-hooks-core` foundation.

This is the **second reference shape** for the hook portfolio: a CC-clone JSON
installer with **create-if-missing** semantics (Codex's `~/.codex/hooks.json`
is optional, unlike CC's `settings.json`).

## Install

```bash
npx @waggle/hive-mind-hooks-codex install
# Windows / production: pin the CLI path
npx @waggle/hive-mind-hooks-codex install --cli-path "C:\\path\\to\\hive-mind-cli\\dist\\index.js"
```

The installer additively merges four hook groups into `~/.codex/hooks.json`
(creating the file if absent), preserving any existing hooks you have, and
writes a pointer + byte-identical backup so uninstall is exact.

> **One-time trust step.** Non-managed Codex hooks require a one-time `/hooks`
> trust before they execute. After installing, run `/hooks` in Codex once to
> trust the hive-mind hooks.

```bash
npx @waggle/hive-mind-hooks-codex verify     # smoke-check + surface admin lockdown
npx @waggle/hive-mind-hooks-codex uninstall  # byte-identical restore (or remove if we created it)
```

`verify` also surfaces the admin lockdown `allow_managed_hooks_only = true`
(in `~/.codex/requirements.toml`), which suppresses user hooks so install would
silently no-op.

## Capture fidelity

| Lifecycle | Codex event | Status | Notes |
|---|---|---|---|
| SessionStart (recall + inject) | `SessionStart` | full | matcher `startup\|resume\|clear\|compact`; injects recalled frames as additional context |
| UserPromptSubmit (save temporary) | `UserPromptSubmit` | full | persists the prompt as a temporary frame |
| Stop (summarize + save) | `Stop` | full | reads `last_assistant_message` in the response fallback; saves an important/critical frame |
| PreCompact (compact memory) | `PreCompact` | full | carries `trigger` (`manual\|auto`); runs `cleanup_frames` before truncation |

**Full parity** with claude-code — no degraded or absent events. The only
non-silent step is the one-time `/hooks` trust step above (an install-UX step,
not a degraded event).

## How it works

Each hook is a short-lived Node subprocess. Codex pipes the event JSON to the
hook's stdin; the hook shells to `hive-mind-cli` to recall or save frames, then
exits 0. **Fail-open:** if `hive-mind-cli` is unreachable or the payload is
malformed, the hook logs to stderr and exits 0 — Codex is never blocked.

License: Apache-2.0.
