#!/usr/bin/env tsx
/**
 * P2 — Ingest-time STATE sections over a finished Evidence Ledger (E6).
 *
 * Two derived, query-INDEPENDENT sections computed once per conversation from
 * the whole dated ledger (conv<N>.ledger.txt) and served at the TOP of the
 * context ahead of the raw ledger:
 *   (a) CURRENT VALUES  — supersession chains: an attribute whose value changed
 *       over time → its LATEST value + as-of date + the dated chain of prior
 *       values (fixes knowledge_update / preference / "what is my current X").
 *   (b) CONTRADICTION RECORDS — an assertion later denied, reversed, or
 *       contradicted → BOTH sides with their dates (fixes contradiction_res).
 *
 * The real supersede.ts detector operates on embedded Observation frames inside
 * a substrate; the ledger is plain dated text, so re-ingesting it just to run
 * that detector is not directly applicable. Instead we run a single gpt-5-mini
 * pass over the whole ledger with the SAME chain semantics (latest-wins
 * supersession + explicit contradiction), which is the pragmatic equivalent.
 *
 * Output: data/beam/ledgers-1M/conv<N>.state.txt (+ .state.done.json). The
 * serving runner (beam-run-ledger.ts) prepends this file to the ledger.
 *
 * RESUMABLE: per-conv .state.done.json; --resume skips finished convs.
 *
 * Usage:
 *   tsx scripts/beam-build-ledger-state.ts --convs 1 --budget 2
 *   tsx scripts/beam-build-ledger-state.ts --convs 1-35 --budget 6 --resume
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createBeamOpenAiClient, BeamOpenAiClient, OPENAI_PRICING, loadDotEnv } from '../src/beam-openai-client.js';

const here = url.fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
const OUT_DIR = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'ledgers-1M');

interface Args { convs: number[]; budget: number; resume: boolean; model: string; }
function parseConvSpec(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.add(i); }
    else if (/^\d+$/.test(part.trim())) out.add(+part.trim());
  }
  return [...out].sort((a, b) => a - b);
}
function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const a: Args = { convs: parseConvSpec('1-35'), budget: 6, resume: false, model: 'gpt-5-mini' };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]; const next = argv[i + 1];
    if (f === '--convs' && next) { a.convs = parseConvSpec(next); i++; }
    else if (f === '--budget' && next) { a.budget = parseFloat(next); i++; }
    else if (f === '--resume') { a.resume = true; }
    else if (f === '--model' && next) { a.model = next; i++; }
  }
  return a;
}

const SYSTEM_PROMPT =
  'You are a state-consolidation system. Given a complete, date-ordered evidence ledger of a ' +
  'conversation, you identify (1) attributes whose value CHANGED over time and report the latest ' +
  'value with its history, and (2) explicit CONTRADICTIONS where a claim was later denied or ' +
  'reversed. You reason carefully over dates and never invent facts not present in the ledger.';

function buildStatePrompt(ledger: string): string {
  return `Below is the COMPLETE date-ordered evidence ledger for one conversation (each line: [YYYY-MM-DD] fact ("quote") {entities}).

Produce EXACTLY two sections in this format, and nothing else:

=== CURRENT VALUES ===
For every attribute, setting, decision, preference, plan, or numeric/version value that was STATED MORE THAN ONCE with a DIFFERENT value over time (i.e. it changed / was updated / was superseded), output one line:
- <attribute>: CURRENT = <latest value> (as of <YYYY-MM-DD>); history: <older value> (<date>) -> <newer value> (<date>) -> ...
Only include attributes that actually CHANGED. If an attribute was stated once and never revised, do NOT list it. If nothing changed, write "(none)".

=== CONTRADICTION RECORDS ===
For every case where a later statement DENIES, REVERSES, or CONFLICTS WITH an earlier statement (e.g. "I decided X" then later "I switched away from X", or "I use A" vs "I use B" for the same thing, or "we shipped Y" vs "Y never happened"), output one line:
- <topic>: on <date> — "<earlier claim>"; on <date> — "<conflicting later claim>" [CONFLICT]
Include both sides with their dates. If there are no genuine contradictions, write "(none)".

RULES:
- Ground every value, date, and quote in the ledger. Do NOT invent.
- Copy numbers, versions, dates, and names EXACTLY as they appear.
- Be thorough but precise: only report real changes/conflicts, not mere repetition or elaboration.
- Output ONLY the two sections with their headers.

LEDGER:
${ledger}`;
}

/** gpt-5-mini caps input at ~272K tokens, but the 1M-token BEAM ledgers exceed
 *  that (conv1 ~390K, conv11 ~430K), so gpt-5-mini returns http_400 on every
 *  conv. Route anthropic/* through OpenRouter (1M context) for whole-ledger state
 *  consolidation; keep gpt-5-mini routing for any conv small enough. */
