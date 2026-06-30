# Pluggable Tool-Adapter Registry — Design

**Date:** 2026-06-30 · **Author:** Claude Opus 4.8 (1M) · **Owner:** Marko (founder)
**Arc:** AI-OS external-agent recon · STEAL NOW item **#5** from
`docs/analysis/external-agent-launching-and-memory-comparison-2026-06-29.md`
**Effort:** M · **Branch:** `feat/tool-adapter-registry` · **v1 scope (founder-approved):** full registry + JSON loader.

---

## 1. Goal & Non-Goals

**Goal.** Turn the 7 hardcoded external tools — currently the same IDs duplicated across **8
structures** in `shared` + `agent` — into one derived **adapter registry**, and let a self-hosted /
KVARK operator add a **PATH-based CLI runtime by dropping a JSON file** (`~/.waggle/adapters/*.json`),
with **no core edit, no recompile, and no executable code load** (honors CLAUDE.md §7: no eval / no
dynamic require).

**Non-goals (YAGNI):**
- No third-party **GUI-desktop** adapters (candidate-path detection stays built-in code — see §3 escape hatch). CLI agents are the launch target.
- No `require()`/dynamic code load — third-party adapters are **declarative data only**.
- No change to the launch/observe behavior shipped in #1–#4. No UI redesign (the dock derives its cohort lists from the same source).
- No signed-plugin trust store (that was the rejected "M-plus" option).

## 2. The 8 hardcoded structures collapsing into 1 source of truth

| Today (authored separately) | After |
|---|---|
| `shared`: `SUPPORTED_TOOLS`, `LAUNCH_COHORT`, `TOOL_DISPLAY_NAMES` | derive from `BUILTIN_TOOL_MANIFESTS` |
| `agent`: `HOOK_POINTER_BY_TOOL`, `detectorsById` + per-tool `detect*` fns | one manifest-driven detect loop |
| `agent` `tool-launcher`: `HOOKS_COHORT`, `hookPackageFor` | derive from the registry (`hookCapable`) |
| `agent` `launcher-prompt-args`: `promptArgsForTool` | built-ins unchanged; third-party via declarative `promptArgTemplate` |

## 3. Architecture — data (shared) vs behavior (agent)

### Unit A — `ToolManifest` + built-in manifests (`packages/shared/src/tool-detection.ts`)

```ts
export type ToolDetectSpec =
  | { kind: 'path'; binaryName: string }   // PATH lookup (CLI tools; the only third-party-allowed kind)
  | { kind: 'candidates' };                // GUI/desktop — paths resolved by an agent-side resolver (built-in only)

export interface ToolManifest {
  id: string;
  displayName: string;
  launchable: boolean;
  hookCapable: boolean;             // ⟺ ships a real @waggle/hive-mind-hooks-<id> bin
  hookPointer: string;             // relative pointer path for hook-status probe
  detect: ToolDetectSpec;
  /** Declarative inline-prompt arg template for THIRD-PARTY path adapters, e.g.
   *  ['--print', '{prompt}']. Built-ins keep their logic in launcher-prompt-args.ts. */
  promptArgTemplate?: string[];
  /** true = first-party (the 7); false/absent = loaded third-party. */
  builtin?: boolean;
}
```

`SUPPORTED_TOOLS` stays the `as const` literal **type anchor** (preserves the `ToolId` union → zero
blast radius on the ~7 places typed `Record<ToolId, …>`). `BUILTIN_TOOL_MANIFESTS: ToolManifest[]`
holds the per-tool **data** (the 7). The other consts **derive** from it:
`TOOL_DISPLAY_NAMES`, `LAUNCH_COHORT`, `HOOK_POINTER_BY_TOOL` (and a new `HOOKS_COHORT` = manifests
where `hookCapable`). Pure data → consumed by both the web bundle and the sidecar.

### Unit B — registry + detection loop (`packages/agent`)

- **`tool-registry.ts` (new).** `getToolRegistry(deps?)` returns the merged adapter list: the 7
  built-in manifests (each `candidates` manifest paired with its existing agent-side resolver
  `(deps) => string[]`, keyed by id — the **escape hatch**) **plus** validated third-party manifests
  from the loader (Unit C). Built-in ids win on collision.
