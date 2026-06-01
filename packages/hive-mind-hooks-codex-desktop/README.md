# @waggle/hive-mind-hooks-codex-desktop

Silent-capture shim that wires **OpenAI Codex Desktop** lifecycle hooks into
[hive-mind](https://github.com/marolinik/hive-mind) frames. Codex Desktop shares
the **same `~/.codex/` config root** as the Codex CLI — there is no separate
codex-desktop config directory — so this package is a **thin re-export of
[`@waggle/hive-mind-hooks-codex`](../hive-mind-hooks-codex)**. Install / uninstall
/ verify behave **identically** and write into the same `~/.codex/hooks.json` +
pointer (`~/.codex/hive-mind-install.json`).

It exists as a distinct package so the dependency graph + OSS subtree-split see
the package boundary, and so the launcher's `hookPackageFor('codex-desktop')`
resolves to this package.

## Install

```bash
npx @waggle/hive-mind-hooks-codex-desktop install
# Windows / production: pin the CLI path
npx @waggle/hive-mind-hooks-codex-desktop install --cli-path "C:\\path\\to\\hive-mind-cli\\dist\\index.js"
```

The installer additively merges four hook groups into `~/.codex/hooks.json`
(creating the file if absent), preserving any existing hooks you have, and
writes a pointer + byte-identical backup so uninstall is exact. This is the
**same file** the Codex CLI shim writes — installing one is installing the other.

> **One-time trust step.** Non-managed Codex hooks require a one-time `/hooks`
> trust before they execute. After installing, run `/hooks` in Codex once to
> trust the hive-mind hooks.

```bash
npx @waggle/hive-mind-hooks-codex-desktop verify     # smoke-check + surface admin lockdown
npx @waggle/hive-mind-hooks-codex-desktop uninstall  # byte-identical restore (or remove if we created it)
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

> **Runtime-verification note.** The **Codex CLI definitely fires** these hooks
> (the shared `~/.codex/hooks.json` is the CLI's own hook surface). Whether the
> Codex **Desktop App** honors the same `~/.codex/hooks.json` is **doc-asserted
> and still needs runtime verification on a real App install**. If you run the
> desktop App, confirm capture lands in your hive-mind frames after a session.

## How it works

This package re-exports the codex installer surface
(`export * from '@waggle/hive-mind-hooks-codex'`); the `codex-desktop-hooks` bin
delegates to the codex `install` / `uninstall` / `verify`. The compiled hook
scripts live in the codex package's `dist/hooks/` (resolved by the codex
installer's own module URL), so codex-desktop ships no duplicate hook bodies.

Each hook is a short-lived Node subprocess. Codex pipes the event JSON to the
hook's stdin; the hook shells to `hive-mind-cli` to recall or save frames, then
exits 0. **Fail-open:** if `hive-mind-cli` is unreachable or the payload is
malformed, the hook logs to stderr and exits 0 — Codex is never blocked.

License: Apache-2.0.
