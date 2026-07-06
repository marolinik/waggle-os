/**
 * `hive-mind-cli maintenance` — batch maintenance ops for a nightly
 * cron. Composes FrameStore.compact + optional wipe-imports + index
 * reconciliation + re-embed + re-chunk + KG entity dedup + P/B consolidation
 * + KG cognify + wiki compile behind a single flag surface.
 *
 * The per-mind ops (compact / wipe-imports / reconcile / reembed-all /
 * rechunk-all / dedupe-entities / consolidate) are factored into
 * runMaintenanceOnMind(db, frames, embedder) so the same code path serves the
 * personal mind and any workspace mind (--workspace / --all-workspaces).
 * Ported from hive-mind a99ea0e.
 */

import * as fs from 'node:fs';
import { spawn } from 'node:child_process';
import { openPersonalMind, type CliEnv } from '../setup.js';
import {
  reconcileIndexes,
  HybridSearch,
  MindDB,
  FrameStore,
  KnowledgeGraph,
  maxEmbedCharsForModel,
  capEmbedText,
  collectObservations,
  detectSupersessionChains,
  detectEntityGroups,
  applyConsolidation,
  type ConsolidationLlm,
  type EmbeddingProviderInstance,
} from '@waggle/hive-mind-core';
import { runCognify } from './cognify.js';
import { runCompileWiki } from './compile-wiki.js';

export interface MaintenanceOptions {
  compact?: boolean;
  wipeImports?: boolean;
  reconcile?: boolean;
  /**
   * Purge memory_frames_vec and re-embed every frame. Use after a period
   * of running with provider=mock (vec rows are byte-hash garbage in that
   * state) or after switching to a higher-quality embedder. Idempotent.
   * Costs one embed call per frame (~30-100ms each on local Ollama).
   * Ported from hive-mind a99ea0e.
   */
  reembedAll?: boolean;
  /**
   * Re-chunk every frame: paragraph-split content, embed each chunk into
   * memory_frame_chunks_vec. Provides the precision boost that whole-frame
   * embeddings can't deliver on domain-homogeneous corpora. Idempotent —
   * existing chunks for each frame are dropped before re-insertion.
   * Costs one embed call per chunk (~3 chunks/frame avg → ~3x reembed cost).
   * Ported from hive-mind a99ea0e.
   */
  rechunkAll?: boolean;
  /**
   * Merge duplicate KG entities that share a normalized name + type: re-point
   * the duplicates' relations onto the survivor, sum seen_count, retire the
   * dups. Idempotent. Ported from hive-mind a99ea0e.
   */
  dedupeEntities?: boolean;
  /**
   * Consolidate the dormant P/B frame types: LLM-detect supersession chains
   * (deprecate stale I-frames + emit a clean-valued P-frame) and enumerable
   * entity groups (emit a B-frame referencing every member), then vec-index the
   * new frames. Opt-in — requires an LLM (see `consolidateModel`).
   */
  consolidate?: boolean;
  /**
   * LLM model for --consolidate. An OpenAI-style id (e.g. `gpt-4o-mini`, with
   * OPENAI_API_KEY set) routes to the OpenAI chat API — the executor the
   * benchmark validated with. Anything else (or omitted) uses the zero-key
   * `claude -p` subprocess.
   */
  consolidateModel?: string;
  /** Max observations fed to the consolidation LLM (default 400). */
  consolidateLimit?: number;
  cognify?: boolean;
  wiki?: boolean;
  maxTempAgeDays?: number;
  maxDeprecatedAgeDays?: number;
  /**
   * Run maintenance against a workspace mind instead of personal. Mutually
   * exclusive with allWorkspaces. Workspace must already exist.
   * Ported from hive-mind a99ea0e.
   */
  workspace?: string;
  /**
   * Iterate every registered workspace mind. Personal is NOT included by
   * default — run a separate invocation for that. Per-workspace failures
   * are logged but don't abort the loop. Ported from hive-mind a99ea0e.
   */
  allWorkspaces?: boolean;
  env?: CliEnv;
}

