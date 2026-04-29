#!/usr/bin/env tsx
/**
 * GEPA Faza 1 — mutation oracle runner.
 *
 * Per launch decision §G step 7 + manifest v7 §gepa.mutation_oracle +
 * §mutation_oracle_design + Amendment 2 §4 (forked Qwen vs non-Qwen templates).
 *
 * For each of 5 shapes, generate 2 mutation candidates via Opus 4.7. Each
 * candidate is validated via mutation-validator.ts (cell-semantic preservation).
 * Output: 10 candidate files at packages/agent/src/prompt-shapes/gepa-evolved/<shape>-gen1-v<N>.ts
 *
 * Approach:
 * - Use JSON-mode response_format (Amendment 4 lesson) for reliable parsing
 * - Opus outputs JSON with the 5 method body strings + new evidence_link
 * - Runner assembles TS file from fixed template (preserves cell semantics by construction)
 * - Validator confirms types.ts + MULTI_STEP_ACTION_CONTRACT SHAs unchanged
 *
 * Cost projection: 10 calls × ~$0.15 = ~$1.50
 *
 * Failure handling per brief §5: 2 consecutive invalid mutations from oracle
 * → halt-and-PM.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCandidate, type ValidatorVerdict } from '../../src/faza-1/mutation-validator.js';
import { classifyShape, type TemplateClass } from '../../src/faza-1/mutation-oracle-fork.js';
import { type ShapeName, QWEN_TARGETED_SHAPES } from '../../src/faza-1/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const PROMPT_SHAPES_DIR = path.join(REPO_ROOT, 'packages/agent/src/prompt-shapes');
const TYPES_FILE = path.join(PROMPT_SHAPES_DIR, 'types.ts');
const GEPA_EVOLVED_DIR = path.join(PROMPT_SHAPES_DIR, 'gepa-evolved');
const ORACLE_LOG = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/gen-1/mutation-oracle-run.log');
const OUT_MANIFEST = path.join(REPO_ROOT, 'benchmarks/results/gepa-faza1/gen-1/mutation-oracle-manifest.json');

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000';
const ORACLE_MODEL = 'claude-opus-4-7';
const ORACLE_MAX_TOKENS = 8000;
const N_MUTATIONS_PER_SHAPE = 2;

const SHAPES: ShapeName[] = ['claude', 'qwen-thinking', 'qwen-non-thinking', 'gpt', 'generic-simple'];

const PHASE_4_3_FAILURE_MODES = `Top T2 categories from Phase 4.3 verdict (decisions/2026-04-28-phase-4-3-rescore-delta-report.md):
1. unsupported-specifics (10 of 26 T2 hits): hallucinated specifics or overreach beyond materials
2. missed / didn't-consider / shallow (9 of 26 T2 hits): incomplete coverage of source documents
3. conflation / weak-synthesis (5 of 26 T2 hits): risks blended together rather than separated
4. wrong-entity / off-topic (sparse): minor framing errors

Phase 4.5 retrieval-engagement signal: Qwen retrieves 1.33×/task vs Opus 2.33×/task on byte-identical tool surface. H3 corpus NULL-baseline replicated this (mean retrievals = 1.05).`;

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(ORACLE_LOG, line); } catch { /* dir may not exist yet */ }
  process.stderr.write(line);
}

// ── Baseline shape inspection (extract metadata for prompt) ────────────────

interface BaselineShapeMetadata {
  description: string;
  modelClass: string;
  defaultThinking: boolean;
  defaultMaxTokens: number;
  shapeFileContent: string;  // full file text
}

function loadBaselineShape(shapeName: ShapeName): BaselineShapeMetadata {
  const shapeFile = path.join(PROMPT_SHAPES_DIR, `${shapeName}.ts`);
  const content = fs.readFileSync(shapeFile, 'utf-8');

  const description = content.match(/description: '([^']+)'/)?.[1] ?? '';
  const modelClass = content.match(/modelClass: '([^']+)'/)?.[1] ?? shapeName;
  const defaultThinking = content.match(/defaultThinking: (true|false|undefined)/)?.[1] === 'true';
  const defaultMaxTokens = Number(content.match(/defaultMaxTokens: (\d+)/)?.[1] ?? 4096);

  return { description, modelClass, defaultThinking, defaultMaxTokens, shapeFileContent: content };
}

