/**
 * Agent Learning — persistent behavioral adjustments from performance signals.
 *
 * Tracks what works and what doesn't across sessions, adjusts agent behavior
 * by building a learned context section injected into the system prompt.
 *
 * Three learning channels:
 * 1. Correction patterns — user corrections become persistent rules
 * 2. Success patterns — approaches that got positive feedback
 * 3. Persona effectiveness — per-persona quality signals
 *
 * Uses the improvement_signals table for persistence.
 */

import type { ImprovementSignalStore } from '@waggle/core';

export interface LearnedBehavior {
  rule: string;
  source: 'correction' | 'success' | 'observation';
  confidence: number;
  occurrences: number;
  lastSeen: string;
}

export interface PersonaEffectiveness {
  personaId: string;
  tasksCompleted: number;
  correctionsReceived: number;
  positiveSignals: number;
  effectivenessScore: number; // 0-100
}

export interface LearningSnapshot {
  learnedBehaviors: LearnedBehavior[];
  personaStats: PersonaEffectiveness[];
  totalCorrections: number;
  totalSuccesses: number;
  adaptationLevel: 'new' | 'learning' | 'adapted' | 'expert';
}

export class AgentLearning {
  private store: ImprovementSignalStore;

  constructor(store: ImprovementSignalStore) {
    this.store = store;
  }

  /** Record a successful interaction pattern. */
  recordSuccess(pattern: string, personaId?: string): void {
    this.store.record('workflow_pattern', `success:${pattern}`, `Approach worked well`, {
      type: 'success',
      personaId,
      recordedAt: new Date().toISOString(),
    });
  }

  /** Record that the user gave positive feedback. */
  recordPositiveFeedback(context: string, personaId?: string): void {
    this.store.record('correction', `positive:${context.slice(0, 50)}`, context, {
      type: 'positive',
      personaId,
      recordedAt: new Date().toISOString(),
    });
  }

  /** Record a persona's task completion. */
  recordPersonaTask(personaId: string, corrected: boolean): void {
    const key = corrected ? `persona:${personaId}:corrected` : `persona:${personaId}:completed`;
    this.store.record('workflow_pattern', key, personaId, {
      type: 'persona_task',
      personaId,
      corrected,
    });
  }

  /** Build a learning snapshot from accumulated signals. */
  getSnapshot(): LearningSnapshot {
    const all = this.store.getActionable();
    const learnedBehaviors: LearnedBehavior[] = [];
    const personaMap = new Map<string, PersonaEffectiveness>();
    let totalCorrections = 0;
    let totalSuccesses = 0;

    for (const signal of all) {
      // Corrections become learned behavioral rules
      if (signal.category === 'correction' && !signal.pattern_key.startsWith('positive:')) {
        totalCorrections += signal.count;
        if (signal.count >= 2) { // Only learn from repeated corrections
          learnedBehaviors.push({
            rule: signal.detail || signal.pattern_key,
            source: 'correction',
            confidence: Math.min(1.0, 0.5 + signal.count * 0.1),
            occurrences: signal.count,
            lastSeen: signal.last_seen,
          });
        }
      }

      // Positive feedback
      if (signal.pattern_key.startsWith('positive:')) {
        totalSuccesses += signal.count;
        learnedBehaviors.push({
          rule: signal.detail || 'Positive approach',
          source: 'success',
          confidence: Math.min(1.0, 0.6 + signal.count * 0.1),
          occurrences: signal.count,
          lastSeen: signal.last_seen,
        });
      }

      // Success patterns
      if (signal.pattern_key.startsWith('success:')) {
        totalSuccesses += signal.count;
      }

      // Persona stats
      if (signal.pattern_key.startsWith('persona:')) {
        const parts = signal.pattern_key.split(':');
        const personaId = parts[1];
        const isCorrected = parts[2] === 'corrected';

        let stats = personaMap.get(personaId);
        if (!stats) {
          stats = { personaId, tasksCompleted: 0, correctionsReceived: 0, positiveSignals: 0, effectivenessScore: 50 };
          personaMap.set(personaId, stats);
        }

        if (isCorrected) {
          stats.correctionsReceived += signal.count;
        } else {
          stats.tasksCompleted += signal.count;
        }
      }
    }

    // Calculate persona effectiveness
    for (const stats of personaMap.values()) {
      const total = stats.tasksCompleted + stats.correctionsReceived;
      stats.effectivenessScore = total > 0
        ? Math.round((stats.tasksCompleted / total) * 100)
        : 50;
    }

    // Determine adaptation level
    const totalSignals = totalCorrections + totalSuccesses;
    const adaptationLevel = totalSignals < 5 ? 'new'
      : totalSignals < 20 ? 'learning'
      : totalSignals < 50 ? 'adapted'
      : 'expert';

    return {
      learnedBehaviors: learnedBehaviors.slice(0, 10), // Cap at 10 rules
      personaStats: Array.from(personaMap.values()),
      totalCorrections,
      totalSuccesses,
      adaptationLevel,
    };
  }

  /**
   * Format learned behaviors as a system prompt section.
   * Only included when there are meaningful learned rules.
   */
  formatLearningPrompt(): string | null {
    const snapshot = this.getSnapshot();
    if (snapshot.learnedBehaviors.length === 0) return null;

    const lines: string[] = [
      '## Learned Behaviors',
      `*Adaptation level: ${snapshot.adaptationLevel} (${snapshot.totalCorrections} corrections, ${snapshot.totalSuccesses} successes)*`,
      '',
    ];

    const corrections = snapshot.learnedBehaviors.filter(b => b.source === 'correction');
    if (corrections.length > 0) {
      lines.push('**Avoid these patterns** (user has corrected before):');
      for (const b of corrections) {
        lines.push(`- ${b.rule} (corrected ${b.occurrences}x, confidence: ${(b.confidence * 100).toFixed(0)}%)`);
      }
      lines.push('');
    }

    const successes = snapshot.learnedBehaviors.filter(b => b.source === 'success');
    if (successes.length > 0) {
      lines.push('**Keep doing** (positive feedback received):');
      for (const b of successes) {
        lines.push(`- ${b.rule}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