export interface MaintenanceResult {
  compact?: {
    temporaryPruned: number;
    deprecatedPruned: number;
    pframesMerged: number;
  };
  wipeImports?: {
    framesDeleted: number;
  };
  reconcile?: {
    ftsFixed: number;
    vecFixed: number;
  };
  reembedAll?: {
    framesEmbedded: number;
    activeProvider: string;
    modelName: string;
    durationMs: number;
  };
  rechunkAll?: {
    framesProcessed: number;
    chunksCreated: number;
    activeProvider: string;
    modelName: string;
    durationMs: number;
  };
  dedupeEntities?: {
    groups: number;
    merged: number;
  };
  consolidate?: {
    chains: number;
    groups: number;
    pframes: number;
    bframes: number;
    deprecated: number;
  };
  cognify?: {
    framesScanned: number;
    entitiesCreated: number;
    entitiesUpdated: number;
  };
  wiki?: {
    provider: string;
    pagesCreated: number;
    pagesUpdated: number;
    pagesUnchanged: number;
  };
  durationMs: number;
}

// ── Per-mind re-embed / re-chunk (ported from hive-mind a99ea0e) ────────────

/**
 * Re-embed every frame in a mind. Wipes memory_frames_vec then batch-embeds
 * via the supplied provider. Refuses to run with provider=mock — re-embedding
 * with mock would just rewrite the same byte-hash garbage and waste IO.
 *
 * Takes primitives (db + embedder) rather than CliEnv so the same code path
 * serves personal and workspace minds.
 */
