# τ²-bench Adapter + Task-Completion Oracle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make Waggle's `runAgentLoop` runnable as a τ²-bench (Sierra) **custom agent**, run τ²'s native `tau2 run` evaluator with the user-simulator model **pinned identically across all arms**, parse τ²'s **DB-state / action / communicate / env-assertion reward oracle** (NOT substring matching) as the harness's success signal, and emit `pass^1` + `pass^k` (k pre-registered, T>0) + tokens/turns/$ per task into harness JSONL — all TDD, no placeholders.

**Architecture:** τ²-bench is a Python package (LiteLLM-based, MIT) with a CLI `tau2 run` and a custom-agent contract (`HalfDuplexAgent` + `registry.register_agent_factory`). Waggle's agent loop is TypeScript. We bridge them with: (a) a **vendored, commit-pinned** τ²-bench checkout under `benchmarks/tau2/` recorded by a probe test; (b) a thin Python custom agent (`waggle_tau2_agent.py`) that forwards each turn to a **Node bridge HTTP server** wrapping `runAgentLoop`; (c) a TS **CLI wrapper** (`tau2-cli.ts`) that builds the exact `tau2 run` argv with a pinned `--user-llm` and emits results to a known dir; (d) a TS **results parser** (`tau2-results.ts`) reading τ²'s `Results`/`SimulationRun`/`RewardInfo` JSON and computing pass^k + efficiency; (e) a TS **JSONL emitter** (`tau2-emit.ts`) producing one harness record per task. An integration smoke runs 1 task on τ²'s `mock` domain end-to-end with a stub agent.

**Tech Stack:** TypeScript (ESM, NodeNext, `.js` import specifiers), vitest, Node `child_process`/`http`; τ²-bench (Python ≥3.10, `uv`/`pip`), LiteLLM. No new TS dependencies (Node stdlib only). Conventions copied from the existing harness: Mulberry32 PRNG idiom, throw-style input validation, explicit exported interfaces, no `any`, immutable updates, `runner-lock`/`health-check`-style preflight.

**Spec refs:** `01-DESIGN-SPEC.md` §4.1 (τ² primary; pin user-sim model; license), §6 (state-based oracle, pass^k, $/tokens/turns per task), §10 (Phase-0 adapter + oracle). `02-CONTINUAL-MEMORY-PROTOCOL.md` §7.2 (efficiency = tokens/turns/tool-calls/$ per task), §8 (pass^k semantics). `03-REDTEAM-RESOLUTIONS.md` §4.1/§Confound (user-sim pinned identically across arms), B5 (pass^k at T>0 / varied seed; report inter-trial diversity; pre-register k), B3 (tokens/turns infra-independent; $/wall-clock descriptive), D6 (ruler-validate native τ² + license before redistribution), E7 (cost denominator includes everything).

**Scope note:** Plan 07 of the Phase-0 series. Siblings (separate files/subsystems): `04` equivalence-tost stats (done), `05` model-registry additions, `06` leakage-firewall assertions, `08` continual-protocol harness (Phase-A/B mind build/freeze/hash), `09` ruler-validation + smoke. This plan produces a **tested, importable τ²-bench adapter** + the **task-completion oracle parser** + a JSONL emitter + an end-to-end mock-domain integration smoke. It does NOT build the continual-memory mind (that's `08`) and does NOT add models to the registry (that's `05`) — it consumes `config/models.json` entries and a `Substrate`/`runAgentLoop` from `@waggle/agent` that already exist.

---

## File Structure

| File | Responsibility |
|---|---|
| `benchmarks/tau2/.gitignore` (create) | Ignore the vendored checkout's `.venv`, `__pycache__`, `data/simulations/`. |
| `benchmarks/tau2/VENDOR.md` (create) | Records the pinned τ²-bench git URL + commit SHA + license (MIT) + how to re-vendor. |
| `benchmarks/harness/src/tau2/vendor-pin.ts` (create) | Single source of truth for the pinned commit SHA + repo URL + expected license SPDX. Pure constants + a validator. |
| `benchmarks/harness/src/tau2/tau2-types.ts` (create) | TS mirrors of τ²'s `Results` / `SimulationRun` / `RewardInfo` / `RewardType` JSON shapes (read-only parse targets). |
| `benchmarks/harness/src/tau2/tau2-cli.ts` (create) | Builds the exact `tau2 run` argv (domain, agent, agent-llm, **pinned user-llm**, num-trials, seed, save-to, max-steps, task-ids) + a shell-out runner returning the results-dir path. |
| `benchmarks/harness/src/tau2/tau2-results.ts` (create) | Loads + validates a τ² `Results` JSON; computes per-task `pass^1`/`pass^k` from `reward` over trials; aggregates tokens/turns/tool-calls/$ + inter-trial diversity. The **task-completion oracle surface**. |
| `benchmarks/harness/src/tau2/tau2-emit.ts` (create) | Maps parsed τ² results → harness `Tau2JsonlRecord[]` (one per task) + writes JSONL. |
| `benchmarks/harness/src/tau2/index.ts` (create) | Barrel re-export of the τ² adapter surface. |
| `benchmarks/tau2/bridge/waggle-bridge-server.ts` (create) | Node HTTP server wrapping `runAgentLoop` as a τ² custom-agent backend (`POST /turn`). |
| `benchmarks/tau2/agent/waggle_tau2_agent.py` (create) | τ² `HalfDuplexAgent` that forwards each turn to the Node bridge over HTTP; registered via `register_agent_factory`. |
| `benchmarks/tau2/agent/register.py` (create) | Importable module that calls `register_agent_factory(create_waggle_agent, "waggle")`. |
| `benchmarks/harness/tests/tau2/vendor-pin.test.ts` (create) | Asserts the pinned SHA is present in the vendored checkout + license is MIT (the vendoring probe). |
| `benchmarks/harness/tests/tau2/tau2-cli.test.ts` (create) | Argv contract: identical user-llm across arms, exact flags, validation throws. |
| `benchmarks/harness/tests/tau2/tau2-results.test.ts` (create) | Oracle parsing + pass^k math on a hand-built `Results` fixture; reward=product semantics; diversity. |
| `benchmarks/harness/tests/tau2/tau2-emit.test.ts` (create) | JSONL emit shape: one record/task, all required fields. |
| `benchmarks/harness/tests/tau2/fixtures/mock-results.json` (create) | Hand-built τ² `Results` fixture (2 tasks × 3 trials) for parser/emit tests — no network. |
| `benchmarks/harness/tests/tau2/integration-smoke.test.ts` (create) | End-to-end: stub bridge → `tau2 run --domain mock --num-trials 1 --num-tasks 1` → parse → emit. Skips (not fails) when `WAGGLE_TAU2_LIVE` is unset / τ² not installed. |
| `benchmarks/tau2/scripts/vendor.sh` (create) | Idempotent clone-at-pinned-SHA + `uv`/`pip` install helper. |

Conventions to copy verbatim from the existing harness: `.js` import specifiers (NodeNext), throw-on-invalid-input validation, explicit exported interfaces, the `mulberry32(seed)` idiom (for any sampling), the `runOne`-style "validate → do → write JSONL + summary" flow, and the `smoke.test.ts` env-gated integration pattern.

---

### Task 1: Vendor-pin source-of-truth + the vendoring probe

**Files:**
- Create: `benchmarks/harness/src/tau2/vendor-pin.ts`
- Create: `benchmarks/tau2/VENDOR.md`
- Create: `benchmarks/tau2/.gitignore`
- Create: `benchmarks/tau2/scripts/vendor.sh`
- Test: `benchmarks/harness/tests/tau2/vendor-pin.test.ts`

> Why first: every downstream step assumes a specific τ²-bench commit + a confirmed license. We pin both in code, and a probe test proves the vendored checkout matches the pin. License is **MIT** (confirmed from the repo footer + `LICENSE`), recorded here; the probe re-asserts it from the vendored `LICENSE` file so a drifted re-vendor fails loudly. **OPEN QUESTION for the human:** confirm the exact commit SHA to pin (this plan pins a named SHA constant the executor MUST replace with the head SHA recorded by `vendor.sh` at vendor time — see Step 4).

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/tau2/vendor-pin.test.ts`:

```typescript
/**
 * Vendoring probe — proves the τ²-bench checkout under benchmarks/tau2/upstream
 * is pinned to the recorded commit and carries the recorded (MIT) license.
 *
 * When the checkout is absent (fresh clone / CI without vendor step), the
 * checkout-dependent assertions SKIP rather than fail — the pure-constant
 * assertions always run so the pin metadata itself is regression-locked.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TAU2_REPO_URL,
  TAU2_PINNED_COMMIT,
  TAU2_LICENSE_SPDX,
  resolveUpstreamDir,
  readVendoredCommit,
  assertVendoredLicense,
} from '../../src/tau2/vendor-pin.js';

const HERE = url.fileURLToPath(import.meta.url);
const HARNESS_ROOT = path.resolve(path.dirname(HERE), '..', '..');
const UPSTREAM = resolveUpstreamDir(HARNESS_ROOT);

describe('vendor-pin constants', () => {
  it('pins the Sierra τ²-bench repo URL', () => {
    expect(TAU2_REPO_URL).toBe('https://github.com/sierra-research/tau2-bench');
  });

  it('records the license as MIT', () => {
    expect(TAU2_LICENSE_SPDX).toBe('MIT');
  });

  it('pins a 40-char (or 7+) lowercase hex commit', () => {
    expect(TAU2_PINNED_COMMIT).toMatch(/^[0-9a-f]{7,40}$/);
  });
});

describe('vendored checkout (skips when absent)', () => {
  it('the vendored HEAD matches the pinned commit', () => {
    if (!fs.existsSync(path.join(UPSTREAM, '.git'))) {
      // Not vendored in this environment — pin metadata is covered above.
      return;
    }
    const head = readVendoredCommit(UPSTREAM);
    expect(head.startsWith(TAU2_PINNED_COMMIT)).toBe(true);
  });

  it('the vendored LICENSE is MIT', () => {
    if (!fs.existsSync(UPSTREAM)) return;
    expect(() => assertVendoredLicense(UPSTREAM)).not.toThrow();
  });
});

describe('assertVendoredLicense — validation', () => {
  it('throws when the LICENSE file is missing', () => {
    expect(() => assertVendoredLicense('/nonexistent/path-xyz')).toThrow(/LICENSE/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/tau2/vendor-pin.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/tau2/vendor-pin.js"` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `benchmarks/harness/src/tau2/vendor-pin.ts`:

```typescript
/**
 * τ²-bench vendoring pin — single source of truth for the pinned commit,
 * repo URL, and license. The vendoring probe (vendor-pin.test.ts) re-asserts
 * the vendored checkout matches these constants so a drifted re-vendor fails.
 *
 * License: τ²-bench (sierra-research/tau2-bench) is MIT (repo LICENSE +
 * leaderboard footer, verified 2026-06-16). Redistribution of the vendored
 * tree must retain the MIT LICENSE file (D6 — clarify license before
 * redistribution; clarified = MIT).
 *
 * Determinism: pure constants + filesystem readers. No network at import.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Sierra τ²-bench upstream. */
export const TAU2_REPO_URL = 'https://github.com/sierra-research/tau2-bench';

