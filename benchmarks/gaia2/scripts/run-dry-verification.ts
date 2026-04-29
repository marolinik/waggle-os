#!/usr/bin/env tsx
/**
 * Sesija C Phase 3b — Gaia2 dry-verification driver (OpenRouter direct).
 *
 * Wires:
 *   - benchmarks/gaia2/config.yaml         → Gaia2AdapterConfig
 *   - benchmarks/gaia2/data/*.jsonl        → loaded via adapter.loadGaia2TasksFromJsonl
 *   - OPENROUTER_API_KEY                   → LlmCallFn (OpenRouter direct chat-completions)
 *   - benchmarks/gaia2/adapter.ts          → runDryRunSweep
 *   - benchmarks/gaia2/runs/<ISO>/         → JSONL output
 *
 * Phase 3b-B-1 patch: replaced LiteLLM proxy transport with OpenRouter
 * direct per PM ratification Option B (2026-04-30 Phase 3b-B kick-off
 * env-var halt resolved). LITELLM_URL + LITELLM_MASTER_KEY were empty
 * in the shell; OPENROUTER_API_KEY was present. Proportional pivot for
 * 4-invocation probe scope.
 *
 * Slug map (`LITELLM_TO_OPENROUTER_SLUG`):
 *   - claude-opus-4-7         → anthropic/claude-opus-4.7   (EXACT match)
 *   - qwen3.6-35b-a3b         → qwen/qwen3-30b-a3b-thinking-2507
 *                              (closest available; 30b vs 35b size delta;
 *                               same a3b architecture + thinking-mode;
 *                               proportional for cost-projection probe)
 *
 * Cost methodology: per-call cost = inTokens × priceIn/1e6 +
 *   outTokens × priceOut/1e6, prices from Faza 1 PRICE_TABLE
 *   (decisions/2026-04-29-gepa-faza1-results.md §F). Opus prices are
 *   exact (Faza 1 used same model). Qwen prices are the Faza 1
 *   `qwen3.6-35b-a3b-via-openrouter` row applied to the 30b OpenRouter
 *   slug as projection-grade approximation.
 *
 * Usage:
 *   pnpm tsx benchmarks/gaia2/scripts/run-dry-verification.ts \\
 *       --tasks benchmarks/gaia2/data/tasks-mini-2.jsonl \\
 *       --halt-after-probe   # (Phase 3b-B-2 sample mode)
 *
 * Env required:
 *   OPENROUTER_API_KEY         (required; FATAL if unset)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as yaml from 'js-yaml';
import {
  runDryRunSweep,
  writeRecordsToJsonl,
  type Gaia2AdapterConfig,
  type LlmCallFn,
} from '../adapter.js';

// ─── OpenRouter constants ────────────────────────────────────────────

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SUBJECT_MAX_TOKENS_QWEN = 16_000;
const SUBJECT_MAX_TOKENS_DEFAULT = 4_096;

/**
 * Translate adapter.ts SHAPE_TO_MODEL names (LiteLLM aliases) into
 * OpenRouter slugs. Validated 2026-04-30 against
 * https://openrouter.ai/api/v1/models response.
 *
 * If a shape's underlying model is missing from this map at runtime,
 * the call fails fast with a clear error.
 */
const LITELLM_TO_OPENROUTER_SLUG: Readonly<Record<string, string>> = Object.freeze({
  'claude-opus-4-7': 'anthropic/claude-opus-4.7',
  'qwen3.6-35b-a3b': 'qwen/qwen3-30b-a3b-thinking-2507',
  // Fallbacks for shapes not in the brief 4-shape sweep but reachable
  // via SHAPE_TO_MODEL in adapter.ts (defensive — would only fire if
  // config.yaml is widened beyond BRIEF_DRY_RUN_SHAPES).
  'gpt-5.4': 'openai/gpt-4o-2024-08-06', // closest available; flag if used
  'claude-haiku-4-5': 'anthropic/claude-haiku-4.5',
});

/**
 * Faza 1 PRICE_TABLE rows (USD per 1M tokens), used for projection-grade
 * cost computation when OpenRouter response doesn't include `usage.cost`
 * (which requires `usage.include: true` in request body).
 *
 * Source: benchmarks/gepa/scripts/faza-1/run-checkpoint-c.ts:106-110.
 * Opus prices are wire-accurate. Qwen 30b prices are approximation
 * inherited from `qwen3.6-35b-a3b-via-openrouter`.
 */
const PRICE_TABLE: Readonly<Record<string, { in: number; out: number }>> = Object.freeze({
  'anthropic/claude-opus-4.7': { in: 15.0, out: 75.0 },
  'qwen/qwen3-30b-a3b-thinking-2507': { in: 0.6, out: 2.4 },
  'openai/gpt-4o-2024-08-06': { in: 2.5, out: 10.0 },
  'anthropic/claude-haiku-4.5': { in: 1.0, out: 5.0 },
});

// ─── OpenRouter LlmCallFn ────────────────────────────────────────────

