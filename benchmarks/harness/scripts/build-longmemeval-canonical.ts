#!/usr/bin/env tsx
/**
 * Canonical LongMemEval V1 archive builder — Track A0 (manifest-v8.2-final.md).
 *
 * Reads:   benchmarks/data/longmemeval_s_cleaned.json    (gitignored, _s default)
 *       or benchmarks/data/longmemeval_m_cleaned.json    (--variant m)
 * Writes:  benchmarks/data/longmemeval/longmemeval.jsonl        (canonical JSONL)
 *          benchmarks/data/longmemeval/longmemeval.meta.json    (SHA-256 + count + distribution)
 *          benchmarks/data/longmemeval/longmemeval_s_cleaned.json  (raw cache copy)
 *
 * Canonicalisation guarantees (required for dataset_version hash determinism):
 *   1. Include every question from the cleaned dataset (all question_types).
 *   2. Sort by instance_id ascending — stable regardless of JSON key order in source.
 *   3. Serialize each record with JSON.stringify (no spaces, explicit key iteration
 *      order) and join with `\n` + trailing newline. No BOM.
 *   4. Compute SHA-256 of the final byte stream. Any drift in the source or
 *      extraction logic changes the hash and fails replication checks downstream.
 *   5. Abstention questions (question_id ending in '_abs') are tagged but included.
 *
 * Per-instance JSONL row schema (flat, downstream-parseable by DatasetInstance):
 *   {
 *     "instance_id": "longmemeval_<question_id>",
 *     "conversation_id": "<question_id>",
 *     "question": "...",
 *     "expected": ["<answer>"],
 *     "context": "<sessions concatenated as formatted text>",
 *     "question_type": "knowledge-update" | "temporal-reasoning" | ...,
 *     "is_abstention": false
 *   }
 *
 * Source: xiaowu0162/longmemeval-cleaned on Hugging Face (Apache 2.0 or CC-BY)
 * Paper: Wu et al. 2024, "LongMemEval: Benchmarking Chat Assistants on Long-Term
 *        Interactive Memory" (arXiv:2410.10813).
 *
 * Zero LLM calls. Zero npm packages beyond Node.js built-ins.
 *
 * Usage:
 *   tsx build-longmemeval-canonical.ts [--variant s|m] [--skip-download]
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

// ---------------------------------------------------------------------------
// Source URLs and paths
// ---------------------------------------------------------------------------

const VARIANT_URLS: Record<string, string> = {
  s: 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json',
  m: 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_m_cleaned.json',
};

const QUESTION_TYPES = [
  'single-session-user',
  'single-session-assistant',
  'single-session-preference',
  'temporal-reasoning',
  'knowledge-update',
  'multi-session',
] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

// ---------------------------------------------------------------------------
// Source schema (from paper/repo xiaowu0162/longmemeval-cleaned)
// ---------------------------------------------------------------------------

interface LongMemEvalMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface LongMemEvalSession {
  session_id: string;
  date?: string;
  messages: LongMemEvalMessage[];
}

interface LongMemEvalQuestion {
  question_id: string;
  question: string;
  answer: string;
  question_type: QuestionType;
  // Abstention variant: question_id ends with '_abs'
  // Primary schema (cleaned HuggingFace variant):
  sessions?: LongMemEvalSession[];
  // Actual cleaned-variant schema:
  // haystack_sessions: list[list[{role, content}]]
  // haystack_dates: list[str]
  // haystack_session_ids: list[str]
  haystack_sessions?: LongMemEvalMessage[][];
  haystack_dates?: string[];
  haystack_session_ids?: string[];
}

// ---------------------------------------------------------------------------
// Output schema
// ---------------------------------------------------------------------------

interface CanonicalInstance {
  instance_id: string;
  conversation_id: string;
  question: string;
  expected: string[];
  context: string;
  question_type: QuestionType;
  is_abstention: boolean;
}

const FIELD_ORDER: readonly (keyof CanonicalInstance)[] = [
  'instance_id',
  'conversation_id',
  'question',
  'expected',
  'context',
  'question_type',
  'is_abstention',
];

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

/**
 * Concatenate all sessions into a single context string.
 *
 * Format per session:
 *   Session N (YYYY-MM-DD):
 *   user: ...
 *   assistant: ...
 *
 * Sessions without a date omit the parenthetical. Separated by double newline.
 */