// ── Oracle prompt (JSON-mode) ──────────────────────────────────────────────

function buildOraclePrompt(shapeName: ShapeName, baseline: BaselineShapeMetadata, mutationIdx: number): string {
  const cls: TemplateClass = classifyShape(shapeName);
  const isQwen = QWEN_TARGETED_SHAPES.has(shapeName);

  const qwenGuidance = `For Qwen-targeted shape mutation:
- Emphasize multi-turn retrieval over single-shot retrieval. Phrase like "Continue retrieving until you have evidence from at least 2 distinct queries before finalizing."
- Add anti-premature-finalization scaffolding. Phrase like "Before finalizing, ask: what gap in evidence remains? Issue another retrieval if any gap exists."
- Encourage iterative refinement of retrieval queries based on prior turn results.
- Goal: push mean retrieval_calls per task from current 1.0 baseline toward >= 1.5 (escape Amendment 2 penalty zone) and ideally >= 2.0 (Opus parity proxy).`;

  const nonQwenGuidance = `For non-Qwen shape mutation:
- Standard mutation guidance per brief §3.3 — evolve reasoning scaffold, planning step structure, chain-of-thought triggers.
- Restructure implicit reasoning prompts (e.g., "think step by step" variants, planning bullets).
- Refine where the model is prompted to articulate reasoning before producing output.
- Improve multi-step task decomposition explicitness.`;

  return `You are an expert prompt engineer. Generate ONE mutated variant of the prompt-shape below, evolving reasoning scaffold + retrieval-engagement guidance while preserving cell semantics.

## Target shape
- Name: ${shapeName}
- Class: ${cls}
- Mutation variant index: ${mutationIdx} (you are generating mutation #${mutationIdx} of 2 for this shape)

## Baseline metadata (LOCKED — do NOT change these)
- description: ${baseline.description}
- modelClass: ${baseline.modelClass}
- defaultThinking: ${baseline.defaultThinking}
- defaultMaxTokens: ${baseline.defaultMaxTokens}

## Phase 4.3 + Phase 4.5 failure modes to address
${PHASE_4_3_FAILURE_MODES}

## Mutation guidance
${isQwen ? qwenGuidance : nonQwenGuidance}

## Cell semantic boundaries (LOCKED — violation = REJECTED candidate)
You may NOT modify:
- The MULTI_STEP_ACTION_CONTRACT constant (lives in types.ts; bytes are SHA-pinned)
- The JSON action contract format ({"action": "retrieve" | "finalize", ...})
- Task framing (persona/question/materials section labels)
- Imports block
- Locked metadata fields above

You MAY modify:
- The 5 method bodies (string-building only): systemPromptSolo, systemPromptMultiStep, soloUserPrompt, multiStepKickoffUserPrompt, retrievalInjectionUserPrompt
- The evidence_link metadata (you MUST update to point to GEPA Gen 1 results: "benchmarks/results/gepa-faza1/gen-1/mutation-oracle-run.log + Phase 4.5 + Amendment 2 §3 retrieval-engagement bonus")

## Baseline shape file (your input)

\`\`\`typescript
${baseline.shapeFileContent}
\`\`\`

## Your output: JSON object

Output a single JSON object with these fields. Each method body field should be a TypeScript expression that evaluates to a string (the prompt text). Use the same approach as the baseline (e.g., array.join('\\n')). Variable references like \${persona}, \${question}, \${maxSteps}, \${maxRetrievalsPerStep}, \${input.persona}, etc. must be preserved verbatim where the baseline used them.

\`\`\`json
{
  "evidenceLink": "<updated evidence_link string referencing Gen 1 results + Phase 4.5/Amendment 2>",
  "systemPromptSolo": "<TypeScript expression returning system prompt for !isMultiStep — typically a join of strings or template literal; reference {persona}>",
  "systemPromptMultiStep": "<TypeScript expression returning system prompt for isMultiStep — must reference MULTI_STEP_ACTION_CONTRACT verbatim, {persona}, {question}, {maxSteps}, {maxRetrievalsPerStep}>",
  "soloUserPrompt": "<TypeScript expression returning user prompt with {input.persona}, {input.materials}, {input.question}>",
  "multiStepKickoffUserPrompt": "<TypeScript expression returning kickoff user message; baseline uses 'Begin. Output your first action JSON now.' — your variant should request engagement scaffolding for Qwen shapes>",
  "retrievalInjectionUserPrompt": "<TypeScript expression returning retrieval-injection user message with {input.query}, {input.resultCount}, {input.results}>"
}
\`\`\`

CRITICAL: each field's value must be a STRING containing valid TypeScript code that, when wrapped in \`return (\${value})\`, would compile + return a string. The simplest valid pattern is template literals or .join('\\n') over an array of strings.

Output ONLY the JSON object. No prose. No code fences.`;
}

