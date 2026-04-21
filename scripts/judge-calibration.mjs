#!/usr/bin/env node
// Judge calibration runner — Sprint 9 Task 4.
//
// Parses PM-authored synthesized calibration labels from
//   PM-Waggle-OS/calibration/2026-04-20-failure-mode-calibration-labels.md
// (10 instances, Path A per Sprint 9 brief: PM constructs representative
// model_answers spanning the correct + F1..F5 spectrum).
// Runs judgeAnswer (default: claude-haiku-4-5 — substitute for the broken
// claude-sonnet-4-6 route; see --judge-model to override) on each instance
// and compares the judge's verdict + failure_mode against PM's human_label.
//
// Writes per-instance match table + disagreement detail to both:
//   - stdout (human-readable, for eyeballing during the run)
//   - preflight-results/judge-calibration-<judge-model>-<ISO>.json (machine)
//
// Usage:
//   node scripts/judge-calibration.mjs \
//     --labels "D:/Projects/PM-Waggle-OS/calibration/2026-04-20-failure-mode-calibration-labels.md" \
//     --judge-model claude-haiku-4-5 \
//     --litellm-url http://localhost:4000 \
//     --out preflight-results/judge-calibration-haiku-<ISO>.json
//
// Cost: ~$0.10-0.30 for 10 Haiku calls. Well under the $5 brief alarm.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// ── Label parser ─────────────────────────────────────────────────────────

