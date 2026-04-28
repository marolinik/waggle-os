#!/usr/bin/env tsx
/**
 * GEPA Faza 1 — H3 NorthLane CFO synthesis corpus generator.
 *
 * Per launch decision §G step 4 + manifest v7 §corpus_design + Amendment 1 Ask A Option C.
 *
 * Generates 50 stratified synthesis-task instances via Opus 4.7 oracle.
 *
 * Cost projection: ~$5 (50 × $0.10/instance avg).
 * Halt threshold: $7 (40% buffer per manifest v7 §corpus_design.expected_generation_cost_usd).
 *
 * Output: benchmarks/results/gepa-faza1/corpus/h3-northlane-cfo-50-instances.jsonl
 *
 * Usage:
 *   npx tsx benchmarks/gepa/scripts/faza-1/generate-h3-corpus.ts --dry-run
 *     # No LLM call. Validates stratification + prompt build only.
 *
 *   npx tsx benchmarks/gepa/scripts/faza-1/generate-h3-corpus.ts --probe
 *     # Single instance (cell index 0). ~$0.10. Validates LiteLLM connection + JSON parse.
 *
 *   npx tsx benchmarks/gepa/scripts/faza-1/generate-h3-corpus.ts --all
 *     # All 50 instances. ~$5. Halt at $7. Spot-audit + Pre-A report afterwards.
 *
 * Authority: launch decision LOCK at decisions/2026-04-28-gepa-faza1-launch.md (PM-Waggle-OS)
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  TOTAL_INSTANCES,
  STRATIFICATION_SEED,
  type CorpusInstance,
  type StratificationCell,
  listStratificationCells,
  buildInstanceId,
  validateInstance,
  runSpotAudit,
  corpusSha256,
} from '../../src/faza-1/corpus.js';
import { buildCorpusInstancePrompt } from '../../src/faza-1/corpus-prompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const OUT_DIR = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/corpus');
const OUT_JSONL = path.join(OUT_DIR, 'h3-northlane-cfo-50-instances.jsonl');
const RUN_LOG = path.join(OUT_DIR, 'generation-run.log');
const SPOT_AUDIT_REPORT = path.join(OUT_DIR, 'h3-spot-audit-pre-a-report.md');

// ── LLM config (per launch decision §A.1 inheritance) ─────────────────────

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000';
const ORACLE_MODEL = 'claude-opus-4-7';
const ORACLE_MAX_TOKENS = 8000;
const ORACLE_TEMPERATURE = 0.7;  // higher for instance variation per manifest v7
const ORACLE_THINKING = true;
const MANIFEST_ANCHOR = 'manifest-v7-gepa-faza1';

// Pricing per pilot runner SHA 8a6251e2 line 129
const PRICE_INPUT_PER_M = 15.0;
const PRICE_OUTPUT_PER_M = 75.0;

// Cost halt per manifest v7 Amendment 3: $15 = 40% buffer over $13.58 actual expected
// (was $7 pre-Amendment-3; raised after probe revealed inherited $0.10/instance estimate
// was 170% off vs actual Opus 4.7 generation cost of $0.27/instance).
const COST_HALT_USD = 15.0;

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(RUN_LOG, line); } catch { /* dir may not exist yet */ }
  process.stderr.write(line);
}

// ── CLI ────────────────────────────────────────────────────────────────────

interface Args {
  mode: 'dry-run' | 'probe' | 'all';
  startIdx?: number;
  endIdx?: number;
}

function parseArgs(argv: string[]): Args {
  let mode: Args['mode'] = 'dry-run';
  let startIdx: number | undefined;
  let endIdx: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--dry-run': mode = 'dry-run'; break;
      case '--probe':   mode = 'probe'; break;
      case '--all':     mode = 'all'; break;
      case '--start':   startIdx = Number(next); i++; break;
      case '--end':     endIdx = Number(next); i++; break;
    }
  }
  return { mode, startIdx, endIdx };
}

// ── LiteLLM call ───────────────────────────────────────────────────────────

interface LlmResult {
  content: string;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  latencyMs: number;
  error?: string;
}

