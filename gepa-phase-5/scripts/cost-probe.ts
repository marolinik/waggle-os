#!/usr/bin/env tsx
/**
 * Phase 5 §0.3 — Cost projection probe.
 *
 * Per PM ratification 2026-04-29 Phase 5 §0 preflight Ask #2: AUTHORIZED.
 * Per brief §0.3 #3 + §5.4 cost ceiling computation.
 *
 * Sends 5 prompts of varying complexity to each Phase 5 deployed variant via
 * the existing LiteLLM proxy (matches Faza 1 runner pattern):
 *   - claude::gen1-v1 model alias = claude-opus-4-7
 *   - qwen-thinking::gen1-v1 model alias = qwen3.6-35b-a3b-via-dashscope-direct
 *
 * Records actual input/output tokens × pricing snapshot 2026-04-29.
 * Emits per-request JSONL + computes p50/p95/max.
 *
 * Validates canary_cost_p95_ceiling = 740 × max(p95) × 1.20 ≤ $20.
 *
 * Pricing snapshot (2026-04-29 — public docs URL):
 *   - Claude Opus 4.7: $5/M input, $25/M output (NEW Opus 4.7 pricing per
 *     platform.claude.com/docs/en/docs/about-claude/pricing 2026-04-29)
 *   - DashScope Qwen 35B-A3B intl thinking: $0.25/M input, $2/M output
 *     (alibabacloud.com/help/en/model-studio/billing-for-model-studio 2026-04-29)
 *
 * NOTE on Faza 1 pricing reference: run-checkpoint-c.ts uses different
 * historical pricing ($15/$75 for Opus, $0.20/$0.80 for Qwen). Phase 5
 * uses the 2026-04-29 snapshot above (Opus 4.7 reduced rate; Qwen intl
 * thinking-mode rate). Probe pricing is the binding source for §0.3.
 *
 * Usage: npx tsx gepa-phase-5/scripts/cost-probe.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { claudeGen1V1Shape } from '../../packages/agent/src/prompt-shapes/gepa-evolved/claude-gen1-v1.js';
import { qwenThinkingGen1V1Shape } from '../../packages/agent/src/prompt-shapes/gepa-evolved/qwen-thinking-gen1-v1.js';

// Manual .env load (no dotenv dependency; keep probe self-contained)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUT_JSONL = path.join(REPO_ROOT, 'gepa-phase-5/cost-probe-2026-04-29.jsonl');
const OUT_SUMMARY = path.join(REPO_ROOT, 'gepa-phase-5/cost-probe-2026-04-29-summary.md');

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000';
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY;

// 2026-04-29 pricing snapshot (Phase 5 binding)
const PRICING = {
  'claude::gen1-v1': { in_per_m: 5.0, out_per_m: 25.0, model_alias: 'claude-opus-4-7' },
  'qwen-thinking::gen1-v1': {
    in_per_m: 0.25,
    out_per_m: 2.0,
    model_alias: 'qwen3.6-35b-a3b-via-dashscope-direct',
  },
} as const;

interface ProbePrompt {
  complexity: 'trivial' | 'medium-1' | 'medium-2' | 'complex' | 'stretch';
  persona: string;
  materials: string;
  question: string;
  max_tokens: number;
}

const PROMPTS: ProbePrompt[] = [
  {
    complexity: 'trivial',
    persona: 'a concise factual analyst',
    materials: 'The number two added to the number two equals four. This is elementary arithmetic.',
    question: 'What is 2+2?',
    max_tokens: 200,
  },
  {
    complexity: 'medium-1',
    persona: 'a CFO advisor at a mid-stage SaaS startup',
    materials: [
      'Q3 metrics for Acme SaaS (Series B, $12M ARR):',
      '- ARR growth slowed from 18% QoQ to 9% QoQ.',
      '- Gross margin held at 78%.',
      '- Net dollar retention dropped from 121% to 108%.',
      '- Churn ticked up in SMB segment from 1.4% to 2.1% monthly.',
      '- Sales cycle elongated 22% in mid-market.',
      '- Two competitors raised Series C at higher valuations.',
    ].join('\n'),
    question: 'List the 3 highest-priority risks the CEO should brief the board on, in order.',
    max_tokens: 600,
  },
  {
    complexity: 'medium-2',
    persona: 'a software architect advising on legacy modernization',
    materials: [
      'Context: 8-year-old Rails monolith. ~400k LOC. Critical revenue path.',
      'Team: 12 backend engineers, 4 platform engineers. No prior modernization experience.',
      'Pressure: Sales reports the monolith blocks integration deals worth ~$8M ARR.',
      'Constraints: 9-month runway-extension clock; CEO wants visible progress every 60 days.',
    ].join('\n'),
    question: 'Compare strangler-fig vs big-bang refactor for this team. Recommend one with explicit risk acknowledgment.',
    max_tokens: 800,
  },
  {
    complexity: 'complex',
    persona: 'a strategic operations consultant',
    materials: [
      'NorthLane Retail (mid-market apparel chain):',
      '- Q3 SSS missed plan by 8% (-3.2% vs +5% planned).',
      '- Macro: discretionary spend down 4% sector-wide; 30y yield up 80bps in quarter.',
      '- Competitive: Aritzia opened 4 new doors in core trade areas; Old Navy ran 30% friends-and-family promo for 6 weeks.',
      '- Internal: New POS system rollout caused 6% transaction-error rate for 3 weeks; e-commerce site speed regressed (LCP 2.4s -> 4.1s).',
      '- Brand: Latest TikTok creator partnership underperformed engagement targets by 60%; Brand consideration score flat.',
      '- Inventory: $42M aged 90+ days; merch margin compressed 180bps to fund clearance.',
    ].join('\n'),
    question: 'Diagnose root causes across 4 dimensions (macro / competitive / internal execution / brand). For each, attribute approximate share of the 8% miss + propose one targeted Q4 intervention.',
    max_tokens: 1200,
  },
  {
    complexity: 'stretch',
    persona: 'an M&A analyst preparing an investment memo for the deal committee',
    materials: [
      'Target: Cobalt Cloud (Series D enterprise SaaS, governance + audit logging).',
      '- ARR: $50M trailing; +52% YoY; 110% NDR.',
      '- Customers: 320 logos, top-10 = 28% of ARR. Net new logos +18% YoY.',
      '- Gross margin: 76% (best-in-class for category 73-78%).',
      '- Sales efficiency (Magic Number): 1.1 (LTM); CAC payback 16 months.',
      '- Burn: $4M/quarter, 18 months runway.',
      '- Last round: $750M post on $35M ARR (21x), 2.5 years ago.',
      '- Comps: Drata (~25x ARR), Vanta (~22x ARR), Hyperproof (~14x ARR), AuditBoard (public, 8x).',
      '- Recent context: 2 strategic offers verbal at 12-15x ARR. Founder open to strategic at 15x+.',
    ].join('\n'),
    question: [
      'Walk through three valuation methods for Cobalt Cloud:',
      '1) DCF — state assumptions explicit (revenue growth fade, margin trajectory, discount rate, terminal multiple).',
      '2) Trading comps — apply weighted multiple from 4 comps to next-twelve-months revenue.',
      '3) LBO — assume Sponsor offer at $750M EV, 6.5x leverage, 5y hold, exit at 12x EBITDA. State minimum revenue CAGR for 25% IRR.',
      'Reconcile any gap > 25% between the three methods + recommend offer band.',
    ].join('\n'),
    max_tokens: 1500,
  },
];

interface ProbeResult {
  variant: 'claude::gen1-v1' | 'qwen-thinking::gen1-v1';
  complexity: ProbePrompt['complexity'];
  model_alias: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  ts: string;
  error?: string;
}

function appendJsonl(file: string, row: ProbeResult) {
  fs.appendFileSync(file, JSON.stringify(row) + '\n');
}

async function callViaLitellm(model: string, system: string, user: string, max_tokens: number) {
  if (!LITELLM_MASTER_KEY) throw new Error('LITELLM_MASTER_KEY not set');
  const payload = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens,
  };
  const t0 = Date.now();
  const resp = await fetch(`${LITELLM_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LITELLM_MASTER_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const latency_ms = Date.now() - t0;
  const data = (await resp.json()) as Record<string, unknown>;
  if (!resp.ok || 'error' in data) {
    const errMsg =
      (data as { error?: { message?: string } }).error?.message ??
      `HTTP ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`;
    return { ok: false as const, error: String(errMsg), latency_ms };
  }
  const choices = data.choices as Array<{ message: { content: string } }> | undefined;
  const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  return {
    ok: true as const,
    content: choices?.[0]?.message?.content ?? '',
    input_tokens: usage?.prompt_tokens ?? 0,
    output_tokens: usage?.completion_tokens ?? 0,
    latency_ms,
  };
}

async function probe(
  variant: 'claude::gen1-v1' | 'qwen-thinking::gen1-v1',
  prompt: ProbePrompt,
): Promise<ProbeResult> {
  const shape = variant === 'claude::gen1-v1' ? claudeGen1V1Shape : qwenThinkingGen1V1Shape;
  const config = PRICING[variant];

  const sysPrompt = shape.systemPrompt({
    persona: prompt.persona,
    question: prompt.question,
    isMultiStep: false,
  });
  const userPrompt = shape.soloUserPrompt({
    persona: prompt.persona,
    materials: prompt.materials,
    question: prompt.question,
  });

  const result = await callViaLitellm(config.model_alias, sysPrompt, userPrompt, prompt.max_tokens);

  if (!result.ok) {
    return {
      variant,
      complexity: prompt.complexity,
      model_alias: config.model_alias,
      input_tokens: 0,
      output_tokens: 0,
      cost_usd: 0,
      latency_ms: result.latency_ms,
      ts: new Date().toISOString(),
      error: result.error,
    };
  }

  const cost_usd =
    (result.input_tokens * config.in_per_m) / 1e6 +
    (result.output_tokens * config.out_per_m) / 1e6;
  return {
    variant,
    complexity: prompt.complexity,
    model_alias: config.model_alias,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    cost_usd,
    latency_ms: result.latency_ms,
    ts: new Date().toISOString(),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

interface VariantSummary {
  variant: string;
  count: number;
  errors: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
  total: number;
}

function summarize(results: ProbeResult[], variant: string): VariantSummary {
  const ok = results.filter((r) => r.variant === variant && !r.error);
  const errors = results.filter((r) => r.variant === variant && r.error).length;
  if (ok.length === 0) {
    return {
      variant,
      count: 0,
      errors,
      p50: NaN,
      p95: NaN,
      max: NaN,
      mean: NaN,
      total: 0,
    };
  }
  const costs = ok.map((r) => r.cost_usd);
  const total = costs.reduce((a, b) => a + b, 0);
  return {
    variant,
    count: ok.length,
    errors,
    p50: percentile(costs, 50),
    p95: percentile(costs, 95),
    max: Math.max(...costs),
    mean: total / ok.length,
    total,
  };
}

async function main() {
  fs.writeFileSync(OUT_JSONL, '');

  console.log('Phase 5 §0.3 cost probe — start');
  console.log(`LiteLLM: ${LITELLM_URL}`);
  console.log(`Output JSONL: ${OUT_JSONL}`);

  const results: ProbeResult[] = [];

  for (const variant of ['claude::gen1-v1', 'qwen-thinking::gen1-v1'] as const) {
    for (const prompt of PROMPTS) {
      console.log(`  ${variant} <- ${prompt.complexity}`);
      const r = await probe(variant, prompt);
      results.push(r);
      appendJsonl(OUT_JSONL, r);
      if (r.error) console.log(`    ERROR: ${r.error}`);
      else
        console.log(
          `    in=${r.input_tokens} out=${r.output_tokens} cost=$${r.cost_usd.toFixed(4)} latency=${r.latency_ms}ms`,
        );
    }
  }

  const claudeSummary = summarize(results, 'claude::gen1-v1');
  const qwenSummary = summarize(results, 'qwen-thinking::gen1-v1');

  const validP95s = [claudeSummary.p95, qwenSummary.p95].filter(
    (v) => Number.isFinite(v) && v > 0,
  );
  const max_p95 = validP95s.length > 0 ? Math.max(...validP95s) : NaN;
  const VOLUME = 740;
  const BUFFER = 1.2;
  const canary_cost_p95_ceiling = Number.isFinite(max_p95) ? VOLUME * max_p95 * BUFFER : NaN;
  const HALT = 20;
  const HARD_CAP = 25;

  const lines: string[] = [];
  lines.push('# Phase 5 §0.3 Cost Probe Summary');
  lines.push('');
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Pricing snapshot:** 2026-04-29`);
  lines.push(`**Branch:** phase-5-deployment-v2`);
  lines.push(`**Endpoint:** ${LITELLM_URL} (LiteLLM proxy, matches Faza 1 runner pattern)`);
  lines.push('');
  lines.push('## Per-variant statistics');
  lines.push('');
  lines.push('| Variant | Model alias | OK | Errors | p50 | p95 | max | mean | total |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const s of [claudeSummary, qwenSummary]) {
    const config = PRICING[s.variant as keyof typeof PRICING];
    if (s.count === 0) {
      lines.push(`| ${s.variant} | ${config.model_alias} | 0 | ${s.errors} | n/a | n/a | n/a | n/a | n/a |`);
    } else {
      lines.push(
        `| ${s.variant} | ${config.model_alias} | ${s.count} | ${s.errors} | $${s.p50.toFixed(4)} | $${s.p95.toFixed(4)} | $${s.max.toFixed(4)} | $${s.mean.toFixed(4)} | $${s.total.toFixed(4)} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Canary cost ceiling (per brief §5.4)');
  lines.push('');
  lines.push(
    `Formula: \`canary_cost_p95_ceiling = ${VOLUME} requests × max(p95) × ${BUFFER} (buffer)\``,
  );
  lines.push('');
  if (Number.isFinite(max_p95)) {
    lines.push(`max(p95) = $${max_p95.toFixed(4)}`);
    lines.push(
      `canary_cost_p95_ceiling = ${VOLUME} × $${max_p95.toFixed(4)} × ${BUFFER} = **$${canary_cost_p95_ceiling.toFixed(2)}**`,
    );
  } else {
    lines.push(`max(p95) = NaN (no successful samples)`);
    lines.push(`canary_cost_p95_ceiling = INDETERMINATE`);
  }
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  if (Number.isFinite(canary_cost_p95_ceiling)) {
    if (canary_cost_p95_ceiling <= HALT) {
      lines.push(
        `**PASS** — ceiling $${canary_cost_p95_ceiling.toFixed(2)} <= halt trigger $${HALT}.`,
      );
    } else if (canary_cost_p95_ceiling <= HARD_CAP) {
      lines.push(
        `**HALT-AND-PM** — ceiling $${canary_cost_p95_ceiling.toFixed(2)} > halt trigger $${HALT}, but <= hard cap $${HARD_CAP}.`,
      );
    } else {
      lines.push(
        `**HARD-CAP-EXCEED** — ceiling $${canary_cost_p95_ceiling.toFixed(2)} > hard cap $${HARD_CAP}.`,
      );
    }
  } else {
    lines.push(`**INDETERMINATE** — no valid p95.`);
  }
  lines.push('');
  lines.push('## Probe spend (this script)');
  const totalSpend = (claudeSummary.total ?? 0) + (qwenSummary.total ?? 0);
  lines.push('');
  lines.push(`Total: **$${totalSpend.toFixed(4)}**`);
  lines.push(`Brief §5.4 probe budget: $0.30-$0.50.`);
  lines.push('');
  lines.push('## JSONL anchor');
  lines.push('');
  lines.push('Per-request rows: `gepa-phase-5/cost-probe-2026-04-29.jsonl`');

  const summaryText = lines.join('\n');
  fs.writeFileSync(OUT_SUMMARY, summaryText);

  console.log('');
  console.log('==========================================');
  console.log(summaryText);
  console.log('==========================================');
  console.log(`Summary: ${OUT_SUMMARY}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
