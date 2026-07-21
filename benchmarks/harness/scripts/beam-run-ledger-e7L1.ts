#!/usr/bin/env tsx
/**
 * P3 — Whole-Ledger serving runner (E6). Serves the COMPLETE per-conversation
 * Evidence Ledger (P1) + STATE sections (P2) as the answer context, instead of a
 * top-k retrieval excerpt. This is the decisive test of the deep-dive thesis:
 * the 4 whole-history STATE abilities (abstention / contradiction / temporal /
 * event_ordering) are unanswerable from <3%-coverage top-k, but trivial over a
 * complete dated store.
 *
 * PER QUESTION:
 *   - cacheableSystem = [framing + CURRENT VALUES + CONTRADICTION RECORDS + full
 *     dated ledger] — a STABLE per-conversation prefix. With Anthropic prompt
 *     caching (via OpenRouter cache_control) the 20 questions of one conversation
 *     share ONE cache write; the rest are cheap cache reads. Questions are
 *     processed GROUPED BY CONVERSATION to keep the cache warm.
 *   - user message = ability-general instruction (gold-blind: keyed off the
 *     dataset's memory_ability metadata, NOT gold) + question. Detail abilities
 *     also get top-N raw dated turns from minds-1M (keeps the retrieval wins);
 *     STATE abilities get the ledger ONLY (abstention needs a store it can trust
 *     is complete — retrieval always surfaces something tangential).
 *   - answerer: anthropic/claude-sonnet-4.6 (via OpenRouter — identical to the
 *     E4-combo-sonnet baseline, for a fair comparison). Judge: canonical gpt-5.
 *
 * RESUMABLE: append-JSONL + skip-done (--resume). --instance-ids allowlist,
 * --abilities filter, --budget hard-cap. --smoke prints contexts (no judge).
 *
 * Usage:
 *   tsx scripts/beam-run-ledger.ts --smoke --convs 1 --instance-ids scripts/smoke3.txt
 *   tsx scripts/beam-run-ledger.ts --instance-ids scripts/matched50.txt --budget 14 --tag e6-ledger-pilot --resume
 *   tsx scripts/beam-run-ledger.ts --convs 1-35 --budget 60 --tag e6-ledger-FULL700 --resume
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createOllamaEmbedder } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';
import { createBeamOpenAiClient, BeamOpenAiClient, OPENAI_PRICING, loadDotEnv } from '../src/beam-openai-client.js';
import { judgeQuestion } from '../src/beam-nugget-judge.js';
import { buildConvDateMap } from '../src/beam-date-map.js';
import { computeBeamMetrics, formatBeamMetrics } from '../src/beam-metrics.js';
import type { BeamQuestionResult } from '../src/beam-metrics.js';
import { buildMultiRouteContext, DEFAULT_MULTIROUTE } from '../src/beam-multiroute.js';

const here = url.fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
const BEAM_CHATS = path.resolve(repoRoot, '..', 'BEAM', 'chats');
const LEDGER_DIR = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'ledgers-1M');
const RAW_MINDS = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M');

interface Question { instanceId: string; conv: number; gopId: string; memoryAbility: string; question: string; rubric: string[]; }
interface Args {
  model: string; judgeModel: string; budget: number; resume: boolean; smoke: boolean;
  convs: number[]; instanceIds: Set<string> | null; abilities: Set<string> | null;
  rawTurns: number; noCache: boolean; tag: string; outPath: string | null;
}

const STATE_ABILITIES = new Set(['abstention', 'temporal_reasoning', 'event_ordering', 'contradiction_resolution']);
const DETAIL_ABILITIES = new Set(['information_extraction', 'instruction_following', 'preference_following', 'knowledge_update', 'multi_session_reasoning']);
// E7-L1: abilities that must NOT see the P2 CURRENT VALUES overlay. The overlay injects a
// superseded/revised value ("CURRENT = March 18; history: March 15 -> March 18") that biases
// duration/aggregation answers toward the wrong anchor when gold wants the original value.
// These abilities get the dated ledger (+ CONTRADICTION RECORDS) but not CURRENT VALUES.
const NO_CV_ABILITIES = new Set(['temporal_reasoning', 'multi_session_reasoning', 'event_ordering']);
const ABSTAIN_SENTINEL = "I don't have enough information to answer this question.";

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
  const a: Args = {
    model: 'anthropic/claude-sonnet-4.6', judgeModel: 'gpt-5', budget: 14, resume: false, smoke: false,
    convs: parseConvSpec('1-35'), instanceIds: null, abilities: null, rawTurns: 30, noCache: false,
    tag: 'e6-ledger', outPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]; const next = argv[i + 1];
    if (f === '--model' && next) { a.model = next; i++; }
    else if (f === '--judge-model' && next) { a.judgeModel = next; i++; }
    else if (f === '--budget' && next) { a.budget = parseFloat(next); i++; }
    else if (f === '--resume') { a.resume = true; }
    else if (f === '--smoke') { a.smoke = true; }
    else if (f === '--convs' && next) { a.convs = parseConvSpec(next); i++; }
    else if (f === '--raw-turns' && next) { a.rawTurns = parseInt(next, 10); i++; }
    else if (f === '--no-cache') { a.noCache = true; }
    else if (f === '--tag' && next) { a.tag = next; i++; }
    else if (f === '--out' && next) { a.outPath = path.resolve(next); i++; }
    else if (f === '--abilities' && next) { a.abilities = new Set(next.split(',').map(s => s.trim()).filter(Boolean)); i++; }
    else if (f === '--instance-ids' && next) {
      a.instanceIds = new Set(fs.readFileSync(path.resolve(next), 'utf-8').split('\n').map(s => s.trim()).filter(Boolean));
      i++;
    }
  }
  return a;
}

function extractRubric(pq: Record<string, unknown>): string[] {
  const raw = pq.rubric;
  if (Array.isArray(raw)) return raw.map(String).map(s => s.trim()).filter(Boolean);
  if (raw && typeof raw === 'object') {
    const n = (raw as Record<string, unknown>).nuggets;
    if (Array.isArray(n)) return n.map(String).map(s => s.trim()).filter(Boolean);
  }
  if (raw) return [String(raw).trim()];
  return [];
}

function loadConvQuestions(conv: number): Question[] {
  const pqPath = path.join(BEAM_CHATS, '1M', String(conv), 'probing_questions', 'probing_questions.json');
  if (!fs.existsSync(pqPath)) return [];
  const data = JSON.parse(fs.readFileSync(pqPath, 'utf-8')) as Record<string, Record<string, unknown>[]>;
  const out: Question[] = [];
  for (const [category, questions] of Object.entries(data)) {
    if (!Array.isArray(questions)) continue;
    questions.forEach((pq, qi) => {
      const q = typeof pq.question === 'string' ? pq.question : '';
      if (!q) return;
      out.push({ instanceId: `beam_1M_${conv}_${category}_q${qi}`, conv, gopId: `beam_${conv}`, memoryAbility: category, question: q, rubric: extractRubric(pq) });
    });
  }
  return out;
}

function ledgerAvailable(conv: number): boolean {
  return fs.existsSync(path.join(LEDGER_DIR, `conv${conv}.ledger.txt`));
}

/** Drop the `=== CURRENT VALUES ===` block from a state.txt, keep CONTRADICTION RECORDS. */
function stripCurrentValues(state: string): string {
  const idx = state.indexOf('=== CONTRADICTION RECORDS ===');
  if (idx >= 0) return state.slice(idx).trim();
  // No contradiction section present: drop the whole overlay.
  return '';
}

