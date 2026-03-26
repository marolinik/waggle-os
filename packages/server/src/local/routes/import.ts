import type { FastifyInstance } from 'fastify';
import { processImport, FrameStore, type ImportSource } from '@waggle/core';

export async function importRoutes(fastify: FastifyInstance) {
  // POST /api/import/preview — parse export and show what would be imported
  fastify.post('/api/import/preview', async (request, reply) => {
    const { data, source } = request.body as { data: unknown; source: ImportSource };

    if (!data || !source) {
      return reply.code(400).send({ error: 'data and source (chatgpt|claude) required' });
    }

    if (source !== 'chatgpt' && source !== 'claude') {
      return reply.code(400).send({ error: 'source must be "chatgpt" or "claude"' });
    }

    const result = processImport(data, source);
    return result;
  });

  // POST /api/import/commit — parse, extract, and save to personal memory
  fastify.post('/api/import/commit', async (request, reply) => {
    const { data, source } = request.body as { data: unknown; source: ImportSource };

    if (!data || !source) {
      return reply.code(400).send({ error: 'data and source (chatgpt|claude) required' });
    }

    if (source !== 'chatgpt' && source !== 'claude') {
      return reply.code(400).send({ error: 'source must be "chatgpt" or "claude"' });
    }

    const result = processImport(data, source);

    if (result.knowledgeExtracted.length === 0) {
      return {
        ...result,
        saved: 0,
        message: 'No knowledge items found to import',
      };
    }

    // Save to personal memory
    try {
      const personalDb = (fastify as any).multiMind?.personal;
      if (!personalDb) {
        return reply.code(503).send({ error: 'Personal mind not available' });
      }

      const frameStore = new FrameStore(personalDb);
      let saved = 0;
      const sourceLabel = source === 'chatgpt' ? 'ChatGPT' : 'Claude';

      for (const item of result.knowledgeExtracted) {
        const content = `[Import:${sourceLabel}] ${item.content}`;
        frameStore.createIFrame('import', content, item.importance);
        saved++;
      }

      return {
        ...result,
        saved,
        message: `Imported ${saved} knowledge items from ${sourceLabel} into personal memory`,
      };
    } catch (err: any) {
      return reply.code(500).send({ error: `Import failed: ${err.message}` });
    }
  });
}