async function runReembedAllOnMind(db: MindDB, embedder: EmbeddingProviderInstance): Promise<MaintenanceResult['reembedAll']> {
  const start = Date.now();
  const status = embedder.getStatus();

  if (status.activeProvider === 'mock') {
    throw new Error(
      'Refusing to --reembed-all with active provider=mock. ' +
      'Set OLLAMA_URL or another real provider first, then re-run.',
    );
  }

  const raw = db.getDatabase();
  const activeFp = {
    provider: status.activeProvider,
    model: status.modelName,
    dim: embedder.dimensions,
  };
  const frames = raw
    .prepare("SELECT id, content FROM memory_frames WHERE importance != 'deprecated' ORDER BY id ASC")
    .all() as Array<{ id: number; content: string }>;

  if (frames.length === 0) {
    return { framesEmbedded: 0, activeProvider: status.activeProvider, modelName: status.modelName, durationMs: Date.now() - start };
  }

  // If the embedding dimension changed, vec0 columns can't be ALTERed — DROP +
  // CREATE both vec tables at the new dim (the remediation for an
  // EmbeddingDimMismatchError). Otherwise just wipe whole-frame vectors so a
  // partial failure leaves the table empty (next reconcile refills it).
  const stored = db.getEmbeddingFingerprint();
  if (stored && stored.dim !== activeFp.dim) {
    db.recreateVecTables(activeFp.dim);
    process.stderr.write(
      `[reembed-all] embedding dim changed ${stored.dim} → ${activeFp.dim}; recreated vec tables. ` +
        `Run --rechunk-all to rebuild chunk vectors.\n`,
    );
  } else {
    raw.prepare('DELETE FROM memory_frames_vec').run();
  }

  // Batch embed in chunks of 32 — Ollama is fastest with small batches and
  // memory stays bounded. sqlite-vec quirk: rowid must be a literal SQL
  // integer, not a bound parameter. Inlining the id matches core/search.ts.
  //
  // Two robustness measures from the audit:
  //   1. Truncate to MAX_EMBED_CHARS — nomic-embed-text's context blows up on
  //      long frames (synthesis bundles, session handoffs).
  //   2. Per-frame fallback to single embed when batch fails — without this,
  //      one oversize frame would silently poison all 31 batchmates with mock
  //      embeddings (the embedder catches batch errors and substitutes mock
  //      for the whole batch).
  const BATCH = 32;
  const modelName = embedder.getStatus().modelName;
  // Shared with the core embedding provider so the cap can never drift.
  const MAX_EMBED_CHARS = maxEmbedCharsForModel(modelName);
  const f32ToBlob = (vec: Float32Array): Buffer => Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
  const prepText = (s: string): string => capEmbedText(s, MAX_EMBED_CHARS);

  let embedded = 0;
  let truncated = 0;
  for (const f of frames) if (f.content.length > MAX_EMBED_CHARS) truncated++;

  for (let i = 0; i < frames.length; i += BATCH) {
    const slice = frames.slice(i, i + BATCH);
    const texts = slice.map((f) => prepText(f.content));

    let vectors: Float32Array[];
    try {
      // Direct per-text calls surface real failures instead of the noisy
      // batch-wide mock fallback in EmbeddingProviderInstance.embedBatch.
      vectors = await Promise.all(texts.map((t) => embedder.embed(t)));
    } catch (err) {
      // Single-call paths also fall back to mock inside embedder.embed().
      // Treat this as a hard skip and continue — better to leave a frame
      // un-embedded than to insert mock noise. Reconcile can re-try later.
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[reembed-all] batch ${i / BATCH} failed entirely: ${msg}\n`);
      continue;
    }

    const tx = raw.transaction(() => {
      for (let j = 0; j < slice.length; j++) {
        const id = slice[j].id;
        if (!Number.isInteger(id) || id <= 0) continue;
        raw
          .prepare(`INSERT INTO memory_frames_vec (rowid, embedding) VALUES (${id}, ?)`)
          .run(f32ToBlob(vectors[j]));
      }
    });
    tx();
    embedded += slice.length;
  }

  if (truncated > 0) {
    process.stderr.write(`[reembed-all] ${truncated} frame(s) > ${MAX_EMBED_CHARS} chars were truncated for embedding\n`);
  }

  // Record the fingerprint of the embedder that produced these vectors so the
  // dim guard matches (and a later model swap is detected) on the next open.
  db.setEmbeddingFingerprint(activeFp);

  return {
    framesEmbedded: embedded,
    activeProvider: status.activeProvider,
    modelName: status.modelName,
    durationMs: Date.now() - start,
  };
}

/**
 * Re-chunk every frame: split content into ~500-token paragraphs, embed
 * each chunk into memory_frame_chunks_vec. Refuses to run with mock provider
 * (would just write byte-hash garbage). Idempotent per-frame —
 * indexChunksForFrame deletes existing chunks before re-inserting.
 *
 * Takes primitives (db + embedder) so the same path runs against personal
 * or workspace minds.
 */
async function runRechunkAllOnMind(db: MindDB, embedder: EmbeddingProviderInstance): Promise<MaintenanceResult['rechunkAll']> {
  const start = Date.now();
  const status = embedder.getStatus();

  if (status.activeProvider === 'mock') {
    throw new Error(
      'Refusing to --rechunk-all with active provider=mock. ' +
      'Set OLLAMA_URL or another real provider first, then re-run.',
    );
  }

  const search = new HybridSearch(db, embedder);
  const raw = db.getDatabase();
  const frames = raw
    .prepare("SELECT id, content FROM memory_frames WHERE importance != 'deprecated' ORDER BY id ASC")
    .all() as Array<{ id: number; content: string }>;

  let framesProcessed = 0;
  let chunksCreated = 0;

  for (const f of frames) {
    try {
      const n = await search.indexChunksForFrame(f.id, f.content);
      framesProcessed++;
      chunksCreated += n;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[rechunk-all] frame ${f.id} failed: ${msg}\n`);
      // Continue — one bad frame shouldn't abort the whole batch.
    }
  }

  return {
    framesProcessed,
    chunksCreated,
    activeProvider: status.activeProvider,
    modelName: status.modelName,
    durationMs: Date.now() - start,
  };
}

// ── P/B consolidation executor ─────────────────────────────────────────────
// The core supersede.ts module is provider-agnostic (pure) — the LLM transport
// lives here at the call site. Default: zero-key `claude -p` subprocess. An
// OpenAI-style model id + OPENAI_API_KEY routes to the OpenAI chat API — the
// executor the benchmark validated with.

/**
 * Spawn `claude -p --output-format=text` and resolve its stdout. Zero API key
 * (uses the operator's Claude Code subscription), HIVE_MIND_NO_SYNTH=1 so the
 * child's Stop hook doesn't enqueue a successor synth task.
 */
