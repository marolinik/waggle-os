// Reverse-ported from OSS hive-mind llm-extractor (oss-drift triage D2, 2026-06-11); executors rehomed onto LLMCallFn.
/**
 * extract-kg-entities.ts — LLM-based knowledge-graph entity extraction.
 *
 * The heuristic capitalized-n-gram regex (packages/agent/src/entity-extractor.ts
 * via CognifyPipeline) produces high noise: sentence-starts, log prefixes, and
 * fragments. This pass replaces the regex with an LLM that understands semantics
 * and returns typed entities (person/project/file/decision/bug/concept/tool/
 * location) keyed by frame id.
 *
 * Ported core = PROMPT + JSONL PARSER + BATCHING + noise filter. The OSS
 * executors ('cc' subprocess spawn, raw Anthropic POST) are dropped — the
 * monorepo drives all LLM calls through `LLMCallFn` ('fast' tier), exactly
 * like extract-memory-lanes.ts.
 *
 * Failure model mirrors extract-memory-lanes: per-batch failures are collected
 * into `errors`, never thrown — partial results beat zero results when one
 * frame confuses the model. All extracted names are injection-scanned before
 * being returned (LLM output over possibly-tainted harvested content).
 */

import type { LLMCallFn } from './pipeline.js';
import { scanForInjection } from '../injection-scanner.js';
import { createCoreLogger } from '../logger.js';
import { isNoiseName, normalizeEntityName } from '../mind/entity-normalizer.js';
import type { KnowledgeGraph } from '../mind/knowledge.js';

const log = createCoreLogger('extract-kg-entities');

/** Canonical entity types the prompt asks the model to choose from. */
export const KG_ENTITY_TYPES = [
  'person',
  'project',
  'file',
  'decision',
  'bug',
  'concept',
  'tool',
  'location',
] as const;

export type KgEntityType = (typeof KG_ENTITY_TYPES)[number];

/** One extracted entity attributed back to its source frame. */
export interface KgEntity {
  frameId: number;
  type: KgEntityType;
  name: string;
}

export interface KgEntityExtraction {
  entities: KgEntity[];
  errors: string[];
}

/**
 * Frames per batch. OSS defaulted to 3 because `claude -p` subprocess
 * wall-clock blew past 90s on batch=5 with raw frames; LLMCallFn has no
 * subprocess pressure, so 5 frames/batch with the per-frame content cap
 * keeps prompts bounded while halving call count.
 */
const BATCH_SIZE = 5;

/**
 * Per-frame content cap before sending to the model (OSS finding: the first
 * ~2-3KB of a frame carries the named entities; long wiki-synth frames can
 * exceed 8KB and add nothing but latency).
 */
const MAX_FRAME_CHARS = 2500;

/** The instructions block sent to the model. Stable across batches. */
const PROMPT_INSTRUCTIONS = `Extract named entities from the FRAMES below. For each entity, output ONE JSON object on its own line.

OUTPUT FORMAT (JSONL — one object per line, no other text):
{"frame_id": <number>, "name": "<entity name>", "type": "<type>"}

VALID TYPES (pick the closest fit):
- person       a specific human (e.g. "Marko", "Alice Chen")
- project      a named project, repo, codebase, or product (e.g. "hive-mind", "Phase 3")
- file         a specific file path or filename (e.g. "synth-drain.js", "PHASE-3-PLAN.md")
- decision     a specific architectural or strategic choice with a name (e.g. "open-core boundary")
- bug          a known issue, incident, or failure mode (e.g. "subprocess feedback loop")
- tool         a CLI tool, library, framework, or service (e.g. "Ollama", "Voyage", "sqlite-vec")
- concept      a domain concept that doesn't fit above (e.g. "watermark", "reranker")
- location     a directory or workspace path (e.g. "D:/Projects/hive-mind")

DO NOT EXTRACT:
- pronouns, demonstratives ("this", "that", "these")
- generic verbs at sentence start ("Add", "Update", "Run")
- standalone acronyms shorter than 4 chars ("API", "CLI", "MCP", "JSON")
- weekdays, months, dates
- common English words
- fragments — if you'd struggle to write a wiki page about it, skip it

QUALITY BAR: ~3-8 high-signal entities per frame is typical. If a frame is short or non-substantive, return zero entities for it (just don't emit lines for it).

Output JSONL only. No prose, no markdown fences, no commentary.`;

interface FrameInput {
  id: number;
  content: string;
}

/** Builds the user-message text for one batch. */
function buildBatchPrompt(frames: ReadonlyArray<FrameInput>): string {
  const sep = '='.repeat(60);
  const blocks = frames.map((f) => {
    const trimmed = f.content.trim();
    const body = trimmed.length > MAX_FRAME_CHARS
      ? `${trimmed.slice(0, MAX_FRAME_CHARS)}\n[...frame truncated for extraction; ${trimmed.length - MAX_FRAME_CHARS} chars omitted]`
      : trimmed;
    return `${sep}\nFRAME id=${f.id}\n${sep}\n${body}`;
  }).join('\n\n');
  return `${PROMPT_INSTRUCTIONS}\n\n${blocks}\n\n=== END OF FRAMES ===\n\nNow output JSONL:`;
}

