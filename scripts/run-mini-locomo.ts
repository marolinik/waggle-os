#!/usr/bin/env tsx
/**
 * Sprint 12 Task 2 C3 Stage 2 Mini Retry v3 — thin wrapper around
 * `benchmarks/harness/src/runner.ts`.
 *
 * Per v3 brief §3.2 the Stage 3 invocation calls `scripts/run-mini-locomo.ts`
 * with v3-namespace flags (`--manifest`, `--subject`, `--cells`,
 * `--parallel-concurrency`). Existing harness runner uses v1 flags
 * (`--model`, `--cell`, no native concurrency). This wrapper is the
 * translation layer.
 *
 * **Scenario pick gate (AUDIT ITEM 1):** this wrapper maps v3 cell
 * names to v1 harness cells via the Scenario-C alias table. If PM
 * ratifies Scenario B, the wrapper is still valid for smoke / dry-run
 * / plumbing verification, but the v1 cells must be relabelled as
 * "scaffold" in post-run analysis. Do NOT ship a publishable claim
 * from this wrapper against v3 cell names without the Scenario-C
 * v3.1 addendum OR Scenario-B Task 2.5 substrate delivery.
 *
 * Usage:
 *   npx tsx scripts/run-mini-locomo.ts \
 *     --manifest decisions/2026-04-23-stage2-mini-manifest-v3.yaml \
 *     --subject qwen3.6-35b-a3b-via-dashscope-direct \
 *     --judge-ensemble claude-opus-4-7,gpt-5.4,gemini-3.1-pro-preview \
 *     --N 100 --cells raw,context,retrieval,agentic \
 *     --parallel-concurrency 2 \
 *     --output benchmarks/results/raw-locomo-retry-v3-<ISO>.jsonl
 *
 * Dry-run (stubbed LLM, N=1 per cell, 4 calls total, $0 spend):
 *   npx tsx scripts/run-mini-locomo.ts --dry-run --manifest <path>
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawn } from 'node:child_process';

// ── CLI parsing ──────────────────────────────────────────────────────────

interface Args {
  manifest?: string;
  subject?: string;
  subjectFallback1?: string;
  judgeEnsemble?: string[];
  N: number;
  cells: string[];
  parallelConcurrency: number;
  output?: string;
  dryRun: boolean;
  validateOnly: boolean;
  manifestHash?: string;
  seed: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    N: 100,
    cells: ['raw', 'context', 'retrieval', 'agentic'],
    parallelConcurrency: 2,
    dryRun: false,
    validateOnly: false,
    seed: 42,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--manifest': out.manifest = next; i++; break;
      case '--subject': out.subject = next; i++; break;
      case '--subject-fallback-1': out.subjectFallback1 = next; i++; break;
      case '--judge-ensemble':
        out.judgeEnsemble = (next ?? '').split(',').map(s => s.trim()).filter(Boolean);
        i++;
        break;
      case '--N': out.N = Number(next); i++; break;
      case '--cells': out.cells = (next ?? '').split(',').map(s => s.trim()).filter(Boolean); i++; break;
      case '--parallel-concurrency': out.parallelConcurrency = Number(next); i++; break;
      case '--output': out.output = next; i++; break;
      case '--dry-run': out.dryRun = true; break;
      case '--validate-only': out.validateOnly = true; break;
      case '--manifest-hash': out.manifestHash = next; i++; break;
      case '--seed': out.seed = Number(next); i++; break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`
Sprint 12 Task 2 C3 Stage 2 Mini Retry v3 wrapper.

Flags:
  --manifest <path>              YAML manifest to hydrate args from (v3 format)
  --subject <alias>              Primary subject model (LiteLLM alias)
  --subject-fallback-1 <alias>   Secondary subject model (used on primary error)
  --judge-ensemble <csv>         Comma-separated judge aliases
  --N <int>                      Instances per cell (default 100)
  --cells <csv>                  v3 cell names (default raw,context,retrieval,agentic)
  --parallel-concurrency <int>   Concurrent cell invocations (default 2)
  --output <path>                Override output base path (default auto)
  --manifest-hash <sha>          64-char lowercase SHA-256 of manifest YAML
  --seed <int>                   PRNG seed (default 42)
  --dry-run                      Stub LLM calls. Runs N=1 per cell, 4 calls total.
  --validate-only                Only validate manifest + aliases, do not invoke runner.
  -h, --help                     This text
`);
}

// ── YAML minimalist parser ───────────────────────────────────────────────

/**
 * Lightweight YAML scalar extractor. No dep. Reads manifest flat
 * top-level scalars + one level of nested maps/sequences. Enough to
 * hydrate the v3 Field 7 slots (subject_model, judge_primary.id, etc.).
 */