function spawnClaudeText(prompt: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format=text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // claude on Windows is a .cmd shim; spawn needs shell:true to find it.
      shell: process.platform === 'win32',
      env: { ...process.env, HIVE_MIND_NO_SYNTH: '1' },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
      reject(new Error(`claude -p timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`spawn claude failed: ${err.message}`));
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`claude -p exited ${code}: ${stderr.slice(0, 300)}`));
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

/**
 * OpenAI chat completion with JSON-object response format — the executor the
 * consolidation benchmark validated with (temperature 0, deterministic). Local
 * fetch helper (NOT in core); requires OPENAI_API_KEY.
 */
async function callOpenAIChat(model: string, system: string, user: string, timeoutMs = 120_000): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('consolidation --consolidate-model requires OPENAI_API_KEY');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`openai ${res.status}: ${text.slice(0, 200)}`);
    return (JSON.parse(text).choices?.[0]?.message?.content ?? '').trim();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the LLM callback injected into the consolidation passes. An OpenAI-style
 * model id routes to the OpenAI API; anything else falls back to the zero-key
 * `claude -p` subprocess (system + user folded into one prompt).
 */
function buildConsolidationLlm(model?: string): ConsolidationLlm {
  if (model && /^(gpt-|o[0-9])/.test(model)) {
    return (system, user) => callOpenAIChat(model, system, user);
  }
  return (system, user) => spawnClaudeText(`${system}\n\n${user}`);
}

/**
 * Human-readable text to vec-index a B-frame under (its stored content is JSON,
 * which embeds poorly). Mirrors the benchmark's `<desc>: bridge of N items`.
 */
function bridgeIndexText(frame: { content: string }): string {
  try {
    const parsed = JSON.parse(frame.content) as { description?: string; references?: unknown[] };
    const n = Array.isArray(parsed.references) ? parsed.references.length : 0;
    return `${parsed.description ?? 'group'}: bridge of ${n} items`;
  } catch {
    return frame.content;
  }
}

/**
 * Run the P/B consolidation pass on one mind: gather I-frame observations, LLM-
 * detect supersession chains + entity groups, apply them (deprecate stale +
 * emit P/B frames), then vec-index the new frames — createPFrame/createBFrame
 * index FTS only, so this step is what makes them semantically recallable.
 *
 * New P/B frames are anchored to the gop of the most-recent observation (a
 * guaranteed-valid session gop_id; the "current value" belongs to the latest
 * session), while their base/references still point at the original source
 * frames — which may be cross-gop.
 *
 * Refactored to take (db, frames, embedder) so it composes with the per-mind
 * dispatch path. Ported from hive-mind a99ea0e.
 */
async function runConsolidateOnMind(
  db: MindDB,
  frames: FrameStore,
  embedder: EmbeddingProviderInstance,
  options: MaintenanceOptions,
): Promise<NonNullable<MaintenanceResult['consolidate']>> {
  const empty = { chains: 0, groups: 0, pframes: 0, bframes: 0, deprecated: 0 };
  const observations = collectObservations(db, { limit: options.consolidateLimit ?? 400 });
  if (observations.length < 2) return empty;

  // Anchor gop = newest non-deprecated I-frame's session.
  const anchor = db
    .getDatabase()
    .prepare(
      "SELECT gop_id FROM memory_frames WHERE frame_type = 'I' AND importance != 'deprecated' ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .get() as { gop_id: string } | undefined;
  if (!anchor) return empty;

  const llm = buildConsolidationLlm(options.consolidateModel);
  const [chains, groups] = await Promise.all([
    detectSupersessionChains(observations, llm),
    detectEntityGroups(observations, llm),
  ]);
  const { pframes, bframes, deprecated } = applyConsolidation(frames, chains, groups, anchor.gop_id);

  const toIndex = [
    ...pframes.map((f) => ({ id: f.id, content: f.content })),
    ...bframes.map((f) => ({ id: f.id, content: bridgeIndexText(f) })),
  ];
  if (toIndex.length > 0) {
    try {
      await new HybridSearch(db, embedder).indexFramesBatch(toIndex);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[consolidate] vec-index failed (frames remain FTS-searchable): ${msg}\n`);
    }
  }

  return {
    chains: chains.length,
    groups: groups.length,
    pframes: pframes.length,
    bframes: bframes.length,
    deprecated: deprecated.length,
  };
}