- **`tool-detection.ts`.** `detectAll` iterates `getToolRegistry()` instead of the `detectorsById`
  map: `detect.kind:'path'` → `detectByPath(id, binaryName)`; `detect.kind:'candidates'` → the
  adapter's resolver → `detectByCandidates`. `probeHooks` reads `manifest.hookPointer`. The bespoke
  `detectClaudeCode`/`detectCursor`/… wrappers and `detectorsById` are deleted; `detectByPath` /
  `detectByCandidates` / the 3 candidate-path helpers are **kept** (they're the reusable engine).
- **`tool-launcher.ts`.** `HOOKS_COHORT` and the launch-cohort guard derive from the registry
  (`hookCapable` / `launchable`); `hookPackageFor(id)` = `manifest.hookPackage ?? @waggle/hive-mind-hooks-<id>`.

### Unit C — declarative loader (`packages/agent/src/tool-manifest-loader.ts`, new)

Reads `~/.waggle/adapters/*.json`, **zod-validates** each, and returns `ToolManifest[]`:
- Allowed `detect.kind` for third-party: **`'path'` only** (candidates would require code).
- **Safe-string refinement** on `id` / `binaryName` / `hookPointer` / template entries: no shell
  metacharacters (`; | & $ \` ( )`), no path traversal (`..`), no absolute path separators in
  `binaryName`. Reject (skip + log) any manifest that fails — never throw into detection.
- Injected `readDir` / `readFile` deps so the loader is hermetic in tests; missing dir → `[]`.
- `builtin: false` stamped on every loaded manifest.

## 4. Data Flow
```
BUILTIN_TOOL_MANIFESTS (shared, data) ──┐
                                        ├─▶ getToolRegistry() ──▶ detectAll loops adapters
~/.waggle/adapters/*.json ─ loader ─────┘     (built-in resolvers for `candidates`;
   (zod + safe-string, kind:'path' only)        detectByPath for `path`)
SUPPORTED_TOOLS/ToolId  (anchor, unchanged)
LAUNCH_COHORT / HOOKS_COHORT / TOOL_DISPLAY_NAMES / HOOK_POINTER_BY_TOOL  ── derive from manifests
```

## 5. Error Handling / Security
- Loader never throws into detection: a malformed/unsafe manifest is skipped + logged; detection proceeds with built-ins.
- `detect.kind:'candidates'` from a third-party manifest is rejected (code-only strategy).
- Safe-string refinement blocks shell-metachar / traversal injection in adapter fields (the boundary defense for external descriptors).
- Built-in ids always win over a third-party manifest claiming the same id (no built-in hijack).
- No `require()`, no eval, no dynamic import of adapter code — data only.

## 6. Testing (TDD)
- **shared:** `BUILTIN_TOOL_MANIFESTS` has 7 entries; `LAUNCH_COHORT`/`HOOKS_COHORT`/`TOOL_DISPLAY_NAMES`/`HOOK_POINTER_BY_TOOL` derive correctly and match today's values (regression-lock the current 7-tool reality).
- **loader:** valid path-manifest → parsed + `builtin:false`; `kind:'candidates'` rejected; shell-metachar / `..` rejected; missing dir → `[]`; injected fake fs.
- **registry:** built-ins present; a loaded third-party `path` adapter appears and is detectable; built-in id wins a collision.
- **detection:** `detectAll` over the registry yields the same results as today for the 7 (injected spawns — existing `tool-detection.test.ts` stays green); a third-party path adapter detects via `detectByPath`.
- **launcher:** `HOOKS_COHORT` derivation matches today's 6; `hookPackageFor` honors a manifest override.

**Gates:** `tsc` 0 (shared/agent/server/web); existing `tool-detection`/`tool-launcher`/`tools-routes*` suites stay green; new units RED→GREEN.

## 7. File Change List
| File | Change |
|---|---|
| `packages/shared/src/tool-detection.ts` | `ToolManifest`/`ToolDetectSpec` types, `BUILTIN_TOOL_MANIFESTS`, derive the 5 consts |
| `packages/agent/src/tool-registry.ts` | **new** — `getToolRegistry()` (built-ins + loaded), candidate-resolver map |
| `packages/agent/src/tool-manifest-loader.ts` | **new** — zod + safe-string loader for `~/.waggle/adapters/*.json` |
| `packages/agent/src/tool-detection.ts` | drive `detectAll` from the registry; delete per-tool wrappers + `detectorsById` |
| `packages/agent/src/tool-launcher.ts` | derive `HOOKS_COHORT` / cohort guard / `hookPackageFor` from the registry |
| `packages/agent/src/index.ts` | export registry + loader + manifest types |
| `apps/web/src/components/os/apps/LauncherApp.tsx` | derive its local `LAUNCH_COHORT`/`HOOKS_COHORT` from shared manifests (kill the local copies) |
| tests (5–6) | per §6 |

## 8. Open Questions
- **None blocking.** Scope (full registry + loader), the candidate-path escape hatch, and the data-only/no-`require()` security model are founder-approved. Third-party GUI-desktop adapters + a signed-plugin trust store are explicit future items, not gaps.
