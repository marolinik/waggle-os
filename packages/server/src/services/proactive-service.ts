import { eq, and, desc } from 'drizzle-orm';
import { proactivePatterns, suggestionsLog } from '../db/schema.js';
import type { Db } from '../db/connection.js';
import { MAX_SUGGESTIONS_PER_INTERACTION } from '@waggle/shared';
import { BUILT_IN_PATTERNS } from '../proactive/patterns.js';

export class ProactiveService {
  constructor(private db: Db) {}

  async ensurePatternsSeeded() {
    const existing = await this.db.select().from(proactivePatterns);
    if (existing.length === 0) {
      for (const p of BUILT_IN_PATTERNS) {
        await this.db.insert(proactivePatterns).values({
          name: p.name,
          trigger: { condition: p.triggerCondition },
          suggestionType: p.suggestionType,
          template: p.template,
        });
      }
    }
  }

  async evaluate(userId: string, jobContext: Record<string, unknown>) {
    // Check if user already has max pending suggestions
    const pending = await this.db.select().from(suggestionsLog)
      .where(and(
        eq(suggestionsLog.userId, userId),
        eq(suggestionsLog.status, 'pending'),
      ));

    if (pending.length >= MAX_SUGGESTIONS_PER_INTERACTION) return null;

    // Get active patterns
    const patterns = await this.db.select().from(proactivePatterns)
      .where(eq(proactivePatterns.enabled, true));

    for (const pattern of patterns) {
      const shouldTrigger = this.matchPattern(pattern, jobContext);
      if (!shouldTrigger) continue;

      // Check if already dismissed for this pattern
      const dismissed = await this.db.select().from(suggestionsLog)
        .where(and(
          eq(suggestionsLog.userId, userId),
          eq(suggestionsLog.patternId, pattern.id),
          eq(suggestionsLog.status, 'dismissed'),
        ));

      if (dismissed.length > 0) continue;

      // Create suggestion
      const [suggestion] = await this.db.insert(suggestionsLog).values({
        userId,
        patternId: pattern.id,
        context: jobContext,
        status: 'pending',
      }).returning();

      return { ...suggestion, pattern };
    }

    return null;
  }

  private matchPattern(
    pattern: { suggestionType: string },
    context: Record<string, unknown>,
  ): boolean {
    const triggerType = pattern.suggestionType;
    if (triggerType === 'cron' && context.repeatCount && (context.repeatCount as number) >= 3) return true;
    if (triggerType === 'dashboard' && context.hasData) return true;
    if (triggerType === 'share' && context.relevantUsers) return true;
    if (triggerType === 'upgrade' && context.expensiveModel) return true;
    if (triggerType === 'skill' && context.manualSteps) return true;
    return false;
  }

  async listPending(userId: string) {
    return this.db.select().from(suggestionsLog)
      .where(and(
        eq(suggestionsLog.userId, userId),
        eq(suggestionsLog.status, 'pending'),
      ))
      .orderBy(desc(suggestionsLog.createdAt));
  }

  async updateStatus(suggestionId: string, status: 'accepted' | 'dismissed' | 'snoozed') {
    const [updated] = await this.db.update(suggestionsLog)
      .set({ status })
      .where(eq(suggestionsLog.id, suggestionId))
      .returning();
    return updated ?? null;
  }
}