/**
 * Strips a fenced code block the model sometimes adds despite instructions.
 * Returns the inner content if a single \`\`\`...\`\`\` block wraps everything,
 * else the original text.
 */
function unwrapFencedBlock(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json|jsonl)?\s*\n([\s\S]*?)\n```\s*$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

/**
 * Parses LLM JSONL output into typed entities. Per-line tolerance: a single
 * malformed line never aborts the batch. Dropped lines:
 *  - unparseable JSON
 *  - frame_id not in this batch (the model invented one — unattributable)
 *  - type outside KG_ENTITY_TYPES (stricter than OSS, which coerced to
 *    'concept' — validate at the boundary instead of laundering junk types)
 *  - names failing the write-time noise filter (isNoiseName)
 *  - names carrying an injection payload (scanned BEFORE returning — LLM
 *    output over harvested content is tainted input)
 */
function parseJsonlOutput(raw: string, validFrameIds: ReadonlySet<number>): KgEntity[] {
  const entities: KgEntity[] = [];
  const cleaned = unwrapFencedBlock(raw);

  for (const line of cleaned.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('{')) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    const frameId = Number(parsed.frame_id);
    if (!Number.isFinite(frameId) || !validFrameIds.has(frameId)) continue;

    const name = typeof parsed.name === 'string' ? parsed.name.trim() : '';
    if (name.length < 2) continue;
    // Write-time noise filter (oss-drift R3 — first wiring): stop tokens,
    // sub-4-char names, single-word acronyms never enter the graph.
    if (isNoiseName(name)) continue;

    const rawType = typeof parsed.type === 'string' ? parsed.type.toLowerCase().trim() : '';
    if (!(KG_ENTITY_TYPES as readonly string[]).includes(rawType)) continue;

    const scan = scanForInjection(name, 'tool_output');
    if (!scan.safe) {
      log.warn('dropping extracted entity name with injection payload', { flags: scan.flags.join(',') });
      continue;
    }

    entities.push({ frameId, name, type: rawType as KgEntityType });
  }

  return entities;
}

/**
 * Extract typed KG entities from N frames via the LLM. Internally batches
 * into groups of BATCH_SIZE, one 'fast'-tier call per batch. Per-batch
 * failures are collected into `errors`, never thrown.
 */
export async function extractKgEntities(
  datedFrames: ReadonlyArray<FrameInput>,
  llmCall: LLMCallFn,
): Promise<KgEntityExtraction> {
  const out: KgEntityExtraction = { entities: [], errors: [] };
  if (datedFrames.length === 0) return out;

  for (let i = 0; i < datedFrames.length; i += BATCH_SIZE) {
    const batch = datedFrames.slice(i, i + BATCH_SIZE);
    const validIds = new Set(batch.map((f) => f.id));
    try {
      const raw = await llmCall(buildBatchPrompt(batch), 'fast');
      out.entities.push(...parseJsonlOutput(raw, validIds));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      out.errors.push(`kg-entities batch ${i / BATCH_SIZE} (frames ${batch[0].id}..${batch[batch.length - 1].id}): ${msg}`);
      log.warn('kg-entity extraction batch failed', { batch: i / BATCH_SIZE, error: msg });
    }
  }

  return out;
}

// ── Graph writing ────────────────────────────────────────────────────────────

export interface WriteKgEntitiesResult {
  /** New knowledge_entities rows. */
  created: number;
  /** Existing entities whose seen_count was bumped (exact-name dedup hit). */
  updated: number;
}

function safeParseProps(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

/**
 * Persist extracted entities into the knowledge graph.
 *
 * Dedup is exact-name via `kg.findEntityByName()` (oss-drift R2) — NEVER the
 * LIKE-based `searchEntities` top-K, which silently drops the exact match once
 * enough similarly-named entities accumulate (3506 duplicate "Phase" rows
 * observed in the OSS repo). On a hit, seen_count is bumped the same way the
 * cognify CLI does; on a miss, a new row is created with source 'cognify-llm'
 * (the tag that distinguishes LLM-grade entities from heuristic noise).
 */
export function writeKgEntities(
  kg: KnowledgeGraph,
  extraction: KgEntityExtraction,
): WriteKgEntitiesResult {
  const result: WriteKgEntitiesResult = { created: 0, updated: 0 };

  for (const entity of extraction.entities) {
    // Defense at the write seam (mirrors the cognify CLI): callers other than
    // extractKgEntities may not have noise-filtered.
    if (isNoiseName(entity.name)) continue;
    if (normalizeEntityName(entity.name).length < 3) continue;

    const existing = kg.findEntityByName(entity.name);
    if (existing) {
      const existingProps = safeParseProps(existing.properties);
      const seenCount = Number(existingProps.seen_count ?? 1) + 1;
      kg.updateEntity(existing.id, {
        properties: { ...existingProps, seen_count: seenCount },
      });
      kg.linkEntityToFrame(existing.id, entity.frameId);
      result.updated++;
    } else {
      try {
        const created = kg.createEntity(entity.type, entity.name, { seen_count: 1, source: 'cognify-llm' });
        kg.linkEntityToFrame(created.id, entity.frameId);
        result.created++;
      } catch (e: unknown) {
        // Ontology validation may reject — skip this entity, never abort the pass.
        log.warn('createEntity rejected extracted entity', {
          name: entity.name,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  return result;
}
