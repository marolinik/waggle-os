#!/usr/bin/env tsx
/**
 * Canonical LoCoMo archive builder — Sprint 12 Task 1 Blocker #1.
 *
 * Reads:   benchmarks/data/locomo10.json      (snap-research/locomo, gitignored)
 * Writes:  benchmarks/data/locomo/locomo-1540.jsonl   (canonical eval set)
 *          benchmarks/data/locomo/locomo-1540.meta.json (SHA-256 + count)
 *
 * Canonicalisation guarantees (required for dataset_version hash determinism):
 *   1. Include every non-adversarial QA entry (category ≠ 5) from every
 *      conversation, with evidence (empty-evidence entries dropped — same rule
 *      build-preflight-samples.ts applies). Adversarial is excluded per paper
 *      §4.1 because it has no factual ground-truth answer.
 *   2. Sort by instance_id ascending — stable regardless of JSON key order
 *      in the source file.
 *   3. Serialize each record with JSON.stringify (no spaces, explicit key
 *      iteration order) and join with `\n` + trailing newline. No BOM.
 *   4. Compute SHA-256 of the final byte stream. Any drift in the source
 *      or the extraction logic changes the hash and fails H-AUDIT-2
 *      replication checks downstream.
 *
 * Per-instance JSONL row schema (flat, downstream-parseable):
 *   {
 *     "instance_id": "locomo_<sample_id>_q<3-digit>",
 *     "conversation_id": "<sample_id>",
 *     "question": "...",
 *     "gold_answer": "...",
 *     "expected": ["..."],              // generic DatasetInstance contract
 *     "category": "single-hop" | "multi-hop" | "temporal" | "open-ended",
 *     "context": "<session-grouped evidence block>",
 *     "locomo_metadata": {
 *       "sample_id": "...",
 *       "qa_index": <int>,
 *       "locomo_category": <1|2|3|4>,
 *       "evidence": ["D1:3", ...],
 *       "speaker_a": "...",
 *       "speaker_b": "..."
 *     }
 *   }
 *
 * Zero LLM calls. Zero network after locomo10.json is present. Re-running is
 * deterministic — committed archive must remain stable.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const CATEGORY_LABEL: Record<number, string> = {
  1: 'multi-hop',
  2: 'temporal',
  3: 'open-ended',
  4: 'single-hop',
  5: 'adversarial',
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
}

interface CanonicalInstance {
  instance_id: string;
  conversation_id: string;
  question: string;
  gold_answer: string;
  expected: string[];
  category: 'single-hop' | 'multi-hop' | 'temporal' | 'open-ended';
  context: string;
  locomo_metadata: {
    sample_id: string;
    qa_index: number;
    locomo_category: number;
    evidence: string[];
    speaker_a: string;
    speaker_b: string;
  };
}

function parseDiaId(eid: string): { session: number; turn: number } | null {
  const m = eid.match(/^D(\d+):(\d+)$/);
  return m ? { session: Number(m[1]), turn: Number(m[2]) } : null;
}

function buildContext(sample: LocomoSample, evidence: string[]): string {
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

function toCanonicalInstance(
  sample: LocomoSample,
  qaIndex: number,
  qa: LocomoQa,
): CanonicalInstance | null {
  const categoryLabel = CATEGORY_LABEL[qa.category];
  if (!categoryLabel || categoryLabel === 'adversarial') return null;
  const evidence = qa.evidence ?? [];
  if (evidence.length === 0) return null;
  const context = buildContext(sample, evidence);
  if (!context) return null;
  const padded = String(qaIndex).padStart(3, '0');
  const answer = String(qa.answer);
  return {
    instance_id: `locomo_${sample.sample_id}_q${padded}`,
    conversation_id: sample.sample_id,
    question: qa.question,
    gold_answer: answer,
    expected: [answer],
    category: categoryLabel as CanonicalInstance['category'],
    context,
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

/**
 * Canonical field order enforced by the serializer below. Keeps the output
 * stable even if upstream code re-orders fields on an object literal — a
 * source of silent hash drift we want to eliminate.
 */