function parseLabelsMarkdown(md) {
  // Split on "## Instanca N:" headers. Each section has a stable subset of
  // fields the regex extracts.
  const sections = md.split(/^## Instanca \d+:/m).slice(1);
  const instances = [];
  for (const section of sections) {
    const headerMatch = section.match(/^\s*`([^`]+)`\s*\(([^)]+)\)/);
    if (!headerMatch) continue;
    const instanceId = headerMatch[1].trim();
    const category = headerMatch[2].trim();

    const questionMatch = section.match(/\*\*Question:\*\*\s*([^\n]+)/);
    const groundTruthMatch = section.match(/\*\*Ground truth:\*\*\s*([^\n]+)/);
    const contextMatch = section.match(/\*\*Context excerpt:\*\*\s*([\s\S]+?)(?=\n\*\*Synthesized|\n\*\*human_label|\n---|\n##)/);
    const modelAnswerMatch = section.match(/\*\*Synthesized model_answer:\*\*\s*([\s\S]+?)(?=\n\*\*human_label|\n---|\n##)/);
    const verdictMatch = section.match(/`verdict`:\s*\*\*([^*]+)\*\*/);
    const failureModeMatch = section.match(/`failure_mode`:\s*\*\*([^*]+)\*\*/);
    const rationaleMatch = section.match(/`rationale`:\s*"([\s\S]+?)"\s*\n/);

    if (!questionMatch || !groundTruthMatch || !contextMatch || !modelAnswerMatch || !verdictMatch) {
      continue;
    }
    instances.push({
      instanceId,
      category,
      question: questionMatch[1].trim(),
      groundTruth: groundTruthMatch[1].trim(),
      // Contexts carry surrounding quotes / narrative — pass through as-is.
      contextExcerpt: contextMatch[1].trim(),
      modelAnswer: modelAnswerMatch[1].trim().replace(/^"/, '').replace(/"$/, ''),
      humanVerdict: verdictMatch[1].trim(),
      humanFailureMode: (failureModeMatch?.[1] ?? 'null').trim(),
      humanRationale: rationaleMatch?.[1].trim() ?? '',
    });
  }
  return instances;
}

// ── Arg parsing ──────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {
    labelsPath: 'D:/Projects/PM-Waggle-OS/calibration/2026-04-20-failure-mode-calibration-labels.md',
    judgeModel: 'claude-haiku-4-5',
    litellmUrl: process.env.LITELLM_BASE_URL ?? 'http://localhost:4000',
    litellmKey: process.env.LITELLM_MASTER_KEY ?? 'sk-waggle-dev',
    out: undefined,
    ensemble: undefined,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case '--labels': out.labelsPath = next; i++; break;
      case '--judge-model': out.judgeModel = next; i++; break;
      case '--litellm-url': out.litellmUrl = next; i++; break;
      case '--litellm-key': out.litellmKey = next; i++; break;
      case '--out': out.out = next; i++; break;
      case '--ensemble':
        out.ensemble = (next ?? '').split(',').map(s => s.trim()).filter(Boolean);
        i++;
        break;
      case '--dry-run': out.dryRun = true; break;
    }
  }
  if (!out.out) {
    const isoStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tag = out.ensemble ? `ensemble-${out.ensemble.length}` : out.judgeModel;
    out.out = `preflight-results/judge-calibration-${tag}-${isoStamp}.json`;
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function loadJudgeModule() {
  const { pathToFileURL } = await import('node:url');
  const nodePath = await import('node:path');
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = nodePath.resolve(nodePath.dirname(here), '..');
  const candidates = [
    nodePath.resolve(repoRoot, 'packages/server/src/benchmarks/judge/failure-mode-judge.ts'),
    nodePath.resolve(repoRoot, 'packages/server/src/benchmarks/judge/failure-mode-judge.js'),
    nodePath.resolve(repoRoot, 'packages/server/dist/benchmarks/judge/failure-mode-judge.js'),
  ];
  const target = candidates.find(p => fs.existsSync(p));
  if (!target) throw new Error(`judge module not found — looked in:\n  ${candidates.join('\n  ')}`);
  return await import(pathToFileURL(target).href);
}

async function loadJudgeClientFactory() {
  const { pathToFileURL } = await import('node:url');
  const nodePath = await import('node:path');
  const here = url.fileURLToPath(import.meta.url);
  const repoRoot = nodePath.resolve(nodePath.dirname(here), '..');
  const candidates = [
    nodePath.resolve(repoRoot, 'benchmarks/harness/src/judge-client.ts'),
    nodePath.resolve(repoRoot, 'benchmarks/harness/src/judge-client.js'),
    nodePath.resolve(repoRoot, 'benchmarks/harness/dist/judge-client.js'),
  ];
  const target = candidates.find(p => fs.existsSync(p));
  if (!target) throw new Error(`judge-client not found — looked in:\n  ${candidates.join('\n  ')}`);
  const mod = await import(pathToFileURL(target).href);
  return mod.createJudgeLlmClient;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mdAbs = path.isAbsolute(args.labelsPath) ? args.labelsPath : path.resolve(args.labelsPath);
  if (!fs.existsSync(mdAbs)) {
    console.error(`[judge-calibration] labels file not found: ${mdAbs}`);
    process.exit(2);
  }
  const md = fs.readFileSync(mdAbs, 'utf-8');
  const instances = parseLabelsMarkdown(md);
  if (instances.length !== 10) {
    console.error(`[judge-calibration] expected 10 instances, parsed ${instances.length}`);
    process.exit(2);
  }
  console.log(`[judge-calibration] parsed ${instances.length} instances from ${path.basename(mdAbs)}`);
  console.log(`[judge-calibration] judge model: ${args.judgeModel}${args.ensemble ? ` (ensemble: ${args.ensemble.join(',')})` : ''}`);

  const judgeModule = await loadJudgeModule();
  const createJudgeLlmClient = await loadJudgeClientFactory();

  // Cost entries get aggregated in-run.
  const costEntries = [];
  const makeClient = (model) =>
    args.dryRun
      ? {
          complete: async () => JSON.stringify({
            verdict: 'correct', failure_mode: null, rationale: 'dry-run stub — not a real judgment',
          }),
        }
      : createJudgeLlmClient({
          litellmUrl: args.litellmUrl,
          litellmApiKey: args.litellmKey,
          model,
          onCall: e => costEntries.push({ ...e, instanceIndex: costEntries.length }),
          backoffMs: [500, 1500], // short backoff for interactive use
        });

  const results = [];
  for (let idx = 0; idx < instances.length; idx++) {
    const inst = instances[idx];
    const start = Date.now();
    let judgeOutput;
    let error = null;
    try {
      if (args.ensemble) {
        const clients = new Map();
        for (const m of args.ensemble) clients.set(m, makeClient(m));
        const res = await judgeModule.judgeEnsemble({
          question: inst.question,
          groundTruth: inst.groundTruth,
          contextExcerpt: inst.contextExcerpt,
          modelAnswer: inst.modelAnswer,
          judgeModels: args.ensemble,
          llmClients: clients,
        });
        judgeOutput = {
          verdict: res.majority.verdict,
          failure_mode: res.majority.failure_mode,
          rationale: res.majority.rationale,
          judge_model: res.majority.judge_model,
          ensemble: res.ensemble.map(r => ({
            model: r.judge_model,
            verdict: r.verdict,
            failure_mode: r.failure_mode,
            rationale: r.rationale,
          })),
          fleissKappa: res.fleissKappa,
        };
      } else {
        const res = await judgeModule.judgeAnswer({
          question: inst.question,
          groundTruth: inst.groundTruth,
          contextExcerpt: inst.contextExcerpt,
          modelAnswer: inst.modelAnswer,
          judgeModel: args.judgeModel,
          llmClient: makeClient(args.judgeModel),
        });
        judgeOutput = {
          verdict: res.verdict,
          failure_mode: res.failure_mode,
          rationale: res.rationale,
          judge_model: res.judge_model,
        };
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const elapsedMs = Date.now() - start;

    // Normalise PM's human_label failure_mode — "null" string to null.
    const humanMode = inst.humanFailureMode === 'null' ? null : inst.humanFailureMode;
    const match =
      judgeOutput
      && judgeOutput.verdict === inst.humanVerdict
      && judgeOutput.failure_mode === humanMode;

    results.push({
      index: idx + 1,
      instanceId: inst.instanceId,
      category: inst.category,
      question: inst.question,
      humanVerdict: inst.humanVerdict,
      humanFailureMode: humanMode,
      humanRationale: inst.humanRationale,
      judgeOutput,
      match,
      elapsedMs,
      error,
    });
    const mark = match ? 'MATCH' : (error ? 'ERROR' : 'DIFF ');
    console.log(
      `  [${String(idx + 1).padStart(2, ' ')}/${instances.length}] ${mark} ${inst.instanceId.padEnd(30, ' ')} ` +
      `pm={verdict:${inst.humanVerdict},fm:${humanMode ?? 'null'}} ` +
      `cc={verdict:${judgeOutput?.verdict ?? 'ERR'},fm:${judgeOutput?.failure_mode ?? 'null'}} ` +
      `(${elapsedMs}ms)`,
    );
  }

  const matches = results.filter(r => r.match).length;
  const totalCostUsd = costEntries.reduce((sum, e) => sum + e.usd, 0);
  const judgeCalls = costEntries.length;

  // Verdict classification
  let gateVerdict;
  if (matches >= 8) gateVerdict = 'PASS';
  else if (matches >= 6) gateVerdict = 'PARTIAL';
  else gateVerdict = 'FAIL';

  console.log('');
  console.log(`[judge-calibration:summary] match=${matches}/${instances.length} verdict=${gateVerdict} ` +
              `judge_model=${args.judgeModel}${args.ensemble ? `_ensemble${args.ensemble.length}` : ''} ` +
              `calls=${judgeCalls} cost=\$${totalCostUsd.toFixed(6)}`);

  const output = {
    generatedAt: new Date().toISOString(),
    labelsSource: mdAbs,
    judgeModel: args.judgeModel,
    ensemble: args.ensemble ?? null,
    matchRate: { matches, total: instances.length, verdict: gateVerdict },
    cost: { totalUsd: totalCostUsd, judgeCalls, entries: costEntries },
    perInstance: results,
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`[judge-calibration] out=${args.out}`);

  // Disagreement block — emit inline for handoff drafting.
  const disagreements = results.filter(r => !r.match);
  if (disagreements.length > 0) {
    console.log('');
    console.log(`Disagreements (${disagreements.length}):`);
    for (const d of disagreements) {
      console.log(`  Instance ${d.index}: ${d.instanceId} (${d.category})`);
      console.log(`    Q: ${d.question.slice(0, 140)}`);
      console.log(`    PM: verdict=${d.humanVerdict}, failure_mode=${d.humanFailureMode}`);
      console.log(`    CC: verdict=${d.judgeOutput?.verdict}, failure_mode=${d.judgeOutput?.failure_mode}, ` +
                  `rationale=${(d.judgeOutput?.rationale ?? '').slice(0, 180)}`);
      if (d.error) console.log(`    ERROR: ${d.error}`);
    }
  }
}

main().catch(err => {
  console.error('[judge-calibration:error]', err?.message ?? err);
  process.exit(1);
});
