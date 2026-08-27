/**
 * `hive-mind-cli cognify` — extract entities and relations from recent
 * frames into the knowledge graph. High-quality extraction requires an
 * LLM, so this command is a deliberately small heuristic pass suitable
 * for a nightly cron: it walks new frames, pulls capitalized noun
 * phrases, normalizes them, and creates/updates KG entities. Callers
 * who want richer extraction should run the MCP `save_entity` tool
 * with an LLM-driven agent instead.
 */

import { openPersonalMind, type CliEnv } from '../setup.js';
import {
  isNoiseName,
  normalizeEntityName,
  scanForInjection,
} from '@waggle/hive-mind-core';

export interface CognifyOptions {
  /** Process frames with id > since. Defaults to last cognify watermark or 0. */
  since?: number;
  limit?: number;
  env?: CliEnv;
}

export interface CognifyResult {
  framesScanned: number;
  entitiesCreated: number;
  entitiesUpdated: number;
  lastFrameId: number;
}

// Heuristic: consecutive capitalised words with optional connectors.
// Deliberately conservative — we prefer to miss entities than to create noise.
const ENTITY_PATTERN = /\b([A-Z][a-zA-Z]+(?:\s+(?:de|of|&)\s+|\s+)[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g;
const SIMPLE_ENTITY_PATTERN = /\b([A-Z][a-zA-Z]{2,})\b/g;
const WATERMARK_KEY = 'cli_cognify_last_frame_id';
const DEFAULT_LIMIT = 500;

// Skip common sentence-starts and pronouns that the naive regex catches.
const STOP_TOKENS = new Set([
  'The', 'This', 'That', 'These', 'Those', 'When', 'Where', 'Why', 'How',
  'What', 'Who', 'Which', 'If', 'And', 'But', 'Or', 'So', 'For', 'Nor',
  'Yet', 'As', 'At', 'By', 'On', 'In', 'To', 'From', 'With', 'Without',
  'Into', 'Onto', 'Upon', 'Over', 'Under', 'Between', 'Among',
]);

function extractCandidateEntities(text: string): string[] {
  const seen = new Set<string>();

  // Multi-word candidates first (more specific — Project Alpha, Acme Corp).
  for (const match of text.matchAll(ENTITY_PATTERN)) {
    const candidate = match[1].trim();
    if (candidate.length >= 4) seen.add(candidate);
  }

  // Single-word candidates — filter stop words.
  for (const match of text.matchAll(SIMPLE_ENTITY_PATTERN)) {
    const candidate = match[1].trim();
    if (STOP_TOKENS.has(candidate)) continue;
    if (candidate.length < 3) continue;
    seen.add(candidate);
  }

  return [...seen];
}

export async function runCognify(options: CognifyOptions = {}): Promise<CognifyResult> {
  if (options.since !== undefined &&
      (!Number.isSafeInteger(options.since) || options.since < 0)) {
    throw new RangeError('cognify since must be a nonnegative safe integer');
  }
  const limit = options.limit === undefined ? DEFAULT_LIMIT : options.limit;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError('cognify limit must be a positive safe integer');
  }

  const env = options.env ?? openPersonalMind();
  const close = options.env ? () => { /* caller owns */ } : env.close;

  try {
    return env.frames.runInTransaction(() => {
      const raw = env.db.getDatabase();
      const explicitSince = options.since !== undefined;
      const stored = explicitSince
        ? undefined
        : raw.prepare('SELECT value FROM meta WHERE key = ?')
          .get(WATERMARK_KEY) as { value: string } | undefined;
      const storedWatermark = stored ? Number(stored.value) : 0;
      const since = explicitSince
        ? options.since!
        : Number.isSafeInteger(storedWatermark) && storedWatermark >= 0
          ? storedWatermark
          : 0;

      const frames = raw.prepare(
        'SELECT id, content FROM memory_frames WHERE id > ? ORDER BY id ASC LIMIT ?',
      ).all(since, limit) as { id: number; content: string }[];
      const linkFrame = raw.prepare(
        'INSERT OR IGNORE INTO kg_entity_frames (entity_id, frame_id) VALUES (?, ?)',
      );

      let entitiesCreated = 0;
      let entitiesUpdated = 0;
      let lastFrameId = since;

      for (const frame of frames) {
        lastFrameId = Math.max(lastFrameId, frame.id);
        const candidates = extractCandidateEntities(frame.content);

        for (const name of candidates) {
          if (isNoiseName(name)) continue;
          if (normalizeEntityName(name).length < 3) continue;
          if (!scanForInjection(name, 'tool_output').safe) continue;

          // Dedup by exact name match — we conservatively classify everything
          // as 'concept' because the heuristic can't tell person from org reliably.
          const existing = env.kg.findEntityByName(name);

          if (existing) {
            // Count distinct source frames, not repeated scans of one frame.
            const linked = linkFrame.run(existing.id, frame.id);
            if (linked.changes === 0) continue;
            const existingProps = safeParse(existing.properties);
            const previousSeenCount = Number(existingProps.seen_count ?? 1);
            const seenCount = (Number.isFinite(previousSeenCount) && previousSeenCount >= 0
              ? previousSeenCount
              : 1) + 1;
            env.kg.updateEntity(existing.id, {
              properties: { ...existingProps, seen_count: seenCount },
            });
            entitiesUpdated++;
          } else {
            let created: { id: number };
            try {
              created = env.kg.createEntity('concept', name, {
                seen_count: 1,
                source: 'cognify',
              });
            } catch (error) {
              if (error instanceof Error && error.message.startsWith('Validation failed:')) {
                continue;
              }
              throw error;
            }
            const linked = linkFrame.run(created.id, frame.id);
            if (linked.changes !== 1) {
              throw new Error(`cognify failed to link entity ${created.id} to frame ${frame.id}`);
            }
            entitiesCreated++;
          }
        }
      }

      if (!explicitSince && frames.length > 0) {
        raw.prepare(
          `INSERT INTO meta (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ).run(WATERMARK_KEY, String(lastFrameId));
      }

      return {
        framesScanned: frames.length,
        entitiesCreated,
        entitiesUpdated,
        lastFrameId,
      };
    });
  } finally {
    close();
  }
}

function safeParse(raw: string | undefined | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}
