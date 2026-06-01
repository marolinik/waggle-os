# @waggle/hive-mind-hooks-hermes

Silent-capture shim that wires **Hermes** (`NousResearch/hermes-agent`)
lifecycle hooks into [hive-mind](https://github.com/marolinik/hive-mind)
frames. Every Hermes session deterministically captures session-start /
prompt / response events into your personal memory via `hive-mind-cli` — the
same every-turn pattern proven by `@waggle/hive-mind-hooks-claude-code`, built
on the shared `@waggle/hive-mind-hooks-core` foundation.

Hermes's hook config is a **YAML installer** with **create-if-missing**
semantics. It targets the **SHELL-HOOKS** system — the top-level `hooks:`
block in `~/.hermes/config.yaml`. It does **not** touch Hermes's two other
"hooks" systems (the directory-based gateway hooks under `~/.hermes/hooks/`,
or the in-process plugin hooks) — only the shell-hooks block.

> **Not hook parity with claude-code.** Hermes ships **only 3 lifecycle
> hooks** — there is **no PreCompact event** — and splits SessionStart across
> two events. See the Capture fidelity table below.

## Install

```bash
npx @waggle/hive-mind-hooks-hermes install
# Windows / production: pin the CLI path
npx @waggle/hive-mind-hooks-hermes install --cli-path "C:\\path\\to\\hive-mind-cli\\dist\\index.js"
```

The installer additively merges hive-mind shell-hook entries into
`~/.hermes/config.yaml` (creating the file if absent), preserving any existing
hooks you have, and writes a pointer + **literal byte-identical backup** so
uninstall is exact. (YAML re-serialization loses comments and key ordering, so
uninstall restores the original bytes rather than a re-serialized diff.)

> **Headless / gateway consent (IMPORTANT).** Hermes keeps a first-use consent
> allow-list keyed on the exact hook command string. Under a **headless /
> non-TTY launch** the hooks register **only** if `hooks_auto_accept: true` is
> in the config (the installer seeds this by default) **or**
> `HERMES_ACCEPT_HOOKS=1` is set — otherwise they silently never register.
> Pass `--no-auto-accept` to manage consent yourself.

```bash
npx @waggle/hive-mind-hooks-hermes verify     # smoke-check
npx @waggle/hive-mind-hooks-hermes uninstall  # byte-identical restore (or remove if we created it)
```

## Capture fidelity

| Lifecycle | Hermes event(s) | Status | Notes |
|---|---|---|---|
| SessionStart (recall + inject) | `on_session_start` (observer) **+** `pre_llm_call` (`is_first_turn`) | full (split) | observer side is a no-op; inject side fires on the first turn only and appends `{ "context": "..." }` to the user message (not the system prompt — preserves the prefix cache) |
| UserPromptSubmit (save temporary) | `pre_llm_call` | full | the user text arrives at `extra.user_message`; saved every turn |
| Stop (summarize + save) | `post_llm_call` | full | the assistant text arrives at `extra.assistant_response`; `on_session_finalize` is gateway-only and is **not** used |
| PreCompact (compact memory) | **— (none)** | **opt-in approximation** | Hermes ships **no compaction hook** (`VALID_HOOKS` has no compact entry) — there is genuinely nothing to bind. Set `WAGGLE_HERMES_COMPACT_ON_STOP=1` (default off) to approximate it from the per-turn Stop hook, time-gated by `WAGGLE_HERMES_COMPACT_WINDOW_MIN` (minutes, default 10) so it runs at most once per window |

**Disclosures:**

- **No PreCompact event at all.** Hermes has no compaction hook, so the
  `cleanup_frames` maintenance step that claude-code runs on PreCompact does
  **not** run under Hermes by default. Memory still accrues correctly; only the
  periodic compaction nudge is absent. **Opt-in:** set
  `WAGGLE_HERMES_COMPACT_ON_STOP=1` to approximate it from the per-turn Stop
  hook, time-gated by `WAGGLE_HERMES_COMPACT_WINDOW_MIN` (minutes, default 10)
  so the maintenance pass fires at most once per window.
- **SessionStart is split** across `on_session_start` (observer) and
  `pre_llm_call` (inject). One compiled script is registered under both; it
  gates injection on `is_first_turn` so it injects once per session, not every
  turn.
- **Block/inject is via stdout JSON**, not exit codes — Hermes has no
  exit-code-2 contract. Our hooks are capture-only: they emit `{}` (or the
  SessionStart `{ "context": ... }`) and exit 0.
- **Headless consent** — without `hooks_auto_accept: true` (seeded by default)
  or `HERMES_ACCEPT_HOOKS=1`, the hooks silently never register under a
  headless launch.

## How it works

Each hook is a short-lived Node subprocess. Hermes spawns the configured
`command` (`shlex.split` + `shell=False`), pipes the event JSON to the hook's
stdin, and reads optional JSON back from stdout. The hook shells to
`hive-mind-cli` to recall or save frames, then exits 0. **Fail-open:** if
`hive-mind-cli` is unreachable or the payload is malformed, the hook logs to
stderr and exits 0 — Hermes is never blocked.

License: Apache-2.0.
