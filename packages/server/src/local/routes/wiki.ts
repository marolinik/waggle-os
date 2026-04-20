import type { FastifyPluginAsync } from 'fastify';
import {
  FrameStore,
  KnowledgeGraph,
  HybridSearch,
} from '@waggle/core';
import {
  WikiCompiler, CompilationState, resolveSynthesizer,
  writeToObsidianVault, writeToNotionWorkspace, extractNotionPageId,
  type NotionStateHelpers,
} from '@waggle/wiki-compiler';
import * as path from 'node:path';

export const wikiRoutes: FastifyPluginAsync = async (server) => {
  function getPersonalDb() {
    const db = server.multiMind?.personal;
    if (!db) throw new Error('Personal mind not initialized');
    return db;
  }

  // GET /api/wiki/pages — list all compiled pages
  server.get('/api/wiki/pages', async (_req, reply) => {
    const db = getPersonalDb();
    const state = new CompilationState(db);
    return reply.send(state.getAllPages());
  });

  // GET /api/wiki/pages/:slug — get a single page metadata
  server.get<{ Params: { slug: string } }>('/api/wiki/pages/:slug', async (req, reply) => {
    const db = getPersonalDb();
    const state = new CompilationState(db);
    const page = state.getPage(req.params.slug);
    if (!page) return reply.status(404).send({ error: 'Page not found' });
    return reply.send(page);
  });

  // GET /api/wiki/pages/:slug/content — get full markdown content
  server.get<{ Params: { slug: string } }>('/api/wiki/pages/:slug/content', async (req, reply) => {
    const db = getPersonalDb();
    const raw = db.getDatabase();
    const row = raw.prepare(
      'SELECT markdown FROM wiki_pages WHERE slug = ?',
    ).get(req.params.slug) as { markdown: string } | undefined;
    if (!row) return reply.status(404).send({ error: 'Page not found' });
    return reply.send({ slug: req.params.slug, markdown: row.markdown });
  });

  // POST /api/wiki/compile — trigger compilation.
  // M-11 BLOCKER-5: skip compile entirely if the server has no real embedder
  // (active provider is 'mock'). Running with zero-vector embeddings produces
  // pages with a silently broken semantic relevance layer — explicit skip
  // with a reason is the correct degraded-state response.
  server.post<{ Body: { mode?: 'incremental' | 'full'; concepts?: string[] } }>('/api/wiki/compile', async (req, reply) => {
    const embedder = server.embeddingProvider;
    if (!embedder || embedder.getActiveProvider() === 'mock') {
      return reply.status(503).send({
        error: 'Wiki compile requires a real embedding provider. Configure a Voyage / OpenAI key in Vault, or an Ollama embedding model, before compiling.',
        skippedReason: 'no_real_embedder',
      });
    }

    const db = getPersonalDb();
    const kg = new KnowledgeGraph(db);
    const frames = new FrameStore(db);
    const search = new HybridSearch(db, embedder);
    const state = new CompilationState(db);
    const synth = await resolveSynthesizer();

    const compiler = new WikiCompiler(kg, frames, search, state, {
      synthesize: synth.synthesize,
    });

    const result = await compiler.compile({
      incremental: (req.body?.mode ?? 'incremental') === 'incremental',
      concepts: req.body?.concepts,
    });

    return reply.send({
      ...result,
      llmProvider: synth.provider,
      llmModel: synth.model,
    });
  });

  // GET /api/wiki/health — health report.
  // M-11 BLOCKER-5: same policy as /compile — no mock embedder in a read
  // path that feeds a relevance signal to the user. Report the degraded
  // state explicitly so the UI can surface an actionable "add embedding
  // key" prompt instead of misleading health numbers.
  server.get('/api/wiki/health', async (_req, reply) => {
    const embedder = server.embeddingProvider;
    if (!embedder || embedder.getActiveProvider() === 'mock') {
      return reply.status(503).send({
        error: 'Wiki health requires a real embedding provider.',
        skippedReason: 'no_real_embedder',
      });
    }

    const db = getPersonalDb();
    const kg = new KnowledgeGraph(db);
    const frames = new FrameStore(db);
    const search = new HybridSearch(db, embedder);
    const state = new CompilationState(db);
    const synth = await resolveSynthesizer();

    const compiler = new WikiCompiler(kg, frames, search, state, {
      synthesize: synth.synthesize,
    });

    return reply.send(compiler.compileHealth());
  });

  // GET /api/wiki/watermark — current compilation state
  server.get('/api/wiki/watermark', async (_req, reply) => {
    const db = getPersonalDb();
    const state = new CompilationState(db);
    return reply.send(state.getWatermark());
  });

  // POST /api/wiki/export/obsidian — M-12: write all compiled pages to a
  // directory the user can drop into an Obsidian vault. The adapter shapes
  // output as {outDir}/{pageType}/{slug}.md + a top-level _index.md.
  server.post<{ Body: { outDir?: string } }>('/api/wiki/export/obsidian', async (req, reply) => {
    const outDir = req.body?.outDir?.trim();
    if (!outDir) {
      return reply.status(400).send({ error: 'outDir is required' });
    }
    if (!path.isAbsolute(outDir)) {
      return reply.status(400).send({ error: 'outDir must be an absolute path' });
    }

    const db = getPersonalDb();
    const state = new CompilationState(db);
    const pages = state.getAllPages();
    if (pages.length === 0) {
      return reply.status(409).send({
        error: 'No compiled pages to export. Run compile first.',
      });
    }

    try {
      const result = writeToObsidianVault(pages, outDir);
      return reply.send(result);
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Export failed',
      });
    }
  });

  // POST /api/wiki/export/notion — M-13: write compiled pages as child
  // pages under a user-chosen Notion root. Reads `notion-wiki-token` from
  // Vault; root is supplied as a notion.so URL or raw page id.
  server.post<{ Body: { rootPageUrl?: string } }>('/api/wiki/export/notion', async (req, reply) => {
    const rootPageUrl = req.body?.rootPageUrl?.trim();
    if (!rootPageUrl) {
      return reply.status(400).send({ error: 'rootPageUrl is required' });
    }

    const rootPageId = extractNotionPageId(rootPageUrl);
    if (!rootPageId) {
      return reply.status(400).send({
        error: 'Could not parse a Notion page id from rootPageUrl. Paste the URL of a page you shared with your integration.',
      });
    }

    const token = server.vault?.get('notion-wiki-token')?.value;
    if (!token) {
      return reply.status(503).send({
        error: 'notion-wiki-token not set. Create an internal integration at notion.so/my-integrations, share your root page with it, and save the token in Vault as `notion-wiki-token`.',
      });
    }

    const db = getPersonalDb();
    const state = new CompilationState(db);
    const pages = state.getAllPages();
    if (pages.length === 0) {
      return reply.status(409).send({
        error: 'No compiled pages to export. Run compile first.',
      });
    }

    // NotionStateHelpers adapter — delegates all the delta-tracking
    // bookkeeping to CompilationState so the adapter stays stateless.
    const helpers: NotionStateHelpers = {
      getNotionPageId: (slug) => state.getNotionPageId(slug),
      setNotionPageId: (slug, id) => state.setNotionPageId(slug, id),
      clearNotionPageId: (slug) => state.clearNotionPageId(slug),
      getPageContentHash: (slug) => state.getPageContentHash(slug),
    };

    try {
      const stats = await writeToNotionWorkspace(pages, { token, rootPageId }, helpers);
      return reply.send(stats);
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : 'Export failed',
      });
    }
  });
};
