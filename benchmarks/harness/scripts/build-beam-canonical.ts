#!/usr/bin/env tsx
/**
 * Canonical BEAM archive builder — Track A (manifest-v8.2-final.md).
 *
 * BEAM data ships inside the mohammadtavakoli78/BEAM GitHub repo under chats/.
 * No separate download step is required if you have cloned the repo.
 *
 * Actual directory layout (discovered by inspection):
 *   <beam-repo>/chats/<size>/              100K | 500K | 1M | 10M
 *     <N>/                                numbered conversation directories (1-based)
 *       chat.json                          [{batch_number, time_anchor, turns: [[{role,id,time_anchor,index,question_type,content}, ...], ...]}]
 *       probing_questions/
 *         probing_questions.json           {<category>: [{question, <answer_field>, difficulty, ...}, ...], ...}
 *       topic.json                         {topic, description, ...}
 *
 * Chat-size alias: repo uses "100K" for what we call "128K" (~130K tokens each).
 *
 * Reads:   <beam-chats-path>/<chat-size-dir>/
 * Writes:  benchmarks/data/beam/beam-<chat-size>.jsonl
 *          benchmarks/data/beam/beam-<chat-size>.meta.json
 *
 * Canonicalisation guarantees (required for dataset_version hash determinism):
 *   1. Include every (conversation × memory_ability × question) triple.
 *   2. Sort by instance_id ascending.
 *   3. JSON.stringify each row (no spaces, explicit key order) + '\n'. No BOM.
 *   4. SHA-256 of the final byte stream.
 *
 * Per-instance JSONL schema:
 *   {
 *     "instance_id":        "beam_<chatSize>_<convId>_<ability>_q<idx>",
 *     "conversation_id":    "beam_<convId>",
 *     "question":           "<probing question>",
 *     "expected":           ["<reference answer>"],
 *     "context":            "<flat role: content lines>",
 *     "memory_ability":     "<category>",
 *     "chat_size":          "<128K|500K|1M|10M>",
 *     "conversation_index": <int>
 *   }
 *
 * Source: mohammadtavakoli78/BEAM (GitHub)
 * Paper:  Tavakoli et al. 2024 "Beyond a Million Tokens: Benchmarking and
 *         Enhancing Long-Term Memory in LLMs" (arXiv:2510.27246, ICLR 2026).
 *
 * Zero LLM calls. Zero npm packages beyond Node.js built-ins.
 *
 * Usage:
 *   tsx build-beam-canonical.ts --beam-chats-path /path/to/BEAM/chats [--chat-size 128K]
 *   # --beam-chats-path defaults to <repo-root>/benchmarks/harness/scripts/../../../BEAM/chats
 *   #                                i.e. a sibling BEAM clone next to waggle-os
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_CHAT_SIZES = ['128K', '500K', '1M', '10M'] as const;
type ChatSize = (typeof VALID_CHAT_SIZES)[number];

/**
 * Map our canonical chat-size names to the directory names used in the BEAM repo.
 * 128K ≈ 100K (actual token count ~130K).
 */
const CHAT_SIZE_DIR_MAP: Record<ChatSize, string[]> = {
  '128K': ['100K'],
  '500K': ['500K'],
  '1M':   ['1M'],
  '10M':  ['10M'],
};

/**
 * All 10 BEAM memory ability categories.
 * Source: Table 1 in arXiv:2510.27246 and repo README.
 */
const MEMORY_ABILITIES = [
  'abstention',
  'contradiction_resolution',
  'event_ordering',
  'information_extraction',
  'instruction_following',
  'knowledge_update',
  'multi_session_reasoning',
  'preference_following',
  'summarization',
  'temporal_reasoning',
] as const;
type MemoryAbility = (typeof MEMORY_ABILITIES)[number];

// ---------------------------------------------------------------------------
// BEAM data schema (verified by inspection of actual BEAM repo files)
// ---------------------------------------------------------------------------

/** One message inside a BEAM conversation turn. */
interface BeamMessage {
  role: string;
  content: string;
  id?: number;
  time_anchor?: string | null;
  index?: string;
  question_type?: string;
}

/** One batch (session) in chat.json. */
interface BeamBatch {
  batch_number?: number;
  time_anchor?: string | null;
  turns: BeamMessage[][];  // list of turn groups; each group is list of msgs
}

