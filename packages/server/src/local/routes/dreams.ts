/**
 * /api/dreams — the Dream Diary read surface (docs/plans/DREAM-DIARY-2026-07-09.md).
 *
 * GET /api/dreams?days=7 → newest-first DreamDay list. Lazy LLM polish:
 * when a returned day has curation events but no narrative yet, ONE guarded
 * background call to the built-in proxy (fast tier) writes a 2-3 sentence
 * first-person narrative into the day file — the response never waits for
 * it. The deterministic summary is always present, so an LLM outage just
 * means the diary reads plainer. Quiet nights (no events with activity)
 * skip the LLM entirely.
 */

import type { FastifyPluginAsync } from 'fastify';
import { createLogger } from '../logger.js';
import { isLocalRequest } from '../origin-guard.js';
import { DreamJournal, QUIET_NIGHT_SUMMARY, type DreamDay } from '../dream-journal.js';

const log = createLogger('dreams');

const MAX_DAYS = 30;

declare module 'fastify' {
  interface FastifyInstance {
    dreamJournal?: DreamJournal;
  }
}

export type NarrativePolish = (day: DreamDay) => Promise<string>;

/** Build the default polish fn — one proxy call, fast tier, hard length cap. */
export function makeProxyPolish(port: number): NarrativePolish {
  return async (day: DreamDay): Promise<string> => {
    const prompt =
      'You are Waggle, a personal AI with persistent memory. While the user slept, ' +
      'your nightly maintenance did this real work (do not invent anything beyond it):\n' +
      `${day.summary}\nRaw counters: ${JSON.stringify(day.events.map(e => ({ action: e.action, ...e.stats })))}\n\n` +
      'Write 2-3 warm first-person sentences telling the user what you did overnight. ' +
      'Mention only work reflected in the counters. No greetings, no markdown, no emoji.';
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`dream polish LLM HTTP ${res.status}`);
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('dream polish returned empty text');
    return text.slice(0, 600);
  };
}

export interface DreamRoutesOptions {
  /** Test seam — replaces the proxy-backed polish. */
  polish?: NarrativePolish;
}

export const dreamRoutes: FastifyPluginAsync<DreamRoutesOptions> = async (server, opts) => {
  const polish = opts.polish
    ?? makeProxyPolish(server.localConfig?.port ?? 3333);
  // Single-flight guard per date — a 5s-polling Home card must not stack
  // duplicate LLM calls while the first one is in flight.
  const polishInFlight = new Set<string>();

  server.get<{ Querystring: { days?: string } }>('/api/dreams', async (request, reply) => {
    if (!isLocalRequest(request)) {
      return reply.status(403).send({ error: 'Local app only' });
    }
    const journal = server.dreamJournal;
    if (!journal) {
      return reply.status(503).send({ error: 'Dream journal not initialized' });
    }
    const days = Math.min(MAX_DAYS, Math.max(1, parseInt(request.query.days ?? '7', 10) || 7));
    const entries = journal.list(days);

    for (const day of entries) {
      const hasActivity = day.events.length > 0 && day.summary !== QUIET_NIGHT_SUMMARY;
      if (!hasActivity || day.narrative || polishInFlight.has(day.date)) continue;
      polishInFlight.add(day.date);
      void polish(day)
        .then(narrative => journal.setNarrative(day.date, narrative))
        .catch(e => {
          log.info(`[dreams] narrative polish skipped for ${day.date}: ${e instanceof Error ? e.message : e}`);
        })
        .finally(() => polishInFlight.delete(day.date));
    }

    return entries;
  });
};
