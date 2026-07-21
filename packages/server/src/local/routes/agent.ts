import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { resolveUsableModel } from '../model-availability.js';
import { chatSessionStateKey } from './chat-persistence.js';
import { assertSafeSegment } from './validate.js';

/**
 * Agent routes — status, cost tracking, model management.
 * Provides the same info that CLI's /cost, /model, /models commands show.
 */
export const agentRoutes: FastifyPluginAsync = async (server) => {
  const { costTracker } = server.agentState;

  // GET /api/agent/status — agent status including cost stats
  server.get('/api/agent/status', async () => {
    const stats = costTracker.getStats();
    return {
      running: true,
      model: server.agentState.currentModel,
      tokensUsed: stats.totalInputTokens + stats.totalOutputTokens,
      estimatedCost: stats.estimatedCost,
      turns: stats.turns,
      usage: stats,
    };
  });

  // GET /api/agent/cost — detailed cost breakdown
  server.get('/api/agent/cost', async () => {
    const stats = costTracker.getStats();
    return {
      summary: costTracker.formatSummary(),
      ...stats,
    };
  });

  // POST /api/agent/cost/reset — reset cost tracking
  server.post('/api/agent/cost/reset', async () => {
    // Create a fresh cost tracker (no reset method, so replace)
    // CostTracker is stateful, we clear by reassigning
    // For now, return the current stats and note it can't be reset in-place
    return { ok: true, message: 'Cost tracking resets on server restart' };
  });

  // GET /api/agent/model — current model
  server.get('/api/agent/model', async () => {
    const model = await resolveUsableModel(server, server.agentState.currentModel);
    server.agentState.currentModel = model;
    return { model };
  });

  // PUT /api/agent/model — switch model
  server.put<{
    Body: { model: string };
  }>('/api/agent/model', async (request, reply) => {
    const { model } = request.body ?? {};
    if (!model) {
      return reply.status(400).send({ error: 'model is required' });
    }
    const resolvedModel = await resolveUsableModel(server, model);
    server.agentState.currentModel = resolvedModel;
    return { ok: true, model: resolvedModel };
  });

  // GET /api/agents/active — current sub-agent orchestrator state
  // Returns active and completed workers from the orchestrator, or empty array if no workflow running
  server.get('/api/agents/active', async () => {
    const orchestrator = server.agentState.subagentOrchestrator;
    if (!orchestrator) {
      return { workers: [], active: [] };
    }
    return {
      workers: orchestrator.getWorkers(),
      active: orchestrator.getActiveWorkers(),
    };
  });

  // GET /api/agent/history — get conversation history for a session
  // Loads from disk (.jsonl files) if not in RAM, ensuring persistence across restarts
  server.get<{
    Querystring: { session?: string; workspace?: string };
  }>('/api/history', async (request) => {
    const sessionId = request.query.session ?? request.query.workspace ?? 'default';
    const workspaceId = request.query.workspace ?? 'default';
    assertSafeSegment(sessionId, 'session');
    assertSafeSegment(workspaceId, 'workspace');
    const sessionStateKey = chatSessionStateKey(workspaceId, sessionId);

    // Try in-memory first
    let history = server.agentState.sessionHistories.get(sessionStateKey);

    // If not in RAM, load from disk
    if (!history || history.length === 0) {
      const filePath = path.join(
        server.localConfig.dataDir, 'workspaces', workspaceId, 'sessions', `${sessionId}.jsonl`
      );
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        const messages: Array<{ role: string; content: string; timestamp?: string; model?: string }> = [];
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'meta') continue;
            if (parsed.role && parsed.content !== undefined) {
              const model = typeof parsed.model === 'string' && parsed.model.trim()
                ? parsed.model
                : undefined;
              messages.push({
                role: parsed.role,
                content: parsed.content,
                timestamp: parsed.timestamp,
                ...(model ? { model } : {}),
              });
            }
          } catch { /* skip */ }
        }
        // Cache in RAM for subsequent requests
        server.agentState.sessionHistories.set(sessionStateKey, messages.map(m => ({
          role: m.role,
          content: m.content,
          ...(m.model ? { model: m.model } : {}),
        })));
        return {
          sessionId,
          messages: messages.map((m, i) => ({
            id: `hist-${i}`,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp ?? new Date().toISOString(),
            ...(m.model ? { model: m.model } : {}),
          })),
          count: messages.length,
        };
      }
      history = [];
    }

    return {
      sessionId,
      messages: history.map((m, i) => ({
        id: `hist-${i}`,
        role: m.role,
        content: m.content,
        timestamp: new Date().toISOString(),
        ...(m.model ? { model: m.model } : {}),
      })),
      count: history.length,
    };
  });
};