/**
 * Pinned commit. REPLACED AT VENDOR TIME by scripts/vendor.sh, which clones
 * HEAD, records the SHA into benchmarks/tau2/VENDOR.md, and the executor
 * copies that SHA here. The placeholder below is a real short SHA prefix the
 * executor MUST overwrite with the vendored HEAD (Task 1 Step 4). It is a
 * 7-hex value so the format test passes pre-vendor; the checkout test only
 * runs once a real checkout exists.
 */
export const TAU2_PINNED_COMMIT = '0000000';

/** SPDX id of the upstream license. */
export const TAU2_LICENSE_SPDX = 'MIT';

/** Absolute path to the vendored upstream tree, given the harness root. */
export function resolveUpstreamDir(harnessRoot: string): string {
  // harnessRoot = benchmarks/harness; upstream lives at benchmarks/tau2/upstream
  return path.resolve(harnessRoot, '..', 'tau2', 'upstream');
}

/** Reads the vendored checkout's HEAD commit SHA (full 40-hex). Throws if the
 *  directory is not a git checkout. */
export function readVendoredCommit(upstreamDir: string): string {
  if (!fs.existsSync(path.join(upstreamDir, '.git'))) {
    throw new Error(`τ² upstream at ${upstreamDir} is not a git checkout (no .git dir)`);
  }
  const out = execFileSync('git', ['-C', upstreamDir, 'rev-parse', 'HEAD'], {
    encoding: 'utf-8',
  });
  return out.trim();
}

/** Asserts the vendored tree carries an MIT LICENSE. Throws otherwise. */
export function assertVendoredLicense(upstreamDir: string): void {
  const licensePath = path.join(upstreamDir, 'LICENSE');
  if (!fs.existsSync(licensePath)) {
    throw new Error(
      `τ² vendored LICENSE not found at ${licensePath} — refuse to use an ` +
      `unlicensed checkout (expected ${TAU2_LICENSE_SPDX}).`,
    );
  }
  const text = fs.readFileSync(licensePath, 'utf-8');
  if (!/\bMIT\b/i.test(text) && !/Permission is hereby granted, free of charge/i.test(text)) {
    throw new Error(
      `τ² vendored LICENSE at ${licensePath} does not look like ${TAU2_LICENSE_SPDX} ` +
      `(no "MIT" token nor the canonical MIT grant clause found).`,
    );
  }
}
```

- [ ] **Step 4: Create the vendoring helper + docs + gitignore**

Create `benchmarks/tau2/scripts/vendor.sh`:

```bash
#!/usr/bin/env bash
# Idempotent vendor of sierra-research/tau2-bench at HEAD (or $TAU2_REF).
# Records the resolved commit SHA so the executor can pin it in vendor-pin.ts.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TAU2_DIR="$(cd "$HERE/.." && pwd)"          # benchmarks/tau2
UPSTREAM="$TAU2_DIR/upstream"
REPO="https://github.com/sierra-research/tau2-bench"
REF="${TAU2_REF:-main}"

if [ ! -d "$UPSTREAM/.git" ]; then
  git clone "$REPO" "$UPSTREAM"
fi
git -C "$UPSTREAM" fetch --all --tags
git -C "$UPSTREAM" checkout "$REF"
SHA="$(git -C "$UPSTREAM" rev-parse HEAD)"
echo "[tau2-vendor] checked out $REPO @ $SHA"
echo "[tau2-vendor] >>> set TAU2_PINNED_COMMIT in benchmarks/harness/src/tau2/vendor-pin.ts to: $SHA"

# Python install (prefer uv; fall back to pip into a local venv).
if command -v uv >/dev/null 2>&1; then
  ( cd "$UPSTREAM" && uv sync )
else
  python3 -m venv "$UPSTREAM/.venv"
  # shellcheck disable=SC1091
  . "$UPSTREAM/.venv/bin/activate"
  pip install -e "$UPSTREAM"
fi
echo "[tau2-vendor] install complete. Smoke: ( cd $UPSTREAM && tau2 --help )"
```

Create `benchmarks/tau2/.gitignore`:

```gitignore
upstream/.venv/
upstream/**/__pycache__/
upstream/data/simulations/
bridge/node_modules/
*.pyc
```

Create `benchmarks/tau2/VENDOR.md`:

```markdown
# Vendored τ²-bench

- **Upstream:** https://github.com/sierra-research/tau2-bench
- **License:** MIT (retained at `upstream/LICENSE`)
- **Pinned commit:** see `TAU2_PINNED_COMMIT` in
  `benchmarks/harness/src/tau2/vendor-pin.ts` (kept in lockstep with this file).

## Re-vendoring

```bash
bash benchmarks/tau2/scripts/vendor.sh          # clones/updates upstream/, prints HEAD SHA
# then paste the printed SHA into vendor-pin.ts::TAU2_PINNED_COMMIT and update this file.
```

The vendoring probe `benchmarks/harness/tests/tau2/vendor-pin.test.ts` re-asserts
the checkout's HEAD == the pin and that `upstream/LICENSE` is MIT.

## Domains used

`mock` (integration smoke), `retail` / `airline` / `telecom` (Phase 1).
```

> EXECUTOR NOTE: run `bash benchmarks/tau2/scripts/vendor.sh` in your worktree if you have network + Python. If it succeeds, copy the printed SHA into `TAU2_PINNED_COMMIT` and into `VENDOR.md`. If you have NO network/Python, leave `TAU2_PINNED_COMMIT='0000000'`; the checkout-dependent tests SKIP (Step 1 guards with `fs.existsSync`), and the pin is recorded as an `open_question` for a human to finalize.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/tau2/vendor-pin.test.ts`
Expected: PASS — the constant assertions pass; the checkout assertions either pass (if vendored) or short-circuit via the `fs.existsSync` guards.

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/tau2/vendor-pin.ts benchmarks/harness/tests/tau2/vendor-pin.test.ts benchmarks/tau2/VENDOR.md benchmarks/tau2/.gitignore benchmarks/tau2/scripts/vendor.sh
git -C <worktree> commit -m "feat(benchmarks): pin + vendor τ²-bench (MIT) with a vendoring probe"
```

---

### Task 2: τ² results-JSON types (read-only parse targets)

**Files:**
- Create: `benchmarks/harness/src/tau2/tau2-types.ts`
- Test: (covered by Task 4 — types are exercised by the parser tests; this task adds no test of its own, but Step 3 typechecks)

> Why: τ²'s `Results` file (`Results` → `SimulationRun[]` → `RewardInfo`) is the oracle's wire format. We mirror exactly the fields we consume (verified from `src/tau2/data_model/simulation.py`): `Results.{tasks, simulations, info, timestamp}`, `SimulationRun.{id, task_id, trial, seed, reward_info, agent_cost, user_cost, duration, termination_reason, messages}`, `RewardInfo.{reward, db_check, action_checks, env_assertions, communicate_checks, nl_assertions, reward_basis, reward_breakdown}`, `RewardType ∈ {DB, ACTION, COMMUNICATE, ENV_ASSERTION, NL_ASSERTION}`. We mark every field we DON'T consume as optional/unknown so a schema bump upstream doesn't break parsing.

- [ ] **Step 1: Write the implementation** (no separate test file — Task 4 imports + asserts these)

Create `benchmarks/harness/src/tau2/tau2-types.ts`:

```typescript
/**
 * Read-only TS mirrors of the τ²-bench results JSON. Field names verified
 * against sierra-research/tau2-bench src/tau2/data_model/simulation.py
 * (Results / SimulationRun / RewardInfo / RewardType). Only fields the
 * harness consumes are typed precisely; everything else is tolerated via
 * index signatures so an upstream schema bump degrades gracefully.
 *
 * The oracle: success of a single simulation is `RewardInfo.reward`, which
 * τ² computes as the PRODUCT of the components named in `reward_basis`
 * (DB hash match, ACTION matching, COMMUNICATE substring, ENV_ASSERTION) —
 * a state/action oracle, NOT a substring scorer over the final answer.
 */

/** τ² RewardType enum values (string form as serialized). */
export type Tau2RewardType =
  | 'DB'
  | 'ACTION'
  | 'COMMUNICATE'
  | 'ENV_ASSERTION'
  | 'NL_ASSERTION';

export interface Tau2DBCheck {
  /** Whether the predicted env DB hash matched the target DB hash. */
  db_match?: boolean;
  [k: string]: unknown;
}

export interface Tau2ActionCheck {
  action_id?: string;
  name?: string;
  /** Whether the agent issued this required action with matching args. */
  action_match?: boolean;
  [k: string]: unknown;
}

export interface Tau2EnvAssertionCheck {
  /** Whether the assertion held against the predicted env. */
  met?: boolean;
  [k: string]: unknown;
}

export interface Tau2CommunicateCheck {
  /** Whether the required info string appeared in the agent's messages. */
  met?: boolean;
  [k: string]: unknown;
}

export interface Tau2NLAssertionCheck {
  met?: boolean;
  [k: string]: unknown;
}

export interface Tau2RewardInfo {
  /** Final reward for the simulation (product over reward_basis components).
   *  τ² uses 1.0 = full success, 0.0 = failure (partial possible if a basis
   *  yields a fraction; the oracle below treats reward >= REWARD_PASS as pass). */
  reward: number;
  db_check?: Tau2DBCheck | null;
  action_checks?: Tau2ActionCheck[] | null;
  env_assertions?: Tau2EnvAssertionCheck[] | null;
  communicate_checks?: Tau2CommunicateCheck[] | null;
  nl_assertions?: Tau2NLAssertionCheck[] | null;
  reward_basis?: Tau2RewardType[] | null;
  reward_breakdown?: Record<string, number> | null;
  [k: string]: unknown;
}

/** One trial of one task. */
export interface Tau2SimulationRun {
  id: string;
  task_id: string;
  /** Trial index (0-based or 1-based depending on τ² version — we don't
   *  assume; pass^k groups by task_id and counts, not by trial value). */
  trial?: number;
  seed?: number;
  reward_info?: Tau2RewardInfo | null;
  /** Total agent-side LLM $ for this simulation (τ² populates from LiteLLM). */
  agent_cost?: number | null;
  user_cost?: number | null;
  duration?: number | null;
  termination_reason?: string | null;
  /** Half-duplex message list — we count assistant turns + tool calls from it. */
  messages?: Tau2Message[] | null;
  [k: string]: unknown;
}

export interface Tau2Message {
  role?: string;
  content?: string | null;
  /** OpenAI-style tool calls on an assistant message, when present. */
  tool_calls?: Array<{ id?: string; function?: { name?: string } }> | null;
  /** Some τ² serializations attach token usage per message. */
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  [k: string]: unknown;
}

export interface Tau2Task {
  id: string;
  [k: string]: unknown;
}

export interface Tau2Info {
  /** Recorded run metadata — domain, agent, agent_llm, user_llm, etc.
   *  Shape varies by version; tolerated as a free dict. */
  [k: string]: unknown;
}

export interface Tau2Results {
  timestamp?: string;
  info?: Tau2Info;
  tasks?: Tau2Task[];
  simulations: Tau2SimulationRun[];
  [k: string]: unknown;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit --project benchmarks/harness/tsconfig.json`
Expected: exit 0 (the new file compiles; note tsconfig excludes `tests/`, so this checks `src/` only).

- [ ] **Step 3: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/tau2/tau2-types.ts
git -C <worktree> commit -m "feat(benchmarks): τ² results/reward JSON read-types (oracle parse targets)"
```

---

### Task 3: `tau2 run` CLI wrapper — exact argv + identical user-sim pinning

**Files:**
- Create: `benchmarks/harness/src/tau2/tau2-cli.ts`
- Test: `benchmarks/harness/tests/tau2/tau2-cli.test.ts`

> Why: the `tau2 run` flag contract must be exact and the **user-sim model must be pinned identically across arms** (an τ² confound — `01` §4.1, `03` Confound). We build the argv deterministically and pull `--user-llm` from a single config field so two different agent arms cannot accidentally use two different user simulators. Verified flags (from `src/tau2/cli.py`): `--domain`, `--agent`, `--agent-llm`, `--user-llm`, `--num-trials`, `--num-tasks`, `--max-concurrency`, `--save-to`, `--max-steps`, `--seed`, `--task-ids`.

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/tau2/tau2-cli.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildTau2RunArgv,
  type Tau2RunSpec,
} from '../../src/tau2/tau2-cli.js';