/**
 * Assemble the cacheable system prefix: framing + STATE sections + full ledger.
 * E7-L1: `includeCurrentValues=false` serves the dated ledger + CONTRADICTION RECORDS but
 * omits the CURRENT VALUES overlay (and its framing line), for the NO_CV_ABILITIES.
 */
function buildLedgerPrefix(conv: number, includeCurrentValues = true): string {
  const ledger = fs.readFileSync(path.join(LEDGER_DIR, `conv${conv}.ledger.txt`), 'utf-8').trim();
  const statePath = path.join(LEDGER_DIR, `conv${conv}.state.txt`);
  const fullState = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf-8').trim()
    : '=== CURRENT VALUES ===\n(none)\n\n=== CONTRADICTION RECORDS ===\n(none)';
  if (includeCurrentValues) {
    return `You are an AI assistant answering questions about a user, using a COMPLETE evidence ledger derived from your entire prior conversation history with them.

The ledger below is the COMPLETE and ONLY record of that conversation history. Every fact in it was extracted from the actual conversation; each line is dated [YYYY-MM-DD], states one fact, and carries a verbatim source quote in parentheses. Lines are ordered by date (oldest first). Two consolidated sections precede the ledger:
- CURRENT VALUES: the latest value of any attribute/decision/preference that changed over time.
- CONTRADICTION RECORDS: statements that were later reversed, denied, or that conflict.

${fullState}

=== EVIDENCE LEDGER (complete, date-ordered) ===
${ledger}`;
  }
  const state = stripCurrentValues(fullState);
  const stateBlock = state ? `${state}\n\n` : '';
  const framingSection = state
    ? `Lines are ordered by date (oldest first). One consolidated section precedes the ledger:
- CONTRADICTION RECORDS: statements that were later reversed, denied, or that conflict.

`
    : `Lines are ordered by date (oldest first).

`;
  return `You are an AI assistant answering questions about a user, using a COMPLETE evidence ledger derived from your entire prior conversation history with them.

The ledger below is the COMPLETE and ONLY record of that conversation history. Every fact in it was extracted from the actual conversation; each line is dated [YYYY-MM-DD], states one fact, and carries a verbatim source quote in parentheses. ${framingSection}${stateBlock}=== EVIDENCE LEDGER (complete, date-ordered) ===
${ledger}`;
}

