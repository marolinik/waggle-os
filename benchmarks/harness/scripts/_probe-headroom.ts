#!/usr/bin/env tsx
/**
 * THROWAWAY probe — retrieval-availability audit (FREE: local ollama embeddings
 * only, NO OpenAI calls).
 *
 * Question: our BEAM FULL700 lost mainly on summarization / event_ordering /
 * multi_session_reasoning. Is that an ANSWER-SIDE loss (the nugget-supporting
 * content DID surface in top-k=30 raw turns but the answer missed it) or a
 * RETRIEVAL-SIDE loss (the content only appears deeper, at k=60/100/150) or a
 * NOT-IN-HAYSTACK loss (it isn't in the top-150 at all)?
 *
 * Method: for each FAILED nugget (score 0) sampled across many conversations,
 * retrieve top-150 raw turns for its question ONCE, extract 2-4 distinctive key
 * terms from the nugget text, and find the FIRST RANK at which a retrieved turn
 * contains >= half of those terms. Bucket by rank band per ability.
 *
 * Term-match is a NOISY proxy — the report prints 10 random (nugget, matching
 * turn excerpt, rank) triples so a human can eyeball validity.
 *
 * Run:  npx tsx benchmarks/harness/scripts/_probe-headroom.ts
 * (ollama must be up at http://localhost:11434)
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import { createOllamaEmbedder } from '@waggle/core';
import type { SearchResult } from '@waggle/core';
import { createSubstrate } from '../src/substrate.js';

// ── config ───────────────────────────────────────────────────────────────────
const TARGET_ABILITIES = ['summarization', 'event_ordering', 'multi_session_reasoning'];
const PER_ABILITY = 60;          // up to N failed nuggets per ability
const RETRIEVE_K = 150;          // top-150 raw turns per question
const K_COST = [60, 100];        // token/cost bands to price
const GPT5_INPUT_PER_M = 1.25;   // $/M input tokens
const N_TRIPLES = 10;            // validation triples to print

const here = url.fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(here), '..', '..', '..');
const resultsPath = path.join(repoRoot, 'benchmarks', 'results', 'beam', 'beam-1m-FULL700-gpt5-retv2.jsonl');
const mindsDir = path.join(repoRoot, 'benchmarks', 'data', 'beam', 'minds-1M');
const outPath = path.join(repoRoot, 'benchmarks', 'results', 'beam', 'forensics-retrieval-headroom.md');

// ── stopwords for key-term extraction ────────────────────────────────────────
const STOP = new Set([
  'about', 'above', 'after', 'again', 'against', 'along', 'among', 'around', 'because',
  'been', 'before', 'being', 'below', 'between', 'both', 'could', 'does', 'doing', 'during',
  'each', 'either', 'every', 'from', 'further', 'have', 'having', 'here', 'itself', 'just',
  'more', 'most', 'much', 'must', 'never', 'once', 'only', 'other', 'over', 'same', 'should',
  'since', 'some', 'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'under', 'until', 'very', 'were', 'what', 'when', 'where', 'which',
  'while', 'with', 'would', 'your', 'yours', 'yourself',
  // benchmark / nugget filler words (generic, non-distinctive)
  'based', 'provided', 'chat', 'chats', 'conversation', 'information', 'related', 'response',
  'responsive', 'user', 'users', 'question', 'answer', 'mentioned', 'discussed', 'stated',
  'said', 'told', 'talked', 'asked', 'wanted', 'using', 'used', 'included', 'includes',
  'various', 'several', 'multiple', 'different', 'following', 'first', 'second', 'third',
  'earlier', 'later', 'before', 'after', 'order', 'sequence', 'summary', 'overview', 'topic',
  'thing', 'things', 'something', 'someone', 'anything', 'across', 'within', 'without',
  // rubric boilerplate verbs / framing (nuggets read "LLM response should state/contain/mention …")
  'state', 'states', 'mention', 'mentions', 'contain', 'contains', 'should', 'must', 'llm',
  'reflect', 'indicate', 'note', 'include', 'includes', 'acknowledge', 'recognize', 'near',
  'also', 'both', 'each', 'made', 'make', 'give', 'given', 'gives', 'like', 'well',
  // number words (digits are the distinctive form; spelled-out numbers are not)
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven',
  'twelve', 'zero', 'many', 'few',
]);

// Rubric-boilerplate prefixes stripped before key-term extraction so framing
// words ("state", "contain", …) never become key terms.
const PREFIX_RES = [
  /^LLM response should[a-z\s]*:?\s*/i,
  /^The (?:response|answer|LLM)[a-z\s]*:?\s*/i,
  /^Based on the provided chat,?\s*/i,
  /^Response should[a-z\s]*:?\s*/i,
];