function makeStateClient(model: string): BeamOpenAiClient {
  if (/claude|anthropic/i.test(model)) {
    loadDotEnv();
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY required for anthropic/* models');
    return new BeamOpenAiClient({
      model, apiKey: key, baseUrl: 'https://openrouter.ai/api/v1',
      pricing: OPENAI_PRICING[model] ?? { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      timeoutMs: 300_000, maxRetries: 2,
    });
  }
  // State detection is genuinely reasoning-heavy (tracking value changes across
  // dates), so 'medium' effort; long timeout for large ledgers.
  return createBeamOpenAiClient({
    model, pricing: OPENAI_PRICING[model], timeoutMs: 300_000, maxRetries: 2, reasoningEffort: 'medium',
  });
}

async function main(): Promise<void> {
  const args = parseArgs();
  loadDotEnv();
  const client = makeStateClient(args.model);
  console.log(`[state] model=${args.model} budget=$${args.budget} convs=${args.convs.length}`);
  let totalCost = 0;

  for (const conv of args.convs) {
    const ledgerPath = path.join(OUT_DIR, `conv${conv}.ledger.txt`);
    const statePath = path.join(OUT_DIR, `conv${conv}.state.txt`);
    const donePath = path.join(OUT_DIR, `conv${conv}.state.done.json`);
    if (args.resume && fs.existsSync(donePath) && fs.existsSync(statePath)) { console.log(`[state] conv ${conv}: done (skip)`); continue; }
    if (!fs.existsSync(ledgerPath)) { console.warn(`[state] conv ${conv}: no ledger (skip — build P1 first)`); continue; }
    if (totalCost >= args.budget) { console.warn(`[state] budget reached — stopping.`); break; }

    const ledger = fs.readFileSync(ledgerPath, 'utf-8');
    const approxIn = Math.ceil(ledger.length / 4);
    console.log(`[state] conv ${conv}: ledger ~${approxIn} tok → consolidating...`);
    const r = await client.chat({ system: SYSTEM_PROMPT, user: buildStatePrompt(ledger), maxTokens: 16384 });
    totalCost += r.costUsd;
    if (r.failureMode || !r.text.trim()) { console.error(`[state] conv ${conv}: FAILED (${r.failureMode ?? 'empty'}) — not marking done.`); continue; }

    fs.writeFileSync(statePath, r.text.trim() + '\n');
    const nCurrent = (r.text.match(/^- /gm) ?? []).length;
    const stats = { conv, ledger_tokens: approxIn, state_lines: nCurrent, out_tokens: r.outputTokens, cost_usd: +r.costUsd.toFixed(4), model: args.model };
    fs.writeFileSync(donePath, JSON.stringify(stats, null, 2));
    console.log(`[state] conv ${conv}: ${nCurrent} state lines, ${r.outputTokens} out tok, $${r.costUsd.toFixed(4)} | running $${totalCost.toFixed(2)}`);
  }
  console.log(`[state] DONE. total spend $${totalCost.toFixed(3)}`);
}

main().catch(e => { console.error('[beam-build-ledger-state] FATAL:', e); process.exit(1); });
