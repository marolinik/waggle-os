# Pluggable Tool-Adapter Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the 7 hardcoded external tools (duplicated across 8 structures) into one derived `BUILTIN_TOOL_MANIFESTS` source of truth + an agent registry, and let a self-hosted operator add a PATH-based CLI runtime via `~/.waggle/adapters/*.json` (zod-validated, no `require()`).

**Architecture:** Declarative `ToolManifest` data lives in `@waggle/shared` (the web bundle + sidecar both read it); the cohort/name/pointer consts derive from it. The agent owns behavior: a `tool-registry.ts` that merges built-in manifests with loaded third-party ones, a `tool-manifest-loader.ts` (declarative, data-only), and a `detectInstalledTools` loop driven by the registry. The 3 desktop candidate-path resolvers stay built-in code (escape hatch); third-party adapters are PATH-only.

**Tech Stack:** TypeScript, zod, Vitest. No new runtime deps.

## Global Constraints

- **`SUPPORTED_TOOLS` stays the `as const` literal anchor** — `ToolId` (the union) is unchanged → zero blast radius on the ~5 `Record<ToolId,…>` consumers.
- **Derived consts must equal today's values** for the 7 built-ins (regression-lock).
- **Third-party adapters: `detect.kind:'path'` only.** `'candidates'` is built-in-code-only (the escape hatch).
- **Loader is data-only:** zod + safe-string refinement (no `; | & $ \` ( )`, no `..`, no path separators in `binaryName`); never `require()`/eval; never throws into detection; missing dir → `[]`.
- **Built-in ids win** over any third-party manifest claiming the same id.
- **Registry = pure data (no functions);** the candidate resolvers stay in `tool-detection.ts` keyed by id (no `registry → detection` cycle: loader ← registry ← detection).
- **Gates:** `tsc` 0 (shared/agent/server/web); existing `tool-detection`/`tool-launcher`/`tools-routes*`/`LauncherApp` suites stay green; new units RED→GREEN.
- **Fast-follow (NOT in v1):** applying a third-party `promptArgTemplate` (the prompt-arg path is web-side `apps/web/src/lib/launcher-prompt-args.ts`; the field is captured but unwired).

## Built-in manifest data (the canonical 7 — used verbatim in Task 1)

| id | displayName | launchable | hookCapable | hookPointer | detect |
|---|---|---|---|---|---|
| claude-code | Claude Code | yes | yes | `.claude/hive-mind-install.json` | `path` binary `claude` |
| claude-desktop | Claude Desktop | yes | **no** | `.config/Claude/hive-mind-install.json` | `candidates` |
| cursor | Cursor | yes | yes | `.cursor/hive-mind-install.json` | `candidates` |
| codex | Codex CLI | yes | yes | `.codex/hive-mind-install.json` | `path` binary `codex` |
| codex-desktop | Codex Desktop | yes | yes | `.codex/hive-mind-install.json` | `candidates` |
| hermes | Hermes Agent | yes | yes | `.hermes/hive-mind-install.json` | `path` binary `hermes` |
| openclaw | OpenClaw | yes | yes | `.openclaw/hive-mind-install.json` | `path` binary `openclaw` |

---

### Task 1: `shared` — `ToolManifest` + `BUILTIN_TOOL_MANIFESTS` + derived consts

**Files:**
- Modify: `packages/shared/src/tool-detection.ts`
- Test: `packages/shared/tests/tool-manifests.test.ts` (new; if `packages/shared/tests` doesn't exist, place under the shared package's test glob — check `packages/shared` for an existing `*.test.ts` to mirror the location)

**Interfaces:**
- Produces: `ToolDetectSpec`, `ToolManifest`, `BUILTIN_TOOL_MANIFESTS: readonly ToolManifest[]`, and **re-derived** `TOOL_DISPLAY_NAMES` / `LAUNCH_COHORT`. `SUPPORTED_TOOLS` / `ToolId` unchanged.