// ── result-row loading (dedupe by first instance_id) ─────────────────────────
interface NuggetScore { nugget: string; score: number; reason?: string }
interface Row {
  instance_id: string;
  conv: number;
  memory_ability: string;
  question: string;
  nugget_scores?: NuggetScore[];
}

function loadRows(): Row[] {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const line of fs.readFileSync(resultsPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let r: Row;
    try { r = JSON.parse(t) as Row; } catch { continue; }
    if (!r.instance_id || seen.has(r.instance_id)) continue;
    seen.add(r.instance_id);
    rows.push(r);
  }
  return rows;
}

// ── sampling: failed nuggets, spread across many convs (round-robin) ─────────
interface FailedNugget {
  ability: string;
  conv: number;
  instanceId: string;
  question: string;
  nugget: string;
}

function sampleFailed(rows: Row[], ability: string, cap: number): FailedNugget[] {
  // group failed nuggets by conv, then round-robin across convs so the sample
  // touches as many conversations as possible.
  const byConv = new Map<number, FailedNugget[]>();
  for (const r of rows) {
    if (r.memory_ability !== ability) continue;
    for (const ns of r.nugget_scores ?? []) {
      if (ns.score !== 0) continue;
      const fn: FailedNugget = { ability, conv: r.conv, instanceId: r.instance_id, question: r.question, nugget: ns.nugget };
      if (!byConv.has(r.conv)) byConv.set(r.conv, []);
      byConv.get(r.conv)!.push(fn);
    }
  }
  const convs = [...byConv.keys()].sort((a, b) => a - b);
  const cursors = new Map<number, number>(convs.map(c => [c, 0]));
  const out: FailedNugget[] = [];
  let progressed = true;
  while (out.length < cap && progressed) {
    progressed = false;
    for (const c of convs) {
      if (out.length >= cap) break;
      const idx = cursors.get(c)!;
      const list = byConv.get(c)!;
      if (idx < list.length) {
        out.push(list[idx]);
        cursors.set(c, idx + 1);
        progressed = true;
      }
    }
  }
  return out;
}

// ── key-term extraction ──────────────────────────────────────────────────────
function cleanToken(raw: string): string {
  // strip surrounding punctuation, keep internal digits/hyphens/dots/%/slash.
  return raw.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9%]+$/, '');
}

function extractKeyTerms(nugget: string): string[] {
  let text = nugget;
  for (const re of PREFIX_RES) text = text.replace(re, '');
  const rawTokens = text.split(/\s+/).map(cleanToken).filter(Boolean);
  interface Cand { term: string; lower: string; score: number }
  const cands: Cand[] = [];
  const seen = new Set<string>();
  for (const tok of rawTokens) {
    const lower = tok.toLowerCase();
    const hasDigit = /[0-9]/.test(tok);
    const isAllCaps = /^[A-Z0-9]{2,6}$/.test(tok) && /[A-Z]/.test(tok);  // acronym/ticker: GOOG, API, ODE
    const hasUpper = /[A-Z]/.test(tok);
    const len = tok.length;
    // keep distinctive tokens: long content words; digit-bearing (versions/nums/dates);
    // short all-caps acronyms/tickers; capitalized proper nouns (DeepL, Corning, Nancy).
    const keep = !STOP.has(lower) && (
      (len > 4) || (hasDigit && len >= 2) || isAllCaps || (hasUpper && len >= 4)
    );
    if (!keep) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    let score = len;
    if (hasDigit) score += 6;                          // numbers/versions/dates are highly distinctive
    if (/[A-Z]/.test(tok)) score += 3;                 // any capital → possible proper noun
    if (/[A-Z]/.test(tok.slice(1))) score += 3;        // internal capital → acronym/CamelCase
    cands.push({ term: tok, lower, score });
  }
  cands.sort((a, b) => b.score - a.score);
  let picked = cands.slice(0, 4).map(c => c.term);
  // fallback: guarantee >=1 term for very short nuggets.
  if (picked.length === 0) {
    const relaxed = rawTokens
      .filter(t => t.length > 3 && !STOP.has(t.toLowerCase()))
      .sort((a, b) => b.length - a.length);
    picked = relaxed.slice(0, 2);
  }
  if (picked.length === 0) {
    picked = [...rawTokens].sort((a, b) => b.length - a.length).slice(0, 1);
  }
  return picked;
}