function parseManifestScalars(yaml: string): Map<string, string> {
  const out = new Map<string, string>();
  const lines = yaml.split('\n');
  const stack: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.search(/\S/);
    const level = indent === -1 ? 0 : Math.floor(indent / 2);
    // Pop deeper stack frames when indent decreases.
    while (stack.length > level) stack.pop();
    const match = line.trim().match(/^([A-Za-z0-9_]+):(?:\s+(.*))?$/);
    if (!match) continue;
    const key = match[1];
    const value = (match[2] ?? '').trim();
    const fullKey = [...stack, key].join('.');
    if (value.length > 0) {
      // Scalar value.
      out.set(fullKey, value.replace(/^["']|["']$/g, ''));
    } else {
      // Enter nested map.
      stack.push(key);
    }
  }
  return out;
}

function hydrateFromManifest(args: Args): Args {
  if (!args.manifest) return args;
  const absPath = path.isAbsolute(args.manifest)
    ? args.manifest
    : path.resolve(process.cwd(), args.manifest);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Manifest not found: ${absPath}`);
  }
  const content = fs.readFileSync(absPath, 'utf-8');
  const scalars = parseManifestScalars(content);

  const next = { ...args };
  next.subject ??= scalars.get('subject_model');
  next.subjectFallback1 ??= scalars.get('subject_fallback_1');
  if (!next.judgeEnsemble) {
    const judges = [
      scalars.get('judge_primary.id'),
      scalars.get('judge_secondary.id'),
      scalars.get('judge_tie_breaker.id'),
    ].filter((x): x is string => typeof x === 'string' && x.length > 0);
    if (judges.length > 0) next.judgeEnsemble = judges;
  }
  if (scalars.get('target_N')) next.N ??= Number(scalars.get('target_N'));
  if (!next.manifestHash) {
    // Compute from YAML bytes if not overridden.
    const hash = crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
    next.manifestHash = hash;
  }
  return next;
}

// ── Alias validation against live LiteLLM /v1/models ─────────────────────

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY ?? 'sk-waggle-dev';

async function validateAliases(requiredAliases: string[]): Promise<{
  ok: boolean;
  live: string[];
  missing: string[];
}> {
  const res = await fetch(`${LITELLM_URL}/v1/models`, {
    headers: { Authorization: `Bearer ${LITELLM_API_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`LiteLLM /v1/models returned ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { data?: Array<{ id: string }> };
  const live = (data.data ?? []).map(m => m.id);
  const liveSet = new Set(live);
  const missing = requiredAliases.filter(a => !liveSet.has(a));
  return { ok: missing.length === 0, live, missing };
}

// ── v3 → v1 cell-name mapping (Scenario C alias table) ───────────────────

const V3_TO_V1_CELLS: Record<string, string> = {
  raw: 'raw',
  context: 'full-context',
  retrieval: 'filtered',
  agentic: 'compressed',
};

function mapCell(v3Name: string): string {
  const v1 = V3_TO_V1_CELLS[v3Name];
  if (!v1) {
    throw new Error(
      `Unknown v3 cell name: ${v3Name}. Valid: ${Object.keys(V3_TO_V1_CELLS).join(', ')}`,
    );
  }
  return v1;
}

// ── Runner invocation ────────────────────────────────────────────────────

function harnessRootAbs(): string {
  const here = url.fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(here), '..', 'benchmarks', 'harness');
}

interface CellRunResult {
  v3Cell: string;
  v1Cell: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  outputPath?: string;
  durationMs: number;
}

async function runOneCell(v3Cell: string, args: Args): Promise<CellRunResult> {
  const v1Cell = mapCell(v3Cell);
  const runnerPath = path.join(harnessRootAbs(), 'src', 'runner.ts');
  const runnerArgs = [
    'tsx',
    runnerPath,
    '--model', args.subject!,
    '--cell', v1Cell,
    '--dataset', 'locomo',
    '--limit', String(args.N),
    '--seed', String(args.seed),
    args.dryRun ? '--dry-run' : '--live',
    '--budget', '250',
  ];
  if (args.judgeEnsemble && args.judgeEnsemble.length > 0) {
    runnerArgs.push('--judge-ensemble', args.judgeEnsemble.join(','));
  }
  if (args.manifestHash) {
    runnerArgs.push('--manifest-hash', args.manifestHash);
  }
  if (!args.dryRun) {
    // Emit the preregistration event only on real runs — the runner
    // still accepts --dry-run and --emit-preregistration-event together
    // but the event payload is less audit-meaningful without real calls.
    runnerArgs.push('--emit-preregistration-event');
  }

  const startedAt = Date.now();
  return await new Promise<CellRunResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let outputPath: string | undefined;
    const child = spawn('npx', runnerArgs, {
      cwd: process.cwd(),
      env: process.env,
      shell: true,  // Windows needs shell: true to resolve `npx` via PATH
    });
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(`[${v3Cell}→${v1Cell}] ${text}`);
      // Extract output path from runner's summary line:
      // [bench:summary] ... jsonl=/absolute/path.jsonl
      const match = text.match(/jsonl=(\S+)/);
      if (match) outputPath = match[1].replace(/[\r\n]+$/, '');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(`[${v3Cell}→${v1Cell}:err] ${text}`);
    });
    child.on('exit', (code) => {
      resolve({
        v3Cell,
        v1Cell,
        exitCode: code ?? 1,
        stdout,
        stderr,
        outputPath,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

// ── Concurrency orchestrator (Promise.all batched to `concurrency`) ──────

async function runCellsWithConcurrency(
  cells: string[],
  concurrency: number,
  args: Args,
): Promise<CellRunResult[]> {
  const results: CellRunResult[] = [];
  for (let i = 0; i < cells.length; i += concurrency) {
    const batch = cells.slice(i, i + concurrency);
    console.log(
      `[wrapper] starting batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(cells.length / concurrency)} — cells: ${batch.join(', ')}`,
    );
    const batchResults = await Promise.all(batch.map(cell => runOneCell(cell, args)));
    results.push(...batchResults);
  }
  return results;
}

// ── Field coverage verification (dry-run only) ───────────────────────────

const EXPECTED_JSONL_FIELDS = [
  'turnId',
  'cell',
  'instance_id',
  'model',
  'seed',
  'accuracy',
  'p50_latency_ms',
  'p95_latency_ms',
  'usd_per_query',
  'failure_mode',
  'dataset_version',
  // Sprint 12 Task 2 §2.1 A3 namespace split columns (LOCKED 2026-04-23):
  'a3_failure_code',
  'a3_rationale',
  // Sprint 11 A2 reasoning-content columns:
  'reasoning_content',
  'reasoning_content_chars',
  'reasoning_shape',
  // Judge columns (populated only when judge ran):
  'judge_verdict',
  'judge_failure_mode',
  'judge_rationale',
  'judge_model',
  'judge_timestamp',
  'judge_ensemble',
  'tie_break_path',
  'tie_break_fourth_vendor',
  // Sprint 12 Blocker #3 / B3 addendum § 4 pinning surface columns:
  'model_pinning_surface',
  'model_pinning_carve_out_reason',
  'model_revision_hash',
  // Sprint 9 legacy:
  'model_answer',
];

function verifyFieldCoverage(outputPath: string): {
  present: string[];
  absent: string[];
  totalRecords: number;
} {
  if (!fs.existsSync(outputPath)) {
    return { present: [], absent: EXPECTED_JSONL_FIELDS.slice(), totalRecords: 0 };
  }
  const lines = fs.readFileSync(outputPath, 'utf-8').split('\n').filter(l => l.trim());
  if (lines.length === 0) {
    return { present: [], absent: EXPECTED_JSONL_FIELDS.slice(), totalRecords: 0 };
  }
  // Union across all records (a field present in any row counts as present).
  const fieldsSeen = new Set<string>();
  for (const line of lines) {
    try {
      const rec = JSON.parse(line);
      for (const k of Object.keys(rec)) fieldsSeen.add(k);
    } catch {
      // skip malformed line
    }
  }
  const present = EXPECTED_JSONL_FIELDS.filter(f => fieldsSeen.has(f));
  const absent = EXPECTED_JSONL_FIELDS.filter(f => !fieldsSeen.has(f));
  return { present, absent, totalRecords: lines.length };
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let args = parseArgs(process.argv.slice(2));
  args = hydrateFromManifest(args);

  // Enforce dry-run limit (brief: 4 calls, 1 per cell).
  if (args.dryRun) {
    console.log('[wrapper] --dry-run: forcing N=1 per cell for plumbing verification');
    args.N = 1;
  }

  if (!args.subject) {
    throw new Error('Missing --subject (or subject_model in manifest).');
  }
  if (!args.judgeEnsemble || args.judgeEnsemble.length === 0) {
    throw new Error('Missing --judge-ensemble (or judge_primary.id etc. in manifest).');
  }

  // Validate aliases against LiteLLM.
  const requiredAliases = [args.subject, ...args.judgeEnsemble];
  if (args.subjectFallback1) requiredAliases.push(args.subjectFallback1);
  console.log(`[wrapper] validating aliases: ${requiredAliases.join(', ')}`);
  const validation = await validateAliases(requiredAliases);
  if (!validation.ok) {
    throw new Error(
      `LiteLLM missing aliases: ${validation.missing.join(', ')}. Add to litellm-config.yaml + restart.`,
    );
  }
  console.log('[wrapper] alias validation: OK');

  // Validate v3 cell names translate.
  for (const cell of args.cells) {
    mapCell(cell);  // throws if unknown
  }
  console.log(`[wrapper] cells (v3 → v1): ${args.cells.map(c => `${c}→${mapCell(c)}`).join(', ')}`);

  if (args.validateOnly) {
    console.log('[wrapper] --validate-only set. Exiting without runner invocation.');
    return;
  }

  console.log(
    `[wrapper] invocation: subject=${args.subject} N=${args.N} cells=${args.cells.length} concurrency=${args.parallelConcurrency} dryRun=${args.dryRun}`,
  );
  if (args.manifestHash) {
    console.log(`[wrapper] manifest_hash=${args.manifestHash.slice(0, 12)}...`);
  }

  const started = Date.now();
  const results = await runCellsWithConcurrency(
    args.cells,
    args.parallelConcurrency,
    args,
  );
  const totalMs = Date.now() - started;

  // Summary.
  console.log('\n=== [wrapper:summary] ===');
  let okCount = 0;
  let failCount = 0;
  const coverageReports: string[] = [];
  for (const r of results) {
    const ok = r.exitCode === 0;
    if (ok) okCount++; else failCount++;
    console.log(
      `  ${r.v3Cell.padEnd(10)} → ${r.v1Cell.padEnd(14)}  exit=${r.exitCode}  duration=${(r.durationMs / 1000).toFixed(1)}s  jsonl=${r.outputPath ?? '<unknown>'}`,
    );
    if (args.dryRun && ok && r.outputPath) {
      const cov = verifyFieldCoverage(r.outputPath);
      coverageReports.push(
        `    field coverage for ${r.v3Cell}: ${cov.present.length}/${EXPECTED_JSONL_FIELDS.length} present, records=${cov.totalRecords}`,
      );
      if (cov.absent.length > 0) {
        coverageReports.push(
          `    absent: ${cov.absent.join(', ')}`,
        );
      }
    }
  }
  console.log(`Total: ${okCount}/${results.length} ok, ${failCount} failed, wall_clock=${(totalMs / 1000).toFixed(1)}s`);
  if (coverageReports.length > 0) {
    console.log('\n=== [wrapper:field-coverage] ===');
    for (const line of coverageReports) console.log(line);
  }

  if (failCount > 0) process.exit(1);
}

main().catch(err => {
  console.error('[wrapper:error]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