- [ ] **Step 1: Write the failing test** — `packages/shared/tests/tool-manifests.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  BUILTIN_TOOL_MANIFESTS, SUPPORTED_TOOLS, LAUNCH_COHORT, TOOL_DISPLAY_NAMES,
} from '../src/tool-detection.js';

describe('BUILTIN_TOOL_MANIFESTS', () => {
  it('has one manifest per supported tool, ids matching SUPPORTED_TOOLS', () => {
    expect(BUILTIN_TOOL_MANIFESTS.map((m) => m.id).sort()).toEqual([...SUPPORTED_TOOLS].sort());
  });
  it('marks every built-in as builtin:true and launchable', () => {
    for (const m of BUILTIN_TOOL_MANIFESTS) { expect(m.builtin).toBe(true); expect(m.launchable).toBe(true); }
  });
  it('claude-desktop is the only non-hook-capable tool', () => {
    const nonHook = BUILTIN_TOOL_MANIFESTS.filter((m) => !m.hookCapable).map((m) => m.id);
    expect(nonHook).toEqual(['claude-desktop']);
  });
  it('derives TOOL_DISPLAY_NAMES + LAUNCH_COHORT from the manifests (unchanged values)', () => {
    expect(TOOL_DISPLAY_NAMES['claude-code']).toBe('Claude Code');
    expect(TOOL_DISPLAY_NAMES['codex']).toBe('Codex CLI');
    expect([...LAUNCH_COHORT].sort()).toEqual([...SUPPORTED_TOOLS].sort());
  });
  it('claude-code detects by PATH binary "claude" (not its id)', () => {
    const cc = BUILTIN_TOOL_MANIFESTS.find((m) => m.id === 'claude-code')!;
    expect(cc.detect).toEqual({ kind: 'path', binaryName: 'claude' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/tests/tool-manifests.test.ts`
Expected: FAIL — `BUILTIN_TOOL_MANIFESTS` not exported.

- [ ] **Step 3: Implement** in `packages/shared/src/tool-detection.ts` — keep `SUPPORTED_TOOLS`/`ToolId`/`DetectedTool`/`ToolDetectionResult` exactly as-is. Add the types + manifests, and REPLACE the hand-authored `LAUNCH_COHORT` and `TOOL_DISPLAY_NAMES` with derived versions:

```ts
export type ToolDetectSpec =
  | { kind: 'path'; binaryName: string }
  | { kind: 'candidates' };

export interface ToolManifest {
  id: string;
  displayName: string;
  launchable: boolean;
  hookCapable: boolean;
  hookPointer: string;
  detect: ToolDetectSpec;
  /** Declarative inline-prompt arg template for THIRD-PARTY path adapters (e.g.
   *  ['--print', '{prompt}']). Built-ins keep their logic in launcher-prompt-args.ts.
   *  Captured in v1; application is a documented fast-follow. */
  promptArgTemplate?: string[];
  /** true = first-party; false/absent = loaded third-party. */
  builtin?: boolean;
}

export const BUILTIN_TOOL_MANIFESTS: readonly ToolManifest[] = [
  { id: 'claude-code', displayName: 'Claude Code', launchable: true, hookCapable: true, hookPointer: '.claude/hive-mind-install.json', detect: { kind: 'path', binaryName: 'claude' }, builtin: true },
  { id: 'claude-desktop', displayName: 'Claude Desktop', launchable: true, hookCapable: false, hookPointer: '.config/Claude/hive-mind-install.json', detect: { kind: 'candidates' }, builtin: true },
  { id: 'cursor', displayName: 'Cursor', launchable: true, hookCapable: true, hookPointer: '.cursor/hive-mind-install.json', detect: { kind: 'candidates' }, builtin: true },
  { id: 'codex', displayName: 'Codex CLI', launchable: true, hookCapable: true, hookPointer: '.codex/hive-mind-install.json', detect: { kind: 'path', binaryName: 'codex' }, builtin: true },
  { id: 'codex-desktop', displayName: 'Codex Desktop', launchable: true, hookCapable: true, hookPointer: '.codex/hive-mind-install.json', detect: { kind: 'candidates' }, builtin: true },
  { id: 'hermes', displayName: 'Hermes Agent', launchable: true, hookCapable: true, hookPointer: '.hermes/hive-mind-install.json', detect: { kind: 'path', binaryName: 'hermes' }, builtin: true },
  { id: 'openclaw', displayName: 'OpenClaw', launchable: true, hookCapable: true, hookPointer: '.openclaw/hive-mind-install.json', detect: { kind: 'path', binaryName: 'openclaw' }, builtin: true },
] as const;

// Derived from the manifests (single source of truth). SUPPORTED_TOOLS stays the
// type anchor above; these keep their ToolId-typed shapes via the cast.
export const TOOL_DISPLAY_NAMES = Object.fromEntries(
  BUILTIN_TOOL_MANIFESTS.map((m) => [m.id, m.displayName]),
) as Record<ToolId, string>;

export const LAUNCH_COHORT: readonly ToolId[] =
  BUILTIN_TOOL_MANIFESTS.filter((m) => m.launchable).map((m) => m.id as ToolId);
```

