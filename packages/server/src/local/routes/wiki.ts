import type { FastifyPluginAsync } from 'fastify';
import {
  FrameStore,
  KnowledgeGraph,
  HybridSearch,
  createEmbeddingProvider,
} from '@waggle/core';
import { WikiCompiler, CompilationState, resolveSynthesizer } from '@waggle/wiki-compiler';

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

  // POST /api/wiki/compile — trigger compilation
  server.post<{ Body: { mode?: 'incremental' | 'full'; concepts?: string[] } }>('/api/wiki/compile', async (req, reply) => {
    const db = getPersonalDb();
    const kg = new KnowledgeGraph(db);
    const frames = new FrameStore(db);
    const embedder = await createEmbeddingProvider({ provider: 'mock' });
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

  // GET /api/wiki/health — health report
  server.get('/api/wiki/health', async (_req, reply) => {
    const db = getPersonalDb();
    const kg = new KnowledgeGraph(db);
    const frames = new FrameStore(db);
    const embedder = await createEmbeddingProvider({ provider: 'mock' });
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
};