/**
 * Subset of maintenance ops that operate purely on a MindDB+embedder pair (no
 * CliEnv-specific state). Used by both the personal and workspace dispatch
 * paths so the per-mind body stays in one place. Ported from hive-mind a99ea0e.
 *
 * Skipped here (handled at the higher level): cognify and wiki. In this
 * monorepo runCognify / runCompileWiki are personal-scoped (they don't accept
 * a workspace id), so they only run on the personal path — see
 * runMaintenanceOnPersonal.
 */
async function runMaintenanceOnMind(
  db: MindDB,
  frames: FrameStore,
  embedder: EmbeddingProviderInstance,
  options: MaintenanceOptions,
  result: MaintenanceResult,
): Promise<void> {
  if (options.compact) {
    const r = frames.compact(
      options.maxTempAgeDays ?? 30,
      options.maxDeprecatedAgeDays ?? 90,
    );
    result.compact = {
      temporaryPruned: r.temporaryPruned,
      deprecatedPruned: r.deprecatedPruned,
      pframesMerged: r.pframesMerged,
    };
  }

  if (options.wipeImports) {
    const raw = db.getDatabase();
    const countRow = raw
      .prepare("SELECT COUNT(*) as cnt FROM memory_frames WHERE source = 'import'")
      .get() as { cnt: number };

    if (countRow.cnt > 0) {
      const frameIds = raw
        .prepare("SELECT id FROM memory_frames WHERE source = 'import'")
        .all() as { id: number }[];

      const tx = raw.transaction(() => {
        for (const { id } of frameIds) {
          raw.prepare('DELETE FROM memory_frames_fts WHERE rowid = ?').run(id);
          try {
            raw.prepare('DELETE FROM memory_frames_vec WHERE rowid = ?').run(id);
          } catch { /* vec optional */ }
        }
        raw.prepare("DELETE FROM memory_frames WHERE source = 'import'").run();
      });
      tx();
    }

    result.wipeImports = { framesDeleted: countRow.cnt };
  }

  if (options.reconcile) {
    const r = await reconcileIndexes(db, embedder);
    result.reconcile = { ftsFixed: r.ftsFixed, vecFixed: r.vecFixed };
  }

  if (options.reembedAll) {
    result.reembedAll = await runReembedAllOnMind(db, embedder);
  }

  if (options.rechunkAll) {
    result.rechunkAll = await runRechunkAllOnMind(db, embedder);
  }

  if (options.dedupeEntities) {
    result.dedupeEntities = new KnowledgeGraph(db).dedupeByName();
  }

  if (options.consolidate) {
    result.consolidate = await runConsolidateOnMind(db, frames, embedder, options);
  }
}

export async function runMaintenance(options: MaintenanceOptions): Promise<MaintenanceResult> {
  if (options.allWorkspaces) {
    return runMaintenanceAllWorkspaces(options);
  }
  if (options.workspace) {
    return runMaintenanceOnWorkspace(options.workspace, options);
  }
  return runMaintenanceOnPersonal(options);
}

async function runMaintenanceOnPersonal(options: MaintenanceOptions): Promise<MaintenanceResult> {
  const env = options.env ?? openPersonalMind();
  const close = options.env ? () => { /* caller owns */ } : env.close;
  const start = Date.now();
  const result: MaintenanceResult = { durationMs: 0 };

  try {
    const embedder = await env.getEmbedder();
    await runMaintenanceOnMind(env.db, env.frames, embedder, options, result);

    if (options.cognify) {
      const r = await runCognify({ env });
      result.cognify = {
        framesScanned: r.framesScanned,
        entitiesCreated: r.entitiesCreated,
        entitiesUpdated: r.entitiesUpdated,
      };
    }

    if (options.wiki) {
      const r = await runCompileWiki({ env });
      result.wiki = {
        provider: r.provider,
        pagesCreated: r.pagesCreated,
        pagesUpdated: r.pagesUpdated,
        pagesUnchanged: r.pagesUnchanged,
      };
    }

    result.durationMs = Date.now() - start;
    return result;
  } finally {
    close();
  }
}

/**
 * Run the per-mind maintenance ops against a single workspace mind. cognify /
 * wiki are intentionally NOT run here — they are personal-scoped commands in
 * this monorepo (see runMaintenanceOnMind). Ported from hive-mind a99ea0e.
 */
