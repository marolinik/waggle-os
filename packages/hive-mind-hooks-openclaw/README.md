# @waggle/hive-mind-hooks-openclaw

> **Roadmap-only in the current Waggle Windows Solo release.** This package is
> retained for development and future qualification. The production manifest
> does not expose OpenClaw launch, hook installation, Fleet/task dispatch, or
> direct agent runs. The implementation notes below do not override that gate.

Silent-capture shim that wires **OpenClaw** (`openclaw/openclaw`) gateway
lifecycle hooks into [hive-mind](https://github.com/marolinik/hive-mind)
frames. Every OpenClaw conversation deterministically captures
bootstrap / inbound-message / outbound-message events into your personal memory
via `hive-mind-cli` — the same every-turn pattern proven by
`@waggle/hive-mind-hooks-claude-code`, built on the shared
`@waggle/hive-mind-hooks-core` foundation.

OpenClaw is the exception in the hook portfolio: its hooks are **in-process
TypeScript**, not stdin-JSON subprocesses. A hook is a **directory**
`~/.openclaw/hooks/hive-mind/{HOOK.md, handler.js}` that the gateway discovers
and dynamically `import()`s, running the default export inside its own Node
event loop. So the installer writes that managed directory and **minimally
touches** the JSON5 config (`~/.openclaw/openclaw.json`) — it does **not**
re-serialize the whole config (that would destroy your comments and trailing
commas).

> **Not hook parity with claude-code.** OpenClaw's Stop event (`message:sent`)
> fires **0..N times per turn** and is **non-replyable**, so Stop is
> **debounced**. There is no single per-turn "agent finished one reply"
> internal event. See the Capture fidelity table below.

## Install

```bash
npx @waggle/hive-mind-hooks-openclaw install
# Windows / production: pin the CLI path
npx @waggle/hive-mind-hooks-openclaw install --cli-path "C:\\path\\to\\hive-mind-cli\\dist\\index.js"
```

The installer:

1. writes the managed hook dir `~/.openclaw/hooks/hive-mind/{HOOK.md, handler.js}`
   (the compiled handler is **copied** from this package's `dist/`),
2. minimally edits `~/.openclaw/openclaw.json` — flips
   `hooks.internal.enabled = true` and adds
   `hooks.internal.entries["hive-mind"] = { enabled: true }` (creating the file
   if absent),
3. writes a pointer + **literal byte-identical backup** so uninstall is exact.

> **Activation (IMPORTANT).** OpenClaw internal hooks are **OFF** until the
> subsystem is enabled. The installer sets `hooks.internal.enabled: true`; if
> that is not honored on your install, run `openclaw hooks enable hive-mind`.

```bash
npx @waggle/hive-mind-hooks-openclaw verify     # smoke-check
npx @waggle/hive-mind-hooks-openclaw uninstall  # remove managed dir + byte-identical restore
```

Reversibility relies on the **literal byte-identical backup** of `openclaw.json`
(JSON5 re-serialization loses comments / trailing commas), plus removal of the
managed hook directory recorded in the pointer. If the config did not pre-exist,
uninstall removes the file we created (no orphans, no leftover backup).

## Capture fidelity

| Lifecycle | OpenClaw event | Status | Notes |
|---|---|---|---|
| SessionStart (recall + inject) | `agent:bootstrap` | full | injects by **mutating** `event.context.bootstrapFiles` (a mutable array the gateway reads back), not stdout — the sanctioned inject seam |
| UserPromptSubmit (save temporary) | `message:received` | full | inbound message; the text arrives at `context.content`, with `from` / `channelId` |
| Stop (summarize + save) | `message:sent` | **degraded (debounced)** | fires **0..N per turn** and is **non-replyable**; the handler debounces (last `message:sent` of a turn wins) so a multi-payload turn saves one frame |
| PreCompact (compact memory) | `session:compact:before` | full | the runtime `event.action` is `compact:before` (the `session:` prefix is HOOK.md-only); the handler matches on the action suffix |

**Disclosures:**

- **Stop is `message:sent`, 0..N per turn, non-replyable.** OpenClaw delivers
  one `message:sent` per outbound payload, so a turn that streams multiple
  payloads fires multiple times. The handler debounces (a short timer keyed on
  the session/channel) so only the last payload of a turn is saved. There is no
  single per-turn finalization event. (`before_agent_finalize` is a **plugin**
  hook — a different subsystem — and is deliberately not used.)
- **`handler.js` must resolve `@waggle/*` at runtime (live-install caveat).**
  The installed `~/.openclaw/hooks/hive-mind/handler.js` `require`s this
  package's runtime deps (`@waggle/hive-mind-shim-core` /
  `@waggle/hive-mind-hooks-core`). Whether the OpenClaw gateway can `import()` a
  file that resolves those node_modules on a real OpenClaw install is the **one
  remaining needs-a-live-install validation** — on a normal `npx`/npm install
  the deps are colocated and resolve, but a hand-copied dir without the package
  tree will not. Pin `--cli-path` for the CLI itself; the gateway's TS/JS loader
  must reach the package's `node_modules`.
- **Gateway double-capture (known v0.1.0 limitation).** OpenClaw can drive
  claude-code / codex as **backends**. If those backends ALSO have hive-mind
  hooks installed, the same conversation is captured twice — once at the
  OpenClaw gateway layer (this package) and once at the backend. This package
  **stamps a provenance marker** (`openclaw-gateway` + the channel/session key)
  on every frame it saves so gateway captures are attributable, but it does
  **not** yet dedup the cross-process double-capture (that is a harder
  cross-process problem). A content-hash dedup heuristic is deferred to a
  fast-follow.

## How it works

OpenClaw loads the default export from
`~/.openclaw/hooks/hive-mind/handler.js` and dispatches its subscribed events
to it **in-process**. The handler maps `event.context` into the shared
lifecycle payload shapes and drives the same recall / save / summarize /
compact bodies the other hooks use, shelling to `hive-mind-cli` via
`@waggle/hive-mind-shim-core`'s `CliBridge`. **Fail-open:** the default export
never throws and never rejects — on any error it resolves silently, so the
gateway flow is never affected.

License: Apache-2.0.
