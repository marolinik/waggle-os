#!/usr/bin/env tsx
/**
 * Canonical BEAM archive builder — Track A (manifest-v8.2-final.md).
 *
 * IMPORTANT: BEAM data must be downloaded separately with Python before
 * running this script. This script does NOT download anything.
 *
 * Prerequisites:
 *   cd /path/to/BEAM
 *   pip install -r requirements.txt
 *   python src/beam/download_dataset.py
 *
 * Reads:   <beam-data-path>/<chat-size>/   (discovered JSON files)
 * Writes:  benchmarks/data/beam/beam-<chat-size>.jsonl
 *          benchmarks/data/beam/beam-<chat-size>.meta.json
 *
 * Canonicalisation guarantees (required for dataset_version hash determinism):
 *   1. Include every (conversation × memory_ability) probing question pair.
 *   2. Sort by instance_id ascending — stable regardless of file/key order.
 *   3. Serialize each record with JSON.stringify (no spaces, explicit key
 *      iteration order) and join with `\n` + trailing newline. No BOM.
 *   4. Compute SHA-256 of the final byte stream.
 *
 * Per-instance JSONL row schema (flat, downstream-parseable by DatasetInstance):
 *   {
 *     "instance_id":       "beam_<chat_size>_<conversation_id>_<memory_ability>_q<index>",
 *     "conversation_id":   "beam_<conversation_id>",
 *     "question":          "<probing question text>",
 *     "expected":          ["<reference answer>"],
 *     "context":           "<all turns as 'user: ...\nassistant: ...'>",
 *     "memory_ability":    "<category>",
 *     "chat_size":         "<128K|500K|1M|10M>",
 *     "conversation_index": <int>
 *   }
 *
 * Source: mohammadtavakoli78/BEAM (GitHub)
 * Paper: Tavakoli, Salemi, Ye, Abdalla, Zamani, Mitchell 2024,
 *        "Beyond a Million Tokens: Benchmarking and Enhancing Long-Term Memory
 *         in LLMs" (arXiv:2510.27246, ICLR 2026).
 *
 * Zero LLM calls. Zero npm packages beyond Node.js built-ins.
 *
 * Usage:
 *   tsx build-beam-canonical.ts --beam-data-path /path/to/BEAM/data [--chat-size 128K]
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
// BEAM data schema (inferred from repo README and paper §3)
// The actual JSON layout is discovered at runtime; we try two known formats.
// ---------------------------------------------------------------------------

/** A single turn in a BEAM conversation. */
interface BeamTurn {
  role: 'user' | 'assistant' | string;
  content: string;
}

/**
 * A single probing question attached to one (conversation, memory_ability) pair.
 * Field names are guesses from the paper; we normalise at runtime.
 */
interface BeamProbingQuestion {
  question?: string;
  query?: string;         // alternative field name
  answer?: string;
  reference?: string;     // alternative field name
  memory_ability?: string;
  category?: string;      // alternative field name
}

/**
 * One BEAM conversation record as it might appear in the JSON.
 * The exact schema is discovered at runtime — we emit a clear error if
 * neither expected layout is found.
 */
interface BeamConversationRecord {
  conversation_id?: string;
  id?: string;             // alternative field name
  index?: number;
  turns?: BeamTurn[];
  messages?: BeamTurn[];   // alternative field name
  conversation?: BeamTurn[]; // alternative field name
  questions?: BeamProbingQuestion[];
  probing_questions?: BeamProbingQuestion[];
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
];

// ---------------------------------------------------------------------------
// Context assembly
// ---------------------------------------------------------------------------

/**
 * Concatenate all conversation turns into a single context string.
 * Format: "user: ...\nassistant: ...\nuser: ..."
 */