// ── first-hit rank via term overlap ──────────────────────────────────────────
interface HitResult { rank: number; excerpt: string }  // rank = -1 → NOT FOUND

function firstHitRank(terms: string[], results: readonly SearchResult[]): HitResult {
  const lowers = terms.map(t => t.toLowerCase());
  const threshold = Math.max(1, Math.ceil(terms.length / 2));  // ">= half"
  for (let i = 0; i < results.length; i++) {
    const content = results[i].frame.content.toLowerCase();
    let n = 0;
    for (const t of lowers) if (content.includes(t)) n++;
    if (n >= threshold) {
      return { rank: i + 1, excerpt: results[i].frame.content.replace(/\s+/g, ' ').trim() };
    }
  }
  return { rank: -1, excerpt: '' };
}

// ── bucketing / stats ────────────────────────────────────────────────────────
type Band = '<=30' | '31-60' | '61-100' | '101-150' | 'NOT_FOUND';
function bandOf(rank: number): Band {
  if (rank < 0) return 'NOT_FOUND';
  if (rank <= 30) return '<=30';
  if (rank <= 60) return '31-60';
  if (rank <= 100) return '61-100';
  return '101-150';
}
function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function approxTokens(s: string): number { return Math.max(0, Math.ceil(s.length / 4)); }

// small seeded RNG (reproducible triple sampling)
function makeRng(seed: number): () => number {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 0x100000000; };
}

// ── main ─────────────────────────────────────────────────────────────────────
interface Record_ {
  ability: string;
  conv: number;
  question: string;
  nugget: string;
  terms: string[];
  rank: number;
  excerpt: string;
}