// ── LLM call (JSON-mode, no temperature per Amendment 4 lesson) ────────────

interface OracleCallResult {
  content: string;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  latencyMs: number;
  error?: string;
}

async function callOpusOracle(prompt: string): Promise<OracleCallResult> {
  const masterKey = process.env.LITELLM_MASTER_KEY;
  if (!masterKey) throw new Error('LITELLM_MASTER_KEY env not set');

  const payload = {
    model: ORACLE_MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: ORACLE_MAX_TOKENS,
    response_format: { type: 'json_object' },
    // temperature omitted per Amendment 4 (Anthropic deprecates with JSON mode)
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
      const costUsd = (inTok * 15.0 + outTok * 75.0) / 1_000_000;
      return { content, inTokens: inTok, outTokens: outTok, costUsd, latencyMs: Date.now() - started };
    } catch (e) {
      lastErr = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 200);
      if (attempt < 1) await new Promise(r => setTimeout(r, 1500));
    }
  }
  return { content: '', inTokens: 0, outTokens: 0, costUsd: 0, latencyMs: Date.now() - started, error: lastErr };
}

// ── JSON parsing + TS file assembly ────────────────────────────────────────

interface MutationFields {
  evidenceLink: string;
  systemPromptSolo: string;
  systemPromptMultiStep: string;
  soloUserPrompt: string;
  multiStepKickoffUserPrompt: string;
  retrievalInjectionUserPrompt: string;
}

function parseOracleOutput(content: string): MutationFields | { error: string } {
  let s = content.trim();
  if (s.startsWith('```')) s = s.replace(/^```[a-z]*\n?/, '').replace(/```\s*$/, '');
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace < 0) {
    return { error: `no JSON object found in output (length=${content.length})` };
  }
  try {
    const obj = JSON.parse(s.slice(firstBrace, lastBrace + 1));
    const required = ['evidenceLink', 'systemPromptSolo', 'systemPromptMultiStep', 'soloUserPrompt', 'multiStepKickoffUserPrompt', 'retrievalInjectionUserPrompt'];
    for (const k of required) {
      if (typeof obj[k] !== 'string' || obj[k].length === 0) {
        return { error: `field "${k}" missing or empty` };
      }
    }
    return obj as MutationFields;
  } catch (e) {
    return { error: `JSON parse failed: ${(e as Error).message}` };
  }
}