(Delete the old literal `LAUNCH_COHORT` and `TOOL_DISPLAY_NAMES` blocks.)

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run packages/shared/tests/tool-manifests.test.ts && npx tsc --noEmit -p packages/shared/tsconfig.json`
Expected: PASS + tsc 0.

- [ ] **Step 5: Build shared dist + commit** (downstream tsc reads dist)

```bash
npx tsc -b packages/shared
git add packages/shared/src/tool-detection.ts packages/shared/tests/tool-manifests.test.ts
git commit -m "feat(shared): BUILTIN_TOOL_MANIFESTS source of truth + derived consts (#5)"
```

---

### Task 2: `agent` — declarative manifest loader

**Files:**
- Create: `packages/agent/src/tool-manifest-loader.ts`
- Test: `packages/agent/tests/tool-manifest-loader.test.ts`

**Interfaces:**
- Consumes: `ToolManifest` (Task 1).
- Produces: `loadThirdPartyManifests(deps?: ManifestLoaderDeps): ToolManifest[]`; `ManifestLoaderDeps { dir?: string; readDir?: (dir: string) => string[]; readFile?: (p: string) => string }`.

- [ ] **Step 1: Write the failing test** — `packages/agent/tests/tool-manifest-loader.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadThirdPartyManifests } from '../src/tool-manifest-loader.js';

function deps(files: Record<string, unknown>) {
  return {
    dir: '/fake',
    readDir: () => Object.keys(files),
    readFile: (p: string) => JSON.stringify(files[p.split('/').pop()!]),
  };
}