/**
 * Per-category probing question.
 * Answer field varies by category — we try all known variants.
 */
interface BeamProbingQuestion {
  question?: string;
  // Category-specific answer fields (verified by inspection):
  answer?: string;             // event_ordering, information_extraction, knowledge_update, multi_session_reasoning, temporal_reasoning
  ideal_response?: string;     // abstention
  ideal_answer?: string;       // contradiction_resolution
  expected_compliance?: string; // instruction_following, preference_following
  ideal_summary?: string;       // summarization
  // Extra fields (stored for provenance, not used in eval directly):
  difficulty?: string;
  rubric?: string[];
  [key: string]: unknown;
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
  memory_ability: string;
  chat_size: string;
  conversation_index: number;
  /**
   * schema v2 (2026-07-06): the ordered list of rubric "nuggets" for this
   * probing question. This is the criterion set the OFFICIAL BEAM metric
   * scores — each nugget is judged 0 / 0.5 / 1 by the graded LLM judge and
   * the per-question score is their mean (see beam-nugget-judge.ts). Carried
   * additively; v1 archives (e.g. the committed beam-128K.jsonl, dataset
   * hash 9311bba4…) do not have it. Appended LAST in FIELD_ORDER so the
   * leading columns are byte-identical to v1 for a human diff — note that
   * ANY added field changes the SHA-256 dataset_version, so a v1 archive
   * rebuilt with this code becomes a v2 hash. We do not rebuild 128K here.
   */
  rubric: string[];
}

const FIELD_ORDER: readonly (keyof CanonicalInstance)[] = [
  'instance_id',
  'conversation_id',
  'question',
  'expected',
  'context',
  'memory_ability',
  'chat_size',
  'conversation_index',
  'rubric',
];

/** Canonical schema version. Bumped to 2 when `rubric` nuggets were added. */
const SCHEMA_VERSION = 2;

// ---------------------------------------------------------------------------
// Turn flattening
// ---------------------------------------------------------------------------

/**
 * Flatten BEAM's nested batch/turn-group structure into a flat list of
 * {role, content} messages, preserving temporal order.
 *
 * chat.json structure:
 *   [ {batch_number, time_anchor, turns: [ [msg, msg, ...], [msg, ...] ]} ]
 *
 * We flatten: batches → turn groups → individual messages.
 * We only emit messages with non-empty content.
 */
function flattenBeamTurns(batches: BeamBatch[]): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  for (const batch of batches) {
    if (!Array.isArray(batch.turns)) continue;
    for (const turnGroup of batch.turns) {
      if (!Array.isArray(turnGroup)) continue;
      for (const msg of turnGroup) {
        const role = String(msg.role ?? 'unknown').toLowerCase();
        const content = String(msg.content ?? '').trim();
        if (content) {
          out.push({ role, content });
        }
      }
    }
  }
  return out;
}

/**
 * Convert flat message list to context string.
 * Format: "user: ...\nassistant: ...\n"
 */
function buildContext(msgs: Array<{ role: string; content: string }>): string {
  return msgs.map(m => `${m.role}: ${m.content}`).join('\n');
}

// ---------------------------------------------------------------------------
// Answer normalisation
// ---------------------------------------------------------------------------

/**
 * Extract the reference answer from a probing question, trying all known
 * per-category answer field names.
 * Returns null if no answer field is found.
 */
function normaliseAnswer(pq: BeamProbingQuestion): string | null {
  return (
    pq.answer ??
    pq.ideal_response ??
    pq.ideal_answer ??
    pq.expected_compliance ??
    pq.ideal_summary ??
    null
  );
}

/**
 * Extract the ordered list of rubric "nuggets" from a probing question.
 * Ported verbatim from mem0's `extract_rubric_nuggets` (benchmarks/beam/run.py):
 * the `rubric` field may be a list[str] (the BEAM 1M/10M shape), a dict with a
 * `nuggets` list, or a bare scalar. Empty/whitespace nuggets are dropped.
 */
