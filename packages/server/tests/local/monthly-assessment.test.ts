/**
 * Monthly Self-Assessment Tests
 *
 * Verifies:
 * - Assessment shape and all required fields
 * - Cron registration (monthly_assessment job type is valid)
 * - Assessment saves to personal mind as I-frame
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, CronStore, FrameStore, OptimizationLogStore, ImprovementSignalStore } from '@waggle/core';
import { generateMonthlyAssessment, saveAssessmentToMind, type MonthlyAssessment } from '../../src/local/monthly-assessment.js';

describe('Monthly Self-Assessment', () => {
  let db: MindDB;

  beforeEach(() => {
    db = new MindDB(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ── Assessment shape ────────────────────────────────────────────────

  describe('generateMonthlyAssessment', () => {
    it('returns a valid MonthlyAssessment shape', () => {
      const config = { port: 3333, host: '127.0.0.1', dataDir: '/tmp/test', litellmUrl: 'http://localhost:4000' };
      const assessment = generateMonthlyAssessment(config, db, '2026-03');

      expect(assessment).toBeDefined();
      expect(assessment.period).toBe('2026-03');
      expect(typeof assessment.totalInteractions).toBe('number');
      expect(typeof assessment.correctionRate).toBe('number');
      expect(typeof assessment.improvementTrend).toBe('string');
      expect(Array.isArray(assessment.topStrengths)).toBe(true);
      expect(Array.isArray(assessment.topWeaknesses)).toBe(true);
      expect(Array.isArray(assessment.capabilityGapsDetected)).toBe(true);
      expect(typeof assessment.skillsInstalled).toBe('number');
      expect(typeof assessment.recommendation).toBe('string');
      expect(assessment.recommendation.length).toBeGreaterThan(0);
    });

    it('defaults to previous month when no period override', () => {
      const config = { port: 3333, host: '127.0.0.1', dataDir: '/tmp/test', litellmUrl: 'http://localhost:4000' };
      const assessment = generateMonthlyAssessment(config, db);

      // Period should be YYYY-MM format for the previous month
      expect(assessment.period).toMatch(/^\d{4}-\d{2}$/);
    });

    it('computes correction rate from optimization logs', () => {
      // Insert some optimization log entries for March 2026
      const optStore = new OptimizationLogStore(db);
      optStore.insert({
        sessionId: 's1',
        workspaceId: 'w1',
        systemPrompt: 'test',
        toolsUsed: ['read_file'],
        turnCount: 5,
        wasCorrection: false,
      });
      optStore.insert({
        sessionId: 's2',
        workspaceId: 'w1',
        systemPrompt: 'test',
        toolsUsed: ['write_file'],
        turnCount: 3,
        wasCorrection: true,
      });

      const config = { port: 3333, host: '127.0.0.1', dataDir: '/tmp/test', litellmUrl: 'http://localhost:4000' };
      // Use current month since the entries use datetime('now')
      const now = new Date();
      const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const assessment = generateMonthlyAssessment(config, db, currentPeriod);

      expect(assessment.totalInteractions).toBe(2);
      expect(assessment.correctionRate).toBe(0.5);
    });

    it('includes capability gaps from improvement signals', () => {
      const signalStore = new ImprovementSignalStore(db);
      // Record the same gap twice (threshold for capability_gap is 2)
      signalStore.record('capability_gap', 'missing:web_search', 'User needed web search');
      signalStore.record('capability_gap', 'missing:web_search', 'User needed web search again');

      const config = { port: 3333, host: '127.0.0.1', dataDir: '/tmp/test', litellmUrl: 'http://localhost:4000' };
      const assessment = generateMonthlyAssessment(config, db, '2026-03');

      expect(assessment.capabilityGapsDetected).toContain('web_search');
    });

    it('has non-empty top strengths even with zero data', () => {
      const config = { port: 3333, host: '127.0.0.1', dataDir: '/tmp/test', litellmUrl: 'http://localhost:4000' };
      const assessment = generateMonthlyAssessment(config, db, '2026-03');

      // Should have at least one strength (e.g., "Stable operation")
      expect(assessment.topStrengths.length).toBeGreaterThan(0);
    });

    it('limits top strengths and weaknesses to 5', () => {
      const config = { port: 3333, host: '127.0.0.1', dataDir: '/tmp/test', litellmUrl: 'http://localhost:4000' };
      const assessment = generateMonthlyAssessment(config, db, '2026-03');

      expect(assessment.topStrengths.length).toBeLessThanOrEqual(5);
      expect(assessment.topWeaknesses.length).toBeLessThanOrEqual(5);
    });
  });

  // ── Save to mind ────────────────────────────────────────────────────

  describe('saveAssessmentToMind', () => {
    it('saves assessment as an I-frame in the personal mind', () => {
      const assessment: MonthlyAssessment = {
        period: '2026-03',
        totalInteractions: 100,
        correctionRate: 0.15,
        improvementTrend: '+5%',
        topStrengths: ['Low correction rate', 'Consistent positive user feedback'],
        topWeaknesses: ['wrong answer'],
        capabilityGapsDetected: ['web_search'],
        skillsInstalled: 2,
        recommendation: 'Agent is performing well overall.',
      };

      saveAssessmentToMind(db, assessment);

      // Verify the frame was created
      const frames = new FrameStore(db);
      const allFrames = frames.getRecent(10);
      expect(allFrames.length).toBe(1);

      const frame = allFrames[0];
      expect(frame.frame_type).toBe('I');
      expect(frame.gop_id).toBe('assessment');
      expect(frame.importance).toBe('important');
      expect(frame.content).toContain('Monthly Agent Assessment');
      expect(frame.content).toContain('2026-03');
      expect(frame.content).toContain('15.0%');
      expect(frame.content).toContain('+5%');
      expect(frame.content).toContain('web_search');
    });
  });

  // ── Cron registration ───────────────────────────────────────────────

  describe('cron registration', () => {
    it('monthly_assessment is a valid cron job type', () => {
      const cronStore = new CronStore(db);

      // This should not throw — monthly_assessment is in VALID_JOB_TYPES
      const schedule = cronStore.create({
        name: 'Monthly assessment',
        cronExpr: '0 6 1 * *',
        jobType: 'monthly_assessment',
      });

      expect(schedule.name).toBe('Monthly assessment');
      expect(schedule.cron_expr).toBe('0 6 1 * *');
      expect(schedule.job_type).toBe('monthly_assessment');
    });

    it('cron expression fires on 1st of month at 6 AM', () => {
      const cronStore = new CronStore(db);
      const schedule = cronStore.create({
        name: 'Monthly assessment',
        cronExpr: '0 6 1 * *',
        jobType: 'monthly_assessment',
      });

      // next_run_at should be set and valid
      expect(schedule.next_run_at).toBeDefined();
      expect(schedule.next_run_at).not.toBeNull();

      // The next run should be on the 1st of some month at 6 AM local time
      // cron-parser interprets expressions in local timezone
      const nextRun = new Date(schedule.next_run_at!);
      expect(nextRun.getDate()).toBe(1);
      expect(nextRun.getHours()).toBe(6);
      expect(nextRun.getMinutes()).toBe(0);
    });
  });
});