function buildShapeFile(shapeName: ShapeName, baseline: BaselineShapeMetadata, fields: MutationFields, mutationIdx: number): string {
  const exportName = `${shapeName.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}Gen1V${mutationIdx}Shape`;
  const tsName = `${shapeName}-gen1-v${mutationIdx}`;
  return `/**
 * GEPA Faza 1 — Gen 1 mutation #${mutationIdx} of ${shapeName}.
 *
 * Generated by Opus 4.7 mutation oracle per Amendment 2 §4 forked template
 * (${classifyShape(shapeName)} branch). Cell-semantic boundaries preserved
 * via mutation-validator.ts SHA pins.
 *
 * Evidence: ${fields.evidenceLink}
 *
 * Baseline anchor: packages/agent/src/prompt-shapes/${shapeName}.ts (manifest v7
 * §gepa.mutation_validator.baseline_shape_shas[${shapeName}.ts]).
 */

import {
  type PromptShape,
  type SystemPromptInput,
  type SoloUserPromptInput,
  type MultiStepKickoffInput,
  type RetrievalInjectionInput,
  MULTI_STEP_ACTION_CONTRACT,
} from '../types.js';

export const ${exportName}: PromptShape = {
  name: '${tsName}',
  metadata: {
    description: '${baseline.description.replace(/'/g, "\\'")}',
    modelClass: '${baseline.modelClass}',
    evidence_link: ${JSON.stringify(fields.evidenceLink)},
    defaultThinking: ${baseline.defaultThinking},
    defaultMaxTokens: ${baseline.defaultMaxTokens},
  },

  systemPrompt(input: SystemPromptInput): string {
    const { persona, question, isMultiStep, maxSteps = 5, maxRetrievalsPerStep = 8 } = input;
    if (!isMultiStep) {
      return ${fields.systemPromptSolo};
    }
    return ${fields.systemPromptMultiStep};
  },

  soloUserPrompt(input: SoloUserPromptInput): string {
    return ${fields.soloUserPrompt};
  },

  multiStepKickoffUserPrompt(_input: MultiStepKickoffInput): string {
    return ${fields.multiStepKickoffUserPrompt};
  },

  retrievalInjectionUserPrompt(input: RetrievalInjectionInput): string {
    return ${fields.retrievalInjectionUserPrompt};
  },
};
`;
}

// ── Validate via runtime sanity (compile check) + structural check ─────────

function validateAssembledFile(filepath: string, baselineShapeName: ShapeName): { valid: boolean; reason?: string } {
  // Check file parses as TypeScript by attempting a require-style import
  // For Faza 1 simplicity, just check that the file:
  // 1. Imports from types.js (mutation-validator's import preservation check)
  // 2. Contains the required locked metadata fields
  // 3. Exports a single PromptShape
  // 4. Doesn't break the cell-semantic boundary (types.ts/MULTI_STEP_ACTION_CONTRACT SHAs unchanged)
  // The mutation-validator.ts does the SHA checks; we use it via validateCandidate.

  const verdict: ValidatorVerdict = validateCandidate({
    candidateShapeFilePath: filepath,
    baselineShapeName: `${baselineShapeName}.ts` as any,
    typesFilePath: TYPES_FILE,
    expectShapeDiff: true,
  });

  if (!verdict.valid) {
    return { valid: false, reason: `validator violations: ${verdict.violations.map(v => `${v.category}: ${v.detail}`).join('; ')}` };
  }
  return { valid: true };
}

// ── Main: generate 10 mutations ────────────────────────────────────────────

interface MutationManifestEntry {
  shape: ShapeName;
  mutationIdx: number;
  filename: string;
  costUsd: number;
  latencyMs: number;
  tsName: string;
  validatorVerdict: 'valid' | 'invalid_after_retry';
  error?: string;
}

