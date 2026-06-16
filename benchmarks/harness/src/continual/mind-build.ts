/**
 * Mode-1 shared-mind builder: run a Phase-A artifact stream through the
 * PRODUCTION write path, freeze the result read-only to a file, and hash it
 * (02 §11; 03 C3).
 *
 * Neutrality (03 C3): the builder is a DETERMINISTIC, non-LLM extraction — it
 * banks the artifacts it is handed verbatim (each tagged with its transfer
 * mechanism M1..M4). No subject-model prose is synthesized here, so the frozen
 * mind is model-neutral by construction and the "byte-identical mind ⇒ the
 * model is the only variable" claim holds. The artifacts themselves are
 * produced upstream (Phase-A run by a NEUTRAL pinned builder; builder-id is
 * recorded). The full firewall (substring + embedding gates over these
 * artifacts) is Plan 06 — this module enforces the substring backbone (02 §5.2)
 * so a gold leak fails the build loudly even before Plan 06 lands.
 *
 * Freeze: frames are written to a :memory: MindDB via FrameStore (the same
 * createIFrame path ingest.ts uses), vector-indexed via HybridSearch, then the
 * logical DB is copied to `outputPath` via better-sqlite3 `db.backup()`. The
 * file is the frozen, read-only-by-convention shared mind. Its hash is the
 * Plan 06 contract hash (mind-hash.ts).
 */

import {
  FrameStore, HybridSearch, MindDB, SessionStore, type Embedder, type Importance,
} from '@waggle/core';
import { resolveHashMind } from './mind-hash.js';

/** A single piece of Phase-A-earned, re-derivable knowledge to bank. */
export interface PhaseAArtifact {
  /** Source task id (provenance). */
  task_id: string;
  /** Transfer mechanism this artifact carries (02 §2). */
  mechanism: 'M1' | 'M2' | 'M3' | 'M4';
  /** Procedure-family cluster id. */
  procedure_family: string;
  /** Recurring-user id for M4 artifacts; null otherwise. */
  recurring_user: string | null;
  /** The text banked into a frame. MUST NOT contain any gold string. */
  content: string;
}

export interface BuildMindInput {
  artifacts: readonly PhaseAArtifact[];
  /** Every Phase-A AND Phase-B gold string — none may appear in any artifact. */
  goldStrings: readonly string[];
  /** Where to freeze the mind. The file is overwritten if present. */
  outputPath: string;
  /** Embedder used for vector indexing (inject a fake in tests). */
  embedder: Embedder;
  /** Provenance id of the neutral builder (recorded per row). */
  builderId: string;
  /** PRNG/order seed (kept for parity + future ordering knobs). Default 42. */
  seed?: number;
}

export interface BuildMindResult {
  mindHash: string;
  outputPath: string;
  frameCount: number;
  builderId: string;
  mechanismCounts: Record<'M1' | 'M2' | 'M3' | 'M4', number>;
}

/** Map a mechanism to a frame importance — durable knowledge banks higher. */
const MECHANISM_IMPORTANCE: Record<PhaseAArtifact['mechanism'], Importance> = {
  M1: 'important',  // skills
  M2: 'important',  // domain facts/policy
  M3: 'normal',     // corrections
  M4: 'normal',     // personalization
};

/** Normalize for substring leak detection: lowercase + collapse whitespace. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function buildAndFreezeMind(input: BuildMindInput): Promise<BuildMindResult> {
  const { artifacts, goldStrings, outputPath, embedder, builderId } = input;
  if (typeof builderId !== 'string' || builderId.trim().length === 0) {
    throw new Error('buildAndFreezeMind requires a non-empty builderId (provenance)');
  }
  // NOTE: do NOT use `Array.isArray(artifacts)` here — it is a type guard that
  // narrows the typed `readonly PhaseAArtifact[]` to `any[]`, which then makes
  // every `art` (and `art.mechanism`) `any` and breaks the typed index access
  // into MECHANISM_IMPORTANCE / mechanismCounts under `strict` (TS7053).
  if (artifacts.length === 0) {
    throw new Error('buildAndFreezeMind requires a non-empty artifacts stream');
  }

  // Firewall backbone (02 §5.2): no gold substring (exact + normalized) in any
  // banked artifact. The richer embedding gate is Plan 06.
  const golds = goldStrings.map(normalize).filter(g => g.length > 0);
  for (const art of artifacts) {
    const norm = normalize(art.content);
    for (const g of golds) {
      if (norm.includes(g)) {
        throw new Error(
          `buildAndFreezeMind: artifact ${art.task_id} contains a gold string — firewall violation`,
        );
      }
    }
  }

  const db = new MindDB(':memory:');
  const frames = new FrameStore(db);
  const sessions = new SessionStore(db);
  const search = new HybridSearch(db, embedder);

  const mechanismCounts: Record<'M1' | 'M2' | 'M3' | 'M4', number> = { M1: 0, M2: 0, M3: 0, M4: 0 };
  const ensured = new Set<string>();
  const toIndex: Array<{ id: number; content: string }> = [];

  try {
    for (const art of artifacts) {
      // gop_id = procedure_family so recall scopes naturally; ensure the FK row.
      const gop = art.procedure_family;
      if (!ensured.has(gop)) {
        sessions.ensure(gop, builderId, `Phase-A family ${gop}`);
        ensured.add(gop);
      }
      const frame = frames.createIFrame(gop, art.content, MECHANISM_IMPORTANCE[art.mechanism], 'agent_inferred');
      toIndex.push({ id: frame.id, content: art.content });
      mechanismCounts[art.mechanism]++;
    }
    await search.indexFramesBatch(toIndex);

    // Freeze: copy the logical DB to outputPath. better-sqlite3 backup() is
    // async and produces a clean single-file image (no WAL sidecar carried).
    for (const suffix of ['', '-wal', '-shm']) {
      try { (await import('node:fs')).unlinkSync(outputPath + suffix); } catch { /* not present */ }
    }
    await db.getDatabase().backup(outputPath);

    const hashMind = resolveHashMind();
    const mindHash = hashMind(db);

    return {
      mindHash,
      outputPath,
      frameCount: toIndex.length,
      builderId,
      mechanismCounts,
    };
  } finally {
    db.close();
  }
}
