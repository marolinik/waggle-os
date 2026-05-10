#!/usr/bin/env tsx
/**
 * GEPA Faza 1 — REGISTRY-injection root-cause diagnostic probe.
 *
 * Per investigate-report.md §C.3, this probe distinguishes:
 *   H1 — ESM module-identity mismatch (deep relative path vs package import)
 *   H2 — registry mutation timing / silent freeze
 *   H3 — other (tsx loader, vite-node interop, etc.)
 *
 * Method: import REGISTRY via BOTH paths the failing runner uses, then
 * mutate via the script's path and probe via both. Also exercise the
 * exact selectShape() call site the agent-loop uses.
 *
 * Cost: ~$0 (no LLM calls).
 *
 * Verdicts:
 *   - "Same object?" === true  → mutations propagate; H2/H3 candidates
 *   - "Same object?" === false → H1 confirmed (module-identity mismatch)
 *   - selectShape from package returns the mutated shape → fix is unnecessary
 *   - selectShape from package throws → bug is on the read path
 */

// ── Path A: deep relative import (matches the failing runner's import) ──
import { REGISTRY as RegistryFromScriptDeepPath } from '../../../../packages/agent/src/prompt-shapes/selector.js';

// ── Path B: package import (matches what runRetrievalAgentLoop's call to
//           selectShape() goes through internally) ─────────────────────────
import {
  REGISTRY as RegistryFromPackage,
  selectShape as selectShapeFromPackage,
} from '@waggle/agent';

// ── Path C: package-internal prompt-shapes export (parallel re-export check) ──
import { REGISTRY as RegistryFromPromptShapes } from '@waggle/agent';

const PROBE_SHAPE_NAME = 'claude-gen1-v1-probe';

// Build a minimal valid PromptShape stub matching the type contract.
// We only care that it gets registered + retrieved; method bodies are not
// invoked in this probe.
const probeShape = {
  name: PROBE_SHAPE_NAME,
  metadata: {
    description: 'Probe shape for REGISTRY-injection diagnostic',
    modelClass: 'probe',
    defaultThinking: false,
    defaultMaxTokens: 100,
    evidence_link: 'benchmarks/results/gepa-faza1/gen-1/investigate-report.md',
  },
  systemPrompt: () => 'probe',
  soloUserPrompt: () => 'probe',
  multiStepKickoffUserPrompt: () => 'probe',
  retrievalInjectionUserPrompt: () => 'probe',
};

function log(line: string): void {
  process.stdout.write(line + '\n');
}

function header(t: string): void {
  log('');
  log('━'.repeat(76));
  log(`  ${t}`);
  log('━'.repeat(76));
}

header('GEPA Faza 1 — REGISTRY-injection diagnostic probe');

log(`Probe shape name: ${PROBE_SHAPE_NAME}`);
log(`Node version:     ${process.version}`);
log(`tsx              : (running via tsx if argv[0] is node + script)`);

// ── Step 1 — pre-mutation snapshot ────────────────────────────────────────

header('STEP 1 — Pre-mutation snapshot (3 import paths)');

const keysScriptPath = Object.keys(RegistryFromScriptDeepPath).sort();
const keysPackagePath = Object.keys(RegistryFromPackage).sort();
const keysPromptShapesPath = Object.keys(RegistryFromPromptShapes).sort();

log(`A) Script deep-relative-path REGISTRY: ${keysScriptPath.length} keys: [${keysScriptPath.join(', ')}]`);
log(`B) Package @waggle/agent REGISTRY:     ${keysPackagePath.length} keys: [${keysPackagePath.join(', ')}]`);
log(`C) Package @waggle/agent (2nd import): ${keysPromptShapesPath.length} keys: [${keysPromptShapesPath.join(', ')}]`);
log('');
log(`Object identity A === B: ${RegistryFromScriptDeepPath === RegistryFromPackage}`);
log(`Object identity A === C: ${RegistryFromScriptDeepPath === RegistryFromPromptShapes}`);
log(`Object identity B === C: ${RegistryFromPackage === RegistryFromPromptShapes}`);