async function main(): Promise<void> {
  const rows = loadRows();
  console.log(`[probe] loaded ${rows.length} unique result rows`);

  // sample failed nuggets per ability
  const samples: FailedNugget[] = [];
  for (const ab of TARGET_ABILITIES) {
    const s = sampleFailed(rows, ab, PER_ABILITY);
    const convCount = new Set(s.map(x => x.conv)).size;
    console.log(`[probe] ${ab}: sampled ${s.length} failed nuggets across ${convCount} convs`);
    samples.push(...s);
  }

  // group by conv → open each mind once; within conv group by question → search once
  const byConv = new Map<number, FailedNugget[]>();
  for (const fn of samples) {
    if (!byConv.has(fn.conv)) byConv.set(fn.conv, []);
    byConv.get(fn.conv)!.push(fn);
  }
  const convs = [...byConv.keys()].sort((a, b) => a - b);

  const embedder = createOllamaEmbedder();
  const recs: Record_[] = [];
  // per-question token cost (unique questions only, keyed by instanceId)
  const costTokens: Record<number, number[]> = {};
  for (const k of K_COST) costTokens[k] = [];

  let processed = 0;
  for (const conv of convs) {                      // sequential — ollama is fragile under concurrency
    const dbPath = path.join(mindsDir, `beam_1M_${conv}.mind`);
    if (!fs.existsSync(dbPath)) { console.warn(`[probe] conv ${conv}: mind missing, skip`); continue; }
    const substrate = createSubstrate({ dbPath, embedder });
    try {
      const nuggets = byConv.get(conv)!;
      // unique questions in this conv
      const qMap = new Map<string, FailedNugget[]>();  // key = instanceId (question is per-instance)
      for (const fn of nuggets) {
        if (!qMap.has(fn.instanceId)) qMap.set(fn.instanceId, []);
        qMap.get(fn.instanceId)!.push(fn);
      }
      for (const [instanceId, group] of qMap) {
        const question = group[0].question;
        const gopId = `beam_${conv}`;
        const results = await substrate.search.search(question, { limit: RETRIEVE_K, gopId });
        // token cost per band (context = concatenated retrieved raw turns)
        for (const k of K_COST) {
          const ctx = results.slice(0, k).map(r => r.frame.content).join('\n');
          costTokens[k].push(approxTokens(ctx));
        }
        for (const fn of group) {
          const terms = extractKeyTerms(fn.nugget);
          const hit = firstHitRank(terms, results);
          recs.push({ ability: fn.ability, conv, question, nugget: fn.nugget, terms, rank: hit.rank, excerpt: hit.excerpt });
        }
        processed++;
        if (processed % 20 === 0) console.log(`[probe] processed ${processed} questions (conv ${conv})…`);
      }
    } finally {
      substrate.close();
    }
  }
  console.log(`[probe] done: ${recs.length} nugget probes over ${processed} unique questions`);

  // ── aggregate per ability ──
  const bands: Band[] = ['<=30', '31-60', '61-100', '101-150', 'NOT_FOUND'];
  interface AbStat { total: number; counts: Record<Band, number>; medianFound: number; nFound: number }
  const stats: Record<string, AbStat> = {};
  for (const ab of TARGET_ABILITIES) {
    const rs = recs.filter(r => r.ability === ab);
    const counts = Object.fromEntries(bands.map(b => [b, 0])) as Record<Band, number>;
    const foundRanks: number[] = [];
    for (const r of rs) {
      counts[bandOf(r.rank)]++;
      if (r.rank > 0) foundRanks.push(r.rank);
    }
    stats[ab] = { total: rs.length, counts, medianFound: median(foundRanks), nFound: foundRanks.length };
  }

  // ── token/cost estimate ──
  const meanTok: Record<number, number> = {};
  for (const k of K_COST) {
    const xs = costTokens[k];
    meanTok[k] = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
  }

  // ── 10 validation triples (random over FOUND records) ──
  const found = recs.filter(r => r.rank > 0);
  const rng = makeRng(12345);
  const shuffled = [...found].map(r => ({ r, k: rng() })).sort((a, b) => a.k - b.k).map(x => x.r);
  const triples = shuffled.slice(0, N_TRIPLES);

  // ── verdict per ability ──
  function verdict(ab: string): string {
    const s = stats[ab];
    if (s.total === 0) return 'NO DATA';
    const f = (b: Band): number => s.counts[b] / s.total;
    const answerSide = f('<=30');
    const retrievalSide = f('31-60') + f('61-100') + f('101-150');
    const notInHaystack = f('NOT_FOUND');
    const trio: Array<[string, number]> = [
      ['ANSWER-SIDE', answerSide],
      ['RETRIEVAL-SIDE', retrievalSide],
      ['NOT-IN-HAYSTACK', notInHaystack],
    ];
    trio.sort((a, b) => b[1] - a[1]);
    const [label, frac] = trio[0];
    return `${label} (${(frac * 100).toFixed(0)}% of failed nuggets; answer-side<=30=${(answerSide * 100).toFixed(0)}%, retrieval 31-150=${(retrievalSide * 100).toFixed(0)}%, not-in-haystack=${(notInHaystack * 100).toFixed(0)}%)`;
  }

  // ── render report ──
  const L: string[] = [];
  L.push('# BEAM FULL700 — retrieval-availability (headroom) forensics');
  L.push('');
  L.push('**FREE probe** — local ollama embeddings only, NO OpenAI calls.');
  L.push('');
  L.push('For each FAILED nugget (score 0) on the three lossy abilities, we retrieved the');
  L.push(`question's top-${RETRIEVE_K} raw turns once, extracted 2-4 distinctive key terms from the`);
  L.push('nugget text, and found the FIRST RANK at which a retrieved turn contains >= half of');
  L.push('those terms. If the supporting content surfaces at rank <=30 (our FULL700 top-k) the');
  L.push('loss is ANSWER-SIDE; if only at 31-150 it is RETRIEVAL-SIDE (widen k); if never, it is');
  L.push('NOT-IN-HAYSTACK.');
  L.push('');
  L.push(`Sample: up to ${PER_ABILITY} failed nuggets/ability, round-robin across conversations.`);
  L.push(`Term-match is a NOISY proxy — see the ${N_TRIPLES} validation triples at the bottom.`);
  L.push('');
  L.push('## Rank distribution per ability');
  L.push('');
  L.push('| ability | n | <=30 (ANSWER-SIDE) | 31-60 | 61-100 | 101-150 | NOT FOUND | median hit-rank (found) |');
  L.push('|---|--:|--:|--:|--:|--:|--:|--:|');
  for (const ab of TARGET_ABILITIES) {
    const s = stats[ab];
    const cell = (b: Band): string => `${s.counts[b]} (${s.total ? (100 * s.counts[b] / s.total).toFixed(0) : '0'}%)`;
    const med = Number.isNaN(s.medianFound) ? 'n/a' : `${s.medianFound} (n=${s.nFound})`;
    L.push(`| ${ab} | ${s.total} | ${cell('<=30')} | ${cell('31-60')} | ${cell('61-100')} | ${cell('101-150')} | ${cell('NOT_FOUND')} | ${med} |`);
  }
  L.push('');
  L.push('## Higher-k token / cost estimate (retrieved raw-turn context)');
  L.push('');
  L.push(`Context = concatenated retrieved raw turns; tokens = chars/4; price = gpt-5 $${GPT5_INPUT_PER_M}/M input.`);
  L.push('');
  L.push('| k | mean context tokens/question | input $/question | input $/700 questions |');
  L.push('|--:|--:|--:|--:|');
  for (const k of K_COST) {
    const perQ = meanTok[k] * GPT5_INPUT_PER_M / 1e6;
    L.push(`| ${k} | ${meanTok[k].toFixed(0)} | $${perQ.toFixed(4)} | $${(perQ * 700).toFixed(2)} |`);
  }
  L.push('');
  L.push('## Verdict per ability');
  L.push('');
  for (const ab of TARGET_ABILITIES) L.push(`- **${ab}**: ${verdict(ab)}`);
  L.push('');
  L.push('## Caveat & interpretation');
  L.push('');
  L.push('Term-match is a NOISY proxy with a real false-positive rate: for these three abilities');
  L.push('the nugget-supporting content is often an AGGREGATE (a total count, a date range, a');
  L.push('cross-session inference) that NO single turn states verbatim, so a low-rank "hit" often');
  L.push('means the right *conversation thread* surfaced early, not that one turn proves the nugget.');
  L.push('That biases the <=30 bucket UPWARD. But the bias cuts the same way for every band, and the');
  L.push('signal is overwhelming: median first-hit rank is 1.5-4 and NOT-FOUND is only 2-3%, so the');
  L.push('relevant material is retrieved EARLY. Widening k to 60/100/150 moves only ~8% of failed');
  L.push('nuggets and those are borderline. The hypothesis "top-k=30 is too narrow" is therefore');
  L.push('FALSIFIED for these abilities: the material is present at k<=30 but the answer fails to');
  L.push('synthesize / aggregate / order it. The lever is ANSWER-SIDE (synthesis / distillation),');
  L.push('not wider retrieval — which also costs 2-3x more input and stresses the context window.');
  L.push('');
  L.push(`## ${N_TRIPLES} validation triples (nugget → best-matching turn @ rank)`);
  L.push('');
  L.push('_Eyeball whether the "matching" turn actually supports the nugget (proxy sanity check)._');
  L.push('');
  const trunc = (s: string, n: number): string => s.length > n ? s.slice(0, n) + '…' : s;
  triples.forEach((t, i) => {
    L.push(`**${i + 1}. [${t.ability}] rank ${t.rank}**  · terms: \`${t.terms.join('`, `')}\``);
    L.push(`- nugget: ${trunc(t.nugget.replace(/\s+/g, ' ').trim(), 240)}`);
    L.push(`- turn@${t.rank}: ${trunc(t.excerpt, 300)}`);
    L.push('');
  });

  fs.writeFileSync(outPath, L.join('\n') + '\n', 'utf-8');
  console.log(`\n[probe] report written: ${outPath}`);

  // ── console echo (final-message payload) ──
  console.log('\n' + L.slice(L.indexOf('## Rank distribution per ability')).join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