function buildContext(sessions: LongMemEvalSession[]): string {
  const blocks: string[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const n = i + 1;
    const header = s.date ? `Session ${n} (${s.date}):` : `Session ${n}:`;
    const lines = s.messages.map(m => `${m.role}: ${m.content}`);
    blocks.push([header, ...lines].join('\n'));
  }
  return blocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

function serializeCanonical(inst: CanonicalInstance): string {
  const ordered: Record<string, unknown> = {};
  for (const key of FIELD_ORDER) {
    ordered[key] = inst[key];
  }
  return JSON.stringify(ordered);
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

function downloadFile(remoteUrl: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[build-longmemeval-canonical] downloading ${remoteUrl}`);
    console.log(`[build-longmemeval-canonical] → ${destPath}`);

    const file = fs.createWriteStream(destPath);
    let received = 0;
    let total = 0;
    let lastPct = -1;

    function doGet(requestUrl: string): void {
      https
        .get(requestUrl, res => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            const location = res.headers.location;
            if (!location) {
              reject(new Error(`Redirect with no Location header (${res.statusCode})`));
              return;
            }
            doGet(location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${requestUrl}`));
            return;
          }
          total = parseInt(res.headers['content-length'] ?? '0', 10);
          res.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (total > 0) {
              const pct = Math.floor((received / total) * 100);
              if (pct !== lastPct && pct % 10 === 0) {
                process.stdout.write(`  ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB)\r`);
                lastPct = pct;
              }
            }
          });
          res.pipe(file);
          res.on('end', () => {
            file.end();
          });
        })
        .on('error', reject);
    }

    file.on('finish', () => {
      process.stdout.write('\n');
      console.log(
        `[build-longmemeval-canonical] download complete (${(received / 1024 / 1024).toFixed(2)} MB)`,
      );
      resolve();
    });
    file.on('error', reject);

    doGet(remoteUrl);
  });
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { variant: string; skipDownload: boolean } {
  const argv = process.argv.slice(2);
  let variant = 's';
  let skipDownload = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--variant' && argv[i + 1]) {
      variant = argv[++i];
    } else if (argv[i] === '--skip-download') {
      skipDownload = true;
    }
  }
  if (variant !== 's' && variant !== 'm') {
    console.error(`[build-longmemeval-canonical] unknown --variant "${variant}". Use s or m.`);
    process.exit(1);
  }
  return { variant, skipDownload };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { variant, skipDownload } = parseArgs();

  const here = url.fileURLToPath(import.meta.url);
  // Script lives at benchmarks/harness/scripts/build-longmemeval-canonical.ts
  // Resolve repo root by going 3 levels up: scripts/ → harness/ → benchmarks/ → repo root
  const scriptDir = path.dirname(here);
  const repoRoot = path.resolve(scriptDir, '..', '..', '..');
  const dataDir = path.resolve(repoRoot, 'benchmarks', 'data');

  const rawFilename = `longmemeval_${variant}_cleaned.json`;
  const rawPath = path.join(dataDir, rawFilename);
  const remoteUrl = VARIANT_URLS[variant];

  // ------------------------------------------------------------------
  // Step 1: acquire raw file
  // ------------------------------------------------------------------

  if (!skipDownload && !fs.existsSync(rawPath)) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    try {
      await downloadFile(remoteUrl, rawPath);
    } catch (err) {
      console.error(`[build-longmemeval-canonical] download failed: ${String(err)}`);
      console.error('');
      console.error('Retry manually with:');
      console.error(`  curl -sL -o ${rawPath} '${remoteUrl}'`);
      process.exit(2);
    }
  } else if (skipDownload && !fs.existsSync(rawPath)) {
    console.error(
      `[build-longmemeval-canonical] --skip-download set but raw file missing: ${rawPath}`,
    );
    console.error('Download with:');
    console.error(`  curl -sL -o ${rawPath} '${remoteUrl}'`);
    process.exit(2);
  } else {
    console.log(`[build-longmemeval-canonical] using cached raw file: ${rawPath}`);
  }

  // ------------------------------------------------------------------
  // Step 2: parse source JSON
  // ------------------------------------------------------------------

  console.log('[build-longmemeval-canonical] parsing source JSON …');
  const raw = fs.readFileSync(rawPath, 'utf-8');
  let questions: LongMemEvalQuestion[];
  try {
    questions = JSON.parse(raw) as LongMemEvalQuestion[];
  } catch (err) {
    console.error(`[build-longmemeval-canonical] JSON parse error: ${String(err)}`);
    process.exit(1);
  }

  if (!Array.isArray(questions)) {
    console.error('[build-longmemeval-canonical] expected top-level JSON array, got something else.');
    process.exit(1);
  }

  console.log(`[build-longmemeval-canonical] loaded ${questions.length} questions from source`);

  // ------------------------------------------------------------------
  // Step 3: convert to canonical instances
  // ------------------------------------------------------------------

  const all: CanonicalInstance[] = [];
  const skipStats = { missingFields: 0, noSessions: 0 };

  for (const q of questions) {
    if (!q.question_id || !q.question || q.answer === undefined || q.answer === null) {
      skipStats.missingFields++;
      continue;
    }

    // Normalise to LongMemEvalSession[]: handle both schema variants.
    // Variant A (original): sessions: [{session_id, date?, messages: [{role, content}]}]
    // Variant B (cleaned HF): haystack_sessions: list[list[{role,content}]],
    //                         haystack_dates: list[str], haystack_session_ids: list[str]
    let normalisedSessions: LongMemEvalSession[] | null = null;

    if (Array.isArray(q.sessions) && q.sessions.length > 0) {
      normalisedSessions = q.sessions;
    } else if (Array.isArray(q.haystack_sessions) && q.haystack_sessions.length > 0) {
      normalisedSessions = q.haystack_sessions.map((msgs, i) => ({
        session_id: q.haystack_session_ids?.[i] ?? `session_${i}`,
        date: q.haystack_dates?.[i],
        messages: msgs.filter(m => m && typeof m.content === 'string'),
      }));
    }

    if (!normalisedSessions || normalisedSessions.length === 0) {
      skipStats.noSessions++;
      continue;
    }

    const isAbstention = q.question_id.endsWith('_abs');
    const context = buildContext(normalisedSessions);

    all.push({
      instance_id: `longmemeval_${q.question_id}`,
      conversation_id: q.question_id,
      question: q.question,
      expected: [q.answer],
      context,
      question_type: q.question_type,
      is_abstention: isAbstention,
    });
  }

  // ------------------------------------------------------------------
  // Step 4: sort + distribution
  // ------------------------------------------------------------------

  all.sort((a, b) => a.instance_id.localeCompare(b.instance_id));

  const byType: Record<string, number> = {};
  for (const qt of QUESTION_TYPES) byType[qt] = 0;
  for (const inst of all) {
    byType[inst.question_type] = (byType[inst.question_type] ?? 0) + 1;
  }
  const abstentionCount = all.filter(i => i.is_abstention).length;

  // ------------------------------------------------------------------
  // Step 5: write outputs
  // ------------------------------------------------------------------

  const outDir = path.join(dataDir, 'longmemeval');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 5a. Canonical JSONL
  const jsonlPath = path.join(outDir, 'longmemeval.jsonl');
  const body = all.map(serializeCanonical).join('\n') + '\n';
  fs.writeFileSync(jsonlPath, body, 'utf-8');

  // 5b. SHA-256
  const hash = crypto.createHash('sha256').update(body, 'utf-8').digest('hex');

  // 5c. meta.json
  const metaPath = path.join(outDir, 'longmemeval.meta.json');
  const meta = {
    dataset_version: hash,
    instance_count: all.length,
    variant,
    built_at: new Date().toISOString(),
    source: remoteUrl,
    source_reference:
      'Wu et al. 2024, "LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory" (arXiv:2410.10813)',
    hf_repo: 'xiaowu0162/longmemeval-cleaned',
    canonicalisation: {
      abstention_included: true,
      no_sessions_excluded: true,
      sort_order: 'instance_id ascending',
      field_order: FIELD_ORDER,
      line_terminator: '\\n',
      trailing_newline: true,
      encoding: 'utf-8',
      no_bom: true,
    },
    distribution_by_question_type: byType,
    abstention_count: abstentionCount,
    skip_stats: skipStats,
    expected_count: variant === 's' ? 500 : null,
    count_matches_expected: variant === 's' ? all.length === 500 : null,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

  // 5d. Raw cache copy alongside canonical outputs
  const rawCachePath = path.join(outDir, rawFilename);
  if (!fs.existsSync(rawCachePath)) {
    fs.copyFileSync(rawPath, rawCachePath);
    console.log(`[build-longmemeval-canonical] cached raw → ${rawCachePath}`);
  }

  // ------------------------------------------------------------------
  // Step 6: report
  // ------------------------------------------------------------------

  console.log('[build-longmemeval-canonical] distribution by question_type:');
  for (const [k, v] of Object.entries(byType)) console.log(`  ${k}: ${v}`);
  console.log(`[build-longmemeval-canonical] abstention questions: ${abstentionCount}`);
  console.log('[build-longmemeval-canonical] skipped:', skipStats);
  console.log(`[build-longmemeval-canonical] wrote ${jsonlPath} (${all.length} instances)`);
  console.log(`[build-longmemeval-canonical] wrote ${metaPath}`);
  console.log(`[build-longmemeval-canonical] dataset_version (SHA-256): ${hash}`);

  if (variant === 's' && all.length !== 500) {
    console.warn(
      `[build-longmemeval-canonical] NOTE: expected 500 instances for _s variant, got ${all.length}. ` +
        'Check source file integrity.',
    );
  }
}

main().catch(err => {
  console.error('[build-longmemeval-canonical] fatal:', err);
  process.exit(1);
});