function extractRubricNuggets(pq: BeamProbingQuestion): string[] {
  const raw = (pq as Record<string, unknown>).rubric;
  const clean = (arr: unknown[]): string[] =>
    arr
      .map(n =>
        n !== null && typeof n === 'object'
          ? String((n as Record<string, unknown>).description ??
                   (n as Record<string, unknown>).text ??
                   JSON.stringify(n))
          : String(n),
      )
      .map(s => s.trim())
      .filter(s => s.length > 0);

  if (Array.isArray(raw)) return clean(raw);
  if (raw !== null && typeof raw === 'object') {
    const nuggets = (raw as Record<string, unknown>).nuggets;
    if (Array.isArray(nuggets)) return clean(nuggets);
  }
  if (raw !== undefined && raw !== null && String(raw).trim().length > 0) {
    return [String(raw).trim()];
  }
  return [];
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
// Directory discovery
// ---------------------------------------------------------------------------

/**
 * Locate the chat-size directory under beamChatsPath.
 * Maps our canonical size name to the BEAM repo directory name.
 */
function locateChatSizeDir(beamChatsPath: string, chatSize: ChatSize): string | null {
  const candidates = CHAT_SIZE_DIR_MAP[chatSize] ?? [chatSize];
  for (const dirName of candidates) {
    const full = path.join(beamChatsPath, dirName);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      return full;
    }
  }
  return null;
}

/**
 * Return all numbered conversation directories inside chatSizeDir.
 * These are directories whose names are numeric strings (1, 2, 3, ...).
 */