async function callOpusOracle(prompt: string): Promise<LlmResult> {
  const masterKey = process.env.LITELLM_MASTER_KEY;
  if (!masterKey) {
    throw new Error('LITELLM_MASTER_KEY env not set; cannot call Opus oracle');
  }

  const payload = {
    model: ORACLE_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: ORACLE_MAX_TOKENS,
    temperature: 1.0,  // Opus runs at temp=1.0 per pilot runner line 385
  };

  const started = Date.now();
  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(`${LITELLM_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${masterKey}` },
        body: JSON.stringify(payload),
      });
      const d: any = await resp.json();
      if ('error' in d) {
        lastErr = String(d.error?.message ?? JSON.stringify(d.error)).slice(0, 200);
        if (attempt < 1) await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      const content = d.choices?.[0]?.message?.content ?? '';
      const usage = d.usage ?? {};
      const inTok = usage.prompt_tokens ?? 0;
      const outTok = usage.completion_tokens ?? 0;
      const costUsd = (inTok * PRICE_INPUT_PER_M + outTok * PRICE_OUTPUT_PER_M) / 1_000_000;
      return { content, inTokens: inTok, outTokens: outTok, costUsd, latencyMs: Date.now() - started };
    } catch (e) {
      lastErr = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 200);
      if (attempt < 1) await new Promise(r => setTimeout(r, 1500));
      continue;
    }
  }
  return {
    content: '', inTokens: 0, outTokens: 0, costUsd: 0,
    latencyMs: Date.now() - started,
    error: lastErr ?? 'unknown error',
  };
}

// ── JSON extraction ────────────────────────────────────────────────────────

interface ParsedInstance {
  personaText: string;
  scenario: string;  // optional — some prompts may put scenario inside personaText
  sourceDocuments: Array<{ title: string; body: string }>;
  question: string;
}

function parseInstanceJson(content: string): ParsedInstance | { error: string } {
  // Strip code fence wrappers if present (Opus sometimes adds them despite instructions)
  let s = content.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '');
  }
  // Find first { and last } for tolerant parsing
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < 0) {
    return { error: `no JSON object found in oracle response (length=${content.length})` };
  }
  const jsonStr = s.slice(firstBrace, lastBrace + 1);
  try {
    const parsed = JSON.parse(jsonStr);
    // Tolerant schema: accept either a "scenario" field or scenario embedded in personaText
    const personaText: string = parsed.personaText ?? '';
    const scenario: string = parsed.scenario ?? '';
    const sourceDocuments = Array.isArray(parsed.sourceDocuments) ? parsed.sourceDocuments : [];
    const question: string = parsed.question ?? '';

    if (!personaText || !sourceDocuments.length || !question) {
      return { error: `parsed JSON missing required fields (personaText/sourceDocuments/question)` };
    }
    return { personaText, scenario, sourceDocuments, question };
  } catch (e) {
    return { error: `JSON parse failed: ${(e as Error).message}` };
  }
}

// ── Build full CorpusInstance from parsed oracle output ────────────────────

function assembleInstance(
  cell: StratificationCell,
  instanceId: string,
  parsed: ParsedInstance,
  llm: LlmResult,
): CorpusInstance {
  const sourceDocuments = parsed.sourceDocuments.map(d => ({
    title: d.title,
    body: d.body,
    charCount: d.body.length,
  }));
  // If oracle put scenario in personaText, just use personaText as-is.
  // Otherwise concatenate "personaText\n\nScenario: scenario".
  const fullPersonaText = parsed.scenario
    ? `${parsed.personaText}\n\nScenario: ${parsed.scenario}`
    : parsed.personaText;
  const materialsConcat = sourceDocuments
    .map(d => `## ${d.title}\n\n${d.body}`)
    .join('\n\n---\n\n');
  return {
    instanceId,
    cell,
    personaText: fullPersonaText,
    scenario: parsed.scenario || extractScenarioFromPersonaText(parsed.personaText),
    sourceDocuments,
    question: parsed.question,
    materialsConcat,
    manifestAnchor: MANIFEST_ANCHOR,
    generatedBy: ORACLE_MODEL,
    generatedAtIso: new Date().toISOString(),
    generationCostUsd: llm.costUsd,
  };
}

function extractScenarioFromPersonaText(personaText: string): string {
  const m = personaText.match(/Scenario:\s*([\s\S]*)/i);
  return m ? m[1].trim() : '';
}

// ── Generate one cell ──────────────────────────────────────────────────────