function makeOpenRouterCallFn(opts: { apiKey: string }): LlmCallFn {
  return async (input) => {
    const slug = LITELLM_TO_OPENROUTER_SLUG[input.model];
    if (!slug) {
      return {
        content: '',
        inTokens: 0,
        outTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        error: `No OpenRouter slug mapping for model "${input.model}". Add to LITELLM_TO_OPENROUTER_SLUG in run-dry-verification.ts.`,
      };
    }

    const isQwen = slug.includes('qwen');
    const maxTokens = input.maxTokens ?? (isQwen ? SUBJECT_MAX_TOKENS_QWEN : SUBJECT_MAX_TOKENS_DEFAULT);

    const payload: Record<string, unknown> = {
      model: slug,
      messages: input.messages,
      max_tokens: maxTokens,
      // OpenRouter `usage.include: true` opt-in returns wire-accurate cost
      // in the response. We capture this when present and fall back to
      // PRICE_TABLE-based computation otherwise.
      usage: { include: true },
    };

    // Temperature: Opus needs 1.0 sentinel per Faza 1 convention; GPT-5.x
    // family rejects temperature override; everything else gets 0.3.
    if (slug.startsWith('anthropic/claude-opus')) {
      payload.temperature = 1.0;
    } else if (slug.startsWith('openai/gpt-5')) {
      // omit temperature (provider rejects override)
    } else {
      payload.temperature = input.temperature ?? 0.3;
    }

    // Qwen thinking-mode is encoded in the slug itself (`-thinking-2507`)
    // for the OpenRouter route — no `enable_thinking` extra_body needed.
    // Verified against OpenRouter qwen3-*-thinking-2507 model cards.

    const startMs = Date.now();
    let lastErr: string | undefined;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opts.apiKey}`,
            // OpenRouter conventions:
            'HTTP-Referer': 'https://waggle-os.ai',
            'X-Title': 'Waggle Sesija C — Gaia2 narrow-proxy probe',
          },
          body: JSON.stringify(payload),
        });

        const body = (await resp.json()) as Record<string, unknown>;

        if ('error' in body) {
          const errObj = body.error as Record<string, unknown> | undefined;
          lastErr = String(errObj?.message ?? JSON.stringify(body.error)).slice(0, 300);
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

        const choices = body.choices as
          | Array<{ message?: { content?: string; reasoning?: string } }>
          | undefined;
        const content = choices?.[0]?.message?.content ?? '';

        const usage = body.usage as
          | { prompt_tokens?: number; completion_tokens?: number; cost?: number }
          | undefined;
        const inTokens = usage?.prompt_tokens ?? 0;
        const outTokens = usage?.completion_tokens ?? 0;

        // Wire-accurate cost preferred; fall back to PRICE_TABLE.
        let costUsd = usage?.cost ?? 0;
        if (costUsd === 0 && PRICE_TABLE[slug]) {
          const pt = PRICE_TABLE[slug];
          costUsd = (inTokens * pt.in) / 1_000_000 + (outTokens * pt.out) / 1_000_000;
        }

        return {
          content,
          inTokens,
          outTokens,
          costUsd,
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
      error: lastErr ?? 'unknown OpenRouter call failure',
    };
  };
}

// ─── CLI ──────────────────────────────────────────────────────────────

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
  return parsed as unknown as Gaia2AdapterConfig;
}

async function main(): Promise<number> {
  const { tasksFile, haltAfterProbe, configPath } = parseArgs();

  console.error(
    `[gaia2-dry-verification] config=${configPath} tasks=${tasksFile} ` +
      `haltAfterProbe=${haltAfterProbe}`,
  );

  const config = loadConfig(configPath);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    console.error(
      'FATAL: OPENROUTER_API_KEY must be set in env (Phase 3b-B-1 OpenRouter direct fallback per PM ratification Option B).',
    );
    return 2;
  }
  const llmCall = makeOpenRouterCallFn({ apiKey });

  const startedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(
    process.cwd(),
    config.output_dir_root,
    `dry-verification-${startedAt}`,
  );
  fs.mkdirSync(outDir, { recursive: true });

  const result = await runDryRunSweep(config, llmCall, {
    tasksFile,
    haltAfterProbe,
  });

  writeRecordsToJsonl(result.probe_records, path.join(outDir, 'probe.jsonl'));
  writeRecordsToJsonl(result.full_sweep_records, path.join(outDir, 'full-sweep.jsonl'));

  const summary = {
    timestamp_started: new Date().toISOString(),
    config_path: configPath,
    tasks_file: tasksFile,
    transport: 'openrouter-direct' as const,
    probe_invocation_count: result.probe_records.length,
    probe_cost_usd: result.probe_cost_usd,
    projected_total_usd: result.projected_total_usd,
    halt_triggered: result.halt_triggered,
    full_sweep_invocation_count: result.full_sweep_records.length,
    final_total_cost_usd: result.final_total_cost_usd,
    cost_cap_usd: config.cost_cap_usd,
    halt_trigger_usd: config.halt_trigger_usd,
    slug_map: LITELLM_TO_OPENROUTER_SLUG,
    price_table: PRICE_TABLE,
  };
  fs.writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf-8',
  );

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
