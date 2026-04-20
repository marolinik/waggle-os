#!/usr/bin/env tsx
/**
 * Sample-lock builder for the Stage 2 preflight gate + failure-mode calibration.
 *
 * Reads:   benchmarks/data/locomo10.json     (snap-research/locomo, gitignored)
 * Writes:  benchmarks/data/preflight-locomo-50.json         (Task 1 — seed=42)
 *          benchmarks/data/failure-mode-calibration-10.jsonl (Task 2 — seed=43)
 *
 * Selection algorithm (deterministic):
 *   1. Walk all 10 LoCoMo conversations; for each QA entry, mint a stable
 *      `instance_id` of the form `locomo_<sample_id>_q<3-digit-index>` where
 *      index is the 0-based position within that sample's `qa` array.
 *   2. Bucket by `category` (1=multi-hop, 2=temporal, 3=open-domain,
 *      4=single-hop, 5=adversarial — verified against LoCoMo evaluation.py
 *      line 208-217 + ACL-2024 paper §4.1). Skip category 5 (adversarial,
 *      out of scope for 4-way MECE split).
 *   3. Sort each bucket by instance_id ascending (canonical order).
 *   4. Fisher-Yates shuffle each bucket with xorshift32(seed). Same PRNG
 *      family as benchmarks/harness/src/datasets.ts → one shuffle convention
 *      across the harness.
 *   5. Take first N per category per task's distribution.
 *   6. Build context from evidence dia_ids, grouped by session (with session
 *      date) so the preserved metadata is faithful to what the model needs.
 *
 * Non-overlap guarantee: Task 2 (seed=43) removes Task 1's instance_ids from
 * each bucket BEFORE the shuffle, so the two samples are provably disjoint
 * regardless of PRNG state.
 *
 * Zero LLM calls. Zero network after locomo10.json is present. Re-running is
 * deterministic — committed lock files are stable.
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// ── LoCoMo category mapping (verified against evaluation.py + ACL paper) ──
const CATEGORY_LABEL: Record<number, string> = {
  1: 'multi-hop',   // eval.py line 213: `elif line['category'] in [1]`: multi-hop
  2: 'temporal',    // all "When did X..." questions with date answers
  3: 'open-ended',  // open-domain / commonsense / inferential (paper §4.1)
  4: 'single-hop',  // simple factoid from single evidence turn
  5: 'adversarial', // unanswerable — excluded from the 4-way split
};

interface LocomoTurn {
  speaker: string;
  dia_id: string;
  text: string;
  img_url?: string[];
  blip_caption?: string;
  query?: string;
}

interface LocomoConversation {
  speaker_a: string;
  speaker_b: string;
  [sessionKey: string]: string | LocomoTurn[];
}

interface LocomoQa {
  question: string;
  answer: string | number;
  evidence?: string[];
  category: number;
}

interface LocomoSample {
  sample_id: string;
  conversation: LocomoConversation;
  qa: LocomoQa[];
  event_summary?: unknown;
  observation?: unknown;
  session_summary?: unknown;
}

interface PreflightInstance {
  id: string;
  category: 'single-hop' | 'multi-hop' | 'temporal' | 'open-ended';
  context: string;
  question: string;
  ground_truth_answer: string;
  locomo_metadata: {
    sample_id: string;
    qa_index: number;
    locomo_category: number;
    evidence: string[];
    speaker_a: string;
    speaker_b: string;
  };
}

interface CalibrationInstance extends PreflightInstance {
  human_label: {
    verdict: null;
    failure_mode: null;
    rationale: null;
  };
}

// xorshift32 — same PRNG family as benchmarks/harness/src/datasets.ts.
function makeRng(seed: number): () => number {
  let state = (seed || 1) >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function fisherYates<T>(items: readonly T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function parseDiaId(eid: string): { session: number; turn: number } | null {
  const m = eid.match(/^D(\d+):(\d+)$/);
  if (!m) return null;
  return { session: Number(m[1]), turn: Number(m[2]) };
}

function buildContext(sample: LocomoSample, evidence: string[]): string {
  // Group evidence turns by session so the temporal anchor (session_N_date_time)
  // can be emitted once per session. Preserves the minimum information needed
  // to answer the question without dumping the whole conversation.
  const bySession = new Map<number, { date: string; turns: LocomoTurn[] }>();

  for (const eid of evidence) {
    const parsed = parseDiaId(eid);
    if (!parsed) continue;
    const sessionKey = `session_${parsed.session}`;
    const dateKey = `session_${parsed.session}_date_time`;
    const session = sample.conversation[sessionKey] as LocomoTurn[] | undefined;
    const dateRaw = sample.conversation[dateKey];
    const date = typeof dateRaw === 'string' ? dateRaw : '';
    if (!session) continue;
    const turn = session.find(t => t.dia_id === eid);
    if (!turn) continue;
    if (!bySession.has(parsed.session)) {
      bySession.set(parsed.session, { date, turns: [] });
    }
    bySession.get(parsed.session)!.turns.push(turn);
  }

  const sessionNums = Array.from(bySession.keys()).sort((a, b) => a - b);
  const blocks: string[] = [];
  for (const n of sessionNums) {
    const entry = bySession.get(n)!;
    const header = entry.date ? `Session ${n} (${entry.date}):` : `Session ${n}:`;
    const lines = entry.turns.map(t => {
      const caption = t.blip_caption ? ` [image: ${t.blip_caption}]` : '';
      return `${t.speaker}: ${t.text}${caption}`;
    });
    blocks.push([header, ...lines].join('\n'));
  }
  return blocks.join('\n\n');
}

function toPreflightInstance(sample: LocomoSample, qaIndex: number, qa: LocomoQa): PreflightInstance | null {
  const category = CATEGORY_LABEL[qa.category];
  if (!category || category === 'adversarial') return null;
  const evidence = qa.evidence ?? [];
  if (evidence.length === 0) return null; // defensive: no evidence → no context
  const context = buildContext(sample, evidence);
  if (!context) return null; // evidence points to turns we can't resolve
  const padded = String(qaIndex).padStart(3, '0');
  return {
    id: `locomo_${sample.sample_id}_q${padded}`,
    category: category as PreflightInstance['category'],
    context,
    question: qa.question,
    ground_truth_answer: String(qa.answer),
    locomo_metadata: {
      sample_id: sample.sample_id,
      qa_index: qaIndex,
      locomo_category: qa.category,
      evidence,
      speaker_a: sample.conversation.speaker_a,
      speaker_b: sample.conversation.speaker_b,
    },
  };
}

function bucketByCategory(instances: PreflightInstance[]): Record<string, PreflightInstance[]> {
  const buckets: Record<string, PreflightInstance[]> = {
    'single-hop': [],
    'multi-hop': [],
    'temporal': [],
    'open-ended': [],
  };
  for (const inst of instances) buckets[inst.category].push(inst);
  for (const key of Object.keys(buckets)) {
    buckets[key].sort((a, b) => a.id.localeCompare(b.id));
  }
  return buckets;
}

function pickStratified(
  buckets: Record<string, PreflightInstance[]>,
  distribution: Record<string, number>,
  seed: number,
  exclude: Set<string>,
): PreflightInstance[] {
  const rand = makeRng(seed);
  const out: PreflightInstance[] = [];
  // Stable key order so the same seed always consumes the RNG in the same way.
  for (const key of ['single-hop', 'multi-hop', 'temporal', 'open-ended']) {
    const pool = buckets[key].filter(i => !exclude.has(i.id));
    const shuffled = fisherYates(pool, rand);
    const need = distribution[key];
    if (shuffled.length < need) {
      throw new Error(
        `category ${key} has ${shuffled.length} usable instances after exclusions, need ${need}`,
      );
    }
    out.push(...shuffled.slice(0, need));
  }
  return out;
}

function main(): void {
  const here = url.fileURLToPath(import.meta.url);
  const harnessRoot = path.resolve(path.dirname(here), '..');
  const dataDir = path.resolve(harnessRoot, '..', 'data');
  const sourcePath = path.join(dataDir, 'locomo10.json');

  if (!fs.existsSync(sourcePath)) {
    console.error(
      `[build-preflight-samples] missing ${sourcePath}\n` +
      'Download with:\n' +
      '  curl -sL -o benchmarks/data/locomo10.json ' +
      'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json',
    );
    process.exit(2);
  }

  const raw = fs.readFileSync(sourcePath, 'utf-8');
  const samples = JSON.parse(raw) as LocomoSample[];

  const allInstances: PreflightInstance[] = [];
  for (const sample of samples) {
    for (let i = 0; i < sample.qa.length; i++) {
      const inst = toPreflightInstance(sample, i, sample.qa[i]);
      if (inst) allInstances.push(inst);
    }
  }

  const buckets = bucketByCategory(allInstances);
  console.log('[build-preflight-samples] bucket sizes (after excluding adversarial + evidence-less):');
  for (const key of ['single-hop', 'multi-hop', 'temporal', 'open-ended']) {
    console.log(`  ${key}: ${buckets[key].length}`);
  }

  // Task 1 — Stage 2 sample lock (seed=42, 13/13/12/12)
  const stage2 = pickStratified(
    buckets,
    { 'single-hop': 13, 'multi-hop': 13, 'temporal': 12, 'open-ended': 12 },
    42,
    new Set(),
  );
  const stage2Ids = new Set(stage2.map(i => i.id));

  // Task 2 — failure-mode calibration (seed=43, 3/3/2/2, non-overlapping with Task 1)
  const calibration = pickStratified(
    buckets,
    { 'single-hop': 3, 'multi-hop': 3, 'temporal': 2, 'open-ended': 2 },
    43,
    stage2Ids,
  );
  for (const inst of calibration) {
    if (stage2Ids.has(inst.id)) {
      throw new Error(`calibration set overlaps stage-2 lock: ${inst.id}`);
    }
  }

  // ── Write Task 1: preflight-locomo-50.json ───────────────────────────
  const stage2Output = {
    _meta: {
      description:
        'Stage 2 preflight 4-cell sample lock. Istih 50 LoCoMo instanci preko ' +
        'sva 4 ćelije (raw / memory-only / evolve-only / full-stack).',
      brief: 'PM-Waggle-OS/briefs/2026-04-20-cc-preflight-prep-tasks.md Task 1',
      locked_decision: 'decisions/2026-04-20-preflight-oq-resolutions-locked.md §OQ-PF-1',
      source: 'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json',
      source_reference: 'Maharana et al. 2024, ACL-2024, "Evaluating Very Long-Term Conversational Memory of LLM Agents"',
      seed: 42,
      selection_algorithm:
        'Bucket LoCoMo qa entries by category (mapping verified via task_eval/evaluation.py + paper §4.1); ' +
        'within each category sort by instance_id ascending (canonical order), apply Fisher-Yates shuffle ' +
        'with xorshift32(seed=42), then take first N per category. Fisher-Yates PRNG is shared across ' +
        'buckets — key iteration order is fixed (single-hop, multi-hop, temporal, open-ended) to keep the ' +
        'selection stable against re-runs. instance_id = locomo_<sample_id>_q<3-digit qa-array index>.',
      distribution: { 'single-hop': 13, 'multi-hop': 13, 'temporal': 12, 'open-ended': 12 },
      total: 50,
      locomo_category_map: {
        '1': 'multi-hop',
        '2': 'temporal',
        '3': 'open-ended',
        '4': 'single-hop',
        '5': 'adversarial (excluded)',
      },
      context_assembly:
        'Evidence dia_ids are grouped by session, prefixed with session_N_date_time for temporal ' +
        'anchoring, and rendered as "speaker: text" lines. Images are preserved via blip_caption tags.',
    },
    instances: stage2,
  };
  const stage2Path = path.join(dataDir, 'preflight-locomo-50.json');
  fs.writeFileSync(stage2Path, JSON.stringify(stage2Output, null, 2) + '\n', 'utf-8');
  console.log(`[build-preflight-samples] wrote ${stage2Path} (${stage2.length} instances)`);

  // ── Write Task 2: failure-mode-calibration-10.jsonl ──────────────────
  const calibrationPath = path.join(dataDir, 'failure-mode-calibration-10.jsonl');
  const header = [
    '# Failure-mode judge calibration set',
    '# brief: PM-Waggle-OS/briefs/2026-04-20-cc-preflight-prep-tasks.md Task 2',
    '# locked: decisions/2026-04-20-failure-mode-oq-resolutions-locked.md §OQ-FM-3',
    '# source: https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json',
    '# seed=43 (non-overlapping with preflight-locomo-50.json seed=42)',
    '# distribution: single-hop=3, multi-hop=3, temporal=2, open-ended=2 (total=10)',
    '# human_label.{verdict,failure_mode,rationale} are left null. PM labels first pass; CC validates second pass.',
    '# Judge activates Stage 1 only after ≥8/10 match against human_label.',
    '',
  ].join('\n');

  const lines: string[] = [];
  for (const inst of calibration) {
    const withLabel: CalibrationInstance = {
      ...inst,
      human_label: { verdict: null, failure_mode: null, rationale: null },
    };
    lines.push(JSON.stringify(withLabel));
  }
  fs.writeFileSync(calibrationPath, header + lines.join('\n') + '\n', 'utf-8');
  console.log(`[build-preflight-samples] wrote ${calibrationPath} (${calibration.length} instances)`);

  // Distribution + overlap summary.
  const countByCat = (items: PreflightInstance[]): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const i of items) out[i.category] = (out[i.category] ?? 0) + 1;
    return out;
  };
  console.log('[build-preflight-samples] stage-2 distribution:', countByCat(stage2));
  console.log('[build-preflight-samples] calibration distribution:', countByCat(calibration));
  const overlap = calibration.filter(i => stage2Ids.has(i.id)).length;
  console.log(`[build-preflight-samples] overlap (must be 0): ${overlap}`);
}

main();
