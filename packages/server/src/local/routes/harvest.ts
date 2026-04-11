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
import os from 'node:os';
import path from 'node:path';
import {
  HarvestSourceStore, ChatGPTAdapter, ClaudeAdapter,
  ClaudeCodeAdapter, GeminiAdapter, UniversalAdapter,
  type ImportSourceType, type UniversalImportItem,
  type SourceAdapter, type FilesystemAdapter,
} from '@waggle/core';

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

  // POST /api/harvest/commit — run pipeline and save
  fastify.post('/api/harvest/commit', async (request, reply) => {
    const { data, source } = request.body as { data: unknown; source: ImportSourceType };
    if (!data || !source) {
      return reply.code(400).send({ error: 'data and source are required' });
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
      return {
        source,
        itemCount: 0,
        saved: 0,
        message: `No items found for ${source}. Check that the export file or local directory contains content the adapter recognizes.`,
      };
    }

    // Save raw items as I-frames (lightweight mode — full pipeline requires LLM keys)
    const personalDb = (fastify as any).multiMind?.personal;
    if (!personalDb) {
      return reply.code(503).send({ error: 'Personal mind not available' });
    }

    // Frames have a FK to sessions(gop_id) — ensure the stable `harvest`
    // session row exists before creating any frames, otherwise the insert
    // hits SQLITE_CONSTRAINT_FOREIGNKEY and nothing persists.
    const { FrameStore, SessionStore } = await import('@waggle/core');
    const sessionStore = new SessionStore(personalDb);
    sessionStore.ensure('harvest', 'harvest', 'Imported memory from external sources');

    const frameStore = new FrameStore(personalDb);
    let saved = 0;

    for (const item of items) {
      const label = `[Harvest:${item.source}] ${item.title}`;
      const content = item.content.slice(0, 4000);
      frameStore.createIFrame('harvest', `${label}\n\n${content}`, 'normal', 'import');
      saved++;
    }

    // Update harvest source tracking
    const harvestStore = new HarvestSourceStore(personalDb);
    harvestStore.upsert(source, adapter.displayName ?? source);
    harvestStore.recordSync(source, items.length, saved);

    return {
      source,
      itemCount: items.length,
      saved,
      message: `Imported ${saved} items from ${source}`,
    };
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
