#!/usr/bin/env tsx
/**
 * Sesija C Phase 3b — Gaia2 dry-verification driver.
 *
 * Wires:
 *   - benchmarks/gaia2/config.yaml     → Gaia2AdapterConfig
 *   - benchmarks/gaia2/data/*.jsonl    → loaded via adapter.loadGaia2TasksFromJsonl
 *   - LITELLM_URL + LITELLM_MASTER_KEY → LlmCallFn (Faza 1 pattern)
 *   - benchmarks/gaia2/adapter.ts      → runDryRunSweep
 *   - benchmarks/gaia2/runs/<ISO>/     → JSONL output
 *
 * Usage:
 *   pnpm tsx benchmarks/gaia2/scripts/run-dry-verification.ts \\
 *       --tasks benchmarks/gaia2/data/tasks-mini-10.jsonl \\
 *       --halt-after-probe   # (Phase 3b-B sample mode)
 *
 * Env required for sample run (Phase 3b-B):
 *   LITELLM_URL              (e.g. http://localhost:4000)
 *   LITELLM_MASTER_KEY       (LiteLLM proxy auth)
 *
 * Phase 3b-A scope: file structure + types + dry-compile (no actual
 * invocations). Phase 3b-B (next CC turn) runs the sample with halt-
 * after-probe enabled to verify schema fit + collect cost evidence.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import {
  runDryRunSweep,
  writeRecordsToJsonl,
  type Gaia2AdapterConfig,
  type LlmCallFn,
} from '../adapter.js';

// Faza 1 LlmCallFn pattern, generalized.
// Source: benchmarks/gepa/scripts/faza-1/run-gen-1.ts:230-260.

const SUBJECT_MAX_TOKENS_QWEN = 16_000;
const SUBJECT_MAX_TOKENS_DEFAULT = 4_096;

function makeLitellmCallFn(opts: { url: string; masterKey: string }): LlmCallFn {
  return async (input) => {
    const isQwen = input.model.includes('qwen');
    const maxTokens = input.maxTokens ?? (isQwen ? SUBJECT_MAX_TOKENS_QWEN : SUBJECT_MAX_TOKENS_DEFAULT);
    const thinking = input.thinking ?? isQwen;

    const payload: Record<string, unknown> = {
      model: input.model,
      messages: input.messages,
      max_tokens: maxTokens,
    };
    if (input.model.startsWith('claude-opus')) {
      payload.temperature = 1.0;
    } else if (input.model === 'gpt-5.4' || input.model === 'minimax-m27-via-openrouter') {
      // omit temperature (provider rejects override)
    } else {
      payload.temperature = input.temperature ?? 0.3;
    }
    if (isQwen) {
      payload.extra_body = { enable_thinking: thinking };
    }

    const startMs = Date.now();
    let lastErr: string | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await fetch(`${opts.url.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.masterKey}`,
          },
          body: JSON.stringify(payload),
        });
        const body = (await resp.json()) as Record<string, unknown>;
        if ('error' in body) {
          const errObj = body.error as Record<string, unknown> | undefined;
          lastErr = String(errObj?.message ?? JSON.stringify(body.error)).slice(0, 200);
          if (attempt < 1) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          return {
            content: '',
            inTokens: 0,
            outTokens: 0,
            costUsd: 0,
            latencyMs: Date.now() - startMs,
            error: lastErr,
          };
        }
        const choices = body.choices as Array<{ message?: { content?: string } }> | undefined;
        const content = choices?.[0]?.message?.content ?? '';
        const usage = body.usage as
          | { prompt_tokens?: number; completion_tokens?: number }
          | undefined;
        // LiteLLM proxy includes a non-standard `response_cost` field at top
        // level when the cost-tracking extension is enabled.
        const cost = (body as { response_cost?: number }).response_cost ?? 0;
        return {
          content,
          inTokens: usage?.prompt_tokens ?? 0,
          outTokens: usage?.completion_tokens ?? 0,
          costUsd: cost,
          latencyMs: Date.now() - startMs,
        };
      } catch (err: unknown) {
        lastErr = err instanceof Error ? err.message : String(err);
        if (attempt < 1) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
      }
    }

    return {
      content: '',
      inTokens: 0,
      outTokens: 0,
      costUsd: 0,
      latencyMs: Date.now() - startMs,
      error: lastErr ?? 'unknown LiteLLM call failure',
    };
  };
}

function parseArgs(): { tasksFile: string; haltAfterProbe: boolean; configPath: string } {
  const args = process.argv.slice(2);
  let tasksFile = 'benchmarks/gaia2/data/tasks-mini-10.jsonl';
  let haltAfterProbe = false;
  let configPath = 'benchmarks/gaia2/config.yaml';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--tasks' && i + 1 < args.length) {
      tasksFile = args[i + 1];
      i++;
    } else if (a === '--halt-after-probe') {
      haltAfterProbe = true;
    } else if (a === '--config' && i + 1 < args.length) {
      configPath = args[i + 1];
      i++;
    }
  }
  return { tasksFile, haltAfterProbe, configPath };
}

function loadConfig(configPath: string): Gaia2AdapterConfig {
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(raw) as Record<string, unknown>;
  // Minimal type assertion — full Zod validation can be added if Phase 3b-B
  // surfaces field-mismatch issues.
  return parsed as unknown as Gaia2AdapterConfig;
}

async function main(): Promise<number> {
  const { tasksFile, haltAfterProbe, configPath } = parseArgs();

  console.error(`[gaia2-dry-verification] config=${configPath} tasks=${tasksFile} haltAfterProbe=${haltAfterProbe}`);

  const config = loadConfig(configPath);

  const litellmUrl = process.env.LITELLM_URL;
  const litellmKey = process.env.LITELLM_MASTER_KEY;
  if (!litellmUrl || !litellmKey) {
    console.error(
      'FATAL: LITELLM_URL and LITELLM_MASTER_KEY must be set in env to run sample invocations.',
    );
    return 2;
  }
  const llmCall = makeLitellmCallFn({ url: litellmUrl, masterKey: litellmKey });

  const startedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(process.cwd(), config.output_dir_root, `dry-verification-${startedAt}`);
  fs.mkdirSync(outDir, { recursive: true });

  const result = await runDryRunSweep(config, llmCall, {
    tasksFile,
    haltAfterProbe,
  });

  // Write probe + full records to JSONL.
  writeRecordsToJsonl(result.probe_records, path.join(outDir, 'probe.jsonl'));
  writeRecordsToJsonl(result.full_sweep_records, path.join(outDir, 'full-sweep.jsonl'));

  // Write summary.
  const summary = {
    timestamp_started: new Date().toISOString(),
    config_path: configPath,
    tasks_file: tasksFile,
    probe_invocation_count: result.probe_records.length,
    probe_cost_usd: result.probe_cost_usd,
    projected_total_usd: result.projected_total_usd,
    halt_triggered: result.halt_triggered,
    full_sweep_invocation_count: result.full_sweep_records.length,
    final_total_cost_usd: result.final_total_cost_usd,
    cost_cap_usd: config.cost_cap_usd,
    halt_trigger_usd: config.halt_trigger_usd,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

  console.error(`[gaia2-dry-verification] complete — output dir: ${outDir}`);
  console.error(JSON.stringify(summary, null, 2));

  return result.halt_triggered ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('FATAL:', err instanceof Error ? err.stack : err);
      process.exit(3);
    },
  );
}

// Module-import-time helper (avoids `import { pathToFileURL }` redundancy).
import { pathToFileURL } from 'node:url';