const FIELD_ORDER: readonly (keyof CanonicalInstance)[] = [
  'instance_id',
  'conversation_id',
  'question',
  'gold_answer',
  'expected',
  'category',
  'context',
  'locomo_metadata',
];

function serializeCanonical(inst: CanonicalInstance): string {
  const ordered: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) {
    ordered[key] = inst[key];
  }
  return JSON.stringify(ordered);
}

function main(): void {
  const here = url.fileURLToPath(import.meta.url);
  const harnessRoot = path.resolve(path.dirname(here), '..');
  const dataDir = path.resolve(harnessRoot, '..', 'data');
  const sourcePath = path.join(dataDir, 'locomo10.json');

  if (!fs.existsSync(sourcePath)) {
    console.error(
      `[build-locomo-canonical] missing ${sourcePath}\n` +
      'Download with:\n' +
      '  curl -sL -o benchmarks/data/locomo10.json ' +
      'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json',
    );
    process.exit(2);
  }

  const raw = fs.readFileSync(sourcePath, 'utf-8');
  const samples = JSON.parse(raw) as LocomoSample[];

  const all: CanonicalInstance[] = [];
  const skipStats = { adversarial: 0, noEvidence: 0, unresolved: 0, unknownCat: 0 };

  for (const sample of samples) {
    for (let i = 0; i < sample.qa.length; i++) {
      const qa = sample.qa[i];
      const categoryLabel = CATEGORY_LABEL[qa.category];
      if (!categoryLabel) {
        skipStats.unknownCat++;
        continue;
      }
      if (categoryLabel === 'adversarial') {
        skipStats.adversarial++;
        continue;
      }
      const evidence = qa.evidence ?? [];
      if (evidence.length === 0) {
        skipStats.noEvidence++;
        continue;
      }
      const inst = toCanonicalInstance(sample, i, qa);
      if (!inst) {
        skipStats.unresolved++;
        continue;
      }
      all.push(inst);
    }
  }

  all.sort((a, b) => a.instance_id.localeCompare(b.instance_id));

  const byCategory: Record<string, number> = {
    'single-hop': 0, 'multi-hop': 0, 'temporal': 0, 'open-ended': 0,
  };
  for (const inst of all) byCategory[inst.category]++;

  const outDir = path.join(dataDir, 'locomo');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'locomo-1540.jsonl');
  const body = all.map(serializeCanonical).join('\n') + '\n';
  fs.writeFileSync(outPath, body, 'utf-8');

  const hash = crypto.createHash('sha256').update(body, 'utf-8').digest('hex');

  const metaPath = path.join(outDir, 'locomo-1540.meta.json');
  const meta = {
    dataset_version: hash,
    instance_count: all.length,
    built_at: new Date().toISOString(),
    source: 'https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json',
    source_reference:
      'Maharana et al. 2024, ACL-2024, "Evaluating Very Long-Term Conversational Memory of LLM Agents"',
    canonicalisation: {
      adversarial_excluded: true,
      no_evidence_excluded: true,
      sort_order: 'instance_id ascending',
      field_order: FIELD_ORDER,
      line_terminator: '\\n',
      trailing_newline: true,
      encoding: 'utf-8',
      no_bom: true,
    },
    distribution: byCategory,
    skip_stats: skipStats,
    paper_total_claim: 1540,
    actual_count: all.length,
    count_matches_paper: all.length === 1540,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

  console.log('[build-locomo-canonical] distribution:');
  for (const [k, v] of Object.entries(byCategory)) console.log(`  ${k}: ${v}`);
  console.log('[build-locomo-canonical] skipped:', skipStats);
  console.log(`[build-locomo-canonical] wrote ${outPath} (${all.length} instances)`);
  console.log(`[build-locomo-canonical] wrote ${metaPath}`);
  console.log(`[build-locomo-canonical] dataset_version (SHA-256): ${hash}`);
  if (all.length !== 1540) {
    console.warn(
      `[build-locomo-canonical] NOTE: actual count ${all.length} differs from paper claim 1540. ` +
      'Filename retained per brief; see meta.json for provenance.',
    );
  }
}

main();
