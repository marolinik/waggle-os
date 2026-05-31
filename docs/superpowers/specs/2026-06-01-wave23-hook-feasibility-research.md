# Wave 2/3 Hook Feasibility — Porting the hive-mind claude-code hook package to 6 other AI tools

**Date:** 2026-06-01
**Author:** Synthesis from 6 per-tool feasibility research passes
**Status:** Scoping brief — gates a human go/no-go + ordering decision
**Reference package:** `packages/hive-mind-hooks-claude-code` (Wave 1, shipped)
**Targets:** `cursor`, `claude-desktop`, `codex`, `codex-desktop`, `hermes`, `openclaw` (all currently `export {}` stubs)

---

## 0. TL;DR

Five of six tools have a real, deterministic lifecycle-hook surface and can reuse ~80% of the Wave 1
package (shim-core + the four handler bodies + the runHook stdin/stdout/exit-0 contract). The per-tool
work is almost entirely confined to **three install-layer modules** — `paths.ts`, `settings-merger.ts`,
`install.ts` (+ matching `uninstall.ts`/`verify.ts`) — plus payload-field remapping in the handlers.

The single outlier is **Claude Desktop**: it has **no lifecycle hook API at all**. It is not a hook port;
it is an MCP-server registration that yields only voluntary, model-initiated, on-demand capture — strictly
weaker than the every-turn deterministic capture the Wave 1 hook gives. Build it (the MCP server already
exists in `packages/memory-mcp`) but label it honestly as "MCP-bridge, partial capture."

**Codex + Codex Desktop should be ONE package** — they share `~/.codex/` entirely.

---

## 1. Comparison Matrix