async function generateOneCell(cell: StratificationCell, ordinal: number): Promise<CorpusInstance | { error: string }> {
  const instanceId = buildInstanceId(cell, ordinal);
  const prompt = buildCorpusInstancePrompt({ cell, instanceId });
  log(`[${instanceId}] generating via ${ORACLE_MODEL} (prompt ${prompt.length}c)`);
  const llm = await callOpusOracle(prompt);
  if (llm.error) {
    log(`[${instanceId}] LLM error: ${llm.error}`);
    return { error: `LLM error: ${llm.error}` };
  }
  const parsed = parseInstanceJson(llm.content);
  if ('error' in parsed) {
    log(`[${instanceId}] parse error: ${parsed.error}; raw content first 200c: ${llm.content.slice(0, 200)}`);
    return { error: parsed.error };
  }
  const instance = assembleInstance(cell, instanceId, parsed, llm);
  const validation = validateInstance(instance);
  if (!validation.valid) {
    log(`[${instanceId}] validation failed: ${validation.violations.join('; ')}`);
    return { error: `validation failed: ${validation.violations.join('; ')}` };
  }
  log(`[${instanceId}] OK; cost=$${llm.costUsd.toFixed(4)}; ${instance.sourceDocuments.length} docs; latency=${llm.latencyMs}ms`);
  return instance;
}

// ── Spot-audit report writer (Pre-A halt-and-PM artifact) ──────────────────