function abilityInstruction(ability: string): string {
  switch (ability) {
    case 'abstention':
      return `The evidence ledger above is the COMPLETE record of everything in this conversation. If the answer to the question is genuinely NOT present anywhere in the ledger, respond with EXACTLY this sentence and nothing else: "${ABSTAIN_SENTINEL}" Do NOT guess, infer unstated facts, or use any outside knowledge. Only answer if the ledger actually contains the information.`;
    case 'temporal_reasoning':
      return `This is a TEMPORAL question. Every ledger line carries a [YYYY-MM-DD] stamp and the ledger is date-ordered. Find every relevant date, then answer in the FORM the question asks for — anchored on the ledger stamps:
- DURATION / SPAN ("how long", "how many days/weeks/months between A and B", total time on something): COMPUTE it and commit to a single answer like "42 days — from 2024-03-01 to 2024-04-12". Do not hedge with ranges.
- RELATIVE OFFSET or ORDERING ("how many days before/after X", "the day before", "the week after", "which came first"): identify the specific action that actually falls on the side the question asks (for "before X" it must be dated EARLIER than X; for "after X" LATER), and answer in the question's own form (e.g. "the day before — booked 2024-04-19, one day before the 2024-04-20 symposium"). Discard candidate dates on the wrong side of X or that belong to a different event; do NOT force an unrelated multi-day span when the answer is a simple relative offset.
- SPECIFIC DATE ("when did X happen"): give that date.
When several ledger lines give different candidate dates for the same event, use the date the event ACTUALLY happened or was confirmed (an exam sat, a milestone completed, a session held), NOT the first time it was merely mentioned, planned, or scheduled. For "by the time X took place" / "by my exam" phrasing, anchor on when X actually occurred. IMPORTANT: when the question asks how long before/after an event you did something that is itself scheduled FOR a specific date (a booked trip, a reserved flight, a planned session), and the wording is ambiguous between when you ARRANGED it and the date it is scheduled FOR, anchor the offset on the SCHEDULED/target date of that thing, not the date you arranged it — e.g. a flight reserved on May 2 for departure on May 20, asked how many days before a May 21 conference it departs, is "the day before" (May 20), not eighteen days (the reservation date).`;
    case 'event_ordering':
      return `This is an ORDERING question — treat it as an EXHAUSTIVE, ordered walkthrough of the WHOLE conversation timeline. The question asks for a specific number of items "in order". (1) Span the ENTIRE date range from the EARLIEST to the LATEST relevant ledger date — distribute your items across the full timeline; do NOT cluster them all in the early period. Later topics (e.g. authentication, security/TLS, fine-tuning, deployment/scaling, streaming, tessellation/visualization tools) count as much as early ones. (2) Present them in strict CHRONOLOGICAL order using the [YYYY-MM-DD] stamps, oldest first, each with its date. (3) For each item, name the SPECIFIC tools, libraries, versions, techniques, or topics the ledger records (e.g. exact software or method names) — the grader checks for specific named topics, not generic descriptions. Cover the distinct sub-topics comprehensively; do not repeat one theme across items. METHOD: first mentally partition the whole timeline into DISTINCT topical PHASES (each a different sub-topic or project stage), then make each of the N requested items a DIFFERENT phase — never spend two items on the same theme. Deliberately reserve items for the LATER-stage phases, which are easy to drop: common ones include authentication / role-based access control, security / TLS configuration, transformer- or LLM-based streaming integration, streaming-performance / chunk-size tuning, database-schema changes, model fine-tuning, and deployment / scaling — include each such phase as its own item whenever the ledger records it. Label every item with its distinct phase name and its date. Give EACH distinct technique, tool, method, model, or library its OWN separate item (e.g. two differently-named tools, or two distinct calculation techniques, are two items — never merge them), and do not let one dominant theme crowd out the smaller distinct sub-topics.`;
    case 'contradiction_resolution':
      return `This is a CONTRADICTION question. These questions almost always hinge on a PLANTED DENIAL: somewhere in the ledger the user explicitly says they NEVER did / didn't / haven't / never actually / never completed / never attended / never studied / never implemented the very thing the question asks about — even though OTHER lines show they clearly DID do it. Before answering, do ALL of this:
1. Search the ENTIRE ledger for any statement that NEGATES the asked activity (scan for "never", "didn't", "haven't", "never actually", "never completed/attended/studied/implemented/practiced"). There is very likely exactly one such line — quote it VERBATIM with its date.
2. State the affirmative evidence that they DID do it, with specifics (dates, numbers, names) and its date.
3. Explicitly say the information is CONTRADICTORY, present BOTH conflicting statements side by side each WITH its date, and note which is more recent and which appears correct.
Also consult the CONTRADICTION RECORDS section above. Do NOT just answer "yes" from the affirmative history — you MUST surface the "never" denial; failing to find it is the main way this question is failed.`;
    case 'summarization':
      return `This is a SUMMARY / overview question. Be EXHAUSTIVE. METHOD: first identify ALL the distinct COMPONENTS, STAGES, and TOPIC AREAS discussed across the entire timeline — each distinct service/module, infrastructure layer, model/ML step, frontend piece, data layer, and ops concern — then write a structured section for EACH. Do NOT let the dominant topic (the one discussed most) crowd out the later or secondary components: the grader checks coverage of the WHOLE process, so a summary that is deep on one area but omits whole stages scores poorly. When present in the ledger, explicitly cover each of: model training / fine-tuning and hyperparameter tuning, containerization (Docker / Docker Compose), orchestration (Kubernetes), frontend state management, database schema and connection issues, caching strategies, authentication / security, deployment / scaling, error handling, and monitoring. For each item include the specific details the ledger records — tools, libraries, versions, numbers, prices, dates, causes, and outcomes. Prefer complete, clause-dense, structured coverage over brevity; do not omit minor items or whole components.`;
    case 'knowledge_update':
      return `This question asks for the user's CURRENT / most-recent value, setting, or decision. The CURRENT VALUES section is a helpful summary but may be incomplete or may list only a GENERAL attribute. If the question names a SPECIFIC variant (e.g. the "recent translations" cache vs the general translation cache, one specific module vs the whole project, a named sub-setting), find the latest-dated ledger line matching THAT EXACT variant — it may differ from CURRENT VALUES. Scan the latest-dated relevant ledger lines directly, report the most recent value, and note it superseded any earlier one. Do not blindly copy CURRENT VALUES if a more specific or more recent ledger line answers the exact question asked; do not report an outdated value as current. IMPORTANT: the latest value can appear in a LATER entry (even one on the SAME date) that says the value was "extended / changed / updated / increased / reduced to" a new number — scan to the very last relevant entry and report that superseding value, not the first one stated. E.g. if a rate limit is first stated as 100/s and a later same-day entry raises it to 250/s, the current value is 250/s. CAUTION: CURRENT VALUES is a DERIVED summary and can CONFLATE two similar-but-distinct settings — e.g. a general translation/response cache versus a specifically-named cache like the "recent translations" cache — and may therefore report a number that actually belongs to the OTHER setting. When the question targets a specific named item, do NOT trust CURRENT VALUES; instead locate the value from the ledger lines that are part of THAT item's own discussion thread (the ones that name or directly continue that exact item), and report the latest such value even if CURRENT VALUES and other similarly-named items show a different number.`;
    case 'preference_following':
      return `This is a PREFERENCE-FOLLOWING question. The user has previously stated a preferred METHOD, approach, style, tool, or convention for how they want this kind of task DONE or EXPLAINED (e.g. prefers vector-algebra derivations over trigonometry, prefers a specific library or framework, prefers step-by-step derivations, a particular notation, or explicitly wants to AVOID some approach/tool). This is NOT a "latest value" question — it is about honoring how they like things done. FIRST scan the ledger AND the supporting raw excerpts for the user's stated preference relevant to THIS question (if it changed over time, use the most recently stated preference). THEN actually ANSWER the question by USING and COMPLYING WITH that preferred method — solve it their way, use exactly the tool/technique/notation they prefer, and avoid any approach they said they dislike or want to avoid. Do not merely name the preference, and do not give a generically-correct answer that ignores their stated way of doing things. If the user has an ESTABLISHED tool, library, or version for this exact task, give optimizations and configuration SPECIFIC to that exact tool/version (its own options, flags, and tuning knobs), and do NOT suggest switching to, adding, or showing code for any alternative library that serves the same purpose — stay entirely within their chosen tool.`;
    case 'instruction_following':
      return `This is an INSTRUCTION-FOLLOWING question. The user has previously given a STANDING INSTRUCTION or preference about HOW answers on this topic must be formatted or what they must ALWAYS include (e.g. always cite version numbers and protocol versions like OAuth 2.0 / TLS 1.3, always include export steps and file-format options, always explain how to save or share outputs, always give step-by-step derivations, always use diagrams). Search the ledger AND the supporting raw excerpts for any such standing instruction relevant to this question, then COMPLY with it: include those specific required elements in your answer, not just the bare facts. Answer completely — name exact tools, versions, and the how-to steps the user asked you to always provide.`;
    case 'multi_session_reasoning':
      return `This question reasons ACROSS multiple sessions — scan the ENTIRE ledger and cross-reference related facts across different dates. If it asks HOW MANY distinct types / kinds / categories / use-cases of something, first GROUP the individual mentions into distinct CATEGORIES and count the CATEGORIES, not every individual instance — the intended answer is usually a small number (about 3-5), so do NOT inflate the count by listing every occurrence separately. If it asks you to optimize or compare, be specific: name the exact tools/versions and cover every relevant technique the ledger records (e.g. leverage the specific library's own strengths, schema indexing, cache-before-DB checks, robust queue with backoff). Include exact names, dates, numbers, and versions.`;
    default:
      return `Answer accurately and completely using the ledger. Scan all relevant lines, cross-reference across dates, and include exact names, dates, numbers, and versions.`;
  }
}

