# Wave 2/3 hive-mind Hook Ports — Design Specification

**Date:** 2026-06-01
**Status:** Approved design, pre-plan (implementation-ready; no code written yet)
**Reference package (FROZEN):** `packages/hive-mind-hooks-claude-code` (Wave 1, shipped)
**Shared dependency (reused as-is):** `@waggle/hive-mind-shim-core` (`packages/hive-mind-shim-core`)
**Author:** Design synthesis over the approved decision set + source-verified Tier B facts (Hermes + OpenClaw real repos)

> This spec expands the approved design verbatim. The approved scope, the three locked decisions
> (D1/D2/D3), and the per-package plan are not relitigated here — they are made implementation-ready
> and the source-verified Tier B facts are folded in. Where verification *contradicted* an assumption,
> the contradiction is surfaced explicitly in §5 and §9 (and reflected in the structured `designImpact`
> fields), never papered over.

---

## 1. Summary

### What

Build **five** new hive-mind hook packages, composed over **one** new shared package:

| New package | Tier | Reuse model |
|---|---|---|
| `@waggle/hive-mind-hooks-codex` | A | CC-clone JSON installer; second reference shape |
| `@waggle/hive-mind-hooks-codex-desktop` | A | Thin re-export of the codex installer (shared `~/.codex/`) |
| `@waggle/hive-mind-hooks-cursor` | A | JSON installer with field renames + degraded events |
| `@waggle/hive-mind-hooks-hermes` | B | Bespoke YAML codec; no PreCompact event |
| `@waggle/hive-mind-hooks-openclaw` | B | Bespoke JSON5 config + in-process TS handlers |
| `@waggle/hive-mind-hooks-core` | — | NEW shared package; the 5 above consume it |

**Excluded:** `claude-desktop` (MCP-bridge category mismatch — no hook surface, on-demand/partial capture
only). It is **deferred** and out of scope for this spec; the only claude-desktop work in scope is a TODO
marker on its known-wrong `tool-detection.ts` pointer (see §6.3).

### Why

The Wave 1 claude-code hook package proves the silent-capture pattern (every-turn deterministic capture of
SessionStart / UserPromptSubmit / Stop / PreCompact into hive-mind frames via `hive-mind-cli`). Five more AI
tools have a real lifecycle-hook surface; porting the pattern widens the free-forever memory+harvest moat
(CLAUDE.md §1 "Moat strategy") across the AI-tool ecosystem. All five packages are part of the hive-mind OSS
split (CLAUDE.md §7.5) and ship publicly via subtree-split — so they must be generic, shell only to
`hive-mind-cli`, and carry no proprietary/KVARK logic.

The Wave 1 package (`packages/hive-mind-hooks-claude-code`) is **FROZEN** — it is the reference shape; do NOT
modify it. The accepted tradeoff (D3) is that its reversible-install logic is duplicated by the new
`hooks-core` rather than retrofitted into CC.

### Shape of the work

The per-tool work is almost entirely confined to three concerns — **config paths**, **config codec /
register-shape**, and **event-name mapping** — composed over shared primitives in `hooks-core`. The four
lifecycle handler *bodies* (recall+inject, save-temporary-frame, summarize+save-important-frame,
compact_memory) are parameterized by a per-tool `EventAdapter` and reuse shim-core's `runHook` + `CliBridge`
unchanged for the stdin-JSON/exit-0 tools (codex, codex-desktop, cursor, hermes). OpenClaw is the exception:
its handlers are in-process TypeScript, so it cannot reuse `runHook` as-is and needs a thin in-process wrapper
(§5.5).

---

## 2. Decision Log

### D1 — Scope = Tier A + Tier B (the 5 packages)