async function main(): Promise<void> {
  fs.mkdirSync(GEPA_EVOLVED_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(ORACLE_LOG), { recursive: true });
  if (!fs.existsSync(ORACLE_LOG)) fs.writeFileSync(ORACLE_LOG, '');

  log(`[start] mutation oracle for ${SHAPES.length} shapes × ${N_MUTATIONS_PER_SHAPE} mutations`);

  const manifest: MutationManifestEntry[] = [];
  let cumulativeCost = 0;
  let consecutiveInvalidGlobal = 0;

  for (const shapeName of SHAPES) {
    const baseline = loadBaselineShape(shapeName);
    log(`[${shapeName}] baseline loaded; modelClass=${baseline.modelClass} description="${baseline.description.slice(0, 60)}..."`);

    for (let mutIdx = 1; mutIdx <= N_MUTATIONS_PER_SHAPE; mutIdx++) {
      const tsName = `${shapeName}-gen1-v${mutIdx}`;
      const outFile = path.join(GEPA_EVOLVED_DIR, `${tsName}.ts`);

      if (fs.existsSync(outFile)) {
        log(`[${tsName}] already exists; skipping`);
        manifest.push({ shape: shapeName, mutationIdx: mutIdx, filename: outFile, costUsd: 0, latencyMs: 0, tsName, validatorVerdict: 'valid' });
        continue;
      }

      // Try once; if invalid, retry once with structural feedback. After 2 fails → mark invalid_after_retry.
      let valid = false;
      let totalCost = 0;
      let totalLatency = 0;
      let errMsg: string | undefined;

      for (let attempt = 0; attempt < 2 && !valid; attempt++) {
        const prompt = buildOraclePrompt(shapeName, baseline, mutIdx);
        log(`[${tsName}] oracle call attempt ${attempt + 1}; prompt_len=${prompt.length}c`);
        const llm = await callOpusOracle(prompt);
        totalCost += llm.costUsd;
        totalLatency += llm.latencyMs;

        if (llm.error) {
          errMsg = `LLM error: ${llm.error}`;
          log(`[${tsName}] ${errMsg}`);
          continue;
        }
        const parsed = parseOracleOutput(llm.content);
        if ('error' in parsed) {
          errMsg = `parse error: ${parsed.error}`;
          log(`[${tsName}] ${errMsg}; first 200c: ${llm.content.slice(0, 200)}`);
          continue;
        }

        const tsContent = buildShapeFile(shapeName, baseline, parsed, mutIdx);
        fs.writeFileSync(outFile, tsContent, 'utf-8');

        const v = validateAssembledFile(outFile, shapeName);
        if (v.valid) {
          valid = true;
          log(`[${tsName}] OK; cost=$${llm.costUsd.toFixed(4)}; latency=${llm.latencyMs}ms; file=${path.basename(outFile)}`);
        } else {
          errMsg = `validator failed: ${v.reason}`;
          log(`[${tsName}] ${errMsg}`);
          fs.unlinkSync(outFile);
        }
      }

      cumulativeCost += totalCost;
      manifest.push({
        shape: shapeName, mutationIdx: mutIdx, filename: outFile,
        costUsd: totalCost, latencyMs: totalLatency, tsName,
        validatorVerdict: valid ? 'valid' : 'invalid_after_retry',
        error: valid ? undefined : errMsg,
      });

      if (valid) {
        consecutiveInvalidGlobal = 0;
      } else {
        consecutiveInvalidGlobal++;
        if (consecutiveInvalidGlobal >= 2) {
          log(`[HALT] 2 consecutive invalid mutations from oracle (per brief §5) — stopping`);
          break;
        }
      }
    }
    if (consecutiveInvalidGlobal >= 2) break;
  }

  fs.writeFileSync(OUT_MANIFEST, JSON.stringify({
    totalMutationsAttempted: manifest.length,
    totalValid: manifest.filter(m => m.validatorVerdict === 'valid').length,
    totalInvalid: manifest.filter(m => m.validatorVerdict !== 'valid').length,
    cumulativeCostUsd: +cumulativeCost.toFixed(6),
    entries: manifest,
    completedAtIso: new Date().toISOString(),
  }, null, 2));
  log(`[done] ${manifest.length} mutations attempted; ${manifest.filter(m => m.validatorVerdict === 'valid').length} valid; cumulative $${cumulativeCost.toFixed(4)}`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(2); });