function buildContext(turns: BeamTurn[]): string {
  return turns
    .map(t => {
      const role = String(t.role ?? 'unknown').toLowerCase();
      const content = String(t.content ?? '');
      return `${role}: ${content}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------
// Schema normalisation helpers
// ---------------------------------------------------------------------------

function normaliseTurns(record: BeamConversationRecord): BeamTurn[] | null {
  const raw = record.turns ?? record.messages ?? record.conversation;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw as BeamTurn[];
}

function normaliseQuestions(record: BeamConversationRecord): BeamProbingQuestion[] | null {
  const raw = record.questions ?? record.probing_questions;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return raw as BeamProbingQuestion[];
}

function normaliseConversationId(record: BeamConversationRecord, fileIndex: number): string {
  const id = record.conversation_id ?? record.id;
  if (id !== undefined && id !== null) return String(id);
  // Fall back to file position index
  return String(fileIndex);
}

function normaliseQuestion(pq: BeamProbingQuestion): string | null {
  return pq.question ?? pq.query ?? null;
}

function normaliseAnswer(pq: BeamProbingQuestion): string | null {
  return pq.answer ?? pq.reference ?? null;
}

function normaliseMemoryAbility(pq: BeamProbingQuestion, fallback: string): string {
  return pq.memory_ability ?? pq.category ?? fallback;
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
// File discovery
// ---------------------------------------------------------------------------

/**
 * Discover all JSON files under `dirPath`. Returns absolute paths.
 * Searches `dirPath` directly and one level of subdirectories.
 */
function discoverJsonFiles(dirPath: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(full);
    } else if (entry.isDirectory()) {
      // One level deeper
      const inner = fs.readdirSync(full, { withFileTypes: true });
      for (const ie of inner) {
        if (ie.isFile() && ie.name.endsWith('.json')) {
          results.push(path.join(full, ie.name));
        }
      }
    }
  }
  return results;
}

/**
 * Locate the right data sub-directory for the requested chat-size.
 * Tries: <beamDataPath>/<chatSize>/, <beamDataPath>/
 */
function locateDataDir(beamDataPath: string, chatSize: string): string | null {
  const candidates = [
    path.join(beamDataPath, chatSize),
    path.join(beamDataPath, chatSize.toLowerCase()),
    beamDataPath,
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
      return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { beamDataPath: string; chatSize: ChatSize } {
  const argv = process.argv.slice(2);
  let beamDataPath = '';
  let chatSize: ChatSize = '128K';

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--beam-data-path' && argv[i + 1]) {
      beamDataPath = argv[++i];
    } else if (argv[i] === '--chat-size' && argv[i + 1]) {
      const val = argv[++i] as ChatSize;
      if (!VALID_CHAT_SIZES.includes(val)) {
        console.error(
          `[build-beam-canonical] unknown --chat-size "${val}". Valid: ${VALID_CHAT_SIZES.join(', ')}`,
        );
        process.exit(1);
      }
      chatSize = val;
    }
  }

  return { beamDataPath, chatSize };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { beamDataPath, chatSize } = parseArgs();

  const here = url.fileURLToPath(import.meta.url);
  // Script lives at benchmarks/harness/scripts/build-beam-canonical.ts
  // Resolve repo root by going 3 levels up: scripts/ -> harness/ -> benchmarks/ -> repo root
  const scriptDir = path.dirname(here);
  const repoRoot = path.resolve(scriptDir, '..', '..', '..');
  const dataDir = path.resolve(repoRoot, 'benchmarks', 'data');

  // ------------------------------------------------------------------
  // Step 1: validate BEAM data path
  // ------------------------------------------------------------------

  if (!beamDataPath) {
    console.error('[build-beam-canonical] --beam-data-path is required.\n');
    console.error('BEAM dataset not found.');
    console.error('Download it with:');
    console.error('  cd /path/to/BEAM');
    console.error('  pip install -r requirements.txt');
    console.error('  python src/beam/download_dataset.py');
    console.error('Then re-run this script with --beam-data-path /path/to/BEAM/data');
    process.exit(2);
  }

  if (!fs.existsSync(beamDataPath)) {
    console.error(`[build-beam-canonical] BEAM dataset not found at ${beamDataPath}.`);
    console.error('Download it with:');
    console.error('  cd /path/to/BEAM');
    console.error('  pip install -r requirements.txt');
    console.error('  python src/beam/download_dataset.py');
    console.error(`Then re-run this script with --beam-data-path ${beamDataPath}`);
    process.exit(2);
  }

  const chatSizeDir = locateDataDir(beamDataPath, chatSize);
  if (!chatSizeDir) {
    console.error(
      `[build-beam-canonical] could not find chat-size directory for "${chatSize}" under ${beamDataPath}.`,
    );
    console.error(
      `Expected one of: ${VALID_CHAT_SIZES.map(s => path.join(beamDataPath, s)).join(', ')}`,
    );
    console.error('Make sure python src/beam/download_dataset.py completed successfully.');
    process.exit(2);
  }

  console.log(`[build-beam-canonical] chat-size directory: ${chatSizeDir}`);

  // ------------------------------------------------------------------
  // Step 2: discover and parse JSON files
  // ------------------------------------------------------------------

  const jsonFiles = discoverJsonFiles(chatSizeDir);
  if (jsonFiles.length === 0) {
    console.error(
      `[build-beam-canonical] no JSON files found under ${chatSizeDir}. ` +
        'Did the BEAM download script complete?',
    );
    process.exit(2);
  }

  console.log(`[build-beam-canonical] found ${jsonFiles.length} JSON file(s)`);

  const all: CanonicalInstance[] = [];
  const skipStats = { unknownSchema: 0, missingQuestion: 0, missingAnswer: 0, noTurns: 0 };

  let fileIndex = 0;
  for (const filePath of jsonFiles) {
    let records: unknown;
    try {
      records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (err) {
      console.warn(`[build-beam-canonical] skipping unparseable file: ${filePath} (${String(err)})`);
      continue;
    }

    // Accept: top-level array of conversation records, or top-level object with a key
    const recordArray: BeamConversationRecord[] = Array.isArray(records)
      ? (records as BeamConversationRecord[])
      : typeof records === 'object' && records !== null
        ? // Try common wrapper keys: "data", "conversations", "items"
          ((records as Record<string, unknown>)['data'] ??
            (records as Record<string, unknown>)['conversations'] ??
            (records as Record<string, unknown>)['items'] ??
            // Fall back: treat single record wrapped in array
            [records]) as BeamConversationRecord[]
        : [];

    if (recordArray.length === 0) {
      console.warn(`[build-beam-canonical] no records found in ${filePath}`);
      skipStats.unknownSchema++;
      continue;
    }

    for (const record of recordArray) {
      const convRawId = normaliseConversationId(record, fileIndex);
      const conversationId = `beam_${convRawId}`;
      fileIndex++;

      const turns = normaliseTurns(record);
      if (!turns) {
        skipStats.noTurns++;
        continue;
      }
      const context = buildContext(turns);

      const questions = normaliseQuestions(record);
      if (!questions) {
        // No probing questions on this record — skip silently (might be a
        // conversation-only file; questions may be in a companion file).
        skipStats.unknownSchema++;
        continue;
      }

      for (let qi = 0; qi < questions.length; qi++) {
        const pq = questions[qi];
        const questionText = normaliseQuestion(pq);
        if (!questionText) {
          skipStats.missingQuestion++;
          continue;
        }
        const answerText = normaliseAnswer(pq);
        if (answerText === null) {
          skipStats.missingAnswer++;
          continue;
        }
        const memAbility = normaliseMemoryAbility(pq, 'unknown');
        const safeChatSize = chatSize.replace(/[^a-zA-Z0-9]/g, '');
        const instanceId = `beam_${safeChatSize}_${convRawId}_${memAbility}_q${qi}`;

        all.push({
          instance_id: instanceId,
          conversation_id: conversationId,
          question: questionText,
          expected: [answerText],
          context,
          memory_ability: memAbility,
          chat_size: chatSize,
          conversation_index: fileIndex - 1,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 3: validate schema assumptions — emit actionable error if needed
  // ------------------------------------------------------------------

  if (all.length === 0) {
    console.error('[build-beam-canonical] extracted 0 instances. Schema mismatch.');
    console.error('');
    console.error('Expected each conversation record to have:');
    console.error('  - turns/messages/conversation: [{role, content}, ...]');
    console.error('  - questions/probing_questions: [{question, answer, memory_ability}, ...]');
    console.error('');
    console.error('Please inspect a sample file and update the normalisation helpers in this');
    console.error('script to match the actual field names.');
    console.error('');
    console.error(`Sample file: ${jsonFiles[0]}`);
    console.error(
      `First 500 chars: ${fs.readFileSync(jsonFiles[0], 'utf-8').slice(0, 500)}`,
    );
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
  const body = all.map(serializeCanonical).join('\n') + '\n';
  fs.writeFileSync(jsonlPath, body, 'utf-8');

  const hash = crypto.createHash('sha256').update(body, 'utf-8').digest('hex');

  const metaPath = path.join(outDir, `beam-${safeChatSize}.meta.json`);
  const meta = {
    dataset_version: hash,
    instance_count: all.length,
    chat_size: chatSize,
    built_at: new Date().toISOString(),
    source: 'mohammadtavakoli78/BEAM (GitHub)',
    source_reference:
      'Tavakoli, Salemi, Ye, Abdalla, Zamani, Mitchell 2024, "Beyond a Million Tokens: Benchmarking and Enhancing Long-Term Memory in LLMs" (arXiv:2510.27246, ICLR 2026)',
    beam_data_path: beamDataPath,
    json_files_processed: jsonFiles.length,
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
  for (const [k, v] of Object.entries(byAbility)) console.log(`  ${k}: ${v}`);
  console.log('[build-beam-canonical] skipped:', skipStats);
  console.log(`[build-beam-canonical] wrote ${jsonlPath} (${all.length} instances)`);
  console.log(`[build-beam-canonical] wrote ${metaPath}`);
  console.log(`[build-beam-canonical] dataset_version (SHA-256): ${hash}`);
}

main();