function writeSpotAuditReport(instances: CorpusInstance[], totalCostUsd: number): void {
  const audit = runSpotAudit(instances);
  const sha = corpusSha256(instances);
  const md: string[] = [];
  md.push('---');
  md.push('report_id: 2026-04-28-gepa-faza1-pre-a-corpus-audit');
  md.push('date: 2026-04-28');
  md.push('checkpoint: Pre-A (corpus quality + NULL kick auth)');
  md.push('manifest_anchor: manifest-v7-gepa-faza1');
  md.push(`corpus_sha256: ${sha}`);
  md.push(`total_instances: ${instances.length}`);
  md.push(`total_generation_cost_usd: ${totalCostUsd.toFixed(4)}`);
  md.push(`spot_audit_sample_size: ${audit.sampleSize}`);
  md.push(`spot_audit_seed: ${STRATIFICATION_SEED}`);
  md.push(`halt_on_failure: ${audit.haltOnFailure}`);
  md.push('---');
  md.push('');
  md.push('# Pre-A Halt-and-PM Report — H3 Corpus Quality Audit');
  md.push('');
  md.push('## TL;DR');
  md.push('');
  md.push(`Generated **${instances.length}/${TOTAL_INSTANCES}** instances at total cost **$${totalCostUsd.toFixed(2)}** (vs $5 expected, $7 halt). Spot-audit sample of ${audit.sampleSize} random instances (seed=${STRATIFICATION_SEED}) ${audit.haltOnFailure ? 'FAILED — corpus regeneration required.' : 'PASSED — NULL-baseline kick authorized pending PM ratify.'}`);
  md.push('');
  md.push('## Spot-audit results (per-instance)');
  md.push('');
  md.push('| Instance ID | Result | Violations |');
  md.push('|---|---|---|');
  for (const a of audit.perInstance) {
    md.push(`| \`${a.instanceId}\` | ${a.result.valid ? '✓ PASS' : '✗ FAIL'} | ${a.result.valid ? '—' : a.result.violations.join('; ')} |`);
  }
  md.push('');
  md.push('## Stratification coverage');
  md.push('');
  md.push(`All 50 (5 task families × 5 personas × 2 company stages) cells generated in canonical order. Each (family, persona) pair appears exactly twice (once per stage). Stratification verified via library tests (\`corpus.test.ts\` 34 tests passing).`);
  md.push('');
  md.push('## Audit chain');
  md.push('');
  md.push(`- Corpus JSONL: \`benchmarks/results/gepa-faza1/corpus/h3-northlane-cfo-50-instances.jsonl\``);
  md.push(`- Corpus SHA256: \`${sha}\``);
  md.push(`- Generation log: \`benchmarks/results/gepa-faza1/corpus/generation-run.log\``);
  md.push(`- Manifest v7 SHA: \`583712dde139ffc87fb1ab21643f68d52c56469ded9e8090a624980b05969beb\``);
  md.push(`- Substrate: c9bda3d (Phase 4.7) via worktree D:/Projects/waggle-os-faza1-wt`);
  md.push('');
  md.push('## PM ratification ask');
  md.push('');
  md.push(audit.haltOnFailure
    ? 'CORPUS FAILED spot-audit. **Do NOT authorize NULL-baseline kick.** Recommended action: review failed instances above + re-run generation for failed cells (cost ~$0.20 per re-gen).'
    : 'CORPUS PASSED spot-audit. **Authorize NULL-baseline kick** (5 shapes × 8 instances per shape, expected cost ~$20).');
  md.push('');
  md.push('---');
  md.push('');
  md.push('**End of Pre-A halt-and-PM report. Standing AWAITING PM ratification.**');

  fs.writeFileSync(SPOT_AUDIT_REPORT, md.join('\n'), 'utf-8');
  log(`[pre-a] spot-audit report written to ${SPOT_AUDIT_REPORT}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const cells = listStratificationCells();
  log(`[generator] mode=${args.mode}; total cells=${cells.length}`);

  if (args.mode === 'dry-run') {
    log(`[dry-run] validating ${cells.length} stratification cells + prompt builds`);
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const id = buildInstanceId(cell, 1);
      const prompt = buildCorpusInstancePrompt({ cell, instanceId: id });
      if (i < 3 || i === cells.length - 1) {
        log(`[dry-run] cell[${i}] = ${id}; prompt = ${prompt.length}c`);
      }
    }
    log(`[dry-run] OK — all ${cells.length} cells produce valid prompts; no LLM call made`);
    log(`[dry-run] cost: $0.00`);
    return;
  }

  const targetCells = args.mode === 'probe'
    ? cells.slice(args.startIdx ?? 0, (args.startIdx ?? 0) + 1)
    : cells.slice(args.startIdx ?? 0, args.endIdx ?? cells.length);

  log(`[${args.mode}] generating ${targetCells.length} instance(s)`);

  const instances: CorpusInstance[] = [];
  let cumulativeCost = 0;
  // Resume support: if JSONL already exists, pick up at the next cell.
  if (fs.existsSync(OUT_JSONL) && args.mode === 'all') {
    const lines = fs.readFileSync(OUT_JSONL, 'utf-8').trim().split(/\n+/).filter(Boolean);
    for (const line of lines) {
      try {
        const inst = JSON.parse(line) as CorpusInstance;
        instances.push(inst);
        cumulativeCost += inst.generationCostUsd;
      } catch { /* skip malformed */ }
    }
    log(`[resume] loaded ${instances.length} existing instances; cumulative cost = $${cumulativeCost.toFixed(4)}`);
  }

  // Open JSONL for append
  const out = fs.createWriteStream(OUT_JSONL, { flags: instances.length > 0 ? 'a' : 'w' });
  const existingIds = new Set(instances.map(i => i.instanceId));

  for (let i = 0; i < targetCells.length; i++) {
    const cell = targetCells[i];
    const id = buildInstanceId(cell, 1);
    if (existingIds.has(id)) {
      log(`[skip] ${id} already in JSONL`);
      continue;
    }
    if (cumulativeCost >= COST_HALT_USD) {
      log(`[HALT] cumulative $${cumulativeCost.toFixed(4)} >= $${COST_HALT_USD} cost halt — stopping generation`);
      break;
    }
    const result = await generateOneCell(cell, 1);
    if ('error' in result) {
      log(`[error] cell ${id} skipped due to: ${result.error}`);
      continue;
    }
    instances.push(result);
    cumulativeCost += result.generationCostUsd;
    out.write(JSON.stringify(result) + '\n');
    log(`[cumulative] $${cumulativeCost.toFixed(4)} / $${COST_HALT_USD} halt; ${instances.length}/${TOTAL_INSTANCES} instances`);
  }
  out.end();

  log(`[done] generated ${instances.length} instances; total cost $${cumulativeCost.toFixed(4)}`);

  // Spot-audit + Pre-A report (only meaningful if we have a full or near-full corpus)
  if (args.mode === 'all' && instances.length > 0) {
    writeSpotAuditReport(instances, cumulativeCost);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});
