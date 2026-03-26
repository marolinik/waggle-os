/**
 * Feedback REST API Routes — records user feedback on agent responses
 * and surfaces improvement stats.
 *
 * Endpoints:
 *   POST /api/feedback       — record user feedback (thumbs up/down + reason)
 *   GET  /api/feedback/stats — return improvement stats and trends
 *
 * Feedback is stored in the .mind database in a dedicated feedback_entries table.
 * Negative feedback is also cross-recorded as correction signals in the
 * improvement_signals table so the self-improvement loop can track recurring issues.
 */

import type { FastifyInstance } from 'fastify';

type FeedbackRating = 'up' | 'down';

const VALID_RATINGS: FeedbackRating[] = ['up', 'down'];

const VALID_REASONS = [
  'wrong_answer', 'too_verbose', 'wrong_tool', 'too_slow', 'other',
] as const;

type FeedbackReason = typeof VALID_REASONS[number];

interface FeedbackBody {
  sessionId: string;
  messageIndex: number;
  rating: FeedbackRating;
  reason?: FeedbackReason;
  detail?: string;
}

/**
 * Ensure the feedback_entries table exists in the .mind database.
 * Separate from improvement_signals to avoid altering the existing schema
 * constraint on category values.
 */
function ensureFeedbackTable(db: import('better-sqlite3').Database): void {
  const exists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='feedback_entries'",
  ).get();
  if (!exists) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        message_index INTEGER NOT NULL,
        rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
        reason TEXT,
        detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_session ON feedback_entries (session_id);
      CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback_entries (rating);
      CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_entries (created_at DESC);
    `);
  }
}

export async function feedbackRoutes(fastify: FastifyInstance) {
  // POST /api/feedback — record user feedback on an agent response
  fastify.post<{ Body: FeedbackBody }>('/api/feedback', async (request, reply) => {
    const { sessionId, messageIndex, rating, reason, detail } = request.body ?? {} as FeedbackBody;

    // Validation
    if (!sessionId || typeof sessionId !== 'string') {
      return reply.code(400).send({ error: 'sessionId is required' });
    }
    if (typeof messageIndex !== 'number' || messageIndex < 0) {
      return reply.code(400).send({ error: 'messageIndex must be a non-negative number' });
    }
    if (!rating || !VALID_RATINGS.includes(rating)) {
      return reply.code(400).send({ error: `rating must be one of: ${VALID_RATINGS.join(', ')}` });
    }
    if (reason && !VALID_REASONS.includes(reason as FeedbackReason)) {
      return reply.code(400).send({ error: `reason must be one of: ${VALID_REASONS.join(', ')}` });
    }

    try {
      const db = fastify.multiMind.personal.getDatabase();
      ensureFeedbackTable(db);

      db.prepare(`
        INSERT INTO feedback_entries (session_id, message_index, rating, reason, detail)
        VALUES (?, ?, ?, ?, ?)
      `).run(sessionId, messageIndex, rating, reason ?? null, detail ?? '');

      // Also record negative feedback as a correction signal in the improvement store
      // so the self-improvement loop can track recurring issues
      if (rating === 'down' && reason) {
        const signalStore = fastify.agentState.orchestrator.getImprovementSignals();
        signalStore.record('correction', `feedback:${reason}`, detail ?? `User thumbs-down: ${reason}`);
      }

      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.code(500).send({ error: `Failed to store feedback: ${message}` });
    }
  });

  // GET /api/feedback/stats — return improvement stats
  fastify.get('/api/feedback/stats', async (_request, reply) => {
    try {
      const db = fastify.multiMind.personal.getDatabase();
      ensureFeedbackTable(db);

      // Total feedback count
      const totalRow = db.prepare('SELECT COUNT(*) as count FROM feedback_entries').get() as { count: number };
      const totalFeedback = totalRow.count;

      // Positive count
      const positiveRow = db.prepare(
        "SELECT COUNT(*) as count FROM feedback_entries WHERE rating = 'up'",
      ).get() as { count: number };
      const positiveCount = positiveRow.count;

      // Positive rate
      const positiveRate = totalFeedback > 0 ? +(positiveCount / totalFeedback).toFixed(2) : 0;

      // Top issues (from negative feedback reasons)
      const topIssuesRows = db.prepare(`
        SELECT reason, COUNT(*) as count
        FROM feedback_entries
        WHERE rating = 'down' AND reason IS NOT NULL
        GROUP BY reason
        ORDER BY count DESC
        LIMIT 5
      `).all() as Array<{ reason: string; count: number }>;
      const topIssues = topIssuesRows.map(r => r.reason);

      // Corrections this week (from improvement_signals table)
      let correctionsThisWeek = 0;
      try {
        const corrRow = db.prepare(`
          SELECT COUNT(*) as count FROM improvement_signals
          WHERE category = 'correction'
            AND last_seen >= datetime('now', '-7 days')
        `).get() as { count: number } | undefined;
        correctionsThisWeek = corrRow?.count ?? 0;
      } catch {
        // improvement_signals table might not exist yet
      }

      // Improvement trend: compare last 7 days positive rate to prior 7 days
      let improvementTrend = '0%';
      if (totalFeedback >= 2) {
        const recentRow = db.prepare(`
          SELECT COUNT(*) as total,
                 SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as positive
          FROM feedback_entries
          WHERE created_at >= datetime('now', '-7 days')
        `).get() as { total: number; positive: number };

        const priorRow = db.prepare(`
          SELECT COUNT(*) as total,
                 SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) as positive
          FROM feedback_entries
          WHERE created_at >= datetime('now', '-14 days')
            AND created_at < datetime('now', '-7 days')
        `).get() as { total: number; positive: number };

        if (recentRow.total > 0 && priorRow.total > 0) {
          const recentRate = recentRow.positive / recentRow.total;
          const priorRate = priorRow.positive / priorRow.total;
          const diff = Math.round((recentRate - priorRate) * 100);
          improvementTrend = diff >= 0 ? `+${diff}%` : `${diff}%`;
        }
      }

      return {
        totalFeedback,
        positiveRate,
        topIssues,
        correctionsThisWeek,
        improvementTrend,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return reply.code(500).send({ error: `Failed to compute stats: ${message}` });
    }
  });
}