**Decision:** Build `hive-mind-hooks-{codex, codex-desktop, cursor, hermes, openclaw}`.
**Rationale:** All five have a real, deterministic lifecycle-hook surface and reuse ≥80% of the Wave 1
package (shim-core + handler bodies + the runHook contract, except OpenClaw's handler model). Claude Desktop
is excluded because it has *no* hook API — it is an MCP-server registration yielding voluntary,
model-initiated, on-demand capture (strictly weaker than every-turn deterministic capture), a different
deliverable that must not block the four real hook ports and carries a separate PM package-vs-fold decision.

### D2 — Tier B (hermes, openclaw) = source-verify the public repos FIRST

**Decision:** Before committing Tier B estimates, read the real Hermes and OpenClaw repositories to confirm
config format, event names, handler model, fail-open mechanism, and external-CLI-invocation feasibility.
**Rationale:** The feasibility brief rated Tier B *medium* confidence — key specifics (Hermes shell-hook
`VALID_HOOKS` allow-list; OpenClaw `handler.ts` event type, `execFileAsync`-under-loop reliability,
`bootstrapFiles` injection sanction) were docs-only, not source-read. **Status: this verification is DONE.**
Results are folded into §5.4 (Hermes) and §5.5 (OpenClaw) with `confidenceAfterVerify: high` for both. The
verification **confirmed** the Hermes design and **required two corrections** to the OpenClaw design (handler
model + one event mismap) — see §5.5 and §9.

### D3 — Architecture = new shared `@waggle/hive-mind-hooks-core`; CC left as-is

**Decision:** Create a new shared package `@waggle/hive-mind-hooks-core` exporting the reversible-install
primitives, the shared lifecycle handler bodies (parameterized by an `EventAdapter`), and a `jsonRegister`
helper. The five new packages consume it. The Wave 1 claude-code package is NOT refactored to consume it.
**Rationale:** Extracting shared logic into `hooks-core` keeps the five new packages thin (paths + codec +
register-shape + bin + tests) and DRY, and keeps the OSS subtree-split clean (one shared package, not five
copies). **Accepted tradeoff:** the reversible-install logic now exists in *two* places — the frozen CC
package and `hooks-core`. This duplication is deliberate; retrofitting CC is explicitly out of scope and
risks regressing a shipped, regression-locked package.

---

## 3. Architecture — `@waggle/hive-mind-hooks-core`

`hooks-core` is a tool-agnostic library package (no `bin`; consumed by the five tool packages). It mirrors the
naming and idioms of the Wave 1 CC modules (`install.ts`, `uninstall.ts`, `verify.ts`, `paths.ts`,
`settings-merger.ts`, `hooks/_shared.ts`) so the per-package code reads like the reference. It depends on
`@waggle/hive-mind-shim-core` and re-uses its `runHook`, `CliBridge`, `createCliBridge`, `encodeFrame`,
`summarizeTurn`, `classifyImportance`, `maybeEmitDiscovery`, and `createLogger` (the same surface the CC hooks
import today — see `packages/hive-mind-shim-core/src/index.ts`).

### 3.0 Package metadata

- `name: "@waggle/hive-mind-hooks-core"`, `version: "0.1.0"`, `type: "module"`, `license: "Apache-2.0"`,
  `main: "dist/index.js"`, `types: "dist/index.d.ts"`, `engines.node >= 20`, `publishConfig.access: "public"`.
- `dependencies`: `@waggle/hive-mind-shim-core: "*"`, plus a YAML parser for the hermes codec and a JSON5
  parser for the openclaw codec **(see §9 OQ-3 — whether the YAML/JSON5 deps live in `hooks-core` or only in
  the hermes/openclaw consumer packages is an open question; default: keep codec-specific deps out of
  `hooks-core` and in the consumers, so `hooks-core` stays codec-agnostic and the JSON tools pull no YAML
  dep)**.
- `peerDependencies`: `@waggle/hive-mind-cli: "*"` (optional, as in CC) — handlers shell to it at runtime.
- No `bin`. Exports a barrel (`.`) plus per-primitive subpath exports if needed by consumers.

### 3.1 Reversible-install primitives (`install-core.ts` / `paths-core.ts`)

These generalize the Wave 1 CC logic. The CC reference assumes the config file **must pre-exist** and throws
if absent (`install.ts` lines 85–90). `hooks-core` must add a **create-if-missing** mode and the matching
uninstall semantics (delete-if-we-created vs restore-backup-if-existed), because codex/cursor/hermes config
files are optional/standalone and may not exist on a fresh machine.

```ts
// backupByteIdentical — write a byte-identical timestamped backup of an existing file.
// Returns the backup path. No-op marker when the source did not exist (createdByUs case).
export function backupPathFor(configPath: string, isoTimestamp: string): string;
//   → `${configPath}.hive-mind-backup.${iso.replace(/[:.]/g, '-')}`   (mirrors CC paths.ts:86)

export async function backupByteIdentical(
  configPath: string,
  isoTimestamp: string,
): Promise<{ backupPath: string | null; preExisted: boolean }>;
//   preExisted=false  → no backup written; caller records createdByUs=true in the pointer.
//   preExisted=true   → backup written with the exact original bytes (CC install.ts:104-106 idiom).

// Pointer file — records what we did so uninstall is exact. Superset of CC's pointer.
export interface InstallPointer {
  version: string;
  installed_at: string;
  config_path: string;
  settings_backup: string | null;   // null ⇔ created_by_us=true
  created_by_us: boolean;           // NEW vs CC: true if the config file did not pre-exist
  hooks_dir: string | null;         // null for in-process tools (openclaw)
  installed_hooks: readonly string[];
  cli_path: string | null;
  extra?: Record<string, unknown>;  // per-tool: e.g. openclaw hook dir names, hermes registered event keys
}
export async function writePointer(pointerPath: string, pointer: InstallPointer): Promise<void>;
export async function readPointer(pointerPath: string): Promise<InstallPointer>;  // throws if malformed/absent

// restoreFromBackup — round-trip-verified restore. Mirrors CC uninstall.ts:71-89:
//   write backup bytes over configPath, re-read, assert SHA-256 / byte equality, refuse to delete
//   the backup unless the readback matches.
export async function restoreFromBackup(args: {
  configPath: string;
  pointer: InstallPointer;
  cleanupBackup?: boolean;          // default true
}): Promise<{ restoredFrom: string | null; createdRemoved: boolean; backupRemoved: boolean }>;
//   created_by_us=true   → DELETE the config file we created (never orphan it); restoredFrom=null.
//   created_by_us=false  → restore the backup byte-identically (CC behavior).

// normalizeCliPath — reject embedded double-quotes (they break `--cli-path "<value>"` quoting).
//   Lifted verbatim from CC install.ts:142-154.
export function normalizeCliPath(input: string | undefined): string | undefined;
```

**Create-if-missing + uninstall semantics (precise):**

1. **Install, config pre-existed:** write byte-identical backup → merge/register hive entries → write merged
   config → pointer with `created_by_us=false`, `settings_backup=<backup>`.
2. **Install, config absent:** create a minimal valid skeleton (per-tool: `{version:1,hooks:{}}` for cursor,
   `{hooks:{}}` for codex, `{}` for hermes YAML, JSON5 `{hooks:{internal:{...}}}` for openclaw) containing
   *only* hive entries → pointer with `created_by_us=true`, `settings_backup=null`.
3. **Uninstall, `created_by_us=false`:** restore backup byte-identically (round-trip verified), delete
   backup + pointer.
4. **Uninstall, `created_by_us=true`:** delete the config file we created, delete pointer. **Never orphan a
   file we created and never leave a backup behind.**
5. **Re-install (upgrade) idempotency:** if a pointer already exists, treat as upgrade — replace the
   marker-tagged hive entries in place (mirrors CC `mergeHiveHooks` replace-in-place, settings-merger.ts:85-93)
   rather than duplicating, and keep the original backup so uninstall still restores the true pre-install
   state.

### 3.2 `EventAdapter` interface (`event-adapter.ts`)

The four lifecycle handler bodies are tool-agnostic and parameterized by a per-tool `EventAdapter` — field
extractors (which incoming payload keys hold the cwd / prompt / response / session id / parent) plus the
event-name map. This generalizes what the CC handlers already do inline via `pickStringFromObject` multi-key
fallbacks (e.g. `stop.ts:37-42` reads `response | assistant_message | transcript`).

```ts
export type Lifecycle = 'session-start' | 'user-prompt-submit' | 'stop' | 'pre-compact';

export interface EventAdapter {
  /** Tool id used for HookEvent.source + logger names. */
  readonly source: ShimSource;                  // 'codex' | 'cursor' | 'hermes' | 'openclaw' | ...
  /** Map our canonical lifecycle name → the tool's native event key. undefined ⇒ event not supported. */
  readonly eventName: Record<Lifecycle, string | undefined>;
  /** Field extractors over the opaque incoming payload (returns undefined when absent). */
  extractCwd(payload: unknown): string | undefined;
  extractSessionId(payload: unknown): string | undefined;
  extractPrompt(payload: unknown): string | undefined;                    // UserPromptSubmit
  extractResponse(payload: unknown, ctx: { readFile?: (p: string) => Promise<string> }): Promise<string | undefined> | string | undefined;
  //   async because Cursor delivers the turn via base.transcript_path (read off disk), not inline.
  extractParent(payload: unknown): string | undefined;                    // Stop parent frame id, if any
  /** Per-tool shape of the SessionStart inject response (some tools differ). undefined ⇒ no inject. */
  formatInject?(additionalContext: string): unknown;
}
```

`ShimSource` is the existing shim-core union (`hook-event-types.ts`); it already includes `'claude-code'`,
`'cursor'`, `'openclaw'` (per the signal-emitter doc comment). **Verify the union includes `'codex'` and
`'hermes'`; if not, extend it in shim-core** (small additive change to the OSS shim-core — acceptable; see
§9 OQ-2).

### 3.3 Shared handler bodies (`handlers-core.ts`)

Four factory functions return shim-core `HookHandler` objects parameterized by an `EventAdapter`. Each mirrors
the corresponding CC hook body (`hooks/session-start.ts`, `user-prompt-submit.ts`, `stop.ts`, `pre-compact.ts`)
but reads fields through the adapter instead of hardcoded key lists.

```ts
export function makeSessionStartHandler(a: EventAdapter, opts?: { recallLimit?: number }): HookHandler<...>;
//   run: bridge.recallMemory('', { limit, scope: 'personal' }) → format hits → a.formatInject(text)
//   (default formatInject = CC's { hookSpecificOutput: { hookEventName, additionalContext } }).

export function makeUserPromptSubmitHandler(a: EventAdapter): HookHandler<...>;
//   run: encodeFrame({eventType:'user-prompt-submit', source:a.source, ...}, {importance:'temporary'})
//        → bridge.saveMemory(frame). No stdout. (mirrors user-prompt-submit.ts)

export function makeStopHandler(a: EventAdapter, opts?: { summaryBudgetChars?: number }): HookHandler<...>;
//   run: summarizeTurn(response) → classifyImportance → encodeFrame(importance:'important'|'critical', parent?)
//        → bridge.saveMemory → opt-in maybeEmitDiscovery on WAGGLE_SIGNAL_EMIT (mirrors stop.ts:46-108).

export function makePreCompactHandler(a: EventAdapter): HookHandler<...>;
//   run: bridge.cleanupFrames() (default mode 'compact'). (mirrors pre-compact.ts)
```

These compose shim-core unchanged: `summarizeTurn`, `classifyImportance`, `encodeFrame`, `maybeEmitDiscovery`,
`CliBridge.{recallMemory,saveMemory,cleanupFrames}`. The WAGGLE_SIGNAL_EMIT opt-in behavior (off by default,
fail-open) is preserved exactly as in CC `stop.ts` so OSS consumers see no behavior change.

### 3.4 How `runHook` / `CliBridge` are composed

For the four stdin-JSON/exit-0 tools (codex, codex-desktop, cursor, hermes), each per-tool hook script is a
thin entrypoint identical in shape to CC's `hooks/session-start.ts` etc.:

```ts
// e.g. packages/hive-mind-hooks-codex/src/hooks/session-start.ts
import { runHook } from '@waggle/hive-mind-shim-core';            // exact CC import
import { makeSessionStartHandler } from '@waggle/hive-mind-hooks-core';
import { codexAdapter } from '../adapter.js';
export async function runSessionStart(opts = {}) {
  return runHook(makeSessionStartHandler(codexAdapter), { name: 'session-start', ...opts });
}
// + the CC isMain self-invoke guard verbatim (session-start.ts:91-102)
```

`runHook` (shim-core `hooks/_shared` equivalent — actually re-exported from shim-core; the CC `_shared.ts`
wraps it) already provides: stdin read with timeout, `safeJsonParse`, `--cli-path` argv parsing
(`parseHookArgs`), `createCliBridge` wiring, **exit-0-always fail-open**, and stdout JSON emission. The
per-tool packages reuse it as-is; `hooks-core` only supplies the adapter + handler bodies.

> Note on `_shared.ts`: the CC `hooks/_shared.ts` is itself a thin wrapper that re-exports/wraps shim-core's
> `createCliBridge` + `createLogger` and defines `runHook`, `parseHookArgs`, `readStdinAsString`,
> `safeJsonParse`, `pickStringFromObject`. To keep the new packages DRY, `hooks-core` should export an
> equivalent `hook-shared.ts` (lifted from CC `_shared.ts`, which is not frozen-by-reference since it's a copy,
> not the CC package — but to be safe, re-author it in `hooks-core` rather than import across package
> boundaries). The five packages import `runHook`/`parseHookArgs` from `hooks-core`, not from the frozen CC
> package.

### 3.5 `jsonRegister` helper (`json-register.ts`)

Generalizes CC's `mergeHiveHooks` (settings-merger.ts:72-101) for any JSON-config tool whose event keys map to
**arrays of hook groups**. Additive merge + marker tag + dedup/replace-in-place.

```ts
export const HIVE_MIND_MARKER_BASE = '@hive-mind';   // per-tool suffix appended, e.g. '@hive-mind/codex-hooks'

export interface JsonRegisterSpec {
  /** Top-level object key holding the per-event map (e.g. 'hooks'). */
  hooksKey: string;
  /** Canonical lifecycle → tool event-key map (from the EventAdapter.eventName). */
  eventName: Record<Lifecycle, string | undefined>;
  /** Builds the tool-shaped group object for one hook entry (codex uses {matcher,hooks:[...]}; cursor uses {command,type,timeout}). */
  buildGroup(lifecycle: Lifecycle, command: string, timeout: number): Record<string, unknown>;
  /** Reads the marker off a group to detect our own entries for replace/remove. */
  isHiveGroup(group: unknown): boolean;
  /** Optional wrapper to ensure skeleton (e.g. cursor needs {version:1}). */
  ensureSkeleton?(root: Record<string, unknown>): Record<string, unknown>;
}

export function jsonRegister(
  config: Record<string, unknown> | undefined,
  entries: readonly { lifecycle: Lifecycle; command: string; timeout: number }[],
  spec: JsonRegisterSpec,
): Record<string, unknown>;   // returns a NEW object; never mutates input (CC immutability contract)

export function jsonUnregister(config, spec): Record<string, unknown>;  // strips marker-tagged groups
export function hasHiveEntries(config, spec): boolean;
```

`jsonRegister`/`jsonUnregister` preserve all non-hive entries verbatim (preserves the user's existing hooks,
exactly as CC's merge preserves `gsd-context-monitor.js`), and dedup our own marker-tagged group by
`(eventKey, command)` so re-install upgrades in place. Used by codex, codex-desktop (via codex), and cursor.
Hermes (YAML) and OpenClaw (JSON5 + dirs) do NOT use `jsonRegister` — they have bespoke codecs (§5.4, §5.5).

---

## 4. Lifecycle → tool-event mapping (canonical reference)

The four canonical lifecycle actions map to native tool events as follows. "—" = no native event (degraded;
documented per §6.1). All five packages prove the two invariants in §7.2.

| Lifecycle (canonical) | claude-code (ref) | codex | codex-desktop | cursor | hermes | openclaw |
|---|---|---|---|---|---|---|
| **SessionStart** (recall+inject) | `SessionStart` | `SessionStart` | `SessionStart` | `sessionStart` | `on_session_start` (observe) **+** `pre_llm_call` `is_first_turn` (inject) | `agent:bootstrap` (mutate `bootstrapFiles`) |
| **UserPromptSubmit** (save temp) | `UserPromptSubmit` | `UserPromptSubmit` | `UserPromptSubmit` | `beforeSubmitPrompt` (save-only) | `pre_llm_call` | `message:received` |
| **Stop** (summarize+save) | `Stop` | `Stop` | `Stop` | `stop` (turn via `transcript_path`) | `post_llm_call` | `message:sent` (0..N/turn — debounce) |
| **PreCompact** (compact_memory) | `PreCompact` | `PreCompact` | `PreCompact` (+`PostCompact` bonus) | `preCompact` (observational) | **— (none)** | `session:compact:before` (match `event.action==='compact:before'`) |

---

## 5. Per-Package Designs

### 5.1 `@waggle/hive-mind-hooks-codex` (Tier A — second reference shape)

- **Config surface:** standalone `~/.codex/hooks.json` (JSON). Do NOT touch `~/.codex/config.toml` (keeps us
  out of the user's TOML and away from protected `notify`/`profile`/`model_providers` keys). Pointer:
  `~/.codex/hive-mind-install.json`.
- **Codec:** plain JSON (`JSON.parse`/`JSON.stringify(_, null, 2) + '\n'`, exactly CC install.ts:116).
- **Register/merge shape:** `jsonRegister` with `hooksKey='hooks'`, group shape
  `{ matcher, hooks: [{ type:'command', command, timeout }], _hiveMindShim }`. `matcher='startup|resume|clear|compact'`
  for SessionStart, `''` (or omitted) elsewhere. Hooks across config layers are additive; the marker is kept
  for byte-identical reversible uninstall, not for correctness.
- **Event map:** SessionStart→`SessionStart`, UserPromptSubmit→`UserPromptSubmit`, Stop→`Stop`,
  PreCompact→`PreCompact` (a deliberate CC clone — `HOOK_EVENT_BY_BASENAME` is effectively identical to CC).
- **Adapter field extractors:** reuse CC's snake_case keys (`prompt`, `session_id`, `cwd`) plus codex
  additions: Stop reads `last_assistant_message` (added to the response fallback list); PreCompact reads
  `trigger` (`manual|auto`); `HookEvent.source='codex'`.
- **Degraded/missing events:** none — all four native and field-compatible.
- **Install UX (non-silent steps):** non-managed Codex hooks require a **one-time `/hooks` trust step** (trust
  keyed by hook hash) before they execute. The installer MUST print: "Run `/hooks` in Codex once to trust the
  hive-mind hooks." Also `verify` must surface admin lockdown `allow_managed_hooks_only = true`
  (`requirements.toml`) which suppresses user hooks so install doesn't silently no-op.
- **Uninstall:** `created_by_us` aware — delete `hooks.json` if we created it, else restore byte-identical
  backup (§3.1).
- **Reuses from core:** `jsonRegister`, all reversible-install primitives, all four handler bodies, the
  `runHook` entrypoint shape, `--cli-path` Windows quoting (verbatim from CC `hookCommandFor`, paths.ts:74-84).
- **Implements locally:** `paths.ts` (codex paths), `adapter.ts` (codex EventAdapter + JsonRegisterSpec),
  4 hook entrypoints, bin (`codex-hooks`).
- **Blocker to note:** field-name casing confirmed from docs, not a live payload — add codex keys as
  *fallbacks* in the adapter rather than assuming. Minimum codex version shipping stable hooks is unpinned
  ("stable as of May 2026") — `verify` should probe dynamically; a too-old codex silently ignores hooks.json.

### 5.2 `@waggle/hive-mind-hooks-codex-desktop` (Tier A — thin re-export)

- **Config surface:** SHARES `~/.codex/hooks.json` with codex CLI — there is no separate codex-desktop config
  root. Same pointer file `~/.codex/hive-mind-install.json`.
- **Codec / register / events / adapter:** identical to codex — this package is a **thin re-export of the
  codex installer** (`export * from '@waggle/hive-mind-hooks-codex'` plus a bin that delegates). It exists as a
  distinct package so the dependency graph + subtree-split see the package boundary and so the launcher's
  `hookPackageFor('codex-desktop')` resolves to `@waggle/hive-mind-hooks-codex-desktop`.
- **In-scope fix — `tool-detection.ts` codex-desktop pointer:** `HOOK_POINTER_BY_TOOL['codex-desktop']` in
  `packages/agent/src/tool-detection.ts` (line 194) is currently `'.config/Codex/hive-mind-install.json'`,
  which is wrong — codex-desktop shares `~/.codex/`. **Fix to `'.codex/hive-mind-install.json'`** so the
  "is-it-installed" probe reads the real pointer. (Prefer config-presence detection at `~/.codex/` over the
  speculative binary-path guesses; the binary candidate paths in detection are admitted guesses for the
  unreleased app — out of scope to fully rework here, but the pointer fix is in scope.)
- **Install UX:** same `/hooks` trust note as codex. Add a note that the desktop App honoring hooks is
  doc-asserted but needs runtime verification on an actual App install (CLI definitely fires).
- **Reuses from core / codex:** everything, transitively via the codex package.
- **Implements locally:** package manifest + thin re-export + bin + the `tool-detection.ts` pointer fix + a
  parity test that asserts it installs into the same `~/.codex/hooks.json` as codex.

### 5.3 `@waggle/hive-mind-hooks-cursor` (Tier A — JSON with field renames + degraded events)

- **Config surface:** `~/.cursor/hooks.json` (JSON) — a **separate file** from Cursor's `settings.json`
  (editor prefs). Pointer: `~/.cursor/hive-mind-install.json` (already present in `HOOK_POINTER_BY_TOOL`).
- **Codec:** plain JSON. Skeleton when absent: `{ "version": 1, "hooks": {} }` (`ensureSkeleton` in the
  `JsonRegisterSpec` adds `version:1`).
- **Register/merge shape:** `jsonRegister` with group shape `{ command, type:'command', timeout, _hiveMindShim }`
  in `hooks.<event>` arrays (note: cursor uses a flat group, not codex's `{matcher,hooks:[]}` wrapper —
  `buildGroup` differs).
- **Event map (field renames):** SessionStart→`sessionStart`, UserPromptSubmit→`beforeSubmitPrompt`,
  Stop→`stop`, PreCompact→`preCompact`.
- **Degraded/missing events (MUST be documented in README per §6.1):**
  - `beforeSubmitPrompt` is **SAVE-ONLY** — it cannot inject context (stdout only `{continue, user_message}`).
    Acceptable: hive-mind's UserPromptSubmit only persists. Adapter `formatInject` is undefined for this event.
  - `preCompact` is **observational only** — it cannot block/reorder, so "run compact_memory BEFORE host
    truncates" is best-effort, not guaranteed-before. `compact_memory` runs fire-and-forget.
  - SessionStart `sessionStart` returns `{ additional_context, env }` — adapter `formatInject` returns
    `{ additional_context: text }` (a rename of CC's `hookSpecificOutput.additionalContext`).
  - Stop reads the completed turn via base field `transcript_path` (NOT inline) — `extractResponse` is async,
    reads the file defensively (tolerate null when transcripts are disabled; do not assume JSONL format), and
    fails open.
- **Install UX:** editing `hooks.json` likely needs a **Cursor restart** for the hooks to take effect (reload
  semantics unverified across 1.7.x) — installer MUST print "Restart Cursor for hive-mind hooks to take
  effect." Windows `.cmd`-shim exec problem applies — thread `--cli-path` to the compiled
  `hive-mind-cli dist/index.js`.
- **Uninstall:** `created_by_us` aware (cursor `hooks.json` may not exist on fresh install).
- **Reuses from core:** `jsonRegister`, reversible-install primitives, three handler bodies as-is; Stop handler
  via an adapter whose `extractResponse` reads `transcript_path`.
- **Implements locally:** `paths.ts`, `adapter.ts` (renames + transcript reader), 4 entrypoints, bin.

### 5.4 `@waggle/hive-mind-hooks-hermes` (Tier B — YAML; **source-verified, confidence: high**)

**Verification status:** source-verified against `NousResearch/hermes-agent` (MIT, Python, default branch
`main`, pushed 2026-05-31). The verification **CONFIRMS the approved design** with two clarifications that do
not break it (folded in below). `confidenceAfterVerify: high`.

- **Config surface:** `~/.hermes/config.yaml` (the path `hermes_cli/config.py get_config_path` resolves to;
  the `cli-config.yaml.example` ships the same `hooks:` block). The relevant system is **Shell hooks** — a
  top-level `hooks:` block in `config.yaml`. Pointer: `~/.hermes/hive-mind-install.json`.

  > **CRITICAL gotcha (folded from verified facts):** Hermes has **THREE** hook systems sharing the name
  > "hooks". The design targets the **SHELL-HOOKS** system (`config.yaml` `hooks:` block, shell-out via
  > subprocess). Do NOT confuse it with (a) the directory-based **Gateway hooks**
  > (`~/.hermes/hooks/<name>/{HOOK.yaml,handler.py}`, colon-style event names `session:start`, gateway-only,
  > in-process Python) or (b) the in-process **Plugin hooks** (`ctx.register_hook`). Only the shell-hooks
  > system is in scope. (Source: `agent/shell_hooks.py`.)

- **Codec:** bespoke YAML. Add a YAML parser dep (e.g. `yaml`) to the hermes consumer package. **YAML
  round-trip is NOT byte-identical** for re-serialized output (comments/ordering lost), so reversibility relies
  on the **literal byte-identical backup** written by `backupByteIdentical` (the merged config is what we
  *write*; uninstall restores the *original bytes*, not a re-serialized merge). This is fully compatible with
  the §3.1 primitives.
- **Register/merge shape:** additive, marker-tagged merge of hive entries into the YAML `hooks:` block,
  preserving the user's existing hook entries. Each event key → list of
  `{ command, timeout?, matcher? }`. Our entries set `command` to the per-event hook script invocation
  (`node "<dist>/hooks/<event>.js" --cli-path "..."` — same Windows-safe quoting as CC) and `timeout` (default
  60, hard cap 300). The marker is carried as a sentinel comment or a recognizable command prefix so
  `jsonUnregister`-equivalent YAML logic can strip exactly our entries on re-install/upgrade.
- **Event map (verified exact strings — snake_case):**
  - **SessionStart → SPLIT** (as the design assumed): `on_session_start` (observer-only; return value ignored;
    fires once per NEW session, `conversation_loop.py` ~L294) registers the observe/no-op side, **and**
    `pre_llm_call` with `is_first_turn=true` (stdout `{"context":"..."}` is appended to the user message — NOT
    the system prompt, to preserve prefix cache; `conversation_loop.py` L687-721) carries the recall+inject.
    Docs explicitly state Claude Code's `UserPromptSubmit` maps to `pre_llm_call`. So the SessionStart adapter
    registers **two** event keys.
  - **UserPromptSubmit → `pre_llm_call`** (fires once/turn before the tool loop; `extra` carries
    `user_message`, `conversation_history`, `is_first_turn`). Fire-and-forget save.
  - **Stop → `post_llm_call`** (fires once/turn after the loop completes, only if `final_response` and not
    interrupted; `extra` carries `assistant_response`; `conversation_loop.py` L4566-4583). This is the reliable
    turn-end signal for a single-shot CLI run. **Note:** `on_session_finalize` is gateway-path only (fires at
    `/new`/`/reset`/expiry boundaries) — do NOT assume it fires on every CLI invocation; use `post_llm_call` as
    the dependable Stop analogue (verified).
  - **PreCompact → NONE.** **CONFIRMED ABSENT** by source read: no compaction hook in `VALID_HOOKS`; no
    `compact`/`precompact`/`pre_compact` token anywhere in `plugins.py` or `shell_hooks.py`; the only
    compaction source (`agent/conversation_compression.py`) emits no hook. The design's "NO PreCompact"
    assumption is correct — there is genuinely nothing to hook. The hermes adapter's
    `eventName['pre-compact'] = undefined`; document the gap, do NOT invent (optionally approximate via
    opportunistic `compact_memory` from the Stop handler — see §9 OQ-4).
- **Handler model (CONFIRMED shell-command):** each firing spawns the configured `command` as a real OS
  subprocess — `argv = shlex.split(os.path.expanduser(command))`,
  `subprocess.run(argv, input=stdin_json, capture_output=True, timeout=..., text=True, shell=False)`. The JSON
  payload is piped to stdin; stdout is read back as optional JSON. This is **structurally identical** to the
  shim-core `runHook` stdin-JSON contract, so the four handler bodies + `runHook` reuse as-is.
- **External CLI invocation (CONFIRMED — idiomatic):** the `command` is ANY executable via
  `shlex.split + shell=False`; docs list languages as "Any (Bash, Python, Go binary, …)". A hook command of
  `node "<dist>/hooks/stop.js"` (which itself shells `hive-mind-cli` via `CliBridge`) works directly — the
  event JSON arrives on stdin and stdout JSON is read back. **Two real constraints, neither blocking:**
  (1) `shell=False` means no pipes/redirection in the command string itself — wrap multi-step logic in the JS
  hook script (we already do). (2) **FIRST-USE CONSENT ALLOW-LIST** — each unique `(event, command)` string
  must be approved once. Under any **non-TTY / headless launch** (the Waggle launcher), the hook registers
  ONLY if one of `--accept-hooks`, `HERMES_ACCEPT_HOOKS=1`, or `hooks_auto_accept: true` is set — otherwise it
  silently stays unregistered with a warning.
- **Fail-open mechanism (CONFIRMED, multi-layer):** config parsing warn-and-skips malformed entries (never
  raises); the subprocess layer catches Timeout/FileNotFound/Permission/Exception and returns None; non-zero
  exit is logged but stdout is still parsed; the dispatcher wraps each callback in try/except; every runtime
  firing site wraps `invoke_hook` in try/except. **Behavioral difference to fold in:** unlike Claude Code there
  is **NO exit-code-2 / special-exit contract** — control flow (block/inject) is expressed purely via
  **stdout JSON** (`{"action":"block"}` or `{"context":"..."}`; two block-shapes accepted). Our hooks are
  capture-only (no block, no inject except SessionStart context), so they just emit `{}`/context and the
  exit-0-always shim contract is fully compatible.
- **Install UX (non-silent steps):**
  - The installer/launcher MUST set `HERMES_ACCEPT_HOOKS=1` (or write `hooks_auto_accept: true` into the
    config) under headless/gateway launch, or the hive-mind hooks **silently never register**. Surface this
    clearly. (Allowlist keys on the exact command STRING, not a script hash — editing the target script is
    silently trusted; only `hermes hooks doctor` surfaces mtime drift.)
  - `matcher:` is honored ONLY for `pre_tool_call`/`post_tool_call` — on our lifecycle events it is stripped
    with a warning; do not set it.
- **Cohort plumbing (in scope per design):** add `'hermes'` to `HOOKS_COHORT` in
  `packages/agent/src/tool-launcher.ts` (currently `['claude-code']`, line 62) once the package ships a real
  bin, so the launcher routes hook install/verify/uninstall for hermes. **Note:** add each Tier-A/B tool to
  `HOOKS_COHORT` as its package ships a bin (codex, codex-desktop, cursor too) — the design singled out hermes
  because the feasibility brief flagged it as excluded, but the cohort gate applies to every newly-real
  package (see §9 OQ-1).
- **Reuses from core:** all four-minus-PreCompact handler bodies, `runHook`, reversible-install primitives.
- **Implements locally:** `paths.ts`, bespoke YAML `settings-merger`/codec, `adapter.ts` (hermes field
  extractors + 2-key SessionStart registration), 3 entrypoints (no pre-compact), bin, the `HOOKS_COHORT` edit.
- **Re-pin note:** the hermes repo moves fast (verified against HEAD/`main`, pushed 2026-05-31); **re-pin to a
  commit SHA before relying on the cited line numbers** during implementation.

### 5.5 `@waggle/hive-mind-hooks-openclaw` (Tier B — JSON5 + in-process TS; **source-verified, two design corrections**)

**Verification status:** source-verified against `openclaw/openclaw`. The verification **REQUIRES CHANGES** —
two material corrections to the approved design's event/handler assumptions (folded in below; also surfaced in
§9). `confidenceAfterVerify: high`. The corrections do NOT change the package's scope; they change the
host↔handler glue and one event name.

- **Config surface:** `~/.openclaw/openclaw.json` (**JSON5** — strict `JSON.parse` first, then `JSON5.parse`
  fallback; supports `$include` merges + `${ENV}` substitution). Hooks are configured under the
  `hooks.internal.*` tree **inside this one file**; the `hooks/<name>/{HOOK.md,handler.ts}` files are the hook
  *implementation* (discovered from directories), separate from config. Pointer:
  `~/.openclaw/hive-mind-install.json`.
- **Codec:** bespoke JSON5. **Naive `JSON.parse`/`JSON.stringify` destroys user comments + trailing commas.**
  Mitigation: write the hive **hook directory** (`~/.openclaw/hooks/hive-mind/{HOOK.md,handler.ts}` — or a
  managed dir) and touch `openclaw.json` minimally (add our entry under `hooks.internal.entries` and/or
  `hooks.internal.load.extraDirs`); rely on the literal byte-identical backup for uninstall rather than
  re-serialization fidelity (compatible with §3.1).
- **Register/merge shape:** discovery-based. Install writes a hook directory with `HOOK.md`
  (frontmatter declaring `metadata.openclaw.events[]`) + `handler.ts` (default export), and patches
  `hooks.internal.enabled=true` + an `entries["hive-mind"]={enabled:true, env:{...}}` (or `extraDirs`). **Hooks
  are OFF until opted in** — set `hooks.internal.enabled=true` and/or run `openclaw hooks enable hive-mind`.
  Record the created dir + config keys in the pointer's `extra` so uninstall removes exactly what we added.
- **Event map (VERIFIED — match on `(type, action)` pair, NOT the joined string):**
  - **SessionStart → `agent:bootstrap`** — `event.context.bootstrapFiles` is a **MUTABLE array**; the handler
    pushes recalled frames onto it before bootstrap files are injected into the system prompt
    (`applyBootstrapHookOverrides` reads it back). This is the sanctioned injection seam (≈ CC
    `additionalContext`). Only recognized basenames load (`AGENTS.md`/`MEMORY.md`/etc.). CONFIRMED.
  - **UserPromptSubmit → `message:received`** (inbound message from any channel; `event.context` =
    `{from, content, channelId, ...}`; replyable). The true user-prompt analog. (`command:new` is the
    `/new`-reset analog, not generic prompt submit.) CONFIRMED.
  - **Stop → `message:sent`** — fires **ONCE PER OUTBOUND PAYLOAD DELIVERED** (`deliver.ts:1044`), i.e.
    **0..N per turn**. This is the design's "needs debounce" case; it is **NON-replyable** (pushed
    `event.messages[]` are ignored). The consumer must debounce/dedupe (e.g. "last `message:sent` of a turn"
    heuristic or a short timer). CONFIRMED.
  - **PreCompact → `session:compact:before`** — **but the runtime `event.action` is `'compact:before'`, NOT
    `'session:compact:before'`** (the `session:` prefix appears only in the `HOOK.md` `events[]` array). A
    handler matching the full joined string will silently never fire. Match `event.action === 'compact:before'`.
    CONFIRMED + corrected.

  **CORRECTION 1 — `before_agent_finalize` is the WRONG system.** The approved design listed
  `before_agent_finalize` alongside the internal events, but it is a **typed PLUGIN hook**
  (`src/plugins/hook-types.ts` `PluginHookName` union, registered via `api.on('before_agent_finalize', …)`),
  NOT an internal `HOOK.md`/`handler.ts` event. The internal-hooks event union is exactly
  `command | session | agent | gateway | message` — it has **no agent-finalize event**, and `command:stop` is
  explicitly documented as cancellation/command-lifecycle, **not** a finalization gate. **Resolution:** do NOT
  use `before_agent_finalize`. Use `message:sent` (with debounce) as the Stop analog. If a true finalization
  gate is ever required, it must be built as an OpenClaw **plugin** (`api.on`), a different subsystem — out of
  scope for this hook package. (Surfaced in §9.)

- **Handler model (VERIFIED — in-process TypeScript, NOT stdin/exit-0):** a hook is a directory
  `hooks/<name>/{HOOK.md, handler.ts}`. The gateway dynamically `import()`s `handler.ts`, grabs the default
  export, and registers it as an `InternalHookHandler`. Signature:
  `(event: InternalHookEvent) => Promise<void> | void`, where `InternalHookEvent =
  { type, action, sessionKey, context, timestamp, messages }`. Handlers run **inside the gateway Node process**
  and share its event loop.

  **CORRECTION 2 — shim-core `runHook` is NOT reusable as-is for OpenClaw.** `runHook` is a stdin-in /
  exit-0-out subprocess model; OpenClaw handlers are in-process functions. **Resolution:** OpenClaw needs a
  thin **in-process wrapper** — a `handler.ts` whose default export receives the `InternalHookEvent`, maps
  `event.context` → the payload shape the shared handler bodies expect, then invokes the shared logic. The
  shared *logic* (recall+inject via mutating `bootstrapFiles`; save-temp-frame; summarize+save;
  `compact_memory`) still reuses shim-core's `CliBridge`/`encodeFrame`/`summarizeTurn`/`classifyImportance` —
  only the host↔handler glue changes from stdin/exit to in-process call + `execFile`. So `hooks-core` exports
  an **openclaw-specific in-process handler factory** (distinct from the `runHook`-based entrypoints the JSON
  tools use). The four shared handler *bodies* (§3.3) are authored to take an already-extracted payload, so
  both the `runHook` path and the in-process path can drive them.

- **External CLI invocation (VERIFIED — fully supported, idiomatic):** a handler imports `node:child_process`
  and shells out — `execFile('hive-mind-cli', [...])` (promisified + awaited) is the sanctioned pattern (the
  `gateway:pre-restart` example in `docs/automation/hooks.md` uses exactly `execFileAsync`). So the
  external-CLI-invocation assumption **HOLDS** — a Waggle handler can `execFile('hive-mind-cli', …)` (or reuse
  `CliBridge`, which already spawns it). For reliability under the event loop: use the async form and `await`
  it (the host already awaits + try/catches each handler); for non-blocking emit, use
  `fireAndForgetBoundedHook` (bounded 16 concurrent, 2s timeout) or just don't await. **No sandbox/allow-list
  restricts `child_process` from a hook** — managed/workspace hooks are "trusted local code" (the loader logs a
  trust warning).
- **Fail-open mechanism (VERIFIED — try/catch, NOT exit-0):** `triggerInternalHook` wraps each handler in
  try/catch (logs `Hook error [type:action]`, runs the next handler, the agent flow is unaffected). There is
  **no exit code** — handlers are JS functions, so "exit 0" does not apply. **Resolution:** the openclaw
  fail-open contract is "the default-exported async handler must not throw" — wrap the handler body in
  try/catch and return on error (as every bundled handler does), and do NOT block synchronously (return a
  promise; let the host await it).
- **Degraded/missing events (document in README per §6.1):** Stop is 0..N/turn and non-replyable (debounce
  required); no single per-turn "agent finished one reply" internal event.
- **`handler.ts` loadability caveat (VERIFIED):** `handler.ts` is loaded via dynamic `import()` of the file
  URL — a user-dropped raw `.ts` in `~/.openclaw/hooks/` relies on the gateway having a TS loader (tsx/bundled).
  **Resolution:** ship a **compiled `.js`** handler (with matching filename) rather than a raw `.ts`, OR verify
  the target install's TS loader. Default: ship compiled `.js` from our `dist/` and reference it (this is
  consistent with how every other package ships compiled hook scripts). (Surfaced in §9 OQ-5.)
- **Provenance / dedup story (design-mandated):** OpenClaw can drive claude-code/codex as **backends** — if
  those backends also have hive-mind hooks installed, the gateway-layer capture double-counts the same
  conversation. The package MUST stamp a provenance marker on frames it saves (e.g. `source` metadata
  `openclaw-gateway` + the channel/session id) and the design notes it "can drive CC/codex as backends," so a
  dedup heuristic (skip frames whose content hashes match a backend-captured frame within a short window) is
  needed before shipping. (Open question on the exact dedup mechanism — §9 OQ-6.)
- **Reuses from core:** the four shared handler *bodies* (§3.3) and shim-core (`CliBridge`, `encodeFrame`,
  `summarizeTurn`, `classifyImportance`), the reversible-install primitives, the openclaw in-process handler
  factory.
- **Implements locally:** `paths.ts` (`~/.openclaw/` + hook dir), bespoke JSON5-minimal-touch codec, the
  `HOOK.md` + compiled `handler.ts` template, the in-process event→payload mapping (incl. `bootstrapFiles`
  mutation for SessionStart and `compact:before` action matching), debounce for `message:sent`, provenance
  stamping, bin, `HOOKS_COHORT` edit.

---

## 6. Cross-Cutting Concerns

### 6.1 Degraded / missing-event documentation policy

Every package's README MUST document its degraded or missing events explicitly and MUST NOT imply hook parity
with claude-code. Required disclosures:

- **cursor:** `beforeSubmitPrompt` save-only (no inject); `preCompact` observational only (best-effort, not
  guaranteed-before-truncation); Stop turn read via `transcript_path` (null when transcripts disabled).
- **hermes:** **no PreCompact event at all** (confirmed absent — only 3 hooks ship); SessionStart is split
  across two events; block/inject is via stdout-JSON not exit codes.
- **openclaw:** Stop is `message:sent` 0..N/turn (debounced, non-replyable); no agent-finalize internal event;
  `before_agent_finalize` is a different (plugin) subsystem.
- **codex / codex-desktop:** full parity (no degraded events) — but note the one-time `/hooks` trust step is
  required for hooks to execute (not a degraded event, an install-UX step).

A short "Capture fidelity" table in each README (events supported / degraded / absent) is the canonical format.

### 6.2 Non-silent install UX

Installers MUST **print** any non-silent manual step (do not assume silent success like CC):

- **codex / codex-desktop:** "Run `/hooks` in Codex once to trust the hive-mind hooks." `verify` surfaces
  `allow_managed_hooks_only` lockdown.
- **cursor:** "Restart Cursor for hive-mind hooks to take effect."
- **hermes:** "Headless/gateway runs require `HERMES_ACCEPT_HOOKS=1` (or `hooks_auto_accept: true`) or the
  hooks will not register." The launcher should set this env under headless launch.
- **openclaw:** "Run `openclaw hooks enable hive-mind` (or set `hooks.internal.enabled=true`) to activate."

### 6.3 `tool-detection.ts` fixes

In `packages/agent/src/tool-detection.ts`, `HOOK_POINTER_BY_TOOL` (lines 189-197):

- **In scope — fix codex-desktop:** change `'codex-desktop': '.config/Codex/hive-mind-install.json'` →
  `'.codex/hive-mind-install.json'` (codex-desktop shares `~/.codex/`). Ship with the codex-desktop package.
- **Out of scope — claude-desktop TODO:** `'claude-desktop': '.config/Claude/hive-mind-install.json'` is also
  wrong (not a real Claude Desktop config dir on any platform; the real config is mac
  `~/Library/Application Support/Claude/` / Win `%APPDATA%\Claude\`). **Leave a `// TODO(claude-desktop):`
  comment** pointing at the deferred MCP-bridge work; do NOT fix it now (claude-desktop is excluded from this
  spec's scope). Do not modify the speculative codex-desktop binary candidate paths beyond the pointer fix
  unless trivially co-located.

### 6.4 OSS / subtree-split

All five packages are part of the hive-mind OSS split (CLAUDE.md §7.5) — the public mirror
(`marolinik/hive-mind`) is generated from this monorepo via `git subtree split`, so whatever lands is
byte-identical in the mirror with no cross-repo drift to police. Implications:

- **No proprietary/KVARK-gated logic** in any of these packages — they only shell to `hive-mind-cli` (the
  subtree-split filter already excludes `vault.ts`/`evolution-runs.ts`/`execution-traces.ts`/
  `improvement-signals.ts`/`compliance/**`; these packages have no such concerns — keep it that way).
- **`@waggle/hive-mind-shim-core` and the new `@waggle/hive-mind-hooks-core` are the shared, reused-as-is
  dependencies** and also live in the OSS split — reuse them (do not copy) to keep the mirror DRY.
- Author everything in `packages/hive-mind-hooks-*` + `packages/hive-mind-hooks-core`; the mirror follows
  automatically. Do NOT resurrect the deprecated dual-repo sync workflows (CLAUDE.md §7.5).
- **Keep `hooks-core` in the OSS allowlist:** ensure `scripts/oss-subtree-split.sh` includes the new package
  in the export set (open item — §9 OQ-7).

---

## 7. Testing Strategy

### 7.1 Per-package parity with the CC reference suite

Each of the five packages mirrors the CC reference test layout (the CC package has install/uninstall/verify/
paths/settings-merger tests + per-hook handler tests). Required suites per package:

- **paths tests:** correct config path, pointer path, hooks-dir resolution, Windows-safe backup path
  (`:`/`.` → `-`), Windows `--cli-path` quoting.
- **register/merge tests:** additive merge preserves existing user entries verbatim; marker-tagged dedup /
  replace-in-place on re-install; immutability (input config never mutated — mirrors CC settings-merger
  contract).
- **install tests:** config pre-existed → byte-identical backup + merged config + pointer with
  `created_by_us=false`; config absent → skeleton created + pointer `created_by_us=true`, no backup.
- **uninstall tests:** `created_by_us=false` → byte-identical restore (round-trip verified), backup+pointer
  removed; `created_by_us=true` → config file deleted (no orphan), pointer removed. (Per-tool: hermes/openclaw
  prove literal-backup restore since codec round-trip is lossy.)
- **verify tests:** entries present + point at live hook scripts + `hive-mind-cli --help` probe (CC verify.ts
  shape); plus per-tool surfacing (codex `allow_managed_hooks_only`; hermes consent/registration state).
- **per-hook handler tests:** each lifecycle handler given a representative tool payload → asserts the right
  `CliBridge` call (recallMemory / saveMemory with correct importance+scope / cleanupFrames) with an injected
  mock bridge (the CC `runHook` test hooks: `readStdin`/`writeStdout`/`exit`/`bridge` overrides). OpenClaw
  handler tests drive the in-process handler with a synthetic `InternalHookEvent` (incl. `bootstrapFiles`
  mutation assertion + `compact:before` action match + `message:sent` debounce).

### 7.2 `hooks-core` unit tests

`hooks-core` carries its own unit suite for the shared primitives independent of any tool: `backupByteIdentical`
(pre-existed vs absent), `restoreFromBackup` (both branches + round-trip-failure refusal), pointer
read/write/malformed, `normalizeCliPath` (double-quote rejection), `jsonRegister`/`jsonUnregister`/`hasHiveEntries`
(additive + dedup + immutability), each `make*Handler` factory against a mock bridge + mock adapter, and the
openclaw in-process handler factory.

### 7.3 The two invariants every package MUST prove

1. **Hooks fail open (always exit 0 / never throw to host).** For the four stdin-JSON tools: an injected
   bridge error / malformed payload still results in `exit(0)` (CC `runHook` contract). For openclaw: an
   injected handler-body error is swallowed by the handler's own try/catch and the returned promise resolves
   (never rejects) — proving the host's per-handler try/catch is not relied on as the only safety net.
2. **Byte-identical reversibility.** Uninstall restores the pre-install config to SHA-256-identical state when
   the config pre-existed (round-trip-verified, mirroring CC uninstall.ts), OR removes exactly the file(s) we
   created when it did not (no orphans, no leftover backup). Test by snapshotting the config bytes before
   install and asserting equality (or absence) after uninstall, for both the pre-existed and absent cases.

---

## 8. Build Order + Tier B Handling

**Locked build order:**

```
hooks-core
  → codex                (Tier A; becomes the 2nd reference shape: CC-clone + create-if-missing)
  → codex-desktop        (Tier A; thin re-export over codex + the tool-detection.ts pointer fix)
  → cursor               (Tier A; JSON + field renames + degraded events)
  → [source-verify spike: hermes + openclaw]   ← DONE in this workflow (D2); results in §5.4/§5.5
  → hermes               (Tier B; YAML codec, no PreCompact, HOOKS_COHORT add)
  → openclaw             (Tier B; JSON5 + in-process TS handlers, in-process factory, debounce, provenance)
```

**Tier B handling (D2):** the source-verify spike is complete (this workflow). Both repos resolved
(`NousResearch/hermes-agent` MIT; `openclaw/openclaw`); `confidenceAfterVerify: high` for both. Hermes
**confirmed** the design (build as designed, 3 hooks, YAML codec). OpenClaw **required two corrections**
(in-process handler model instead of `runHook`; `before_agent_finalize` removed in favor of debounced
`message:sent`) — both folded into §5.5; neither changes scope, only the host↔handler glue and one event name.
Therefore no second spike is needed before implementation; the remaining Tier B unknowns are the small
open questions in §9 (dedup mechanism, compiled-handler loadability), resolvable during implementation.

`hooks-core` is built and unit-tested first (it has no tool dependency). Each tool package is built →
tested → and its `HOOKS_COHORT` entry added (so the launcher only offers a hook action once the bin is real),
then the next package. Re-pin the hermes/openclaw repo SHAs before relying on the cited line numbers.

---

## 9. Risks + Open Questions

**Design impact from verification:** the Tier B verification (D2) produced **one design-impacting change** —
OpenClaw's handler model is in-process TypeScript (not `runHook` stdin/exit-0) and `before_agent_finalize` was
a wrong-system event. Both are resolved within the approved scope and architecture (the in-process wrapper +
debounced `message:sent` substitution are folded into §5.5) — the *scope* (5 packages + 1 core, openclaw =
bespoke JSON5 + in-process TS, Stop debounced) was already correct in the approved design, so this is a
mechanism clarification, not a scope or architecture change. It does **not** require human re-approval, but it
IS recorded here for visibility.

**Risks:**

1. **Tier B repos move fast** — hermes verified against `main` pushed 2026-05-31; re-pin both to commit SHAs
   before implementation relies on line numbers.
2. **Create-if-missing is a behavioral fork from the frozen CC reference** (CC hard-throws if config absent).
   Easy to get the uninstall side subtly wrong (orphaned files). The §3.1 primitives + §7.2 invariant-2 tests
   are the guard.
3. **Config round-trip fidelity** — hermes YAML and openclaw JSON5 do not survive naive parse→stringify.
   Mitigated by literal byte-identical backups for uninstall (not diff-merge fidelity) and minimal-touch edits.
4. **Hermes headless consent** — without `HERMES_ACCEPT_HOOKS=1` the hooks silently never register under the
   launcher. The launcher MUST set it; otherwise capture is silently zero.
5. **OpenClaw double-counting** — gateway-layer capture can duplicate backend (CC/codex) capture; provenance
   stamping + a dedup heuristic are required before shipping.

**Open questions (need a human decision before / during writing-plans):**

- **OQ-1 — `HOOKS_COHORT` membership:** the design explicitly names hermes for `HOOKS_COHORT`. Confirm that
  codex, codex-desktop, and cursor are ALSO added to `HOOKS_COHORT` as each ships a real bin (the cohort gate
  applies to every newly-real package, not just hermes). Default assumption: yes, add each as it ships.
- **OQ-2 — `ShimSource` union extension:** confirm `'codex'` and `'hermes'` are valid `ShimSource` values in
  shim-core (`hook-event-types.ts`); if absent, the spec assumes a small additive extension there. Confirm
  that additive shim-core edit is acceptable (it ships in the OSS mirror).
- **OQ-3 — YAML/JSON5 dep placement:** keep the `yaml` (hermes) and `json5` (openclaw) parser deps in the
  consumer packages (default) vs in `hooks-core`. Default keeps `hooks-core` codec-agnostic and avoids forcing
  a YAML dep on the JSON tools.
- **OQ-4 — hermes PreCompact approximation:** PreCompact is confirmed absent. Do we (a) ship hermes with no
  compaction maintenance, or (b) opportunistically call `compact_memory` from the hermes Stop handler? Default:
  document the gap; do not invent — leave (b) as an optional follow-up.
- **OQ-5 — openclaw handler shipping format:** ship a compiled `.js` `handler.ts`-equivalent (default, robust)
  vs a raw `.ts` relying on the gateway's TS loader. Default: compiled `.js`. Confirm the `HOOK.md` `default`
  export resolution works against a compiled file on a real openclaw install (the one remaining
  needs-a-live-install validation).
- **OQ-6 — openclaw dedup mechanism:** exact provenance/dedup story (content-hash window? backend-detection?)
  needs a decision before openclaw ships. Not blocking codex/cursor/hermes.
- **OQ-7 — OSS subtree-split allowlist:** confirm `scripts/oss-subtree-split.sh` includes the new
  `hive-mind-hooks-core` (and the four new hook packages, if the script enumerates rather than globs) in the
  export set.

No TBD/placeholder remains unresolved outside this open-questions list; the spec is internally consistent and
scoped to a single implementation plan (hooks-core + 5 packages, build order in §8).