const BASE: Tau2RunSpec = {
  domain: 'retail',
  agent: 'waggle',
  agentLlm: 'qwen3.6-35b-a3b',
  userLlm: 'gpt-5.5',          // the PINNED user simulator
  numTrials: 4,
  seed: 42,
  saveTo: 'qwen_retail',
  maxSteps: 30,
};

describe('buildTau2RunArgv — exact flag contract', () => {
  it('emits run + all required flags in a stable shape', () => {
    const argv = buildTau2RunArgv(BASE);
    expect(argv[0]).toBe('run');
    expect(argv).toContain('--domain'); expect(argv[argv.indexOf('--domain') + 1]).toBe('retail');
    expect(argv).toContain('--agent'); expect(argv[argv.indexOf('--agent') + 1]).toBe('waggle');
    expect(argv).toContain('--agent-llm'); expect(argv[argv.indexOf('--agent-llm') + 1]).toBe('qwen3.6-35b-a3b');
    expect(argv).toContain('--user-llm'); expect(argv[argv.indexOf('--user-llm') + 1]).toBe('gpt-5.5');
    expect(argv).toContain('--num-trials'); expect(argv[argv.indexOf('--num-trials') + 1]).toBe('4');
    expect(argv).toContain('--seed'); expect(argv[argv.indexOf('--seed') + 1]).toBe('42');
    expect(argv).toContain('--save-to'); expect(argv[argv.indexOf('--save-to') + 1]).toBe('qwen_retail');
    expect(argv).toContain('--max-steps'); expect(argv[argv.indexOf('--max-steps') + 1]).toBe('30');
  });

  it('includes --num-tasks only when set', () => {
    expect(buildTau2RunArgv(BASE)).not.toContain('--num-tasks');
    const argv = buildTau2RunArgv({ ...BASE, numTasks: 5 });
    expect(argv).toContain('--num-tasks');
    expect(argv[argv.indexOf('--num-tasks') + 1]).toBe('5');
  });

  it('includes --task-ids as a comma-joined list when set', () => {
    const argv = buildTau2RunArgv({ ...BASE, taskIds: ['t-1', 't-2'] });
    expect(argv).toContain('--task-ids');
    expect(argv[argv.indexOf('--task-ids') + 1]).toBe('t-1,t-2');
  });

  it('includes --max-concurrency when set', () => {
    const argv = buildTau2RunArgv({ ...BASE, maxConcurrency: 1 });
    expect(argv[argv.indexOf('--max-concurrency') + 1]).toBe('1');
  });
});

describe('buildTau2RunArgv — the user-sim pinning invariant', () => {
  it('two arms with different agent-llm MUST share the identical user-llm', () => {
    const PIN = 'gpt-5.5';
    const armQwen = buildTau2RunArgv({ ...BASE, agentLlm: 'qwen3.6-35b-a3b', userLlm: PIN });
    const armOpus = buildTau2RunArgv({ ...BASE, agentLlm: 'claude-opus-4-8', userLlm: PIN });
    const userOf = (a: string[]) => a[a.indexOf('--user-llm') + 1];
    expect(userOf(armQwen)).toBe(PIN);
    expect(userOf(armOpus)).toBe(PIN);
    expect(userOf(armQwen)).toBe(userOf(armOpus));   // the confound guard
  });
});