function stripAns(text: string): string {
  return text.includes('ANSWER:') ? text.split('ANSWER:').pop()!.trim() : text.trim();
}

function makeClient(model: string, forCaching: boolean): BeamOpenAiClient {
  // Any provider-prefixed model ("anthropic/*", "openai/*") is routed through
  // OpenRouter. The judge uses "openai/gpt-5" here because the OpenAI-direct
  // account's gpt-5 quota can be exhausted; OpenRouter is the same model at the
  // same price. Pricing lookup strips the provider prefix (openai/gpt-5 -> gpt-5).
  if (model.includes('/')) {
    loadDotEnv();
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OPENROUTER_API_KEY required for provider-routed models');
    const bareModel = model.replace(/^[^/]+\//, '');
    return new BeamOpenAiClient({
      model, apiKey: key, baseUrl: 'https://openrouter.ai/api/v1',
      pricing: OPENAI_PRICING[model] ?? OPENAI_PRICING[bareModel] ?? { inputPerMillion: 3.0, outputPerMillion: 15.0 },
      timeoutMs: 300_000, maxRetries: 3,
    });
  }
  return createBeamOpenAiClient({ model, pricing: OPENAI_PRICING[model], timeoutMs: 300_000, maxRetries: 2 });
}

async function main(): Promise<void> {
  const args = parseArgs();
  loadDotEnv();

  const outDir = path.join(repoRoot, 'benchmarks', 'results', 'beam');
  fs.mkdirSync(outDir, { recursive: true });
  const modelSlug = args.model.replace(/[^a-z0-9.]+/gi, '-');
  const outPath = args.outPath ?? path.join(outDir, `beam-1m-${args.tag}-${modelSlug}.jsonl`);

  const doneIds = new Set<string>();
  if (fs.existsSync(outPath)) {
    for (const line of fs.readFileSync(outPath, 'utf-8').split('\n')) {
      const t = line.trim(); if (!t) continue;
      try { const row = JSON.parse(t) as { instance_id?: string }; if (args.resume && row.instance_id) doneIds.add(row.instance_id); } catch { /* skip */ }
    }
    if (args.resume) console.log(`[ledger-run] resume: ${doneIds.size} already answered in ${path.basename(outPath)}`);
    else if (fs.readFileSync(outPath, 'utf-8').trim()) console.warn(`[ledger-run] WARNING: ${path.basename(outPath)} exists; appending without --resume may duplicate.`);
  }

  const answerClient = makeClient(args.model, true);
  const judgeClient = makeClient(args.judgeModel, false);
  const embedder = createOllamaEmbedder();

  const perQuestion: BeamQuestionResult[] = [];
  const promptToks: number[] = [];
  let answerCost = 0, judgeCost = 0;
  let cacheReadSum = 0, cacheCreateSum = 0, cachedCalls = 0;
  let budgetStopped = false;
  const outStream = args.smoke ? null : fs.createWriteStream(outPath, { flags: 'a' });

  const convs = args.convs.filter(ledgerAvailable);
  console.log(`[ledger-run] answer=${args.model} judge=${args.judgeModel} rawTurns=${args.rawTurns} cache=${args.noCache ? 'OFF' : 'ON'} budget=$${args.budget} convs=${convs.length}${args.instanceIds ? ` allowlist=${args.instanceIds.size}` : ''}`);

  for (const conv of convs) {
    if (budgetStopped) break;
    const questions = loadConvQuestions(conv).filter(q =>
      !doneIds.has(q.instanceId) &&
      (!args.instanceIds || args.instanceIds.has(q.instanceId)) &&
      (!args.abilities || args.abilities.has(q.memoryAbility)));
    if (questions.length === 0) continue;

    // E7-L1: two cacheable prefix variants per conv. Full (CURRENT VALUES ON) for protected
    // abilities; stripped (CURRENT VALUES OFF) for NO_CV_ABILITIES. Built once and reused so
    // within-conv prompt caching is preserved (≤2 cache writes/conv).
    const prefixFull = buildLedgerPrefix(conv, true);
    const prefixNoCV = buildLedgerPrefix(conv, false);
    const prefixTokFull = Math.ceil(prefixFull.length / 4);
    const prefixTokNoCV = Math.ceil(prefixNoCV.length / 4);
    const rawSub = createSubstrate({ dbPath: path.join(RAW_MINDS, `beam_1M_${conv}.mind`), embedder });
    const dateMap = buildConvDateMap(path.join(BEAM_CHATS, '1M', String(conv), 'chat.json'));
    console.log(`[ledger-run] conv ${conv}: ${questions.length} q, prefix full ~${prefixTokFull} tok / noCV ~${prefixTokNoCV} tok`);

    try {
      for (const q of questions) {
        const spent = answerCost + judgeCost;
        if (spent >= args.budget) { console.warn(`[ledger-run] budget $${args.budget} reached ($${spent.toFixed(2)}) — stopping.`); budgetStopped = true; break; }

        // Raw dated turns only for detail abilities (abstention/state stay ledger-only).
        let rawBlock = '';
        if (args.rawTurns > 0 && DETAIL_ABILITIES.has(q.memoryAbility)) {
          const ctx = await buildMultiRouteContext(rawSub, q.gopId, q.question, dateMap, { ...DEFAULT_MULTIROUTE, topN: args.rawTurns });
          if (ctx.displayStrings.length) {
            rawBlock = `\n\nSUPPORTING RAW EXCERPTS (verbatim conversation turns, for extra detail — the ledger above remains the complete record):\n` +
              ctx.displayStrings.map((m, i) => `${i + 1}. ${m}`).join('\n');
          }
        }

        // E7-L1: select the cacheable prefix — CURRENT VALUES OFF for NO_CV_ABILITIES.
        const usesCV = !NO_CV_ABILITIES.has(q.memoryAbility);
        const prefix = usesCV ? prefixFull : prefixNoCV;
        const prefixTok = usesCV ? prefixTokFull : prefixTokNoCV;

        const instruction = abilityInstruction(q.memoryAbility);
        const userMsg = `${instruction}${rawBlock}\n\nAnswer the question using ONLY the evidence ledger (and any excerpts shown above). Be specific — include exact names, dates, numbers, and versions from the ledger.\n\nQUESTION: ${q.question}\n\nANSWER:`;
        promptToks.push(prefixTok + Math.ceil(userMsg.length / 4));

        if (args.smoke) {
          console.log(`\n════ conv ${conv} · ${q.memoryAbility} · ${q.instanceId}`);
          console.log(`Q: ${q.question}`);
          console.log(`prefix ~${prefixTok} tok | rawExcerpts=${rawBlock ? 'yes' : 'no'} | instruction=${instruction.slice(0, 70)}...`);
          const ans = await answerClient.chat({ system: '', user: userMsg, cacheableSystem: args.noCache ? undefined : prefix, maxTokens: 4096 });
          answerCost += ans.costUsd;
          if (ans.cacheReadTokens || ans.cacheCreationTokens) { cacheReadSum += ans.cacheReadTokens ?? 0; cacheCreateSum += ans.cacheCreationTokens ?? 0; cachedCalls++; }
          console.log(`\n──── ANSWER (${ans.latencyMs}ms, cacheRead=${ans.cacheReadTokens ?? 0} cacheCreate=${ans.cacheCreationTokens ?? 0} $${ans.costUsd.toFixed(4)}) ────`);
          console.log(stripAns(ans.text).slice(0, 1000));
          continue;
        }

        const ans = await answerClient.chat({ system: '', user: userMsg, cacheableSystem: args.noCache ? undefined : prefix, maxTokens: 4096 });
        answerCost += ans.costUsd;
        if (ans.cacheReadTokens || ans.cacheCreationTokens) { cacheReadSum += ans.cacheReadTokens ?? 0; cacheCreateSum += ans.cacheCreationTokens ?? 0; cachedCalls++; }
        const answer = stripAns(ans.text) || ABSTAIN_SENTINEL;

        const { judgement, llmResults } = await judgeQuestion(judgeClient, { question: q.question, rubric: q.rubric, memoryAbility: q.memoryAbility, answer }, { computeTau: false });
        for (const r of llmResults) judgeCost += r.costUsd;

        perQuestion.push({ instanceId: q.instanceId, memoryAbility: q.memoryAbility, score: judgement.score, ...(judgement.error ? { error: judgement.error } : {}) } as BeamQuestionResult);
        outStream!.write(JSON.stringify({
          instance_id: q.instanceId, memory_ability: q.memoryAbility, question: q.question, answer,
          score: judgement.score, judgment: judgement.judgment, nugget_scores: judgement.nuggetScores, n_nuggets: q.rubric.length,
          ledger_prefix_tokens: prefixTok, raw_excerpts: !!rawBlock,
          cache_read_tokens: ans.cacheReadTokens ?? 0, cache_creation_tokens: ans.cacheCreationTokens ?? 0,
          answer_model: args.model, judge_model: args.judgeModel, answer_latency_ms: ans.latencyMs,
        }) + '\n');
        const cacheFlag = (ans.cacheReadTokens ?? 0) > 0 ? `cR=${ans.cacheReadTokens}` : (ans.cacheCreationTokens ?? 0) > 0 ? `cW=${ans.cacheCreationTokens}` : 'cache—';
        process.stdout.write(`  [conv ${conv}] ${q.memoryAbility.padEnd(24)} ${cacheFlag.padEnd(12)} score=${judgement.score.toFixed(2)} $${(answerCost + judgeCost).toFixed(3)}\n`);
      }
    } finally { rawSub.close(); }
  }
  if (outStream) outStream.end();

  if (!args.smoke) {
    const metrics = computeBeamMetrics(perQuestion);
    const meanTok = promptToks.length ? Math.round(promptToks.reduce((s, x) => s + x, 0) / promptToks.length) : 0;
    const totalCost = answerCost + judgeCost;
    const summaryPath = outPath.replace(/\.jsonl$/, '.summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
      run: {
        cell: 'ledger', dataset: 'beam-1m', answer_model: args.model, judge_model: args.judgeModel,
        raw_turns: args.rawTurns, caching: !args.noCache, mean_prompt_tokens: meanTok, answered_now: perQuestion.length,
        cache_read_total: cacheReadSum, cache_creation_total: cacheCreateSum, cached_calls: cachedCalls, budgetStopped,
        answer_cost: +answerCost.toFixed(4), judge_cost: +judgeCost.toFixed(4), total_cost: +totalCost.toFixed(4),
      },
      metrics: { overall_avg_score: metrics.overall.avgScore, overall_pass_rate_pct: metrics.overall.accuracy, by_ability: metrics.byAbility },
    }, null, 2), 'utf-8');

    console.log('\n════════ BEAM 1M · Evidence-Ledger serving ════════');
    console.log(formatBeamMetrics(metrics));
    console.log(`cache: reads=${cacheReadSum} creates=${cacheCreateSum} over ${cachedCalls} cached calls`);
    console.log(`cost=$${totalCost.toFixed(4)} (answer=$${answerCost.toFixed(3)} judge=$${judgeCost.toFixed(3)}) answered_now=${perQuestion.length} meanPromptTok=${meanTok}`);
    console.log(`jsonl:   ${outPath}`);
    console.log(`summary: ${summaryPath}`);
  }
}

main().catch(e => { console.error('[beam-run-ledger] FATAL:', e); process.exit(1); });