function discoverConversationDirs(chatSizeDir: string): string[] {
  const entries = fs.readdirSync(chatSizeDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && /^\d+$/.test(e.name))
    .sort((a, b) => Number(a.name) - Number(b.name))
    .map(e => path.join(chatSizeDir, e.name));
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { beamChatsPath: string; chatSize: ChatSize } {
  const argv = process.argv.slice(2);
  let beamChatsPath = '';
  let chatSize: ChatSize = '128K';

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if ((flag === '--beam-chats-path' || flag === '--beam-data-path') && next) {
      // Accept both --beam-chats-path (new) and --beam-data-path (old compat)
      // If user passes BEAM root (contains chats/ subdir), auto-append chats/
      let p = next;
      if (fs.existsSync(path.join(p, 'chats'))) {
        p = path.join(p, 'chats');
      }
      beamChatsPath = p;
      i++;
    } else if (flag === '--chat-size' && next) {
      const val = next as ChatSize;
      if (!VALID_CHAT_SIZES.includes(val)) {
        console.error(
          `[build-beam-canonical] unknown --chat-size "${val}". Valid: ${VALID_CHAT_SIZES.join(', ')}`,
        );
        process.exit(1);
      }
      chatSize = val;
      i++;
    }
  }

  return { beamChatsPath, chatSize };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { beamChatsPath: beamChatsPathArg, chatSize } = parseArgs();

  const here = url.fileURLToPath(import.meta.url);
  // Script lives at benchmarks/harness/scripts/build-beam-canonical.ts
  // repo root = 3 levels up: scripts/ → harness/ → benchmarks/ → repo root
  const scriptDir = path.dirname(here);
  const repoRoot = path.resolve(scriptDir, '..', '..', '..');
  const dataDir = path.resolve(repoRoot, 'benchmarks', 'data');

  // Auto-discover beamChatsPath if not provided:
  // Try <repo-root>/../BEAM/chats (sibling clone convention)
  let beamChatsPath = beamChatsPathArg;
  if (!beamChatsPath) {
    const siblingGuess = path.resolve(repoRoot, '..', 'BEAM', 'chats');
    if (fs.existsSync(siblingGuess)) {
      beamChatsPath = siblingGuess;
      console.log(`[build-beam-canonical] auto-discovered BEAM chats at ${beamChatsPath}`);
    } else {
      console.error('[build-beam-canonical] --beam-chats-path is required (or clone BEAM as sibling of waggle-os).\n');
      console.error('Clone with:  git clone https://github.com/mohammadtavakoli78/BEAM.git');
      console.error('Then re-run: tsx build-beam-canonical.ts --beam-chats-path /path/to/BEAM/chats');
      process.exit(2);
    }
  }

  if (!fs.existsSync(beamChatsPath)) {
    console.error(`[build-beam-canonical] BEAM chats path not found: ${beamChatsPath}`);
    process.exit(2);
  }

  // ------------------------------------------------------------------
  // Step 1: locate chat-size directory
  // ------------------------------------------------------------------

  const chatSizeDir = locateChatSizeDir(beamChatsPath, chatSize);
  if (!chatSizeDir) {
    const tried = (CHAT_SIZE_DIR_MAP[chatSize] ?? [chatSize]).map(d => path.join(beamChatsPath, d));
    console.error(
      `[build-beam-canonical] could not find chat-size directory for "${chatSize}" under ${beamChatsPath}.`,
    );
    console.error(`Tried: ${tried.join(', ')}`);
    process.exit(2);
  }

  console.log(`[build-beam-canonical] chat-size directory: ${chatSizeDir}`);

  // ------------------------------------------------------------------
  // Step 2: scan conversation directories
  // ------------------------------------------------------------------

  const convDirs = discoverConversationDirs(chatSizeDir);
  if (convDirs.length === 0) {
    console.error(
      `[build-beam-canonical] no numbered conversation directories found under ${chatSizeDir}.`,
    );
    process.exit(2);
  }

  console.log(`[build-beam-canonical] found ${convDirs.length} conversation directories`);

  const all: CanonicalInstance[] = [];
  const skipStats = {
    missingChat: 0,
    missingProbing: 0,
    missingQuestion: 0,
    missingAnswer: 0,
    noTurns: 0,
  };

  for (let convIdx = 0; convIdx < convDirs.length; convIdx++) {
    const convDir = convDirs[convIdx];
    const convId = path.basename(convDir);  // e.g. "1", "2", ...

    // ── Load chat.json ──────────────────────────────────────────────
    const chatJsonPath = path.join(convDir, 'chat.json');
    if (!fs.existsSync(chatJsonPath)) {
      console.warn(`[build-beam-canonical] skipping ${convDir}: no chat.json`);
      skipStats.missingChat++;
      continue;
    }

    let batches: BeamBatch[];
    try {
      batches = JSON.parse(fs.readFileSync(chatJsonPath, 'utf-8')) as BeamBatch[];
    } catch (err) {
      console.warn(`[build-beam-canonical] skipping ${chatJsonPath}: ${String(err)}`);
      skipStats.missingChat++;
      continue;
    }

    const flatMsgs = flattenBeamTurns(batches);
    if (flatMsgs.length === 0) {
      console.warn(`[build-beam-canonical] skipping ${convDir}: 0 messages after flatten`);
      skipStats.noTurns++;
      continue;
    }
    const context = buildContext(flatMsgs);

    // ── Load probing_questions/probing_questions.json ───────────────
    const pqPath = path.join(convDir, 'probing_questions', 'probing_questions.json');
    if (!fs.existsSync(pqPath)) {
      console.warn(`[build-beam-canonical] skipping ${convDir}: no probing_questions.json`);
      skipStats.missingProbing++;
      continue;
    }

    let pqData: Record<string, BeamProbingQuestion[]>;
    try {
      pqData = JSON.parse(fs.readFileSync(pqPath, 'utf-8')) as Record<string, BeamProbingQuestion[]>;
    } catch (err) {
      console.warn(`[build-beam-canonical] skipping ${pqPath}: ${String(err)}`);
      skipStats.missingProbing++;
      continue;
    }

    const conversationId = `beam_${convId}`;
    const safeChatSize = chatSize.replace(/[^a-zA-Z0-9]/g, '');

    // ── Iterate categories ──────────────────────────────────────────
    for (const [category, questions] of Object.entries(pqData)) {
      if (!Array.isArray(questions)) continue;

      for (let qi = 0; qi < questions.length; qi++) {
        const pq = questions[qi];
        const questionText = pq.question ?? null;
        if (!questionText) {
          skipStats.missingQuestion++;
          continue;
        }
        const rubric = extractRubricNuggets(pq);
        // `expected` keeps the single normalised reference answer for the
        // legacy substring scorer. If a question has no single-answer field
        // but does carry rubric nuggets, fall back to the joined rubric
        // (mem0's ground_truth_answer convention) rather than dropping it.
        let answerText = normaliseAnswer(pq);
        if (answerText === null) {
          if (rubric.length > 0) {
            answerText = rubric.join(' | ');
          } else {
            skipStats.missingAnswer++;
            continue;
          }
        }

        const instanceId = `beam_${safeChatSize}_${convId}_${category}_q${qi}`;

        all.push({
          instance_id: instanceId,
          conversation_id: conversationId,
          question: questionText,
          expected: [answerText],
          context,
          memory_ability: category,
          chat_size: chatSize,
          conversation_index: convIdx,
          rubric,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 3: validate
  // ------------------------------------------------------------------

  if (all.length === 0) {
    console.error('[build-beam-canonical] extracted 0 instances.');
    console.error(`Scanned ${convDirs.length} conversation dirs. Skip stats: ${JSON.stringify(skipStats)}`);
    process.exit(2);
  }

  // ------------------------------------------------------------------
  // Step 4: sort + distribution
  // ------------------------------------------------------------------

  all.sort((a, b) => a.instance_id.localeCompare(b.instance_id));

  const byAbility: Record<string, number> = {};
  for (const ma of MEMORY_ABILITIES) byAbility[ma] = 0;
  for (const inst of all) {
    byAbility[inst.memory_ability] = (byAbility[inst.memory_ability] ?? 0) + 1;
  }

  // ------------------------------------------------------------------
  // Step 5: write outputs
  // ------------------------------------------------------------------

  const outDir = path.join(dataDir, 'beam');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const safeChatSize = chatSize.replace(/[^a-zA-Z0-9]/g, '');
  const jsonlPath = path.join(outDir, `beam-${safeChatSize}.jsonl`);

  // Stream the write + hash incrementally, one line at a time. The full body
  // for the 1M/10M tracks (~3 GB for 1M, since the ~4 MB context is repeated
  // per question) exceeds V8's max string length (~512 MB), so it can never
  // be materialised as a single `join()`ed string. Writing `line + '\n'` for
  // each row in sorted order produces byte-identical output to the old
  // `all.map(serializeCanonical).join('\n') + '\n'` (a trailing newline after
  // the final row), so the SHA-256 dataset_version stays deterministic and
  // matches what the join-based path would have produced.
  const hasher = crypto.createHash('sha256');
  const fd = fs.openSync(jsonlPath, 'w');
  try {
    for (const inst of all) {
      const line = serializeCanonical(inst) + '\n';
      fs.writeSync(fd, line, null, 'utf-8');
      hasher.update(line, 'utf-8');
    }
  } finally {
    fs.closeSync(fd);
  }
  const hash = hasher.digest('hex');

  const metaPath = path.join(outDir, `beam-${safeChatSize}.meta.json`);
  const withRubric = all.filter(i => i.rubric.length > 0).length;
  const totalNuggets = all.reduce((s, i) => s + i.rubric.length, 0);

  const meta = {
    dataset_version: hash,
    schema_version: SCHEMA_VERSION,
    instances_with_rubric: withRubric,
    total_nuggets: totalNuggets,
    instance_count: all.length,
    chat_size: chatSize,
    built_at: new Date().toISOString(),
    source: 'mohammadtavakoli78/BEAM (GitHub)',
    source_reference:
      'Tavakoli, Salemi, Ye, Abdalla, Zamani, Mitchell 2024, "Beyond a Million Tokens: ' +
      'Benchmarking and Enhancing Long-Term Memory in LLMs" (arXiv:2510.27246, ICLR 2026)',
    beam_chats_path: beamChatsPath,
    conversations_processed: convDirs.length,
    chat_size_dir_alias: CHAT_SIZE_DIR_MAP[chatSize]?.[0] ?? chatSize,
    canonicalisation: {
      sort_order: 'instance_id ascending',
      field_order: FIELD_ORDER,
      line_terminator: '\\n',
      trailing_newline: true,
      encoding: 'utf-8',
      no_bom: true,
    },
    distribution_by_memory_ability: byAbility,
    skip_stats: skipStats,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');

  // ------------------------------------------------------------------
  // Step 6: report
  // ------------------------------------------------------------------

  console.log('[build-beam-canonical] distribution by memory_ability:');
  for (const [k, v] of Object.entries(byAbility)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('[build-beam-canonical] skip_stats:', skipStats);
  console.log(`[build-beam-canonical] wrote ${jsonlPath} (${all.length} instances)`);
  console.log(`[build-beam-canonical] wrote ${metaPath}`);
  console.log(`[build-beam-canonical] dataset_version (SHA-256): ${hash}`);
}

main();