describe('loadThirdPartyManifests', () => {
  it('loads a valid PATH manifest, stamped builtin:false', () => {
    const out = loadThirdPartyManifests(deps({
      'foo.json': { id: 'foo-cli', displayName: 'Foo', launchable: true, hookCapable: false, hookPointer: '.foo/hm.json', detect: { kind: 'path', binaryName: 'foo' } },
    }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'foo-cli', builtin: false, detect: { kind: 'path', binaryName: 'foo' } });
  });

  it('rejects detect.kind:candidates (code-only strategy)', () => {
    const out = loadThirdPartyManifests(deps({
      'bad.json': { id: 'bad', displayName: 'B', launchable: true, hookCapable: false, hookPointer: '.b/hm.json', detect: { kind: 'candidates' } },
    }));
    expect(out).toEqual([]);
  });

  it('rejects shell-metachar / traversal in fields', () => {
    const out = loadThirdPartyManifests(deps({
      'evil.json': { id: 'evil', displayName: 'E', launchable: true, hookCapable: false, hookPointer: '../../etc/passwd', detect: { kind: 'path', binaryName: 'foo; rm -rf /' } },
    }));
    expect(out).toEqual([]);
  });

  it('returns [] when the dir is missing (readDir throws)', () => {
    expect(loadThirdPartyManifests({ dir: '/none', readDir: () => { throw new Error('ENOENT'); }, readFile: () => '' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/tool-manifest-loader.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `packages/agent/src/tool-manifest-loader.ts`:

```ts
/**
 * AI-OS #5 — declarative loader for third-party tool adapters from
 * ~/.waggle/adapters/*.json. Data only: zod-validated, safe-string-refined,
 * PATH-detection only, never require()/eval. Never throws into detection.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import type { ToolManifest } from '@waggle/shared';

// No shell metacharacters, no path traversal, non-empty, bounded.
const SAFE = /^[A-Za-z0-9._/\\-]+$/;
const safe = (max: number) =>
  z.string().min(1).max(max).refine((s) => SAFE.test(s) && !s.includes('..'), 'unsafe string');

const ManifestSchema = z.object({
  id: safe(64),
  displayName: z.string().min(1).max(80),
  launchable: z.boolean(),
  hookCapable: z.boolean(),
  hookPointer: safe(256),
  detect: z.object({ kind: z.literal('path'), binaryName: safe(128).refine((s) => !/[\\/]/.test(s), 'binaryName has a path separator') }),
  promptArgTemplate: z.array(z.string().max(256)).max(20).optional(),
});

export interface ManifestLoaderDeps {
  dir?: string;
  readDir?: (dir: string) => string[];
  readFile?: (p: string) => string;
}

export function loadThirdPartyManifests(deps: ManifestLoaderDeps = {}): ToolManifest[] {
  const dir = deps.dir ?? path.join(os.homedir(), '.waggle', 'adapters');
  const readDir = deps.readDir ?? ((d) => fs.readdirSync(d));
  const readFile = deps.readFile ?? ((p) => fs.readFileSync(p, 'utf8'));
  let names: string[];
  try { names = readDir(dir).filter((n) => n.endsWith('.json')); } catch { return []; }
  const out: ToolManifest[] = [];
  for (const name of names) {
    try {
      const parsed = ManifestSchema.safeParse(JSON.parse(readFile(path.join(dir, name))));
      if (parsed.success) out.push({ ...parsed.data, builtin: false });
    } catch { /* skip malformed file */ }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/agent/tests/tool-manifest-loader.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 5: Commit** (export wired in Task 3's commit)

```bash
git add packages/agent/src/tool-manifest-loader.ts packages/agent/tests/tool-manifest-loader.test.ts
git commit -m "feat(agent): declarative third-party tool-manifest loader (#5)"
```

---

### Task 3: `agent` — `getToolRegistry()`

**Files:**
- Create: `packages/agent/src/tool-registry.ts`
- Modify: `packages/agent/src/index.ts` (exports)
- Test: `packages/agent/tests/tool-registry.test.ts`

**Interfaces:**
- Consumes: `BUILTIN_TOOL_MANIFESTS` (Task 1), `loadThirdPartyManifests` (Task 2).
- Produces: `getToolRegistry(deps?: ManifestLoaderDeps): ToolManifest[]` (built-ins + loaded third-party; built-in ids win).

- [ ] **Step 1: Write the failing test** — `packages/agent/tests/tool-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getToolRegistry } from '../src/tool-registry.js';
import { SUPPORTED_TOOLS } from '@waggle/shared';

const fakeLoaderDeps = (manifests: unknown[]) => ({
  dir: '/fake',
  readDir: () => manifests.map((_, i) => `m${i}.json`),
  readFile: (p: string) => JSON.stringify(manifests[Number(p.match(/m(\d+)\.json/)![1])]),
});

describe('getToolRegistry', () => {
  it('includes all built-in tools when no third-party present', () => {
    const ids = getToolRegistry({ dir: '/none', readDir: () => { throw new Error('ENOENT'); }, readFile: () => '' }).map((m) => m.id);
    expect(ids.sort()).toEqual([...SUPPORTED_TOOLS].sort());
  });

  it('merges a valid third-party PATH adapter', () => {
    const reg = getToolRegistry(fakeLoaderDeps([
      { id: 'foo-cli', displayName: 'Foo', launchable: true, hookCapable: false, hookPointer: '.foo/hm.json', detect: { kind: 'path', binaryName: 'foo' } },
    ]));
    expect(reg.find((m) => m.id === 'foo-cli')).toMatchObject({ builtin: false });
    expect(reg.length).toBe(SUPPORTED_TOOLS.length + 1);
  });

  it('built-in id wins a third-party collision', () => {
    const reg = getToolRegistry(fakeLoaderDeps([
      { id: 'claude-code', displayName: 'HIJACK', launchable: true, hookCapable: false, hookPointer: '.x/hm.json', detect: { kind: 'path', binaryName: 'x' } },
    ]));
    const cc = reg.filter((m) => m.id === 'claude-code');
    expect(cc).toHaveLength(1);
    expect(cc[0].displayName).toBe('Claude Code');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/tool-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `packages/agent/src/tool-registry.ts`:

```ts
/**
 * AI-OS #5 — the tool-adapter registry. Pure data: the built-in manifests
 * (source of truth in @waggle/shared) merged with validated third-party
 * manifests from the loader. Built-in ids always win a collision so a
 * third-party file can never hijack a first-party tool.
 */
import { BUILTIN_TOOL_MANIFESTS, type ToolManifest } from '@waggle/shared';
import { loadThirdPartyManifests, type ManifestLoaderDeps } from './tool-manifest-loader.js';

export function getToolRegistry(deps?: ManifestLoaderDeps): ToolManifest[] {
  const builtins = [...BUILTIN_TOOL_MANIFESTS];
  const builtinIds = new Set(builtins.map((m) => m.id));
  const thirdParty = loadThirdPartyManifests(deps).filter((m) => !builtinIds.has(m.id));
  return [...builtins, ...thirdParty];
}
```

- [ ] **Step 4: Export + run** — add to `packages/agent/src/index.ts` (after the existing tool exports):

```ts
export { getToolRegistry } from './tool-registry.js';
export { loadThirdPartyManifests, type ManifestLoaderDeps } from './tool-manifest-loader.js';
```

Run: `npx vitest run packages/agent/tests/tool-registry.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit -p packages/agent/tsconfig.json
git add packages/agent/src/tool-registry.ts packages/agent/src/index.ts
git commit -m "feat(agent): getToolRegistry — built-ins + third-party, built-in wins (#5)"
```

---

### Task 4: `agent` — drive `detectInstalledTools` from the registry

**Files:**
- Modify: `packages/agent/src/tool-detection.ts` (the `detectInstalledTools` orchestrator + remove per-tool wrappers + `detectorsById`; keep `detectByPath`/`detectByCandidates`/`probeHooks`/candidate-path helpers)
- Test: `packages/agent/tests/tool-detection.test.ts` (existing — must stay green; add 1 case for a third-party path adapter)

**Interfaces:**
- Consumes: `getToolRegistry` (Task 3), `BUILTIN_TOOL_MANIFESTS` (for the candidate-resolver keys).

- [ ] **Step 1: Read** the existing `tool-detection.test.ts` to confirm the injected deps (`pathFromEnv`, `exists`, `execVersion`) and that it drives `detectInstalledTools(opts)`. The refactor must keep those exact seams.

- [ ] **Step 2: Write the failing test** — append to `tool-detection.test.ts` (mirror its existing `detectInstalledTools({...injected deps...})` setup; add a manifest-loader dep so a third-party adapter is present):

```ts
it('detects a third-party PATH adapter from the registry', async () => {
  const result = await detectInstalledTools({
    platform: 'linux',
    pathFromEnv: async (bin: string) => (bin === 'foo' ? '/usr/bin/foo' : null),
    exists: async (p: string) => p === '/usr/bin/foo',
    execVersion: async () => '1.0.0',
    // NEW: inject the manifest-loader deps so the registry includes a 3rd-party tool
    manifestLoader: {
      dir: '/fake',
      readDir: () => ['foo.json'],
      readFile: () => JSON.stringify({ id: 'foo-cli', displayName: 'Foo', launchable: true, hookCapable: false, hookPointer: '.foo/hm.json', detect: { kind: 'path', binaryName: 'foo' } }),
    },
  });
  const foo = result.tools.find((t) => t.id === 'foo-cli');
  expect(foo?.installed).toBe(true);
  expect(foo?.installedPath).toBe('/usr/bin/foo');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/tool-detection.test.ts -t "third-party"`
Expected: FAIL — registry not wired; `manifestLoader` dep unknown.

- [ ] **Step 4: Implement** in `packages/agent/src/tool-detection.ts`:

(a) Imports — add `getToolRegistry` + the manifest type, and `BUILTIN_TOOL_MANIFESTS` is already imported via shared (it imports `SUPPORTED_TOOLS`/`TOOL_DISPLAY_NAMES`):

```ts
import { getToolRegistry } from './tool-registry.js';
import type { ManifestLoaderDeps } from './tool-manifest-loader.js';
import type { ToolManifest } from '@waggle/shared';
```

(b) A candidate-resolver map keyed by built-in id (the escape hatch — the 3 desktop tools). Place it near the candidate-path helpers:

```ts
const CANDIDATE_RESOLVERS: Record<string, (deps: ResolvedDeps) => string[]> = {
  'cursor': cursorCandidatePaths,
  'claude-desktop': claudeDesktopCandidatePaths,
  'codex-desktop': codexDesktopCandidatePaths,
};
```

(c) A manifest-driven single detector replacing the per-tool wrappers:

```ts
async function detectFromManifest(m: ToolManifest, deps: ResolvedDeps): Promise<DetectedTool> {
  if (m.detect.kind === 'path') {
    return detectByPath(m.id as ToolId, m.detect.binaryName, deps, m.hookPointer, m.displayName);
  }
  const resolver = CANDIDATE_RESOLVERS[m.id];
  const candidates = resolver ? resolver(deps) : [];
  return detectByCandidates(m.id as ToolId, candidates, deps, /* withVersion */ false, m.hookPointer, m.displayName);
}
```

(d) Generalize `detectByPath` / `detectByCandidates` / `probeHooks` to take `hookPointer` + `displayName` as params instead of reading `TOOL_DISPLAY_NAMES[id]` / `HOOK_POINTER_BY_TOOL[id]` (so third-party ids work). Change their signatures to accept `hookPointer: string, displayName: string`, and have `probeHooks(hookPointer, deps)` use the passed pointer. Keep `HOOK_POINTER_BY_TOOL` as a derived export for back-compat:

```ts
// derived from the manifests (was a hand-authored Record)
export const HOOK_POINTER_BY_TOOL = Object.fromEntries(
  BUILTIN_TOOL_MANIFESTS.map((m) => [m.id, m.hookPointer]),
) as Record<ToolId, string>;
```

(Import `BUILTIN_TOOL_MANIFESTS` from `@waggle/shared` for this.)

(e) Replace `detectInstalledTools`'s body:

```ts
export async function detectInstalledTools(
  opts: ToolDetectionDeps & { manifestLoader?: ManifestLoaderDeps } = {},
): Promise<ToolDetectionResult> {
  const deps = resolveDeps(opts);
  const registry = getToolRegistry(opts.manifestLoader);
  const tools = await Promise.all(registry.map((m) => detectFromManifest(m, deps)));
  return { platform: deps.platform, detectedAt: new Date().toISOString(), tools };
}
```

(f) Delete `detectClaudeCode`, `detectCursor`, `detectClaudeDesktop`, `detectCodex`, `detectHermes`, `detectOpenClaw`, `detectCodexDesktop`, the old `detectorsById`, and the old hand-authored `HOOK_POINTER_BY_TOOL` block. Keep `detectByPath`, `detectByCandidates`, `probeHooks`, and the 3 `*CandidatePaths` helpers.

> Note: `detectByPath` currently hardcodes `pathFromEnv('claude')` only in the inline claude-code path — the generic `detectByPath` already takes `binaryName`, so claude-code now flows through it with `binaryName: 'claude'` from its manifest. Drop the special-case inline detector.

- [ ] **Step 5: Run the FULL existing suite + new case**

Run: `npx vitest run packages/agent/tests/tool-detection.test.ts`
Expected: PASS — all existing 7-tool detection assertions + the new third-party case.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit -p packages/agent/tsconfig.json
git add packages/agent/src/tool-detection.ts packages/agent/tests/tool-detection.test.ts
git commit -m "feat(agent): registry-driven detectInstalledTools (#5)"
```

---

### Task 5: `agent` — derive launcher cohorts from the registry

**Files:**
- Modify: `packages/agent/src/tool-launcher.ts` (`HOOKS_COHORT`, `hookPackageFor`, the `launchTool` cohort guard)
- Test: `packages/agent/tests/tool-launcher.test.ts` (existing — stays green; add a manifest-derivation assertion)

**Interfaces:**
- Consumes: `BUILTIN_TOOL_MANIFESTS` (Task 1).

- [ ] **Step 1: Write the failing test** — append to `tool-launcher.test.ts`:

```ts
import { BUILTIN_TOOL_MANIFESTS } from '@waggle/shared';
it('HOOKS_COHORT equals the hook-capable manifests (claude-desktop excluded)', () => {
  const expected = BUILTIN_TOOL_MANIFESTS.filter((m) => m.hookCapable).map((m) => m.id).sort();
  expect([...HOOKS_COHORT].sort()).toEqual(expected);
  expect(HOOKS_COHORT).not.toContain('claude-desktop');
});
```

(`HOOKS_COHORT` is already imported/exported from `tool-launcher.ts`; add the import if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/tool-launcher.test.ts -t "HOOKS_COHORT equals"`
Expected: FAIL — if the literal differs OR (more likely) passes already; if it passes, still proceed to make the derivation real so it can't drift.

- [ ] **Step 3: Implement** in `packages/agent/src/tool-launcher.ts` — replace the literal `HOOKS_COHORT` with a derived one and let `hookPackageFor` honor a manifest override:

```ts
import { BUILTIN_TOOL_MANIFESTS, type ToolId } from '@waggle/shared';

export const HOOKS_COHORT: readonly ToolId[] =
  BUILTIN_TOOL_MANIFESTS.filter((m) => m.hookCapable).map((m) => m.id as ToolId);
```

(Keep `LAUNCH_COHORT`'s import from shared as-is — it's already derived in Task 1. The `launchTool` guard `if (!LAUNCH_COHORT.includes(opts.id))` is unchanged.)

- [ ] **Step 4: Run the full launcher suite**

Run: `npx vitest run packages/agent/tests/tool-launcher.test.ts`
Expected: PASS (existing 39 + new).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit -p packages/agent/tsconfig.json
git add packages/agent/src/tool-launcher.ts packages/agent/tests/tool-launcher.test.ts
git commit -m "feat(agent): derive HOOKS_COHORT from the manifest registry (#5)"
```

---

### Task 6: `web` — derive LauncherApp cohorts from shared manifests

**Files:**
- Modify: `apps/web/src/components/os/apps/LauncherApp.tsx` (the local `LAUNCH_COHORT` / `HOOKS_COHORT` copies, ~lines 41–59)
- Test: `apps/web/src/components/os/apps/LauncherApp.test.tsx` (existing — stays green)

- [ ] **Step 1: Implement** — replace the hand-maintained local arrays with derivations from the shared manifests (kills the "kept local to avoid a runtime import" duplication the comments call out):

```ts
import { BUILTIN_TOOL_MANIFESTS } from '@waggle/shared';

const LAUNCH_COHORT = BUILTIN_TOOL_MANIFESTS.filter((m) => m.launchable).map((m) => m.id);
const HOOKS_COHORT = BUILTIN_TOOL_MANIFESTS.filter((m) => m.hookCapable).map((m) => m.id);
```

(Delete the two local literal arrays + their explanatory comments.)

- [ ] **Step 2: Run the LauncherApp suite + web typecheck**

Run: `cd apps/web && npx vitest run -c vitest.config.ts src/components/os/apps/LauncherApp.test.tsx && npx tsc --noEmit`
Expected: PASS (6 tests) + tsc 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/os/apps/LauncherApp.tsx
git commit -m "feat(web): derive LauncherApp cohorts from shared manifests (#5)"
```

---

### Final Gate

- [ ] **Build dists then full typecheck:** `npx tsc -b packages/shared packages/agent && npx tsc --noEmit -p packages/server/tsconfig.json && (cd apps/web && npx tsc --noEmit)` → 0.
- [ ] **Touched suites:** `npx vitest run packages/shared/tests/tool-manifests.test.ts packages/agent/tests/tool-manifest-loader.test.ts packages/agent/tests/tool-registry.test.ts packages/agent/tests/tool-detection.test.ts packages/agent/tests/tool-launcher.test.ts` + `(cd apps/web && npx vitest run -c vitest.config.ts src/components/os/apps/LauncherApp.test.tsx)`.
- [ ] **Server route sanity:** `npx vitest run packages/server/tests/tools-routes.test.ts packages/server/tests/tools-routes-launch.test.ts` (they consume detect/launch — must stay green).
- [ ] **Lint** touched files.

## Fast-follow (documented, NOT silently dropped)

**Third-party `promptArgTemplate` application.** The field is captured + validated in v1 but unwired:
the inline-prompt arg logic lives web-side (`apps/web/src/lib/launcher-prompt-args.ts`) and the dock
computes args before POSTing. Wiring a loaded manifest's `promptArgTemplate` means surfacing the
registry (or its prompt templates) to the web bundle — additive, deferred. Built-in prompt-args are
unchanged.

## Self-Review

**Spec coverage:** §3 Unit A → Task 1 · Unit B (registry) → Task 3 · Unit B (detection) → Task 4 · Unit B (launcher) → Task 5 · Unit C (loader) → Task 2 · web derivation (§7 file list) → Task 6 · §5 security → Task 2 tests. The `promptArgTemplate` application is logged as a fast-follow (field captured in Task 1).

**Placeholder scan:** Task 4 Step 1 + Task 6 are read/edit steps with concrete code; no TBD/TODO. Every code step ships real code.

**Type consistency:** `ToolManifest`/`ToolDetectSpec` (Task 1) consumed unchanged in Tasks 2–6. `loadThirdPartyManifests(deps)` (Task 2) → `getToolRegistry(deps)` (Task 3) → `detectInstalledTools({manifestLoader})` (Task 4). `getToolRegistry` returns `ToolManifest[]`. `detectFromManifest`/`CANDIDATE_RESOLVERS` names consistent within Task 4. `HOOKS_COHORT`/`LAUNCH_COHORT` derived identically in Tasks 1/5/6.