// ── Step 2 — mutate via script's path (the failing pattern) ───────────────

header('STEP 2 — Mutate REGISTRY via script deep-relative-path');

(RegistryFromScriptDeepPath as any)[PROBE_SHAPE_NAME] = probeShape;

log(`Mutation via Path A: REGISTRY[${PROBE_SHAPE_NAME}] = probeShape`);

// ── Step 3 — read-back from all 3 paths ───────────────────────────────────

header('STEP 3 — Read-back probe-shape via each path');

const seenInA = RegistryFromScriptDeepPath[PROBE_SHAPE_NAME] !== undefined;
const seenInB = RegistryFromPackage[PROBE_SHAPE_NAME] !== undefined;
const seenInC = RegistryFromPromptShapes[PROBE_SHAPE_NAME] !== undefined;

log(`A) Script-import sees probe-shape:  ${seenInA}`);
log(`B) Package-import sees probe-shape: ${seenInB}`);
log(`C) Re-import sees probe-shape:      ${seenInC}`);

// ── Step 4 — call selectShape via package (the agent-loop path) ───────────

header('STEP 4 — selectShape({override}) via @waggle/agent (agent-loop path)');

let selectShapeVerdict: 'FOUND' | 'NOT_FOUND' | 'OTHER_ERROR';
let selectShapeError: string | null = null;

try {
  const found = selectShapeFromPackage('any-alias-not-relevant', { override: PROBE_SHAPE_NAME });
  log(`selectShape returned shape with name="${(found as any).name ?? '<missing>'}"`);
  selectShapeVerdict = 'FOUND';
} catch (e) {
  selectShapeError = (e as Error).message;
  log(`selectShape THREW: ${selectShapeError}`);
  selectShapeVerdict = selectShapeError.includes('not in REGISTRY') ? 'NOT_FOUND' : 'OTHER_ERROR';
}

// ── Step 5 — verdict ───────────────────────────────────────────────────────

header('STEP 5 — VERDICT');

const sameObjectAB = RegistryFromScriptDeepPath === RegistryFromPackage;

if (!sameObjectAB) {
  log('VERDICT: H1 CONFIRMED — ESM module-identity mismatch');
  log('  Script deep-relative-path REGISTRY and @waggle/agent REGISTRY are');
  log('  separate object instances. Mutations to one do not propagate.');
  log('');
  log('Fix: add registerShape(name, shape) API in selector.ts, called from');
  log('     a single canonical entry point. Avoid direct REGISTRY mutation.');
} else if (sameObjectAB && seenInA && !seenInB) {
  log('VERDICT: H2/H3 — Same object but read mismatch');
  log('  This should not happen: identical objects with different key sets.');
  log('  Investigate JS engine optimization, hidden Proxy, or freeze-on-read.');
} else if (sameObjectAB && seenInA && seenInB && selectShapeVerdict === 'FOUND') {
  log('VERDICT: NOT REPRODUCED — REGISTRY mutation works in this probe.');
  log('  The runner-time failure must be due to a different cause (timing,');
  log('  loader, dynamic-import side effect on candidate shape). Investigate');
  log('  loadCandidates() dynamic import return shape vs static import.');
} else if (sameObjectAB && seenInA && seenInB && selectShapeVerdict !== 'FOUND') {
  log('VERDICT: H2/H3 — Read found but selectShape rejected');
  log(`  Direct read sees probe-shape, but selectShape() error: ${selectShapeError}`);
  log('  Investigate selectShape() implementation for hidden state or guard.');
} else {
  log('VERDICT: UNKNOWN');
  log(`  sameObjectAB=${sameObjectAB} seenInA=${seenInA} seenInB=${seenInB} seenInC=${seenInC} selectShape=${selectShapeVerdict}`);
}

log('');
log('Probe complete. Cost: $0 (no LLM calls). Halt-and-PM with verdict above.');

// Exit 0 in all cases — we want PM to read the full output regardless of verdict
process.exit(0);