| Tool | What it is | Config surface | SessionStart | UserPromptSubmit | Stop | PreCompact | Tier | Confidence |
|---|---|---|---|---|---|---|---|---|
| **Cursor** | AI-native VS Code-fork editor; first-party Hooks since v1.7 | `~/.cursor/hooks.json` (JSON, `{version,hooks:{event:[...]}}`) | native (`sessionStart`, `additional_context` inject) | native (`beforeSubmitPrompt`; save-only, **no inject**) | native (`stop`; turn read via `transcript_path`) | approx (`preCompact`; observational, can't block) | near-direct port | high |
| **Codex CLI** | OpenAI terminal coding agent; stable hooks mirror CC schema | `~/.codex/hooks.json` (JSON, `{hooks:{Event:[{matcher,hooks:[...]}]}}`) | native (`SessionStart`, `additionalContext`) | native (`UserPromptSubmit`, `prompt`) | native (`Stop`, `last_assistant_message`) | native (`PreCompact`, `trigger`) | near-direct port | high |
| **Codex Desktop** | OpenAI native GUI app; same runtime + same `~/.codex/` as CLI | shared `~/.codex/hooks.json` (identical to Codex CLI) | native | native | native | native (`PostCompact` bonus) | near-direct port (fold into Codex pkg) | high |
| **Hermes Agent** | Nous Research MIT Python self-improving CLI/server agent | `~/.hermes/config.yaml` (**YAML**, `hooks:` block) | native split (`on_session_start` observe + `pre_llm_call` first-turn inject) | native (`pre_llm_call`) | approx (`post_llm_call` per-turn / `on_session_finalize`) | **none** (internal compaction, no hook) | lifecycle-hooks-need-adapter | medium |
| **OpenClaw** | Self-hosted Node "Gateway" bridging chat apps to coding agents | `~/.openclaw/openclaw.json` (**JSON5**) + `~/.openclaw/hooks/<name>/{HOOK.md,handler.ts}` (**in-process TS, not stdin/stdout**) | native (`agent:bootstrap` mutable `bootstrapFiles` / `command:new`) | native (`message:received`) | approx (`message:sent` 0..N/turn / `before_agent_finalize`) | native (`session:compact:before`) | lifecycle-hooks-need-adapter | medium |
| **Claude Desktop** | Anthropic first-party GUI chat app; only extensibility = MCP | `claude_desktop_config.json` `mcpServers` key (macOS `~/Library/Application Support/Claude/`, Win `%APPDATA%\Claude\`) | **none** (MCP tool/prompt, model-discretion) | **none** (raw prompt never handed to server) | **none** (no turn event) | **none** (no host compaction event) | mcp-bridge-only | high |

> "near-direct port" = reuse shim-core + handlers as-is; rewrite only the 3 install-layer modules + payload-field renames.
> "lifecycle-hooks-need-adapter" = all/most lifecycle events exist but the config format (YAML / JSON5+TS-handler) and/or
> registration model differs enough that the install layer is a rewrite and one event is degraded/missing.
> "mcp-bridge-only" = no hook surface; replace the hook package with an MCP-server config patcher; partial capture only.

---

## 2. Per-Tool Detail

### 2.1 Cursor — `near-direct port` — confidence: high

**What it is.** Anysphere's Cursor, an AI-native VS Code-fork desktop app with an Agent/Composer loop and a
`cursor-agent` CLI. Since v1.7 (late 2025, expanded through 2026) it ships a real first-party **Hooks**
feature that runs scripts on agent-loop lifecycle events.

**Config surface.** `~/.cursor/hooks.json` (user-global), plus project `<repo>/.cursor/hooks.json` and enterprise
paths (Win `C:\ProgramData\Cursor\hooks.json`; mac `/Library/Application Support/Cursor/hooks.json`; linux
`/etc/cursor/hooks.json`). Format: `{ "version": 1, "hooks": { "<event>": [ { "command": "node \"<abs>\\dist\\hooks\\<event>.js\"", "type": "command", "timeout": 5 } ] } }`. Each event maps to an **array** of hook
entries → additive append/merge works exactly like the Wave 1 settings.json merge. This is a **separate file**
from `settings.json` (which Cursor uses for editor prefs) — new path constants, same merge/marker/backup logic.
Detection already present: binary candidates + pointer `~/.cursor/hive-mind-install.json` in `HOOK_POINTER_BY_TOOL`.

**Lifecycle mapping.**
- SessionStart → `sessionStart` (new composer conversation); stdout `{additional_context, env}` — directly satisfies recall-and-inject.
- UserPromptSubmit → `beforeSubmitPrompt` (stdin `{prompt, attachments}`); save-only. **Caveat: cannot inject** (stdout only `{continue, user_message}`) — fine, hive-mind's UserPromptSubmit only persists.
- Stop → `stop` (status `completed|aborted|error`, `loop_count`); completed turn read via base field `transcript_path`, not inline — minor handler change.
- PreCompact → `preCompact` (rich usage stats) but **observational only** (stdout `{user_message}`, cannot block/reorder). `compact_memory` runs fire-and-forget; "before host truncates" is best-effort, not guaranteed-before.

**Recommended approach.** Port nearly verbatim. shim-core reusable as-is. `hooks/_shared.ts` ports verbatim
(identical stdin-JSON/stdout-JSON command-hook model). Four handlers port with small field renames (SessionStart
returns `{additional_context}`; UserPromptSubmit reads `stdin.prompt`; Stop summarizes via `base.transcript_path`;
PreCompact shells `compact_memory` best-effort). Rewrite the 3 install modules: `paths.ts` (`hooks.json` target,
keep pointer), `settings-merger.ts` (`HOOK_EVENT_BY_BASENAME = {session-start:'sessionStart',
user-prompt-submit:'beforeSubmitPrompt', stop:'stop', pre-compact:'preCompact'}`; wrap with `version:1` +
`hooks.<event>` arrays; keep `_hiveMindShim` marker), `install.ts` (create `{version:1,hooks:{}}` skeleton if
absent — CC throws if settings.json missing). `type:'command'`, `timeout:5`. ~80% reuse.

**Blockers.**
- `beforeSubmitPrompt` cannot inject context (acceptable — UserPromptSubmit only persists).
- `preCompact` observational only — "run compact_memory BEFORE host truncates" is best-effort.
- Stop reads turn via `transcript_path` (null if transcripts disabled) — handler must tolerate null and fail open.
- `hooks.json` may not exist on fresh install — `install.ts` must create skeleton, not throw.
- Windows `.cmd`-shim exec problem applies — thread `--cli-path` to compiled `hive-mind-cli dist/index.js`.
- Editing `hooks.json` likely needs a Cursor restart (reload semantics unverified across 1.7.x) — surface in install UX.
- Exact `transcript_path` file format undocumented — Stop summarizer must read defensively (don't assume JSONL).

**Sources.** `cursor.com/docs/hooks` (+ `.md`); `blog.gitbutler.com/cursor-hooks-deep-dive`;
`aiengineerguide.com/til/cursor-agent-lifecycle-hooks`; `skywork.ai/blog/how-to-cursor-1-7-hooks-guide`;
repo `packages/{agent,shared}/src/tool-detection.ts`, `packages/hive-mind-hooks-claude-code/**`,
`packages/hive-mind-hooks-cursor/src/index.ts` (stub).

---

### 2.2 Codex CLI — `near-direct port` — confidence: high

**What it is.** OpenAI's terminal coding agent CLI (`codex`), rooted at `~/.codex/config.toml`. As of May 2026 it
ships a **stable** lifecycle-hooks system that deliberately mirrors Claude Code's schema (same event names,
stdin JSON, exit-0 contract, `additionalContext` injection).

**Config surface.** Write a standalone `~/.codex/hooks.json` (JSON), **not** config.toml — keeps us out of the
user's TOML and away from protected `notify`/`profile`/`model_providers` keys. Shape mirrors CC's hooks block:
`{ "hooks": { "SessionStart": [ { "matcher": "startup|resume", "hooks": [ { "type":"command", "command":"node \"<dist>/hooks/session-start.js\" --cli-path \"...\"" } ] } ], "UserPromptSubmit":[...], "Stop":[...], "PreCompact":[...] } }`.
Hooks across config layers are **additive** (no override) → marker-tagged merge not required for correctness but
kept for byte-identical reversible uninstall. Pointer `~/.codex/hive-mind-install.json` matches `HOOK_POINTER_BY_TOOL`.

**Lifecycle mapping.** All four native and field-compatible with the existing handlers:
- SessionStart (`startup|resume|clear|compact`, `source`); injects via stdout text or `hookSpecificOutput.additionalContext` (exact shape session-start.ts already emits).
- UserPromptSubmit (`prompt`, `turn_id`, `session_id`, `cwd`) — existing handler already parses `prompt`/`session_id`/`cwd`.
- Stop (`last_assistant_message`, `turn_id`, `stop_hook_active`).
- PreCompact (`trigger` = `manual|auto`).

**Recommended approach.** Promote stub to near-verbatim CC clone. Reuse as-is: `@waggle/hive-mind-shim-core`
entirely (tool-agnostic); `src/hooks/{_shared,session-start,user-prompt-submit,stop,pre-compact}.ts` essentially
unchanged (already parse snake_case `session_id`/`prompt`/`cwd`; session-start already emits the
`hookSpecificOutput.additionalContext` Codex honors). Minor edits: set `HookEvent.source` from `'claude-code'`
→ `'codex'`; add codex `last_assistant_message`/`trigger` keys to the existing multi-key `pickStringFromObject`
fallbacks. Rewrite install layer: `paths.ts` (`~/.codex/hooks.json`, pointer `~/.codex/hive-mind-install.json`),
`settings-merger.ts` (`{hooks:{Event:[{matcher,hooks:[...]}]}}`, matcher `"startup|resume|clear|compact"` for
SessionStart / `""` elsewhere, keep `_hiveMindShim` marker), `install.ts`/`uninstall.ts`/`verify.ts` (create
hooks.json if absent; delete-if-created vs restore-backup-if-existed). Keep `--cli-path` Windows quoting verbatim.
`HOOK_EVENT_BY_BASENAME` is identical. **Do NOT use `notify`** — it only fires agent-turn-complete (Stop subset),
JSON on argv not stdin, user-config-only, strictly weaker. Estimate ~1 day, dominated by install/merge/verify + tests.

**Blockers.**
- Field-name casing confirmed from docs but not from a live payload — add codex keys as fallbacks rather than assuming.
- Minimum Codex version shipping stable hooks not pinned ("stable as of May 2026", no version) — verify dynamically; too-old `codex` may silently ignore hooks.json.
- CC installer hard-requires a pre-existing config; codex hooks.json is optional/standalone → `install.ts` must create-if-missing (behavioral fork, not a copy).
- Admin lockdown `allow_managed_hooks_only = true` (requirements.toml) can suppress user hooks — `verify` must surface this so install doesn't silently no-op.

**Sources.** `developers.openai.com/codex/{hooks,config-advanced,config-reference}`;
`github.com/openai/codex/blob/main/docs/config.md`; `github.com/openai/codex/issues/8189`;
repo detection + Wave 1 reference + `packages/hive-mind-shim-core/src/cli-bridge.ts`.

---

### 2.3 Codex Desktop — `near-direct port` (fold into Codex pkg) — confidence: high

**What it is.** OpenAI's native Codex desktop GUI (the "Codex app"), macOS + Windows (Linux waitlisted), running
Codex threads in parallel. **Not a separate engine** — same Codex runtime, same shared `~/.codex/config.toml` as
CLI + IDE extension.

**Config surface.** Registers into the **shared** `~/.codex/` root — identical for CLI, IDE, and App. Use
`~/.codex/hooks.json` (cleaner additive-JSON merge) or inline `[[hooks.<Event>]]` TOML in config.toml. JSON shape:
`{"hooks":{"<Event>":[{"matcher":"*","hooks":[{"type":"command","command":"node \"<dist>/hooks/<event>.js\"","commandWindows":"...","timeout":600}]}]}}`.
**Non-managed hooks require one-time user trust via the `/hooks` command** (trust keyed by hook hash) before they execute.

**Lifecycle mapping.** SessionStart / UserPromptSubmit / Stop / PreCompact all native (PostCompact bonus); JSON on stdin.

**Recommended approach.** Build **ONE** `@waggle/hive-mind-hooks-codex` package serving **both** `codex` (CLI) and
`codex-desktop` (App) — they share `~/.codex/` entirely, so a separate codex-desktop installer is redundant. Make
`hive-mind-hooks-codex-desktop` a thin re-export, or key one installer on the shared config root for both ToolIds.
Port as in §2.2. **Also fix `tool-detection.ts`:** the current `codexDesktopCandidatePaths` are speculative/wrong
(`%LOCALAPPDATA%/OpenAI/Codex.exe`, `/Applications/Codex.app/...`; source comment admits "unreleased at time of
writing"). Prefer **config-presence detection at `~/.codex/`** over guessing the binary; correct
`HOOK_POINTER_BY_TOOL['codex-desktop']` from `'.config/Codex/...'` → `'.codex/hive-mind-install.json'`. Add a
post-install note to run `/hooks` once to trust.

**Blockers.**
- Non-managed hooks are **not auto-trusted** — install is not fully silent; surface "run `/hooks` to trust" (enterprise `requirements.toml` managed hooks bypass trust but that's an org path).
- App settings page doesn't mention hooks; only the general `/codex/hooks` doc asserts the App honors them — runtime verification on an actual App install needed (CLI definitely fires).
- On-disk desktop paths undocumented (mac `.dmg`, Win Microsoft Store `9PLM9XGG6VKS`, Linux unreleased) — replace hardcoded guesses with config-presence detection.
- Stop exit-2 "continues with stderr as a new prompt" (not a hard block) — harmless for fail-open exit-0 capture; ensure ported handler never writes stderr+exit-2.

**Sources.** `developers.openai.com/codex/{hooks,app/settings,ide/settings,config-reference,app,changelog}`;
repo detection (speculative paths, wrong pointer) + `packages/hive-mind-hooks-codex-desktop/src/index.ts` (stub) + Wave 1 reference.

---

### 2.4 Hermes Agent — `lifecycle-hooks-need-adapter` — confidence: medium

**What it is.** Hermes Agent by Nous Research — a real MIT-licensed Python self-improving CLI/server agent (the
`hermes` binary, config under `~/.hermes/`). **NOT** the Nous Hermes LLM model. Confirmed target by
`docs/addictiveness-audit-2026-05-28/BENCHMARK-hermes.md`.

**Config surface.** Config-driven YAML shell hooks in `~/.hermes/config.yaml` under a top-level `hooks:` block (no
Python required). Each event key → list of `{ command, matcher?, timeout? (default 60, max 300) }`. Scripts get
JSON on stdin, return JSON on stdout (`{"context":"..."}` to inject, `{"decision":"block",...}`, or `{}` for no-op)
— nearly identical to the hive-mind contract. Hooks live by convention under `~/.hermes/agent-hooks/`. Pointer
`~/.hermes/hive-mind-install.json` already expected.

**Lifecycle mapping.**
- SessionStart → **split**: `on_session_start` (observer-only, no injection) for "switch workspace" + `pre_llm_call` with `is_first_turn=true` (returns `{context:...}`) for "inject recalled frames."
- UserPromptSubmit → `pre_llm_call` (fires once/turn before tool loop; `user_message`/`conversation_history`/`is_first_turn`) — fire-and-forget save.
- Stop → `post_llm_call` (after tool loop, `assistant_response`) for the per-turn important-frame summary; optionally `on_session_finalize` for end-of-session flush.
- PreCompact → **none**. Hermes compacts internally (preflight >50% ctx, gateway auto-compress >85%) and flushes memory to disk first, but exposes **no hook** at that boundary. Approximate via opportunistic `compact_memory` from the Stop handler.

**Recommended approach.** Config-driven YAML shell-hook installer — cleanest target after CC itself. Reuse as-is:
`@waggle/hive-mind-shim-core` + the four handler bodies (same stdin-JSON/stdout-JSON, exit-0/fail-open contract;
port with payload-field remapping via `pickStringField`, e.g. `user_message`/`is_first_turn`/`session_id`).
Rewrite the install trio: `paths.ts` (`~/.hermes/`, `config.yaml`, pointer), `settings-merger.ts` (**YAML** merge
keyed by `{on_session_start, pre_llm_call, post_llm_call}`; add a YAML parser dep e.g. `yaml`; additive +
marker-tagged + preserve user hooks), `install.ts` (read-or-create — config may not exist; timestamped
byte-identical backup + reversible uninstall). Wire: SessionStart→`on_session_start` (+ `pre_llm_call`/first-turn
inject), UserPromptSubmit→`pre_llm_call`, Stop→`post_llm_call`. **Drop the 4th hook** (no PreCompact — document the
gap, don't invent). Finally add `'hermes'` to `HOOKS_COHORT` in `tool-launcher.ts` and ship a real bin (currently stub).

**Blockers.**
- No PreCompact-equivalent — 4th hook cannot be ported, only approximated by opportunistic `compact_memory` from Stop.
- Config is YAML, not JSON — YAML round-trip is not byte-identical for re-serialized output; mitigate by keeping a literal backup for uninstall rather than diff-merge fidelity.
- Existing pkg is a binless `export {}` stub and `'hermes'` is excluded from `HOOKS_COHORT` — both must change.
- Context-injection asymmetry: `on_session_start` is observer-only; injection rides `pre_llm_call(is_first_turn)` → SessionStart handler must split into two registrations.
- **Source-level unverified:** the exact `VALID_HOOKS` allow-list for shell hooks (vs Python plugin hooks); docs-only, not read from implementation. Benchmark doc's star/version figures (170k stars, v0.14.0) read as possibly aspirational, unconfirmed.
- Windows is early-beta (Linux/macOS/WSL2 first-class); Python-installed binary → PATH detection + launch UX weaker on Windows.

**Sources.** `hermes-agent.nousresearch.com/docs/{user-guide/features/hooks, developer-guide/agent-loop,
user-guide/features/skills, guides/build-a-hermes-plugin}`; `github.com/NousResearch/hermes-agent` (+ hooks.md);
repo detection + launcher + `docs/addictiveness-audit-2026-05-28/BENCHMARK-hermes.md` + Wave 1 reference.

---

### 2.5 OpenClaw — `lifecycle-hooks-need-adapter` — confidence: medium

**What it is.** A self-hosted Node "Gateway" (Peter Steinberger / community, `github.com/openclaw/openclaw`)
bridging messaging surfaces (Discord, Slack, Telegram, WhatsApp, iMessage, …) to AI coding agents. CLI +
long-running daemon, **not** a CC fork or IDE, but it has its own `openclaw` CLI and a real internal hooks system.
Binary name + `~/.openclaw` config dir verified correct; detector carries no model of the hooks subsystem.

**Config surface.** `~/.openclaw/openclaw.json` (**JSON5** — comments + trailing commas). Register hooks two ways:
(1) discovery-based (preferred) — drop `~/.openclaw/hooks/<name>/` with `HOOK.md` + `handler.ts`, or point
`hooks.internal.load.extraDirs:["<abs>"]` at an external dir; enable via `openclaw hooks enable <name>`. (2) legacy
`hooks.internal.handlers[]` (deprecated). Internal-hooks shape:
`{ "hooks": { "internal": { "enabled": true, "entries": { "<name>": {"enabled":true,"env":{...}} }, "load": {"extraDirs":[...]} } } }`.
**Handlers are in-process TypeScript** (`export default async (event)=>{...}`) — but MAY shell out
(`execFileAsync("openclaw",[...])`), so a hive-mind handler can spawn `hive-mind-cli` like CliBridge does.
(Distinct from the HTTP-webhook `hooks.{enabled,token,path,mappings}` block — a different subsystem.)

**Lifecycle mapping.**
- SessionStart → `agent:bootstrap` (fires before workspace bootstrap files injected; exposes a **mutable `bootstrapFiles` array** — first-class injection seam ≈ CC `additionalContext`) or `command:new` (on `/new`); `gateway:startup` is process-level.
- UserPromptSubmit → `message:received` (every inbound channel message before agent processes; `from`/`content`/`channelId`/`metadata`) — direct save-prompt analogue.
- Stop → **approx**. No single per-turn Stop. `message:sent` fires per delivered outbound reply (0..N/turn); or `before_agent_finalize` inspects the final answer during finalization. Maps onto `message:sent` but turn boundaries are looser.
- PreCompact → `session:compact:before` (`messageCount`, `tokenCount`); `session:compact:after` reports before/after — direct PreCompact analogue, ideal `compact_memory` point.

**Recommended approach.** Real integration via OpenClaw's **internal** hooks (all 4 events exist). Reuse
`@waggle/hive-mind-shim-core` as-is (CliBridge/logger/workspace-resolver/prompt-summarizer/importance-classifier/
frame-encoder all tool-agnostic). The four handler bodies port **in spirit** but must be **re-authored as OpenClaw
handler.ts modules** (`export default async (event) => {...}` switching on `event.type`/`event.action`, not reading
stdin JSON). Mapping: `agent:bootstrap` (push recalled frames into mutable `bootstrapFiles`) or `command:new` →
SessionStart; `message:received` → save temp frame; `message:sent`/`before_agent_finalize` → summarize+save;
`session:compact:before` → `compact_memory`. Rewrite the registration trio: `paths.ts` (`~/.openclaw/` +
`~/.openclaw/hooks/<name>/`), `settings-merger.ts` (discovery-based: write hook **directories** with
`HOOK.md`+`handler.ts` and/or merge `hooks.internal.load.extraDirs` into JSON5 openclaw.json — **no** command-array
to splice), `install.ts` (back up openclaw.json, patch `hooks.internal`, `openclaw hooks enable`, drop the pointer,
byte-identical reversible uninstall). Keep fail-open as **try/catch inside the handler** (not `process.exit(0)`).

**Blockers.**
- No per-turn Stop — `message:sent` is 0..N/turn, `before_agent_finalize` is a plugin-hook → need a debounce/dedup or "last message:sent of a turn" heuristic.
- Registration model incompatible with the reference: discovery-based TS handler files + JSON5, not a settings.json command-array → install trio is a **rewrite, not a parameterization**.
- JSON5 (comments + trailing commas) — naive `JSON.parse/stringify` destroys user comments; need JSON5-aware merge or restrict edits to writing hook dirs + minimal `extraDirs`.
- Handlers are in-process TS loaded by the gateway → fail-open contract becomes "default-exported async handler that must not throw," not "thin stdin script, exit 0."
- **Unverified:** exact `handler.ts` event TS type, whether `execFileAsync` is reliable under the gateway loop, whether `openclaw hooks enable` is required vs auto-discovery, and whether `bootstrapFiles` mutation is the sanctioned injection path vs `command:new` (docs prose + one example, not source-read).
- OpenClaw drives arbitrary backend coding agents (incl. claude-code/codex) → gateway-layer capture may **double-count** if the backend also has hive-mind hooks → needs a provenance/dedup story.

**Sources.** `docs.openclaw.ai/{automation/hooks, gateway/configuration-reference, cli/agent}`; `openclaw.ai`;
`github.com/openclaw/openclaw` (PR #9761 hooks, Issue #3336); milvus.io overview; repo detection + stub.

---

### 2.6 Claude Desktop — `mcp-bridge-only` — confidence: high

**What it is.** Anthropic's first-party GUI desktop chat app for macOS + Windows (no official Linux client as of
2026). A desktop app — **not** a CLI or IDE. Its **only** extensibility surface is MCP servers (via
`claude_desktop_config.json`) and one-click `.mcpb`/`.dxt` Desktop Extension bundles. **There is no hooks/settings.json surface.**

**Config surface.** `claude_desktop_config.json` — macOS `~/Library/Application Support/Claude/`, Windows
`%APPDATA%\Claude\`. Integration goes under top-level `"mcpServers"`:
`{ "mcpServers": { "hive-mind": { "command":"node", "args":["<memory-mcp dist/index.js>"], "env":{"HIVE_MIND_WORKSPACE_ID":"..."} } } }`.
stdio transport for local servers; Streamable HTTP for remote. Alternative packaging: an `.mcpb` bundle (manifest
spec 0.3) for drag-into-Settings install. **Note:** `HOOK_POINTER_BY_TOOL['claude-desktop'] = '.config/Claude/...'`
is **WRONG** — not a real Claude Desktop config dir on any platform; needs fixing if a real installer ships.

**Lifecycle mapping.** **All four → none.** No SessionStart event (only a startup prompt Claude *may* invoke —
model-discretion, non-deterministic). No per-prompt hook (raw prompt never handed to the server on submit, so
"save every prompt" is impossible). No Stop/turn-completed event (no deterministic turn summarization). No exposed
compaction lifecycle (`compact_memory` only via manual or Waggle cron, never host-driven). The `.mcpb` manifest 0.3
exposes only tools/resources/prompts — **no event-handler field** — so a bundle can't register handlers either.

**Recommended approach.** **Do NOT port the hook shim** — there is nothing to register into. Replace the hooks
package with an **MCP-bridge installer**. **Critical reuse:** Waggle already ships the exact server —
`packages/memory-mcp` (`src/index.ts` + `tools/{memory,awareness,identity,harvest,ingest,knowledge,wiki,workspace}.ts`
+ `resources/memory.ts`) exposes the full hive-mind tool surface (`recall_memory`, `save_memory`, …) as a stdio MCP
server. So the integration is a **thin config patcher**, not a new server: (1) port `paths.ts` → resolve the **real**
config path (mac `~/Library/Application Support/Claude/claude_desktop_config.json`, Win `%APPDATA%\Claude\...`) —
rewrite, don't reuse the wrong `.config/Claude` pointer. (2) New settings-merger → additively merge an entry under
`mcpServers` (not `hooks`), marker-tag for reversible uninstall; the immutable-merge + timestamped-backup +
pointer-file + byte-identical-uninstall **shape** ports cleanly even though the target key changes. (3) shim-core is
**mostly NOT reusable** — CliBridge/runHook/readStdin/hook-handler scaffolding is dead weight; only the generic
logger and the backup/pointer filesystem pattern carry over. (4) Optionally also produce an `.mcpb` bundle for
one-click install. **Honest §10/README framing:** this captures **memory on-demand** (Claude voluntarily calling
`recall_memory`/`save_memory`) — strictly weaker than the every-turn deterministic capture of the CC shim. Mark the
package "MCP-bridge, partial capture," do not imply hook parity.

**Blockers.**
- No lifecycle hook/event API — the 4-hook automatic-capture model is fundamentally unportable.
- MCP context is model-initiated, not server-pushed — no deterministic SessionStart inject, no raw prompt on submit, no turn on Stop → silent/automatic capture impossible.
- `.mcpb` manifest 0.3 exposes only tools/resources/prompts (no lifecycle field) — bundles can't register handlers.
- **Existing artifact conflict:** `HOOK_POINTER_BY_TOOL` uses a non-existent `.config/Claude/...` dir → detector's hook-installed check would be wrong; fix if a real installer ships.
- **Redundancy risk:** `packages/memory-mcp` already provides the server → a separate hooks-claude-desktop package is mostly a config patcher. **Confirm with PM** whether to keep it as a package or fold the install into the existing launcher/MCP-registration flow before building.
- PreCompact/`compact_memory` can't tie to host compaction — needs Waggle-side cron, out of band.

**Sources.** `support.claude.com/.../local-mcp-servers-on-claude-desktop`;
`anthropic.com/engineering/desktop-extensions`; `github.com/modelcontextprotocol/mcpb`;
`blog.modelcontextprotocol.io/posts/2025-11-20-adopting-mcpb`; `mcpbundles.com/docs/concepts/mcpb-files`;
`code.claude.com/docs/en/hooks` (CC hooks ≠ desktop app); `github.com/desktop/desktop/issues/22138`;
repo detection (wrong pointer) + `packages/memory-mcp/**` + stub.

---

## 3. Implementation Tiers

### Tier A — `near-direct port` (reuse shim-core + handlers; rewrite only the 3 install modules + field renames)
**Tools:** Codex CLI, Codex Desktop, Cursor.
**Rationale:** All three have native first-party lifecycle hooks with a stdin-JSON / stdout-JSON / command-hook /
exit-0 model that is structurally identical to the Wave 1 reference. Codex's schema is a deliberate CC clone (events
match exactly); Cursor needs only payload-field renames and a separate `hooks.json` path. Codex CLI + Desktop share
`~/.codex/` and collapse into one package. ~80% reuse, ~1 day each (Codex CLI is the anchor; Desktop is a thin
re-export; Cursor is a parallel clone).

### Tier B — `lifecycle-hooks-need-adapter` (events exist but config format/registration model is a rewrite; one event degraded/missing)
**Tools:** Hermes Agent, OpenClaw.
**Rationale:** Both have real lifecycle events and the shim-core + handler *bodies* still reuse, but the install
layer is a genuine rewrite, not a parameterization — Hermes is YAML (no byte-identical round-trip; no PreCompact
event), OpenClaw is JSON5 + in-process TypeScript handler files (no stdin command-array; fail-open becomes try/catch;
looser Stop boundary). Both also have medium confidence (docs-only on key specifics) and require detector/cohort
plumbing changes (Hermes must be added to `HOOKS_COHORT`).

### Tier C — `mcp-bridge-only` (no hook surface; register an MCP server; partial, on-demand capture)
**Tools:** Claude Desktop.
**Rationale:** No lifecycle hook API of any kind. The deliverable is an MCP-server config patcher wrapping the
already-built `packages/memory-mcp`, yielding voluntary model-initiated capture only — strictly weaker than the
every-turn deterministic capture of the shim. Must be labeled "partial capture." Open PM question: keep as a package
or fold into the existing MCP-registration flow.

### Tier D — `not-feasible-now`
**Tools:** *(none)*.
**Rationale:** Every tool has at least a partial integration path. None is blocked outright at this time.

---

## 4. Recommended Implementation Order (easiest + highest-value first)

1. **Codex CLI (`hive-mind-hooks-codex`)** — highest reuse (schema is a CC clone), full 4-hook lifecycle, native `additionalContext` inject. Build this first; it becomes the second reference shape (CC-clone-with-create-if-missing) for the rest of the cohort.
2. **Codex Desktop (`hive-mind-hooks-codex-desktop`)** — near-free once Codex CLI lands: thin re-export over the same `~/.codex/` installer. Bundle the `tool-detection.ts` fix (config-presence detection + correct pointer) here.
3. **Cursor (`hive-mind-hooks-cursor`)** — full lifecycle, near-verbatim port, only payload-field renames + a separate `hooks.json` path + create-if-missing. High-value (Cursor is a widely used editor) and low-risk.
4. **Hermes (`hive-mind-hooks-hermes`)** — first Tier-B: reuse handlers, rewrite install for YAML, drop PreCompact, add to `HOOKS_COHORT`, ship a real bin. Medium confidence — budget a live-payload verification spike.
5. **OpenClaw (`hive-mind-hooks-openclaw`)** — most install-layer rework (JSON5 + in-process TS handlers, re-authored fail-open, Stop debounce, provenance/dedup story). Defer until a live OpenClaw install can validate the handler API.
6. **Claude Desktop (`hive-mind-hooks-claude-desktop`)** — last, and gate it on a **PM decision** (package vs fold-into-launcher). It is a different deliverable (MCP bridge, partial capture), so don't let it block the four real hook ports. Fix the wrong `HOOK_POINTER_BY_TOOL` entry as part of whatever ships.

---

## 5. Key Risks

1. **Confidence asymmetry.** Tier A (Codex×2, Cursor) is high-confidence and doc-corroborated. Tier B (Hermes, OpenClaw) is **medium** — key specifics (Hermes shell-hook `VALID_HOOKS` allow-list; OpenClaw `handler.ts` event type + `execFileAsync`-under-loop reliability + `bootstrapFiles` injection sanction) are docs-only, not source-verified. Budget a live-payload/handler verification spike before committing Tier B estimates.
2. **`tool-detection.ts` carries known-wrong data.** `HOOK_POINTER_BY_TOOL` for **claude-desktop** (`.config/Claude/...`) and **codex-desktop** (`.config/Codex/...`) point at non-existent dirs; codex-desktop binary candidate paths are admitted guesses for an unreleased app. These must be corrected or the "is-it-installed" check lies. Prefer config-presence detection over binary-path guessing for the desktop apps.
3. **Create-if-missing is a behavioral fork from the Wave 1 reference.** The CC installer hard-requires a pre-existing config and throws if absent. Codex/Cursor/Hermes config files are optional/standalone and may not exist — every Tier A/B installer needs create-if-absent + the matching "delete-if-we-created vs restore-backup-if-existed" uninstall logic. Easy to get subtly wrong (orphaned files on uninstall).
4. **Not-silent installs.** Codex (CLI + Desktop) non-managed hooks require a one-time `/hooks` trust step; Cursor likely needs a restart for `hooks.json` to take effect. Neither is fully silent like CC — install UX must surface the manual step or the hook silently no-ops.
5. **Degraded/missing events.** Hermes has **no PreCompact** (approximate via opportunistic `compact_memory`). Cursor PreCompact is observational (can't guarantee before-truncation). Cursor UserPromptSubmit can't inject. OpenClaw Stop is 0..N/turn (needs debounce). Document each gap rather than implying parity.
6. **Config round-trip fidelity.** Hermes YAML and OpenClaw JSON5 don't survive naive `parse→stringify` (comments/ordering lost). Rely on literal byte-identical backups for uninstall rather than diff-merge fidelity; for OpenClaw, prefer writing hook directories and touching config minimally.
7. **Claude Desktop is a category mismatch.** Marketing/§10 must not imply hook parity — it is on-demand, model-discretion capture. There's also a redundancy decision (vs `packages/memory-mcp` + the existing launcher MCP-registration flow) that should be resolved by PM before any code is written.
8. **OpenClaw double-counting.** OpenClaw can drive claude-code/codex as backends; if those backends also have hive-mind hooks installed, the gateway-layer capture double-counts the same conversation. Needs a provenance/dedup story before shipping.

---

## 6. OSS-Mirror Implication

All seven `hive-mind-hooks-*` packages are part of the **hive-mind OSS split** (per `CLAUDE.md` §7.5) — the public
mirror at [`marolinik/hive-mind`](https://github.com/marolinik/hive-mind) is **generated from this monorepo via
`git subtree split`**, so whatever lands in these packages is byte-identical in the OSS mirror and there is no
cross-repo drift to police.

Implications for this work:
- **Everything built here ships publicly.** The Codex/Cursor/Hermes/OpenClaw hook installers and the Claude Desktop
  MCP bridge become part of the open-source `hive-mind` surface. That is consistent with the strategy (memory +
  harvest is the free-forever moat; broad AI-tool reach amplifies it) — but it means **no proprietary/KVARK-gated
  logic** belongs in these packages. The subtree-split filter (`scripts/oss-subtree-split.sh`) already excludes
  `vault.ts`, `evolution-runs.ts`, `execution-traces.ts`, `improvement-signals.ts`, `compliance/**`; the new hook
  packages have no such concerns (they only shell to `hive-mind-cli`) — keep it that way.
- **`@waggle/hive-mind-shim-core` is the shared, reused-as-is dependency** across all Tier A/B ports — it too lives in
  the OSS split, so its tool-agnostic CliBridge/logger stay public. Reusing it (rather than per-tool copies) keeps
  the OSS mirror DRY and the subtree-split clean.
- **Per CLAUDE.md §7.5, do not resurrect the deprecated dual-repo sync workflows** — the export is one-directional
  (monorepo → mirror). Author everything in `packages/hive-mind-hooks-*`; the mirror follows automatically.

---

*This brief gates a human scoping decision. Tier A (Codex×2 + Cursor) is the safe, high-value first slice; Tier B
needs a verification spike; Claude Desktop needs a PM package-vs-fold decision and an honest "partial capture" label.*