async function runMaintenanceOnWorkspace(workspaceId: string, options: MaintenanceOptions): Promise<MaintenanceResult> {
  const env = options.env ?? openPersonalMind();
  const close = options.env ? () => { /* caller owns */ } : env.close;
  const start = Date.now();
  const result: MaintenanceResult = { durationMs: 0 };

  try {
    const wm = env.workspaces;
    const ws = wm.get(workspaceId);
    if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);
    const mindPath = wm.getMindPath(workspaceId);
    if (!fs.existsSync(mindPath)) {
      throw new Error(`Workspace mind file missing: ${mindPath}. Save at least one memory to materialise it.`);
    }

    const embedder = await env.getEmbedder();
    const wsDb = new MindDB(mindPath);
    try {
      const wsFrames = new FrameStore(wsDb);
      await runMaintenanceOnMind(wsDb, wsFrames, embedder, options, result);
      result.durationMs = Date.now() - start;
      return result;
    } finally {
      wsDb.close();
    }
  } finally {
    close();
  }
}

/**
 * Run the per-mind maintenance ops against every registered workspace mind,
 * summing the headline counts. Per-workspace failures are logged and skipped.
 * cognify / wiki are personal-scoped and not run here. Ported from
 * hive-mind a99ea0e.
 */
async function runMaintenanceAllWorkspaces(options: MaintenanceOptions): Promise<MaintenanceResult> {
  const env = options.env ?? openPersonalMind();
  const close = options.env ? () => { /* caller owns */ } : env.close;
  const start = Date.now();
  const aggregate: MaintenanceResult = { durationMs: 0 };

  // Per-mind aggregation. Ops like reembed-all report a 'framesEmbedded' count —
  // sum across workspaces and let the caller see the headline number.
  let totalEmbedded = 0;
  let totalFramesProcessed = 0;
  let totalChunks = 0;
  let totalReconcileFts = 0;
  let totalReconcileVec = 0;

  try {
    const embedder = await env.getEmbedder();
    for (const ws of env.workspaces.list()) {
      const mindPath = env.workspaces.getMindPath(ws.id);
      if (!fs.existsSync(mindPath)) continue;
      try {
        const wsDb = new MindDB(mindPath);
        try {
          const wsFrames = new FrameStore(wsDb);
          const wsResult: MaintenanceResult = { durationMs: 0 };
          await runMaintenanceOnMind(wsDb, wsFrames, embedder, options, wsResult);
          if (wsResult.reembedAll) {
            totalEmbedded += wsResult.reembedAll.framesEmbedded;
            // Take the last seen provider/model — identical across minds since
            // we share one embedder instance.
            aggregate.reembedAll = {
              framesEmbedded: totalEmbedded,
              activeProvider: wsResult.reembedAll.activeProvider,
              modelName: wsResult.reembedAll.modelName,
              durationMs: (aggregate.reembedAll?.durationMs ?? 0) + wsResult.reembedAll.durationMs,
            };
          }
          if (wsResult.rechunkAll) {
            totalFramesProcessed += wsResult.rechunkAll.framesProcessed;
            totalChunks += wsResult.rechunkAll.chunksCreated;
            aggregate.rechunkAll = {
              framesProcessed: totalFramesProcessed,
              chunksCreated: totalChunks,
              activeProvider: wsResult.rechunkAll.activeProvider,
              modelName: wsResult.rechunkAll.modelName,
              durationMs: (aggregate.rechunkAll?.durationMs ?? 0) + wsResult.rechunkAll.durationMs,
            };
          }
          if (wsResult.reconcile) {
            totalReconcileFts += wsResult.reconcile.ftsFixed;
            totalReconcileVec += wsResult.reconcile.vecFixed;
            aggregate.reconcile = { ftsFixed: totalReconcileFts, vecFixed: totalReconcileVec };
          }
        } finally {
          wsDb.close();
        }
      } catch (err) {
        // One bad workspace shouldn't abort the loop. Surface and continue.
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[maintenance] workspace ${ws.id} failed: ${msg}\n`);
      }
    }

    aggregate.durationMs = Date.now() - start;
    return aggregate;
  } finally {
    close();
  }
}
