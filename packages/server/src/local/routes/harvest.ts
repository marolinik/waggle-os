/**
 * Harvest Routes — Memory Harvest API endpoints.
 *
 * POST /api/harvest/preview — parse input and show what would be imported
 * POST /api/harvest/commit — run full pipeline and save to memory
 * GET  /api/harvest/sources — list registered harvest sources
 * POST /api/harvest/sources — register/update a source
 * POST /api/harvest/scan-claude-code — scan local Claude Code directory
 */

import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  HarvestSourceStore, HarvestRunStore, ChatGPTAdapter, ClaudeAdapter,
  ClaudeCodeAdapter, GeminiAdapter, UniversalAdapter,
  type ImportSourceType, type UniversalImportItem,
  type SourceAdapter, type FilesystemAdapter,
} from '@waggle/core';
import { loadProfile, saveProfile, type IdentitySuggestion } from './profile.js';

/** M-08: where cached input payloads live so we can resume interrupted runs. */
function getHarvestCacheDir(dataDir: string): string {
  return path.join(dataDir, 'harvest-cache');
}

function writeHarvestCache(dataDir: string, cacheKey: string, data: unknown): string {
  const dir = getHarvestCacheDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${cacheKey}.json`);
  fs.writeFileSync(file, JSON.stringify(data), 'utf-8');
  return file;
}

function readHarvestCache(file: string): unknown {
  const raw = fs.readFileSync(file, 'utf-8');
  return JSON.parse(raw);
}

function deleteHarvestCache(file: string | null): void {
  if (!file) return;
  try { fs.unlinkSync(file); } catch { /* already gone */ }
}

function getAdapter(source: ImportSourceType): SourceAdapter {
  switch (source) {
    case 'chatgpt': return new ChatGPTAdapter();
    case 'claude': case 'claude-desktop': return new ClaudeAdapter();
    case 'claude-code': return new ClaudeCodeAdapter();
    case 'gemini': case 'google-ai-studio': return new GeminiAdapter();
    default: return new UniversalAdapter();
  }
}

function isFilesystemAdapter(adapter: SourceAdapter): adapter is FilesystemAdapter {
  return typeof (adapter as FilesystemAdapter).scan === 'function';
}

function getDefaultLocalDir(source: ImportSourceType): string | null {
  switch (source) {
    case 'claude-code': return path.join(os.homedir(), '.claude');
    default: return null;
  }
}

function isScanLocalRequest(data: unknown): boolean {
  return (
    typeof data === 'object' && data !== null &&
    'scanLocal' in data && (data as { scanLocal?: unknown }).scanLocal === true
  );
}

function emitHarvestProgress(data: { phase: string; current: number; total: number; source: string }) {
  const listeners = (globalThis as any).__harvestProgressListeners as Set<(e: Event) => void> | undefined;
  if (!listeners || listeners.size === 0) return;
  const event = new CustomEvent('harvest-progress', { detail: data });
  for (const fn of listeners) fn(event);
}

export async function harvestRoutes(fastify: FastifyInstance) {
  // POST /api/harvest/preview — parse and show extraction preview
  fastify.post('/api/harvest/preview', async (request, reply) => {
    const { data, source } = request.body as { data: unknown; source: ImportSourceType };
    if (!data || !source) {
      return reply.code(400).send({ error: 'data and source are required' });
    }

    const adapter = getAdapter(source);
    const items = adapter.parse(data);

    return {
      source,
      itemCount: items.length,
      types: countByField(items, 'type'),
      preview: items.slice(0, 10).map(i => ({ id: i.id, title: i.title, type: i.type, source: i.source })),
    };
  });

  // POST /api/harvest/commit — run pipeline and save.
  // M-08: wraps the work in a HarvestRunStore row so interrupted runs can
  // be resumed. Input payloads are cached to disk (dataDir/harvest-cache/)
  // before the pipeline starts; the cache is deleted on successful completion
  // and preserved on failure for the UI's resume banner.
  fastify.post('/api/harvest/commit', async (request, reply) => {
    const body = request.body as {
      data?: unknown;
      source?: ImportSourceType;
      /** M-08: resume an existing interrupted run (replays its cached input). */
      resumeFromRun?: number;
    };

    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }
    const runStore = new HarvestRunStore(personalDb);
    const dataDir = fastify.localConfig.dataDir;

    // Branch 1: resume path. Load the prior run's cached data + source and
    // re-enter the normal flow with them. A new run record is NOT created —
    // we reuse the existing row so the UI sees the same id complete.
    let data: unknown;
    let source: ImportSourceType;
    let resumingRunId: number | null = null;

    if (typeof body.resumeFromRun === 'number') {
      const prior = runStore.getById(body.resumeFromRun);
      if (!prior) {
        return reply.code(404).send({ error: `Run ${body.resumeFromRun} not found` });
      }
      if (prior.status === 'completed' || prior.status === 'abandoned') {
        return reply.code(409).send({ error: `Run ${prior.id} is already ${prior.status}` });
      }
      if (!prior.inputCachePath || !fs.existsSync(prior.inputCachePath)) {
        return reply.code(410).send({ error: 'Cached input for this run is no longer available' });
      }
      data = readHarvestCache(prior.inputCachePath);
      source = prior.source;
      resumingRunId = prior.id;
    } else {
      if (!body.data || !body.source) {
        return reply.code(400).send({ error: 'data and source are required' });
      }
      data = body.data;
      source = body.source;
    }

    const adapter = getAdapter(source);

    // Local filesystem scan mode (Claude Code, etc.) — clients send
    // `{ scanLocal: true }` instead of a parsed payload. Route these through
    // the adapter's scan() method against the source's default local dir.
    let items: UniversalImportItem[];
    if (isScanLocalRequest(data)) {
      if (!isFilesystemAdapter(adapter)) {
        return reply.code(400).send({
          error: `Source '${source}' does not support local scan`,
        });
      }
      const dir = getDefaultLocalDir(source);
      if (!dir) {
        return reply.code(400).send({
          error: `No default local directory configured for source '${source}'`,
        });
      }
      items = adapter.scan(dir);
    } else {
      items = adapter.parse(data);
    }

    if (items.length === 0) {
      // Nothing to save. If we were resuming, the run is legitimately done.
      if (resumingRunId !== null) {
        runStore.complete(resumingRunId, 0);
        const prior = runStore.getById(resumingRunId);
        deleteHarvestCache(prior?.inputCachePath ?? null);
      }
      return {
        source,
        itemCount: 0,
        saved: 0,
        message: `No items found for ${source}. Check that the export file or local directory contains content the adapter recognizes.`,
      };
    }

    // M-08: cache input + open a run row before any pipeline work. Skip cache
    // writing when resuming (the cache already exists and is referenced on
    // the prior run row).
    let runId: number;
    let cachePath: string | null = null;
    if (resumingRunId !== null) {
      runId = resumingRunId;
      cachePath = runStore.getById(resumingRunId)?.inputCachePath ?? null;
    } else {
      const cacheKey = randomUUID();
      try {
        cachePath = writeHarvestCache(dataDir, cacheKey, data);
      } catch {
        // Cache write failure is non-fatal — the run just won't be resumable.
        cachePath = null;
      }
      const run = runStore.start(source, items.length, cachePath);
      runId = run.id;
    }

    // Frames have a FK to sessions(gop_id) — ensure the stable `harvest`
    // session row exists before creating any frames, otherwise the insert
    // hits SQLITE_CONSTRAINT_FOREIGNKEY and nothing persists.
    const { FrameStore, SessionStore } = await import('@waggle/core');
    const sessionStore = new SessionStore(personalDb);
    sessionStore.ensure('harvest', 'harvest', 'Imported memory from external sources');

    const frameStore = new FrameStore(personalDb);
    let saved = 0;

    try {
      emitHarvestProgress({ phase: 'saving', current: 0, total: items.length, source });
      for (const item of items) {
        const label = `[Harvest:${item.source}] ${item.title}`;
        const content = item.content.slice(0, 4000);
        frameStore.createIFrame('harvest', `${label}\n\n${content}`, 'normal', 'import');
        saved++;
        if (saved % 10 === 0 || saved === items.length) {
          emitHarvestProgress({ phase: 'saving', current: saved, total: items.length, source });
          // M-08 heartbeat — updates items_saved + updated_at so the UI
          // can show "paused at N/M" for an interrupted run.
          runStore.heartbeat(runId, saved);
        }
      }

      // Update harvest source tracking
      const harvestStore = new HarvestSourceStore(personalDb);
      harvestStore.upsert(source, adapter.displayName ?? source);
      harvestStore.recordSync(source, items.length, saved);

      // Post-harvest cognify: extract entities + relations from imported frames
      let cognifyStats = { processed: 0, entities: 0, relations: 0 };
      try {
        const { KnowledgeGraph, HybridSearch, createEmbeddingProvider } = await import('@waggle/core');
        const { CognifyPipeline } = await import('@waggle/agent');
        const embedder = await createEmbeddingProvider({ provider: 'mock' });
        const cognify = new CognifyPipeline({
          frames: frameStore,
          sessions: sessionStore,
          knowledge: new KnowledgeGraph(personalDb),
          search: new HybridSearch(personalDb, embedder),
        });
        const recentFrames = frameStore.getRecent(saved);
        const frameIds = recentFrames.map(f => f.id);
        emitHarvestProgress({ phase: 'cognifying', current: 0, total: frameIds.length, source });
        cognifyStats = await cognify.cognifyBatch(frameIds);
        emitHarvestProgress({ phase: 'cognifying', current: frameIds.length, total: frameIds.length, source });
      } catch {
        // Cognify failure is non-fatal — frames are already saved
      }

      // M-11: post-harvest wiki recompile. Incremental compile uses the
      // watermark to skip entity pages that no new frames mention, so it's
      // cheap. Fail-soft: if the synthesizer has no LLM configured the whole
      // block short-circuits without affecting the harvest response.
      let wikiStats = { pagesCreated: 0, pagesUpdated: 0, pagesUnchanged: 0 };
      try {
        const { KnowledgeGraph, HybridSearch, createEmbeddingProvider } = await import('@waggle/core');
        const { WikiCompiler, CompilationState, resolveSynthesizer } = await import('@waggle/wiki-compiler');
        const embedder = await createEmbeddingProvider({ provider: 'mock' });
        const state = new CompilationState(personalDb);
        const synth = await resolveSynthesizer();
        const compiler = new WikiCompiler(
          new KnowledgeGraph(personalDb),
          frameStore,
          new HybridSearch(personalDb, embedder),
          state,
          { synthesize: synth.synthesize },
        );
        emitHarvestProgress({ phase: 'wiki-compile', current: 0, total: 1, source });
        const result = await compiler.compile({ incremental: true });
        wikiStats = {
          pagesCreated: result.pagesCreated,
          pagesUpdated: result.pagesUpdated,
          pagesUnchanged: result.pagesUnchanged,
        };
        emitHarvestProgress({ phase: 'wiki-compile', current: 1, total: 1, source });
      } catch {
        // Wiki compile failure is non-fatal — frames + entities still saved.
      }

      // M-08: finalize run and delete cache so getLatestInterrupted stops
      // surfacing this one.
      runStore.complete(runId, saved);
      deleteHarvestCache(cachePath);

      return {
        source,
        itemCount: items.length,
        saved,
        cognified: cognifyStats.processed,
        entitiesExtracted: cognifyStats.entities,
        relationsCreated: cognifyStats.relations,
        wikiCompiled: wikiStats,
        runId,
        message: `Imported ${saved} items from ${source}, cognified ${cognifyStats.processed} frames, wiki ${wikiStats.pagesCreated + wikiStats.pagesUpdated} pages updated`,
      };
    } catch (err) {
      // M-08: record the failure with however many items we got through.
      // Cache is preserved so the UI can resume.
      runStore.fail(runId, err instanceof Error ? err.message : 'unknown harvest error', saved);
      throw err;
    }
  });

  // GET /api/harvest/sources — list all registered sources
  fastify.get('/api/harvest/sources', async (_request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }

    const store = new HarvestSourceStore(personalDb);
    return { sources: store.getAll() };
  });

  // POST /api/harvest/sources — register or update a source
  fastify.post('/api/harvest/sources', async (request, reply) => {
    const { source, displayName, sourcePath, autoSync, syncIntervalHours } = request.body as {
      source: ImportSourceType; displayName: string; sourcePath?: string;
      autoSync?: boolean; syncIntervalHours?: number;
    };

    if (!source || !displayName) {
      return reply.code(400).send({ error: 'source and displayName required' });
    }

    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }

    const store = new HarvestSourceStore(personalDb);
    const entry = store.upsert(source, displayName, sourcePath);
    if (autoSync !== undefined) {
      store.setAutoSync(source, autoSync, syncIntervalHours);
    }

    return { source: store.getBySource(source) ?? entry };
  });

  // DELETE /api/harvest/sources/:source — remove a registered source
  fastify.delete<{ Params: { source: string } }>('/api/harvest/sources/:source', async (request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) return reply.code(503).send({ error: 'Personal mind not available' });
    const store = new HarvestSourceStore(personalDb);
    store.remove(request.params.source as ImportSourceType);
    return { ok: true };
  });

  // PATCH /api/harvest/sources/:source — toggle auto-sync
  fastify.patch<{ Params: { source: string }; Body: { autoSync?: boolean; syncIntervalHours?: number } }>(
    '/api/harvest/sources/:source', async (request, reply) => {
      const personalDb = (fastify as any).multiMind?.personal;
      if (!personalDb) return reply.code(503).send({ error: 'Personal mind not available' });
      const store = new HarvestSourceStore(personalDb);
      const { autoSync, syncIntervalHours } = request.body ?? {};
      if (autoSync !== undefined) {
        store.setAutoSync(request.params.source as ImportSourceType, autoSync, syncIntervalHours);
      }
      return { source: store.getBySource(request.params.source as ImportSourceType) };
    },
  );

  // GET /api/harvest/progress — SSE stream for import progress
  fastify.get('/api/harvest/progress', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const listener = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      reply.raw.write(`data: ${JSON.stringify(detail)}\n\n`);
    };
    (globalThis as any).__harvestProgressListeners ??= new Set();
    (globalThis as any).__harvestProgressListeners.add(listener);

    request.raw.on('close', () => {
      (globalThis as any).__harvestProgressListeners?.delete(listener);
    });
  });

  // GET /api/harvest/runs/latest-interrupted — M-08: single latest run in
  // 'running' or 'failed' state with a surviving cache. UI uses this on
  // mount to decide whether to render the "Resume?" banner.
  fastify.get('/api/harvest/runs/latest-interrupted', async (_request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) return reply.code(503).send({ error: 'Personal mind not available' });
    const runStore = new HarvestRunStore(personalDb);
    const run = runStore.getLatestInterrupted();
    // Only surface the run if its cache file still exists — otherwise the
    // row is resume-ineligible and we shouldn't pretend it is.
    if (run && run.inputCachePath && !fs.existsSync(run.inputCachePath)) {
      return { run: null };
    }
    return { run };
  });

  // GET /api/harvest/runs — M-08: list recent runs. Primarily for debugging
  // and future history views; UI presently only consumes `latest-interrupted`.
  fastify.get<{ Querystring: { limit?: string } }>('/api/harvest/runs', async (request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) return reply.code(503).send({ error: 'Personal mind not available' });
    const runStore = new HarvestRunStore(personalDb);
    const limit = Math.min(Number(request.query.limit) || 50, 500);
    return { runs: runStore.getAll(limit) };
  });

  // POST /api/harvest/runs/:id/abandon — M-08: user chose to discard an
  // interrupted run. Marks it abandoned and deletes the cached input so it
  // stops surfacing in the banner.
  fastify.post<{ Params: { id: string } }>('/api/harvest/runs/:id/abandon', async (request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) return reply.code(503).send({ error: 'Personal mind not available' });
    const runStore = new HarvestRunStore(personalDb);
    const id = Number(request.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: 'Invalid run id' });
    }
    const run = runStore.getById(id);
    if (!run) return reply.code(404).send({ error: `Run ${id} not found` });
    if (run.status === 'completed' || run.status === 'abandoned') {
      return { run };
    }
    runStore.abandon(id);
    deleteHarvestCache(run.inputCachePath);
    return { run: runStore.getById(id) };
  });

  // POST /api/harvest/extract-identity — M-09: scan recent harvest frames,
  // LLM-extract structured identity (name/role/company/industry/bio), and
  // persist as pending `profile.identitySuggestions` for the user to review
  // in UserProfileApp. Mirrors the profile.analyze-style pattern (internal
  // Haiku proxy call).
  fastify.post('/api/harvest/extract-identity', async (_request, reply) => {
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }

    const { FrameStore } = await import('@waggle/core');
    const frameStore = new FrameStore(personalDb);
    // getGopFrames returns ASC; the most recent 50 harvest frames are the tail.
    const harvestFrames = frameStore.getGopFrames('harvest').slice(-50);

    const dataDir = fastify.localConfig.dataDir;
    if (harvestFrames.length === 0) {
      return { suggestions: loadProfile(dataDir).identitySuggestions };
    }

    const apiKey = fastify.vault?.get('anthropic')?.value;
    if (!apiKey) {
      // Surface empty suggestions rather than 503 — absence of key is a
      // degraded-but-known state (same user may still review manually).
      return { suggestions: loadProfile(dataDir).identitySuggestions, note: 'no_anthropic_key' };
    }

    const concat = harvestFrames
      .map((f, i) => `[Frame ${i + 1}]\n${f.content.slice(0, 500)}`)
      .join('\n\n---\n\n');

    const prompt = `Extract identity facts about the user from these harvested memory frames.

Return ONLY valid JSON in this exact shape:
{
  "suggestions": [
    { "field": "name" | "role" | "company" | "industry" | "bio",
      "value": "extracted value (concise — for bio, 2-3 sentences max)",
      "confidence": 0.0..1.0,
      "sourceHint": "brief evidence note (e.g., 'mentioned in 3 frames')" }
  ]
}

Rules:
- Only include fields with confidence >= 0.5.
- Name: the user's own name (first + last if available).
- Role: job title or functional role.
- Company: employer or organization.
- Industry: the industry the user works in.
- Bio: 2-3 sentence professional summary.
- Skip fields where evidence is unclear or contradictory.
- If no identity facts surface, return { "suggestions": [] }.

Frames:
${concat}`;

    let extracted: IdentitySuggestion[] = [];
    try {
      const port = fastify.server.address()?.toString().split(':').pop() ?? '3333';
      const proxyUrl = `http://127.0.0.1:${port}/v1/chat/completions`;
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 600,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        const content = data.choices?.[0]?.message?.content ?? '';
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as { suggestions?: unknown[] };
          if (Array.isArray(parsed.suggestions)) {
            const now = new Date().toISOString();
            extracted = parsed.suggestions
              .filter(isValidSuggestionShape)
              .map(s => ({ ...s, extractedAt: now }));
          }
        }
      }
    } catch { /* return current suggestions unchanged */ }

    // Merge into profile. Rule: per-field, keep highest confidence. Drop any
    // suggestion whose value already matches the manually-set profile field
    // (no point showing "suggested: X" when the user already has X).
    const profile = loadProfile(dataDir);
    const byField = new Map<IdentitySuggestion['field'], IdentitySuggestion>();
    for (const existing of profile.identitySuggestions) byField.set(existing.field, existing);
    for (const incoming of extracted) {
      const currentValue = profile[incoming.field];
      if (typeof currentValue === 'string' && currentValue.trim() === incoming.value.trim()) continue;
      const prior = byField.get(incoming.field);
      if (!prior || incoming.confidence > prior.confidence) byField.set(incoming.field, incoming);
    }
    profile.identitySuggestions = Array.from(byField.values());
    saveProfile(dataDir, profile);

    return { suggestions: profile.identitySuggestions };
  });

  // POST /api/harvest/scan-claude-code — scan local Claude Code directory
  fastify.post('/api/harvest/scan-claude-code', async (_request, reply) => {
    const claudeDir = path.join(os.homedir(), '.claude');
    const adapter = new ClaudeCodeAdapter();
    const items = adapter.scan(claudeDir);

    if (items.length === 0) {
      return { found: false, path: claudeDir, itemCount: 0, items: [] };
    }

    return {
      found: true,
      path: claudeDir,
      itemCount: items.length,
      types: countByField(items, 'type'),
      preview: items.slice(0, 20).map(i => ({
        id: i.id, title: i.title, type: i.type,
        metadata: i.metadata,
      })),
    };
  });
}

function countByField(items: UniversalImportItem[], field: keyof UniversalImportItem): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const val = String(item[field]);
    counts[val] = (counts[val] ?? 0) + 1;
  }
  return counts;
}

const VALID_IDENTITY_FIELDS: ReadonlyArray<IdentitySuggestion['field']> = [
  'name', 'role', 'company', 'industry', 'bio',
];

function isValidSuggestionShape(x: unknown): x is Omit<IdentitySuggestion, 'extractedAt'> {
  if (!x || typeof x !== 'object') return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.field === 'string' &&
    (VALID_IDENTITY_FIELDS as ReadonlyArray<string>).includes(s.field) &&
    typeof s.value === 'string' && s.value.trim().length > 0 &&
    typeof s.confidence === 'number' && s.confidence >= 0 && s.confidence <= 1 &&
    typeof s.sourceHint === 'string'
  );
}