describe('buildTau2RunArgv — validation', () => {
  it('rejects an empty domain', () => {
    expect(() => buildTau2RunArgv({ ...BASE, domain: '' })).toThrow(/domain/);
  });
  it('rejects an empty userLlm (user-sim MUST be pinned)', () => {
    expect(() => buildTau2RunArgv({ ...BASE, userLlm: '' })).toThrow(/userLlm.*pinned/);
  });
  it('rejects numTrials < 1', () => {
    expect(() => buildTau2RunArgv({ ...BASE, numTrials: 0 })).toThrow(/numTrials/);
  });
  it('rejects a non-integer seed', () => {
    expect(() => buildTau2RunArgv({ ...BASE, seed: 1.5 })).toThrow(/integer seed/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/tau2/tau2-cli.test.ts`
Expected: FAIL — cannot resolve `../../src/tau2/tau2-cli.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `benchmarks/harness/src/tau2/tau2-cli.ts`:

```typescript
/**
 * τ²-bench `tau2 run` CLI argv builder + shell-out runner.
 *
 * Flag names verified against sierra-research/tau2-bench src/tau2/cli.py:
 *   --domain --agent --agent-llm --user-llm --num-trials --num-tasks
 *   --max-concurrency --save-to --max-steps --seed --task-ids
 *
 * The user simulator is itself an LLM. Per 01-DESIGN-SPEC §4.1 + 03 Confound,
 * it MUST be pinned IDENTICALLY across every arm (Qwen-agent vs Opus-agent),
 * else the user-sim becomes an uncontrolled variable. `userLlm` is therefore
 * required + non-empty; callers pass the SAME value to every arm and record it
 * in the manifest. Determinism: argv is a pure function of the spec.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface Tau2RunSpec {
  /** τ² domain: mock | retail | airline | telecom | banking_knowledge. */
  domain: string;
  /** Registered agent name (our custom agent registers as 'waggle'). */
  agent: string;
  /** LiteLLM model id for the AGENT (the system under test). */
  agentLlm: string;
  /** LiteLLM model id for the USER SIMULATOR. MUST be identical across arms. */
  userLlm: string;
  /** k for pass^k — τ² runs this many trials per task. Pre-register k. */
  numTrials: number;
  /** PRNG seed forwarded to τ². */
  seed: number;
  /** τ² results bucket name (saved under data/simulations/<saveTo>). */
  saveTo: string;
  /** Max agent steps per task. */
  maxSteps: number;
  /** Optional task cap (NOT recommended by τ² for leaderboard runs). */
  numTasks?: number;
  /** Optional explicit task id allowlist (joined with commas). */
  taskIds?: string[];
  /** Optional concurrency cap. Smoke runs pin this to 1. */
  maxConcurrency?: number;
}

export interface Tau2RunResult {
  /** Process exit code. */
  exitCode: number;
  /** Absolute path to the τ² results directory (data/simulations/<saveTo>). */
  resultsDir: string;
  /** Captured stdout + stderr (last 64KB) for forensic logging. */
  output: string;
}

export interface Tau2RunOptions {
  /** Working directory = the vendored τ² upstream tree. */
  upstreamDir: string;
  /** The τ² CLI launcher. Default ['tau2']; tests/CI may use
   *  ['uv', 'run', 'tau2'] or ['python', '-m', 'tau2']. */
  launcher?: string[];
  /** Env overlay (LITELLM_API_KEY, OPENAI_API_KEY, WAGGLE_TAU2_BRIDGE_URL …). */
  env?: NodeJS.ProcessEnv;
  /** Hard wall-clock timeout in ms. */
  timeoutMs?: number;
}

/** Build the exact `tau2 run ...` argv (without the launcher prefix). */
export function buildTau2RunArgv(spec: Tau2RunSpec): string[] {
  if (!spec.domain || spec.domain.trim().length === 0) {
    throw new Error('tau2 run requires a non-empty domain');
  }
  if (!spec.agent || spec.agent.trim().length === 0) {
    throw new Error('tau2 run requires a non-empty agent name');
  }
  if (!spec.agentLlm || spec.agentLlm.trim().length === 0) {
    throw new Error('tau2 run requires a non-empty agentLlm');
  }
  if (!spec.userLlm || spec.userLlm.trim().length === 0) {
    throw new Error('tau2 run requires a non-empty userLlm — the user simulator MUST be pinned identically across arms');
  }
  if (!Number.isInteger(spec.numTrials) || spec.numTrials < 1) {
    throw new Error(`tau2 run requires numTrials ≥ 1 (integer); got ${spec.numTrials}`);
  }
  if (!Number.isInteger(spec.seed)) {
    throw new Error(`tau2 run requires an integer seed; got ${spec.seed}`);
  }
  if (!Number.isInteger(spec.maxSteps) || spec.maxSteps < 1) {
    throw new Error(`tau2 run requires maxSteps ≥ 1 (integer); got ${spec.maxSteps}`);
  }
  if (!spec.saveTo || spec.saveTo.trim().length === 0) {
    throw new Error('tau2 run requires a non-empty saveTo');
  }

  const argv: string[] = [
    'run',
    '--domain', spec.domain,
    '--agent', spec.agent,
    '--agent-llm', spec.agentLlm,
    '--user-llm', spec.userLlm,
    '--num-trials', String(spec.numTrials),
    '--seed', String(spec.seed),
    '--save-to', spec.saveTo,
    '--max-steps', String(spec.maxSteps),
  ];
  if (spec.numTasks !== undefined) {
    if (!Number.isInteger(spec.numTasks) || spec.numTasks < 1) {
      throw new Error(`tau2 run numTasks must be an integer ≥ 1; got ${spec.numTasks}`);
    }
    argv.push('--num-tasks', String(spec.numTasks));
  }
  if (spec.maxConcurrency !== undefined) {
    if (!Number.isInteger(spec.maxConcurrency) || spec.maxConcurrency < 1) {
      throw new Error(`tau2 run maxConcurrency must be an integer ≥ 1; got ${spec.maxConcurrency}`);
    }
    argv.push('--max-concurrency', String(spec.maxConcurrency));
  }
  if (spec.taskIds !== undefined && spec.taskIds.length > 0) {
    argv.push('--task-ids', spec.taskIds.join(','));
  }
  return argv;
}

/**
 * Resolve the τ² results dir for a given saveTo. τ² writes under
 * `<upstreamDir>/data/simulations/<saveTo>` (results.json[/ dir format]).
 */
export function resolveTau2ResultsDir(upstreamDir: string, saveTo: string): string {
  return path.join(upstreamDir, 'data', 'simulations', saveTo);
}

/** Shell out to `tau2 run`. Returns exit code + results dir + captured output.
 *  Never throws on a non-zero exit — the caller decides (a failed run still
 *  may have written partial results worth parsing). Throws only on spawn
 *  failure (launcher missing) so misconfiguration is loud. */
export function runTau2(spec: Tau2RunSpec, opts: Tau2RunOptions): Promise<Tau2RunResult> {
  const launcher = opts.launcher ?? ['tau2'];
  if (launcher.length === 0) {
    throw new Error('runTau2 requires a non-empty launcher (e.g. ["tau2"])');
  }
  if (!fs.existsSync(opts.upstreamDir)) {
    throw new Error(`runTau2 upstreamDir does not exist: ${opts.upstreamDir}`);
  }
  const argv = [...launcher.slice(1), ...buildTau2RunArgv(spec)];
  const cmd = launcher[0];
  const resultsDir = resolveTau2ResultsDir(opts.upstreamDir, spec.saveTo);

  return new Promise<Tau2RunResult>((resolve, reject) => {
    const child = spawn(cmd, argv, {
      cwd: opts.upstreamDir,
      env: { ...process.env, ...opts.env },
    });
    let buf = '';
    const append = (chunk: Buffer): void => {
      buf += chunk.toString('utf-8');
      if (buf.length > 64_000) buf = buf.slice(buf.length - 64_000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);

    let timer: NodeJS.Timeout | undefined;
    if (opts.timeoutMs !== undefined) {
      timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs);
    }
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`runTau2 failed to spawn '${cmd}': ${err.message}`));
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: code ?? -1, resultsDir, output: buf });
    });
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/tau2/tau2-cli.test.ts`
Expected: PASS (argv-builder + pinning + validation describe blocks). `runTau2` is exercised by the integration smoke (Task 7), not these pure-unit tests.

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/tau2/tau2-cli.ts benchmarks/harness/tests/tau2/tau2-cli.test.ts
git -C <worktree> commit -m "feat(benchmarks): tau2 run argv builder + shell-out, user-sim pinned across arms"
```

---

### Task 4: Task-completion oracle parser + pass^k

**Files:**
- Create: `benchmarks/harness/src/tau2/tau2-results.ts`
- Create: `benchmarks/harness/tests/tau2/fixtures/mock-results.json`
- Test: `benchmarks/harness/tests/tau2/tau2-results.test.ts`

> Why: this is the **task-completion oracle**. τ²'s `RewardInfo.reward` IS the state/action oracle (DB-hash + action-match + communicate + env-assertion, product over `reward_basis`). We treat `reward >= REWARD_PASS` (default 1.0) as a per-trial pass — never substring matching. From per-trial passes we compute `pass^1` (mean over trials) and `pass^k` (ALL k trials pass — the τ² reliability metric, `02` §8), plus per-task efficiency (tokens/turns/tool-calls/$ averaged over trials) and inter-trial trajectory diversity (`03` B5).

- [ ] **Step 1: Build the fixture**

Create `benchmarks/harness/tests/tau2/fixtures/mock-results.json`:

```json
{
  "timestamp": "2026-06-16T00:00:00Z",
  "info": { "domain": "mock", "agent": "waggle", "agent_llm": "stub", "user_llm": "gpt-5.5" },
  "tasks": [{ "id": "task-A" }, { "id": "task-B" }],
  "simulations": [
    {
      "id": "sim-1", "task_id": "task-A", "trial": 0, "seed": 42,
      "agent_cost": 0.0100, "duration": 3.2, "termination_reason": "agent_stop",
      "reward_info": {
        "reward": 1.0, "reward_basis": ["DB", "ACTION"],
        "db_check": { "db_match": true },
        "action_checks": [{ "action_id": "a1", "name": "create_order", "action_match": true }],
        "reward_breakdown": { "DB": 1.0, "ACTION": 1.0 }
      },
      "messages": [
        { "role": "assistant", "content": "", "tool_calls": [{ "id": "c1", "function": { "name": "create_order" } }], "usage": { "prompt_tokens": 100, "completion_tokens": 20 } },
        { "role": "tool", "content": "ok" },
        { "role": "assistant", "content": "done", "usage": { "prompt_tokens": 130, "completion_tokens": 10 } }
      ]
    },
    {
      "id": "sim-2", "task_id": "task-A", "trial": 1, "seed": 43,
      "agent_cost": 0.0120, "duration": 3.5, "termination_reason": "agent_stop",
      "reward_info": {
        "reward": 0.0, "reward_basis": ["DB", "ACTION"],
        "db_check": { "db_match": false },
        "action_checks": [{ "action_id": "a1", "name": "create_order", "action_match": false }],
        "reward_breakdown": { "DB": 0.0, "ACTION": 1.0 }
      },
      "messages": [
        { "role": "assistant", "content": "hmm", "tool_calls": [{ "id": "c2", "function": { "name": "search" } }], "usage": { "prompt_tokens": 100, "completion_tokens": 25 } },
        { "role": "tool", "content": "none" },
        { "role": "assistant", "content": "give up", "usage": { "prompt_tokens": 140, "completion_tokens": 8 } }
      ]
    },
    {
      "id": "sim-3", "task_id": "task-A", "trial": 2, "seed": 44,
      "agent_cost": 0.0110, "duration": 3.3, "termination_reason": "agent_stop",
      "reward_info": {
        "reward": 1.0, "reward_basis": ["DB", "ACTION"],
        "db_check": { "db_match": true },
        "action_checks": [{ "action_id": "a1", "name": "create_order", "action_match": true }]
      },
      "messages": [
        { "role": "assistant", "content": "", "tool_calls": [{ "id": "c3", "function": { "name": "create_order" } }], "usage": { "prompt_tokens": 105, "completion_tokens": 21 } },
        { "role": "tool", "content": "ok" },
        { "role": "assistant", "content": "done", "usage": { "prompt_tokens": 132, "completion_tokens": 9 } }
      ]
    },
    {
      "id": "sim-4", "task_id": "task-B", "trial": 0, "seed": 42,
      "agent_cost": 0.0200, "duration": 5.0, "termination_reason": "agent_stop",
      "reward_info": {
        "reward": 1.0, "reward_basis": ["COMMUNICATE"],
        "communicate_checks": [{ "met": true }]
      },
      "messages": [
        { "role": "assistant", "content": "the fee is $50", "usage": { "prompt_tokens": 80, "completion_tokens": 12 } }
      ]
    },
    {
      "id": "sim-5", "task_id": "task-B", "trial": 1, "seed": 43,
      "agent_cost": 0.0210, "duration": 5.1, "termination_reason": "agent_stop",
      "reward_info": {
        "reward": 1.0, "reward_basis": ["COMMUNICATE"],
        "communicate_checks": [{ "met": true }]
      },
      "messages": [
        { "role": "assistant", "content": "the fee is $50", "usage": { "prompt_tokens": 82, "completion_tokens": 13 } }
      ]
    },
    {
      "id": "sim-6", "task_id": "task-B", "trial": 2, "seed": 44,
      "agent_cost": 0.0205, "duration": 5.0, "termination_reason": "agent_stop",
      "reward_info": {
        "reward": 1.0, "reward_basis": ["COMMUNICATE"],
        "communicate_checks": [{ "met": true }]
      },
      "messages": [
        { "role": "assistant", "content": "the fee is $50", "usage": { "prompt_tokens": 81, "completion_tokens": 12 } }
      ]
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

Create `benchmarks/harness/tests/tau2/tau2-results.test.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseTau2Results,
  computeTaskOutcomes,
  REWARD_PASS,
  type Tau2TaskOutcome,
} from '../../src/tau2/tau2-results.js';
import type { Tau2Results } from '../../src/tau2/tau2-types.js';

const HERE = url.fileURLToPath(import.meta.url);
const FIXTURE = path.resolve(path.dirname(HERE), 'fixtures', 'mock-results.json');

function loadFixture(): Tau2Results {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf-8')) as Tau2Results;
}

describe('parseTau2Results — structural validation', () => {
  it('parses the fixture and returns 6 simulations', () => {
    const r = parseTau2Results(loadFixture());
    expect(r.simulations).toHaveLength(6);
  });
  it('throws when simulations is missing', () => {
    expect(() => parseTau2Results({} as Tau2Results)).toThrow(/simulations/);
  });
  it('throws when a simulation lacks task_id', () => {
    expect(() =>
      parseTau2Results({ simulations: [{ id: 'x' } as never] } as Tau2Results),
    ).toThrow(/task_id/);
  });
});

describe('computeTaskOutcomes — the state/action oracle (NOT substring)', () => {
  it('groups by task_id into one outcome per task', () => {
    const outcomes = computeTaskOutcomes(parseTau2Results(loadFixture()));
    expect(outcomes.map(o => o.task_id).sort()).toEqual(['task-A', 'task-B']);
  });

  it('per-trial pass uses reward >= REWARD_PASS (1.0), not text match', () => {
    const a = outcome(outcomes(), 'task-A');
    // task-A trials: reward 1.0, 0.0, 1.0 → 2 of 3 pass.
    expect(a.trialPasses).toEqual([true, false, true]);
    expect(REWARD_PASS).toBe(1.0);
  });

  it('pass^1 = mean trial pass rate', () => {
    const a = outcome(outcomes(), 'task-A');
    expect(a.pass1).toBeCloseTo(2 / 3, 10);
    const b = outcome(outcomes(), 'task-B');
    expect(b.pass1).toBe(1);
  });

  it('pass^k = ALL k trials pass (the τ² reliability metric)', () => {
    const a = outcome(outcomes(), 'task-A'); // 2/3 pass → NOT all → passK false
    expect(a.k).toBe(3);
    expect(a.passK).toBe(false);
    const b = outcome(outcomes(), 'task-B'); // 3/3 pass → passK true
    expect(b.passK).toBe(true);
  });

  it('captures the reward_basis that drove the oracle', () => {
    expect(outcome(outcomes(), 'task-A').rewardBasis).toEqual(['DB', 'ACTION']);
    expect(outcome(outcomes(), 'task-B').rewardBasis).toEqual(['COMMUNICATE']);
  });

  it('averages tokens / turns / tool-calls / $ over trials (efficiency)', () => {
    const a = outcome(outcomes(), 'task-A');
    // turns = assistant messages per trial: trial0=2, trial1=2, trial2=2 → mean 2
    expect(a.meanTurns).toBe(2);
    // tool-calls per trial: 1,1,1 → mean 1
    expect(a.meanToolCalls).toBe(1);
    // tokens per trial (sum of usage prompt+completion across that trial's msgs):
    //   trial0 = (100+20)+(130+10)=260 ; trial1 = (100+25)+(140+8)=273 ; trial2 = (105+21)+(132+9)=267
    //   mean = (260+273+267)/3 = 266.666...
    expect(a.meanTokens).toBeCloseTo((260 + 273 + 267) / 3, 6);
    // $ per trial: 0.0100, 0.0120, 0.0110 → mean 0.0110
    expect(a.meanCostUsd).toBeCloseTo(0.011, 10);
  });

  it('reports inter-trial trajectory diversity (B5 variance-collapse guard)', () => {
    // task-B: all three final answers identical → diversity 0.
    expect(outcome(outcomes(), 'task-B').trajectoryDiversity).toBe(0);
    // task-A: final contents "done","give up","done" → 2 distinct of 3.
    expect(outcome(outcomes(), 'task-A').trajectoryDiversity).toBeCloseTo(2 / 3, 10);
  });
});

// ── helpers ──
function outcomes(): Tau2TaskOutcome[] {
  return computeTaskOutcomes(parseTau2Results(loadFixture()));
}
function outcome(list: Tau2TaskOutcome[], id: string): Tau2TaskOutcome {
  const o = list.find(x => x.task_id === id);
  if (!o) throw new Error(`no outcome for ${id}`);
  return o;
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/tau2/tau2-results.test.ts`
Expected: FAIL — cannot resolve `../../src/tau2/tau2-results.js`.

- [ ] **Step 4: Write the minimal implementation**

Create `benchmarks/harness/src/tau2/tau2-results.ts`:

```typescript
/**
 * τ²-bench results parser — the TASK-COMPLETION ORACLE surface.
 *
 * τ² computes success via a STATE/ACTION oracle: RewardInfo.reward is the
 * PRODUCT over the components named in reward_basis — DB hash match (DB),
 * required-action matching (ACTION), required-info substring in the agent's
 * messages (COMMUNICATE), and env-assertion checks (ENV_ASSERTION). We consume
 * `reward` directly; we NEVER re-score the final answer with our own substring
 * matcher (that would defeat the point — see 01-DESIGN-SPEC §6).
 *
 * From per-trial pass/fail we compute:
 *   pass^1 = mean trial pass rate per task.
 *   pass^k = ALL k trials pass (τ²'s native reliability metric; 02 §8).
 * Plus per-task efficiency (tokens/turns/tool-calls/$ averaged over trials)
 * and inter-trial trajectory diversity (distinct final answers / k) — the
 * B5 variance-collapse guard so "reliability" is not won by recall-pinning.
 */

import type {
  Tau2Results,
  Tau2SimulationRun,
  Tau2Message,
  Tau2RewardType,
} from './tau2-types.js';

/** A simulation counts as a pass when its oracle reward meets this floor.
 *  τ² uses reward=1.0 for full task success; partial-credit bases can yield a
 *  fraction, which is NOT a pass. */
export const REWARD_PASS = 1.0;

export interface Tau2TaskOutcome {
  task_id: string;
  /** Number of trials observed for this task (= k for pass^k). */
  k: number;
  /** Per-trial pass/fail in trial order, by the oracle reward. */
  trialPasses: boolean[];
  /** Mean trial pass rate. */
  pass1: number;
  /** True iff EVERY trial passed (τ² reliability metric). */
  passK: boolean;
  /** The reward_basis components τ² used (from the first trial that has one). */
  rewardBasis: Tau2RewardType[];
  /** Mean total tokens (prompt+completion) per trial. */
  meanTokens: number;
  /** Mean assistant turns per trial. */
  meanTurns: number;
  /** Mean tool calls per trial. */
  meanToolCalls: number;
  /** Mean agent $ per trial (τ² LiteLLM cost; E7 — the cost denominator). */
  meanCostUsd: number;
  /** Mean wall-clock duration seconds per trial (descriptive — B3). */
  meanDurationSec: number;
  /** Distinct final-answer strings / k ∈ [0,1] — inter-trial diversity. */
  trajectoryDiversity: number;
}

/** Validate + normalize a raw τ² Results object. Throws on a missing
 *  simulations array or a sim without a task_id. */
export function parseTau2Results(raw: Tau2Results): Tau2Results {
  if (!raw || !Array.isArray(raw.simulations)) {
    throw new Error('τ² Results must carry a `simulations` array');
  }
  for (const sim of raw.simulations) {
    if (!sim || typeof sim.task_id !== 'string' || sim.task_id.length === 0) {
      throw new Error(`τ² simulation is missing a string task_id: ${JSON.stringify(sim).slice(0, 120)}`);
    }
  }
  return raw;
}

function trialPass(sim: Tau2SimulationRun): boolean {
  const reward = sim.reward_info?.reward;
  if (typeof reward !== 'number' || !Number.isFinite(reward)) return false;
  return reward >= REWARD_PASS;
}

function countAssistantTurns(messages: Tau2Message[] | null | undefined): number {
  if (!messages) return 0;
  return messages.filter(m => m.role === 'assistant').length;
}

function countToolCalls(messages: Tau2Message[] | null | undefined): number {
  if (!messages) return 0;
  let n = 0;
  for (const m of messages) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) n += m.tool_calls.length;
  }
  return n;
}

function sumTokens(messages: Tau2Message[] | null | undefined): number {
  if (!messages) return 0;
  let n = 0;
  for (const m of messages) {
    const u = m.usage;
    if (u) n += (u.prompt_tokens ?? 0) + (u.completion_tokens ?? 0);
  }
  return n;
}

/** Final-answer string for a trial = the last assistant message content. */
function finalAnswer(messages: Tau2Message[] | null | undefined): string {
  if (!messages) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return (messages[i].content ?? '').trim();
  }
  return '';
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Group simulations by task_id, then derive the oracle + efficiency outcome. */
export function computeTaskOutcomes(results: Tau2Results): Tau2TaskOutcome[] {
  const byTask = new Map<string, Tau2SimulationRun[]>();
  for (const sim of results.simulations) {
    const bucket = byTask.get(sim.task_id);
    if (bucket) bucket.push(sim);
    else byTask.set(sim.task_id, [sim]);
  }

  const outcomes: Tau2TaskOutcome[] = [];
  for (const [task_id, sims] of byTask) {
    // Stable trial order: by `trial` when present, else insertion order.
    const ordered = [...sims].sort((a, b) => {
      const ta = a.trial ?? 0;
      const tb = b.trial ?? 0;
      return ta - tb;
    });
    const trialPasses = ordered.map(trialPass);
    const k = ordered.length;
    const pass1 = k === 0 ? 0 : trialPasses.filter(Boolean).length / k;
    const passK = k > 0 && trialPasses.every(Boolean);

    const basisSim = ordered.find(s => Array.isArray(s.reward_info?.reward_basis));
    const rewardBasis = (basisSim?.reward_info?.reward_basis ?? []) as Tau2RewardType[];

    const meanTokens = mean(ordered.map(s => sumTokens(s.messages)));
    const meanTurns = mean(ordered.map(s => countAssistantTurns(s.messages)));
    const meanToolCalls = mean(ordered.map(s => countToolCalls(s.messages)));
    const meanCostUsd = mean(ordered.map(s => s.agent_cost ?? 0));
    const meanDurationSec = mean(ordered.map(s => s.duration ?? 0));

    const finals = ordered.map(s => finalAnswer(s.messages));
    const distinct = new Set(finals).size;
    const trajectoryDiversity = k === 0 ? 0 : distinct / k;

    outcomes.push({
      task_id, k, trialPasses, pass1, passK, rewardBasis,
      meanTokens, meanTurns, meanToolCalls, meanCostUsd, meanDurationSec,
      trajectoryDiversity,
    });
  }
  // Deterministic order for downstream JSONL.
  outcomes.sort((a, b) => (a.task_id < b.task_id ? -1 : a.task_id > b.task_id ? 1 : 0));
  return outcomes;
}

/** Load + parse a τ² results.json file from disk (dir or file path). */
export function loadTau2ResultsFile(filePath: string): Tau2Results {
  const fs = require('node:fs') as typeof import('node:fs');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Tau2Results;
  return parseTau2Results(raw);
}
```

> NOTE on `loadTau2ResultsFile`: it uses `require` to avoid a top-level `fs` import that the pure-parser path doesn't need. Under NodeNext ESM, `require` is available via `createRequire` only — replace with a top-level `import fs from 'node:fs'` if the executor's lint flags `require`. Decision: **use a top-level `import fs from 'node:fs';`** at the top of the file and call `fs.readFileSync` directly (see the corrected version below). Apply this in Step 4 — do not ship the `require` form.

Corrected top of file (use this — add the import, drop the inline `require`):

```typescript
import fs from 'node:fs';
// ... (types import as above) ...

export function loadTau2ResultsFile(filePath: string): Tau2Results {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Tau2Results;
  return parseTau2Results(raw);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/tau2/tau2-results.test.ts`
Expected: PASS — all oracle + pass^k + efficiency + diversity assertions green.

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/tau2/tau2-results.ts benchmarks/harness/tests/tau2/tau2-results.test.ts benchmarks/harness/tests/tau2/fixtures/mock-results.json
git -C <worktree> commit -m "feat(benchmarks): τ² task-completion oracle parser + pass^1/pass^k + efficiency"
```

---

### Task 5: JSONL emitter (one harness record per τ² task)

**Files:**
- Create: `benchmarks/harness/src/tau2/tau2-emit.ts`
- Test: `benchmarks/harness/tests/tau2/tau2-emit.test.ts`

> Why: the harness's downstream stats (`04` equivalence-tost) + reporting consume flat JSONL. We map each `Tau2TaskOutcome` to a flat record carrying the arm-identifying context (domain, agent model, **pinned user-sim model**, seed, k) + the oracle pass^1/pass^k + the efficiency axes. The `cluster_id` field is set to `task_id` here (the τ² procedure-family cluster id is assigned later in `08`/analysis — `03` B2 — but we expose a hook so a pre-registered cluster map can override it).

- [ ] **Step 1: Write the failing test**

Create `benchmarks/harness/tests/tau2/tau2-emit.test.ts`:

```typescript
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  toTau2JsonlRecords,
  writeTau2Jsonl,
  type Tau2EmitContext,
  type Tau2JsonlRecord,
} from '../../src/tau2/tau2-emit.js';
import type { Tau2TaskOutcome } from '../../src/tau2/tau2-results.js';

const CTX: Tau2EmitContext = {
  domain: 'retail',
  agentModelId: 'qwen3.6-35b-a3b',
  userSimModelId: 'gpt-5.5',
  seed: 42,
  arm: 'B',
  memory: 'on',
  manifestHash: 'a'.repeat(64),
};

const OUTCOME: Tau2TaskOutcome = {
  task_id: 'task-A', k: 3, trialPasses: [true, false, true],
  pass1: 2 / 3, passK: false, rewardBasis: ['DB', 'ACTION'],
  meanTokens: 266.6667, meanTurns: 2, meanToolCalls: 1,
  meanCostUsd: 0.011, meanDurationSec: 3.3333, trajectoryDiversity: 2 / 3,
};

describe('toTau2JsonlRecords', () => {
  it('emits exactly one record per outcome', () => {
    const recs = toTau2JsonlRecords([OUTCOME], CTX);
    expect(recs).toHaveLength(1);
  });

  it('carries the arm-identifying + oracle + efficiency fields', () => {
    const r = toTau2JsonlRecords([OUTCOME], CTX)[0];
    expect(r.substrate).toBe('tau2');
    expect(r.domain).toBe('retail');
    expect(r.task_id).toBe('task-A');
    expect(r.model).toBe('qwen3.6-35b-a3b');
    expect(r.user_sim_model).toBe('gpt-5.5');   // confound-record field
    expect(r.arm).toBe('B');
    expect(r.memory).toBe('on');
    expect(r.seed).toBe(42);
    expect(r.k).toBe(3);
    expect(r.pass1).toBeCloseTo(2 / 3, 6);
    expect(r.passK).toBe(false);
    expect(r.reward_basis).toEqual(['DB', 'ACTION']);
    expect(r.tokens_per_task).toBeCloseTo(266.6667, 4);
    expect(r.turns_per_task).toBe(2);
    expect(r.tool_calls_per_task).toBe(1);
    expect(r.usd_per_task).toBeCloseTo(0.011, 10);
    expect(r.trajectory_diversity).toBeCloseTo(2 / 3, 6);
    expect(r.cluster_id).toBe('task-A');       // default cluster = task
    expect(r.manifest_hash).toBe('a'.repeat(64));
  });

  it('uses a pre-registered cluster map when provided', () => {
    const r = toTau2JsonlRecords([OUTCOME], { ...CTX, clusterMap: { 'task-A': 'returns-family' } })[0];
    expect(r.cluster_id).toBe('returns-family');
  });

  it('validates the context (empty userSimModelId throws — pinning is mandatory)', () => {
    expect(() => toTau2JsonlRecords([OUTCOME], { ...CTX, userSimModelId: '' })).toThrow(/userSimModelId/);
  });
});

describe('writeTau2Jsonl', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tau2-emit-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('writes one JSON object per line', () => {
    const out = path.join(dir, 'tau2.jsonl');
    const n = writeTau2Jsonl([OUTCOME], CTX, out);
    expect(n).toBe(1);
    const lines = fs.readFileSync(out, 'utf-8').split('\n').filter(l => l.trim().length > 0);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as Tau2JsonlRecord;
    expect(parsed.task_id).toBe('task-A');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/tau2/tau2-emit.test.ts`
Expected: FAIL — cannot resolve `../../src/tau2/tau2-emit.js`.

- [ ] **Step 3: Write the minimal implementation**

Create `benchmarks/harness/src/tau2/tau2-emit.ts`:

```typescript
/**
 * τ² outcome → harness JSONL emitter. One flat record per task, carrying the
 * arm context (domain, agent model, PINNED user-sim model, arm, memory state,
 * seed, k), the oracle (pass^1, pass^k, reward_basis), and the efficiency axes
 * (tokens/turns/tool-calls/$ per task + trajectory diversity). Flat by design
 * so jq/DuckDB/the equivalence-tost stats consume it directly.
 *
 * cluster_id defaults to task_id; a pre-registered clusterMap (procedure-family
 * / recurring-user, 03 B2) overrides it for cluster-bootstrap analysis.
 */

import fs from 'node:fs';
import type { Tau2TaskOutcome } from './tau2-results.js';
import type { Tau2RewardType } from './tau2-types.js';

export interface Tau2EmitContext {
  /** τ² domain this run targeted. */
  domain: string;
  /** Agent (system-under-test) model id. */
  agentModelId: string;
  /** USER SIMULATOR model id — recorded so the confound is auditable per row. */
  userSimModelId: string;
  /** PRNG seed used. */
  seed: number;
  /** Experimental arm label (A/B/C/D/E per 01 §3.1). */
  arm: string;
  /** Memory state for this arm. */
  memory: 'on' | 'off';
  /** SHA-256 of the pre-registration manifest (audit anchor). */
  manifestHash: string;
  /** Optional pre-registered task_id → cluster_id map (procedure-family etc). */
  clusterMap?: Record<string, string>;
}

export interface Tau2JsonlRecord {
  /** Constant 'tau2' so multi-substrate JSONL can be filtered. */
  substrate: 'tau2';
  domain: string;
  task_id: string;
  cluster_id: string;
  model: string;
  user_sim_model: string;
  arm: string;
  memory: 'on' | 'off';
  seed: number;
  /** Trials per task = pass^k's k. */
  k: number;
  /** Mean trial pass rate (oracle). */
  pass1: number;
  /** All-k-trials-pass reliability metric. */
  passK: boolean;
  /** Which τ² reward components drove the oracle. */
  reward_basis: Tau2RewardType[];
  tokens_per_task: number;
  turns_per_task: number;
  tool_calls_per_task: number;
  usd_per_task: number;
  /** Wall-clock seconds per task (descriptive — infra-dependent, B3). */
  duration_sec_per_task: number;
  /** Distinct final answers / k ∈ [0,1] — B5 variance-collapse guard. */
  trajectory_diversity: number;
  manifest_hash: string;
}

function validateContext(ctx: Tau2EmitContext): void {
  if (!ctx.domain) throw new Error('Tau2EmitContext requires a non-empty domain');
  if (!ctx.agentModelId) throw new Error('Tau2EmitContext requires a non-empty agentModelId');
  if (!ctx.userSimModelId) {
    throw new Error('Tau2EmitContext requires a non-empty userSimModelId — the user simulator MUST be pinned + recorded');
  }
  if (!Number.isInteger(ctx.seed)) throw new Error(`Tau2EmitContext requires an integer seed; got ${ctx.seed}`);
  if (ctx.memory !== 'on' && ctx.memory !== 'off') {
    throw new Error(`Tau2EmitContext.memory must be 'on' | 'off'; got ${ctx.memory}`);
  }
  if (!/^[0-9a-f]{64}$/i.test(ctx.manifestHash)) {
    throw new Error(`Tau2EmitContext.manifestHash must be 64-char hex; got ${ctx.manifestHash}`);
  }
}

export function toTau2JsonlRecords(
  outcomes: readonly Tau2TaskOutcome[],
  ctx: Tau2EmitContext,
): Tau2JsonlRecord[] {
  validateContext(ctx);
  return outcomes.map((o): Tau2JsonlRecord => ({
    substrate: 'tau2',
    domain: ctx.domain,
    task_id: o.task_id,
    cluster_id: ctx.clusterMap?.[o.task_id] ?? o.task_id,
    model: ctx.agentModelId,
    user_sim_model: ctx.userSimModelId,
    arm: ctx.arm,
    memory: ctx.memory,
    seed: ctx.seed,
    k: o.k,
    pass1: o.pass1,
    passK: o.passK,
    reward_basis: o.rewardBasis,
    tokens_per_task: o.meanTokens,
    turns_per_task: o.meanTurns,
    tool_calls_per_task: o.meanToolCalls,
    usd_per_task: o.meanCostUsd,
    duration_sec_per_task: o.meanDurationSec,
    trajectory_diversity: o.trajectoryDiversity,
    manifest_hash: ctx.manifestHash,
  }));
}

/** Write outcomes to a JSONL file (one object per line). Returns count written. */
export function writeTau2Jsonl(
  outcomes: readonly Tau2TaskOutcome[],
  ctx: Tau2EmitContext,
  outputPath: string,
): number {
  const records = toTau2JsonlRecords(outcomes, ctx);
  const body = records.map(r => JSON.stringify(r)).join('\n') + (records.length > 0 ? '\n' : '');
  fs.writeFileSync(outputPath, body, 'utf-8');
  return records.length;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/tau2/tau2-emit.test.ts`
Expected: PASS (emit-shape + cluster-map + validation + write describe blocks).

- [ ] **Step 5: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/tau2/tau2-emit.ts benchmarks/harness/tests/tau2/tau2-emit.test.ts
git -C <worktree> commit -m "feat(benchmarks): τ² outcome → harness JSONL emitter (pass^k + efficiency per task)"
```

---

### Task 6: The Waggle custom agent — Node bridge server + Python `HalfDuplexAgent`

**Files:**
- Create: `benchmarks/tau2/bridge/waggle-bridge-server.ts`
- Create: `benchmarks/tau2/agent/waggle_tau2_agent.py`
- Create: `benchmarks/tau2/agent/register.py`
- Test: `benchmarks/harness/tests/tau2/bridge-server.test.ts`

> Why: τ²'s custom-agent contract is Python (`HalfDuplexAgent` with `get_init_state(message_history)` + `generate_next_message(message, state)`, constructed with `tools, domain_policy, llm, llm_args`, registered via `registry.register_agent_factory(create_waggle_agent, "waggle")`). Waggle's `runAgentLoop` is TypeScript. We bridge with a tiny **Node HTTP server** that owns `runAgentLoop`, and a thin Python agent that forwards each `generate_next_message` to it over `POST /turn`. The Python side stays stateless-thin (it carries a session id; the Node side keeps the message list). This keeps ALL Waggle logic in TS (no Python re-implementation) and makes `--agent-llm` flow straight into `runAgentLoop`'s `model`. **The Node server is the part we unit-test** (the Python file is exercised by the integration smoke in Task 7).

- [ ] **Step 1: Write the failing test for the bridge server**

Create `benchmarks/harness/tests/tau2/bridge-server.test.ts`:

```typescript
import { describe, expect, it, afterEach } from 'vitest';
import {
  startWaggleBridge,
  type WaggleBridgeHandle,
  type BridgeRunAgentLoopFn,
} from '../../../tau2/bridge/waggle-bridge-server.js';
import type { AgentResponse } from '@waggle/agent';

let handle: WaggleBridgeHandle | undefined;
afterEach(async () => { if (handle) { await handle.close(); handle = undefined; } });

/** Deterministic fake runAgentLoop: echoes the last user message, records the
 *  model + tool count so the test can assert the bridge forwarded them. */
const fakeRunAgentLoop: BridgeRunAgentLoopFn = async (cfg) => {
  const lastUser = [...cfg.messages].reverse().find(m => m.role === 'user');
  const resp: AgentResponse = {
    content: `ECHO[${cfg.model}]: ${lastUser?.content ?? ''} (tools=${cfg.tools.length})`,
    toolsUsed: [],
    usage: { inputTokens: 11, outputTokens: 7 },
  };
  return resp;
};

async function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('waggle-bridge-server', () => {
  it('GET /health returns ok', async () => {
    handle = await startWaggleBridge({ port: 0, runAgentLoopFn: fakeRunAgentLoop, litellmUrl: 'http://x', litellmApiKey: 'k' });
    const res = await fetch(`${handle.url}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('POST /turn forwards the agent-llm as the model + returns content + usage', async () => {
    handle = await startWaggleBridge({ port: 0, runAgentLoopFn: fakeRunAgentLoop, litellmUrl: 'http://x', litellmApiKey: 'k' });
    const res = await post(`${handle.url}/turn`, {
      session_id: 's1',
      model: 'qwen3.6-35b-a3b',
      domain_policy: 'be helpful',
      message: { role: 'user', content: 'hi' },
      tools: [{ name: 'search', description: 'search', parameters: { type: 'object', properties: {} } }],
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { content: string; usage: { inputTokens: number; outputTokens: number } };
    expect(body.content).toContain('ECHO[qwen3.6-35b-a3b]');
    expect(body.content).toContain('tools=1');
    expect(body.usage).toEqual({ inputTokens: 11, outputTokens: 7 });
  });

  it('accumulates the conversation across turns within a session', async () => {
    handle = await startWaggleBridge({ port: 0, runAgentLoopFn: fakeRunAgentLoop, litellmUrl: 'http://x', litellmApiKey: 'k' });
    await post(`${handle.url}/turn`, { session_id: 's2', model: 'm', domain_policy: 'p', message: { role: 'user', content: 'first' }, tools: [] });
    const res = await post(`${handle.url}/turn`, { session_id: 's2', model: 'm', domain_policy: 'p', message: { role: 'user', content: 'second' }, tools: [] });
    const body = await res.json() as { content: string; turn_count: number };
    // turn_count = number of user messages seen in this session.
    expect(body.turn_count).toBe(2);
  });

  it('POST /turn rejects a missing model', async () => {
    handle = await startWaggleBridge({ port: 0, runAgentLoopFn: fakeRunAgentLoop, litellmUrl: 'http://x', litellmApiKey: 'k' });
    const res = await post(`${handle.url}/turn`, { session_id: 's3', message: { role: 'user', content: 'x' }, tools: [] });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run benchmarks/harness/tests/tau2/bridge-server.test.ts`
Expected: FAIL — cannot resolve `../../../tau2/bridge/waggle-bridge-server.js`.

- [ ] **Step 3: Write the bridge server**

Create `benchmarks/tau2/bridge/waggle-bridge-server.ts`:

```typescript
/**
 * Waggle ↔ τ² bridge server. Owns runAgentLoop; exposes it as an HTTP backend
 * the Python τ² custom agent forwards each turn to.
 *
 *   GET  /health        → { ok: true }
 *   POST /turn          → run one agent turn for a session.
 *     body: { session_id, model, domain_policy, message:{role,content},
 *             tools:[{name,description,parameters}] }
 *     resp: { content, usage:{inputTokens,outputTokens}, tools_used, turn_count }
 *
 * The Node side keeps the per-session message list so the Python side stays
 * thin. `model` comes straight from τ²'s --agent-llm. Tools are τ²'s domain
 * tools, made executable as no-op stubs here — τ² executes the REAL tools on
 * ITS side after parsing our assistant message's tool_calls; this bridge only
 * needs the schemas so runAgentLoop can EMIT tool_calls. (See Task 6 note.)
 *
 * NOTE on tool execution model: τ²'s half-duplex contract is that the agent
 * RETURNS an AssistantMessage (possibly with tool_calls) and τ² executes the
 * tools, returning ToolMessages on the next call. Therefore runAgentLoop here
 * must run with maxTurns=1 per /turn call so it emits at most one assistant
 * message (with tool_calls) WITHOUT executing them locally, letting τ² own the
 * environment. We pass tools with a throwing `execute` so a local execution
 * attempt is a loud bug, never a silent wrong-env call.
 */

import http from 'node:http';
import { runAgentLoop as realRunAgentLoop, type AgentLoopConfig, type AgentResponse, type ToolDefinition } from '@waggle/agent';

export type BridgeRunAgentLoopFn = (cfg: AgentLoopConfig) => Promise<AgentResponse>;

export interface WaggleBridgeOptions {
  /** TCP port; 0 = ephemeral. */
  port: number;
  /** LiteLLM proxy for the agent loop. */
  litellmUrl: string;
  litellmApiKey: string;
  /** Injected for tests; defaults to the real runAgentLoop. */
  runAgentLoopFn?: BridgeRunAgentLoopFn;
}

export interface WaggleBridgeHandle {
  url: string;
  port: number;
  close(): Promise<void>;
}

interface TurnRequest {
  session_id: string;
  model: string;
  domain_policy: string;
  message: { role: string; content: string };
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
}

interface SessionState {
  messages: Array<{ role: string; content: string }>;
  userTurns: number;
}

function toToolDefinitions(
  tools: TurnRequest['tools'],
): ToolDefinition[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    // The agent must NOT execute τ² tools locally — τ² owns the environment.
    execute: async () => {
      throw new Error(`τ² tool '${t.name}' must be executed by τ², not the bridge`);
    },
  }));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

export function startWaggleBridge(opts: WaggleBridgeOptions): Promise<WaggleBridgeHandle> {
  const runFn = opts.runAgentLoopFn ?? realRunAgentLoop;
  const sessions = new Map<string, SessionState>();

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (req.method === 'POST' && req.url === '/turn') {
          const body = JSON.parse(await readBody(req)) as Partial<TurnRequest>;
          if (!body.session_id || typeof body.model !== 'string' || body.model.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'session_id and a non-empty model are required' }));
            return;
          }
          const state = sessions.get(body.session_id) ?? { messages: [], userTurns: 0 };
          if (body.message) {
            state.messages.push({ role: body.message.role, content: body.message.content });
            if (body.message.role === 'user') state.userTurns += 1;
          }
          const cfg: AgentLoopConfig = {
            litellmUrl: opts.litellmUrl,
            litellmApiKey: opts.litellmApiKey,
            model: body.model,
            systemPrompt: body.domain_policy ?? '',
            tools: toToolDefinitions(body.tools ?? []),
            messages: state.messages,
            // One assistant turn per τ² turn — τ² owns tool execution.
            maxTurns: 1,
          };
          const resp = await runFn(cfg);
          state.messages.push({ role: 'assistant', content: resp.content });
          sessions.set(body.session_id, state);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            content: resp.content,
            usage: resp.usage,
            tools_used: resp.toolsUsed,
            turn_count: state.userTurns,
          }));
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not found' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      }
    })();
  });

  return new Promise<WaggleBridgeHandle>((resolve, reject) => {
    server.on('error', reject);
    server.listen(opts.port, '127.0.0.1', () => {
      const addr = server.address();
      if (addr === null || typeof addr === 'string') {
        reject(new Error('bridge server failed to bind a TCP port'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        port: addr.port,
        close: () => new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
}
```

- [ ] **Step 4: Write the Python custom agent + registration**

Create `benchmarks/tau2/agent/waggle_tau2_agent.py`:

```python
"""
Waggle τ² custom agent — forwards every turn to the Node bridge server.

Implements τ²'s HalfDuplexAgent contract (get_init_state / generate_next_message).
All agent logic lives in the Node bridge (runAgentLoop); this class is a thin
HTTP forwarder so --agent-llm flows straight into runAgentLoop's `model`.

Bridge URL comes from $WAGGLE_TAU2_BRIDGE_URL (default http://127.0.0.1:8088).
Register via register.py: registry.register_agent_factory(create_waggle_agent, "waggle").
"""

from __future__ import annotations

import json
import os
import urllib.request
import uuid
from typing import Any, List, Optional


BRIDGE_URL = os.environ.get("WAGGLE_TAU2_BRIDGE_URL", "http://127.0.0.1:8088")


def _post(path: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BRIDGE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read().decode("utf-8"))


class WaggleBridgeAgent:
    """HalfDuplexAgent[str] — state is the bridge session id."""

    def __init__(self, tools: List[Any], domain_policy: str, llm: str,
                 llm_args: Optional[dict] = None) -> None:
        self.tools = tools
        self.domain_policy = domain_policy
        self.llm = llm
        self.llm_args = llm_args or {}

    def _tool_schemas(self) -> List[dict]:
        schemas: List[dict] = []
        for t in self.tools:
            # τ² Tool objects expose name/description and an OpenAI-style schema.
            name = getattr(t, "name", None) or (t.get("name") if isinstance(t, dict) else None)
            desc = getattr(t, "description", "") or (t.get("description", "") if isinstance(t, dict) else "")
            params = getattr(t, "openai_schema", None)
            if params is None and isinstance(t, dict):
                params = t.get("parameters")
            schemas.append({
                "name": name,
                "description": desc,
                "parameters": params or {"type": "object", "properties": {}},
            })
        return schemas

    def get_init_state(self, message_history: Optional[list] = None) -> str:
        # A fresh bridge session per task. message_history (if any) is replayed.
        session_id = uuid.uuid4().hex
        if message_history:
            for m in message_history:
                role = getattr(m, "role", None) or (m.get("role") if isinstance(m, dict) else "user")
                content = getattr(m, "content", "") or (m.get("content", "") if isinstance(m, dict) else "")
                _post("/turn", {
                    "session_id": session_id, "model": self.llm,
                    "domain_policy": self.domain_policy,
                    "message": {"role": role, "content": content or ""},
                    "tools": self._tool_schemas(),
                })
        return session_id

    def generate_next_message(self, message: Any, state: str):
        role = getattr(message, "role", None) or (message.get("role") if isinstance(message, dict) else "user")
        content = getattr(message, "content", "") or (message.get("content", "") if isinstance(message, dict) else "")
        out = _post("/turn", {
            "session_id": state, "model": self.llm,
            "domain_policy": self.domain_policy,
            "message": {"role": role, "content": content or ""},
            "tools": self._tool_schemas(),
        })
        # τ² expects an AssistantMessage; import lazily to avoid a hard dep at
        # module import time (keeps this file importable for a smoke that only
        # checks registration).
        from tau2.data_model.message import AssistantMessage  # type: ignore
        return AssistantMessage(role="assistant", content=out.get("content", "")), state


def create_waggle_agent(tools, domain_policy, **kwargs):
    """Factory matching τ²'s register_agent_factory signature."""
    return WaggleBridgeAgent(
        tools=tools,
        domain_policy=domain_policy,
        llm=kwargs.get("llm"),
        llm_args=kwargs.get("llm_args"),
    )
```

Create `benchmarks/tau2/agent/register.py`:

```python
"""Importing this module registers the 'waggle' agent with τ²'s registry."""
from tau2.registry import registry  # type: ignore
from waggle_tau2_agent import create_waggle_agent

registry.register_agent_factory(create_waggle_agent, "waggle")
```

> EXECUTOR NOTE on the Python tool-schema accessor: τ²'s `Tool` object exposes its name/description and an OpenAI-format schema. The exact attribute for the schema (`openai_schema` vs `to_openai()` vs `parameters`) varies by τ² version. The code above tries `getattr(t, "openai_schema", None)` then dict fallbacks. **At vendor time, verify the real attribute** by running `python -c "from tau2.environment.tool import Tool; print([a for a in dir(Tool) if not a.startswith('_')])"` inside `benchmarks/tau2/upstream` and, if neither matches, set the accessor to the verified attribute. This is the ONE Python interface that must be pinned against the vendored version; the integration smoke (Task 7) is the gate that proves it.

- [ ] **Step 5: Run the bridge-server test to verify it passes**

Run: `npx vitest run benchmarks/harness/tests/tau2/bridge-server.test.ts`
Expected: PASS — /health, /turn-forwarding (model + tools), session accumulation, and 400-on-missing-model all green. (The `.py` files are not exercised here — Task 7's smoke does that.)

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add benchmarks/tau2/bridge/waggle-bridge-server.ts benchmarks/tau2/agent/waggle_tau2_agent.py benchmarks/tau2/agent/register.py benchmarks/harness/tests/tau2/bridge-server.test.ts
git -C <worktree> commit -m "feat(benchmarks): Waggle τ² custom agent — Node bridge + HalfDuplexAgent forwarder"
```

---

### Task 7: End-to-end integration smoke (mock domain, 1 task, env-gated)

**Files:**
- Create: `benchmarks/harness/tests/tau2/integration-smoke.test.ts`

> Why: the unit tests prove each piece; the smoke proves the whole chain — start the bridge with a deterministic stub agent, run `tau2 run --domain mock --num-tasks 1 --num-trials 1 --agent waggle --user-llm <pin>` against it, parse the written `Results`, emit JSONL. It is **env-gated**: it SKIPS (returns early, never fails) unless `WAGGLE_TAU2_LIVE=1` AND the vendored upstream exists — so it never breaks the default `npm test` gate on machines without Python/τ². This matches the existing `smoke.test.ts` env-gated pattern. The `mock` domain needs no real LLM keys for the agent (our stub answers); τ²'s user-sim still needs a reachable `--user-llm` route, so the smoke pins `--max-steps 2` + a tiny task to keep it cheap, and uses the launcher from `WAGGLE_TAU2_LAUNCHER` (default `tau2`).

- [ ] **Step 1: Write the smoke test**

Create `benchmarks/harness/tests/tau2/integration-smoke.test.ts`:

```typescript
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startWaggleBridge, type BridgeRunAgentLoopFn } from '../../../tau2/bridge/waggle-bridge-server.js';
import { runTau2, resolveTau2ResultsDir, type Tau2RunSpec } from '../../src/tau2/tau2-cli.js';
import { loadTau2ResultsFile, computeTaskOutcomes } from '../../src/tau2/tau2-results.js';
import { writeTau2Jsonl, type Tau2EmitContext } from '../../src/tau2/tau2-emit.js';
import { resolveUpstreamDir } from '../../src/tau2/vendor-pin.js';
import type { AgentResponse } from '@waggle/agent';
import url from 'node:url';

const HERE = url.fileURLToPath(import.meta.url);
const HARNESS_ROOT = path.resolve(path.dirname(HERE), '..', '..');
const UPSTREAM = resolveUpstreamDir(HARNESS_ROOT);

const LIVE = process.env.WAGGLE_TAU2_LIVE === '1';
const LAUNCHER = (process.env.WAGGLE_TAU2_LAUNCHER ?? 'tau2').split(' ');
const USER_LLM = process.env.WAGGLE_TAU2_USER_LLM ?? 'gpt-4.1';

// Deterministic stub: always emits a benign final message. The mock domain's
// oracle will likely score 0 — that's fine; the smoke proves the PLUMBING
// (run → results.json → parse → emit), not task success.
const stubAgent: BridgeRunAgentLoopFn = async (cfg): Promise<AgentResponse> => ({
  content: 'I have completed the requested action.',
  toolsUsed: [],
  usage: { inputTokens: 5, outputTokens: 5 },
});

describe('τ² integration smoke (mock domain)', () => {
  it('runs end-to-end: bridge → tau2 run → parse → emit', async () => {
    if (!LIVE || !fs.existsSync(UPSTREAM)) {
      // Not a live τ² environment — covered by unit tests. Skip cleanly.
      expect(true).toBe(true);
      return;
    }

    const bridge = await startWaggleBridge({
      port: 8088, runAgentLoopFn: stubAgent,
      litellmUrl: process.env.LITELLM_URL ?? 'http://localhost:4000',
      litellmApiKey: process.env.LITELLM_API_KEY ?? 'sk-waggle-dev',
    });
    try {
      const saveTo = `smoke_${Date.now()}`;
      const spec: Tau2RunSpec = {
        domain: 'mock', agent: 'waggle', agentLlm: 'stub',
        userLlm: USER_LLM, numTrials: 1, seed: 42, saveTo,
        maxSteps: 2, numTasks: 1, maxConcurrency: 1,
      };
      const run = await runTau2(spec, {
        upstreamDir: UPSTREAM,
        launcher: LAUNCHER,
        timeoutMs: 180_000,
        env: {
          WAGGLE_TAU2_BRIDGE_URL: bridge.url,
          // τ² imports our agent via the registration module on PYTHONPATH.
          PYTHONPATH: path.join(HARNESS_ROOT, '..', 'tau2', 'agent'),
        },
      });
      // tau2 may exit non-zero if the oracle fails the task; we still expect a
      // results file to have been written.
      const resultsDir = resolveTau2ResultsDir(UPSTREAM, saveTo);
      // τ² writes results.json (file) or a dir; find the file.
      const candidate = fs.existsSync(path.join(resultsDir, 'results.json'))
        ? path.join(resultsDir, 'results.json')
        : (fs.existsSync(`${resultsDir}.json`) ? `${resultsDir}.json` : resultsDir);
      expect(fs.existsSync(candidate)).toBe(true);

      const results = loadTau2ResultsFile(candidate);
      const outcomes = computeTaskOutcomes(results);
      expect(outcomes.length).toBeGreaterThanOrEqual(1);
      expect(outcomes[0].k).toBe(1);
      expect(typeof outcomes[0].pass1).toBe('number');

      const ctx: Tau2EmitContext = {
        domain: 'mock', agentModelId: 'stub', userSimModelId: USER_LLM,
        seed: 42, arm: 'smoke', memory: 'off', manifestHash: '0'.repeat(64),
      };
      const out = path.join(os.tmpdir(), `${saveTo}.jsonl`);
      const n = writeTau2Jsonl(outcomes, ctx, out);
      expect(n).toBe(outcomes.length);
      const lines = fs.readFileSync(out, 'utf-8').split('\n').filter(l => l.trim());
      expect(JSON.parse(lines[0]).substrate).toBe('tau2');
      fs.rmSync(out, { force: true });
    } finally {
      await bridge.close();
    }
  }, 200_000);
});
```

- [ ] **Step 2: Run it (skips cleanly without a live τ²)**

Run: `npx vitest run benchmarks/harness/tests/tau2/integration-smoke.test.ts`
Expected: PASS — in a non-live env (the default), the test takes the skip branch and asserts trivially. To exercise the real chain, an operator runs after vendoring: `WAGGLE_TAU2_LIVE=1 WAGGLE_TAU2_USER_LLM=gpt-4.1 LITELLM_URL=... npx vitest run benchmarks/harness/tests/tau2/integration-smoke.test.ts` (requires a reachable `--user-llm` route).

- [ ] **Step 3: Commit**

```bash
git -C <worktree> add benchmarks/harness/tests/tau2/integration-smoke.test.ts
git -C <worktree> commit -m "test(benchmarks): τ² end-to-end integration smoke (mock domain, env-gated)"
```

---

### Task 8: Barrel export + full-module verification

**Files:**
- Create: `benchmarks/harness/src/tau2/index.ts`

- [ ] **Step 1: Add the barrel**

Create `benchmarks/harness/src/tau2/index.ts`:

```typescript
/** τ²-bench adapter surface — barrel re-export. */
export {
  TAU2_REPO_URL,
  TAU2_PINNED_COMMIT,
  TAU2_LICENSE_SPDX,
  resolveUpstreamDir,
  readVendoredCommit,
  assertVendoredLicense,
} from './vendor-pin.js';
export {
  buildTau2RunArgv,
  resolveTau2ResultsDir,
  runTau2,
  type Tau2RunSpec,
  type Tau2RunResult,
  type Tau2RunOptions,
} from './tau2-cli.js';
export {
  parseTau2Results,
  computeTaskOutcomes,
  loadTau2ResultsFile,
  REWARD_PASS,
  type Tau2TaskOutcome,
} from './tau2-results.js';
export {
  toTau2JsonlRecords,
  writeTau2Jsonl,
  type Tau2EmitContext,
  type Tau2JsonlRecord,
} from './tau2-emit.js';
export type {
  Tau2Results,
  Tau2SimulationRun,
  Tau2RewardInfo,
  Tau2RewardType,
  Tau2Message,
} from './tau2-types.js';
```

- [ ] **Step 2: Add a barrel-import test** — append to `benchmarks/harness/tests/tau2/tau2-cli.test.ts`:

```typescript
import * as tau2 from '../../src/tau2/index.js';

describe('τ² barrel surface', () => {
  it('re-exports the adapter functions + the REWARD_PASS oracle constant', () => {
    expect(typeof tau2.buildTau2RunArgv).toBe('function');
    expect(typeof tau2.computeTaskOutcomes).toBe('function');
    expect(typeof tau2.toTau2JsonlRecords).toBe('function');
    expect(typeof tau2.runTau2).toBe('function');
    expect(tau2.REWARD_PASS).toBe(1.0);
    expect(tau2.TAU2_LICENSE_SPDX).toBe('MIT');
  });
});
```

- [ ] **Step 3: Typecheck the src tree**

Run: `npx tsc --noEmit --project benchmarks/harness/tsconfig.json`
Expected: exit 0. (Note: `benchmarks/tau2/bridge/waggle-bridge-server.ts` is OUTSIDE `benchmarks/harness/src`, so it is NOT covered by this tsconfig. It is typechecked transitively by the vitest tests that import it. If the executor wants an explicit gate, run `npx tsc --noEmit --module nodenext --moduleResolution nodenext --strict benchmarks/tau2/bridge/waggle-bridge-server.ts` — expect 0 errors; resolve `@waggle/agent` via the repo's vitest alias if standalone tsc can't find it, otherwise rely on the import-time check in bridge-server.test.ts.)

- [ ] **Step 4: Run the whole τ² test suite**

Run: `npx vitest run benchmarks/harness/tests/tau2/`
Expected: PASS — `vendor-pin`, `tau2-cli` (incl. barrel), `tau2-results`, `tau2-emit`, `bridge-server` all green; `integration-smoke` skip-passes.

- [ ] **Step 5: Run the full harness suite to confirm no regression**

Run: `npx vitest run --root . benchmarks/harness/tests/`
Expected: PASS — pre-existing harness tests (smoke, stats, cells, etc.) still green plus the new τ² suite.

- [ ] **Step 6: Commit**

```bash
git -C <worktree> add benchmarks/harness/src/tau2/index.ts benchmarks/harness/tests/tau2/tau2-cli.test.ts
git -C <worktree> commit -m "feat(benchmarks): export the τ² adapter from a barrel + full-suite verification"
```

---

## Self-Review

**Spec coverage:**
- `01` §4.1 / §10 — vendor + pin τ² (probe records exact commit + MIT license) → Task 1. ✓
- `01` §4.1 / `03` Confound — user-sim model pinned IDENTICALLY across arms → `buildTau2RunArgv` requires non-empty `userLlm`; the pinning-invariant test asserts two arms share it; `tau2-emit` records `user_sim_model` per row → Task 3 + Task 5. ✓
- `01` §6 — task-completion oracle = τ² DB-state/action check, NOT substring → `tau2-results` consumes `RewardInfo.reward` (product over `reward_basis` ∈ {DB, ACTION, COMMUNICATE, ENV_ASSERTION}); explicit test "NOT substring" → Task 4. ✓
- `01` §6 / `02` §7.2 / §8 / `03` B5 — pass^1 + pass^k (k pre-registered via `--num-trials`; T>0 via the run spec, not a code constant) + tokens/turns/tool-calls/$ per task + inter-trial diversity → Task 4 (`Tau2TaskOutcome`) + Task 5 (JSONL). ✓
- "custom agent over τ²'s tool/user-sim interface" wrapping `runAgentLoop` → Task 6 (Node bridge + Python `HalfDuplexAgent` `get_init_state`/`generate_next_message`, registered via `register_agent_factory(create_waggle_agent, "waggle")`). ✓
- "EXACT command contract + thin TS wrapper + integration smoke (1 task, stub)" → Task 3 (`buildTau2RunArgv`/`runTau2`) + Task 7 (mock-domain smoke). ✓
- `03` D6 / E7 / B3 — license clarified (MIT, Task 1); cost denominator = τ²'s `agent_cost` (full LiteLLM cost, Task 4); tokens/turns infra-independent vs `$`/wall-clock descriptive (recorded both; comments mark duration descriptive). ✓
- NOT in scope (siblings 05/06/08/09): model-registry additions, leakage-firewall assertions, continual-mind build/freeze/hash, ruler-validation — flagged in the scope note; `cluster_id` left as a hook (`clusterMap`) for `08`/analysis to pre-register. ✓

**Placeholder scan:** No `TODO`/"appropriate"/"similar to above". The ONE deliberate placeholder is `TAU2_PINNED_COMMIT = '0000000'` — it is a *real, format-valid* value the executor overwrites at vendor time (Task 1 Step 4 EXECUTOR NOTE), guarded so tests pass either way, and surfaced as an open_question. The Python tool-schema accessor (`openai_schema`) carries an explicit verify-at-vendor-time note + the exact command to confirm it; the integration smoke is its gate.

**Type consistency:** `Tau2RunSpec{domain,agent,agentLlm,userLlm,numTrials,seed,saveTo,maxSteps,numTasks?,taskIds?,maxConcurrency?}`, `Tau2TaskOutcome{task_id,k,trialPasses,pass1,passK,rewardBasis,meanTokens,meanTurns,meanToolCalls,meanCostUsd,meanDurationSec,trajectoryDiversity}`, `Tau2EmitContext{domain,agentModelId,userSimModelId,seed,arm,memory,manifestHash,clusterMap?}`, `Tau2JsonlRecord` (flat) — names spelled identically across impl, tests, and barrel. `REWARD_PASS`, `parseTau2Results`, `computeTaskOutcomes`, `buildTau2RunArgv`, `runTau2`, `toTau2JsonlRecords`, `writeTau2Jsonl`, `startWaggleBridge` consistent throughout. The Python factory `create_waggle_agent` / agent name `"waggle"` match between `register.py`, `waggle_tau2_agent.py`, and every `--agent waggle` in the CLI specs. The `loadTau2ResultsFile` `require`→`import fs` correction is called out explicitly in Task 4 (ship the `import` form). ✓
