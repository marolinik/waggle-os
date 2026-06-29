/**
 * Phase 3B (S11) — Automation Center display vocabulary.
 *  - §14.6: the FULL automation state vocabulary renders a label + tone.
 *  - Derived status from row + latest log + in-flight flag.
 *  - C27: success-rate math from execution logs.
 *  - C24: trigger description (schedule | manual only).
 */
import { describe, it, expect } from 'vitest';
import type { AutomationLog } from '@/lib/types';
import type { Automation } from '@waggle/shared';
import {
  AUTOMATION_STATE_META,
  type AutomationViewStatus,
  deriveAutomationStatus,
  successRateFromLogs,
  formatRatePercent,
  describeTrigger,
  workspaceLabel,
  groupAutomationsByWorkspace,
} from './automation-display';

const auto = (id: string, workspaceId: string): Automation => ({
  id, name: `A${id}`, triggerType: 'schedule', schedule: '0 9 * * *',
  actions: [], workspaceId, status: 'active',
});

const ALL_STATES: AutomationViewStatus[] = [
  'draft', 'scheduled', 'running', 'success', 'failed', 'paused', 'awaiting_approval', 'disabled',
];

function log(success: boolean): AutomationLog {
  return { id: 1, executedAt: '2026-06-10T01:00:00Z', durationMs: 1200, success, resultSummary: success ? 'ok' : null, error: success ? null : 'boom' };
}

describe('workspaceLabel', () => {
  const ws = [{ id: 'w1', name: 'Acme Sales' }, { id: 'w2', name: 'Legal' }];
  it('maps the cross-workspace sentinels to "All workspaces"', () => {
    expect(workspaceLabel('*', ws)).toBe('All workspaces');
    expect(workspaceLabel('global', ws)).toBe('All workspaces');
    expect(workspaceLabel(undefined, ws)).toBe('All workspaces');
    expect(workspaceLabel('', ws)).toBe('All workspaces');
  });
  it('resolves a known id to its name and falls back to the raw id', () => {
    expect(workspaceLabel('w1', ws)).toBe('Acme Sales');
    expect(workspaceLabel('w9', ws)).toBe('w9');
  });
});

describe('groupAutomationsByWorkspace', () => {
  const labelFor = (id: string | undefined) =>
    workspaceLabel(id, [{ id: 'w1', name: 'Acme' }, { id: 'w2', name: 'Legal' }]);
  it('returns [] for no rows', () => {
    expect(groupAutomationsByWorkspace([], labelFor)).toEqual([]);
  });
  it('partitions by workspace with the cross-workspace group first', () => {
    const groups = groupAutomationsByWorkspace(
      [auto('1', 'w2'), auto('2', '*'), auto('3', 'w1'), auto('4', 'w2')],
      labelFor,
    );
    expect(groups.map(g => g.key)).toEqual(['*', 'w1', 'w2']);
    expect(groups[0].label).toBe('All workspaces');
    expect(groups.find(g => g.key === 'w2')?.automations).toHaveLength(2);
  });
  it('treats a blank workspaceId as the cross-workspace group', () => {
    const groups = groupAutomationsByWorkspace([auto('1', '')], labelFor);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('*');
  });
});

describe('AUTOMATION_STATE_META — §14.6 full vocabulary', () => {
  it('maps every state to a non-empty label and tone', () => {
    for (const s of ALL_STATES) {
      const meta = AUTOMATION_STATE_META[s];
      expect(meta, `missing meta for ${s}`).toBeDefined();
      expect(meta.label.length).toBeGreaterThan(0);
      expect(['healthy', 'attention', 'risk', 'info', 'neutral']).toContain(meta.tone);
    }
    expect(AUTOMATION_STATE_META.awaiting_approval.label).toBe('Awaiting approval');
    expect(AUTOMATION_STATE_META.failed.tone).toBe('risk');
  });
});

describe('deriveAutomationStatus', () => {
  it('an enabled schedule is Scheduled', () => {
    expect(deriveAutomationStatus({ status: 'active' })).toBe('scheduled');
  });

  it('a disabled automation is Paused', () => {
    expect(deriveAutomationStatus({ status: 'paused' })).toBe('paused');
  });

  it('a failing latest run surfaces as Failed (overrides enabled)', () => {
    expect(deriveAutomationStatus({ status: 'active' }, log(false))).toBe('failed');
  });

  it('a successful latest run keeps the schedule state', () => {
    expect(deriveAutomationStatus({ status: 'active' }, log(true))).toBe('scheduled');
  });

  it('server-marked failed/running pass through even without logs', () => {
    expect(deriveAutomationStatus({ status: 'failed' }, null)).toBe('failed');
    expect(deriveAutomationStatus({ status: 'running' }, null)).toBe('running');
  });

  it('an in-flight Run-now wins over everything', () => {
    expect(deriveAutomationStatus({ status: 'paused' }, log(false), true)).toBe('running');
  });
});

describe('successRateFromLogs — C27 math', () => {
  it('returns the success fraction over the loaded rows', () => {
    expect(successRateFromLogs([log(true), log(true), log(false), log(true)])).toBeCloseTo(0.75);
    expect(successRateFromLogs([log(false)])).toBe(0);
  });

  it('returns null (rendered as a dash) when no runs are recorded', () => {
    expect(successRateFromLogs([])).toBeNull();
    expect(formatRatePercent(null)).toBe('—');
    expect(formatRatePercent(0.5)).toBe('50%');
  });
});

describe('describeTrigger — C24 (schedule-only v1 + manual)', () => {
  it('humanises a preset cron schedule', () => {
    expect(describeTrigger({ triggerType: 'schedule', schedule: '0 9 * * *' })).toBe('Every day at 9:00 AM');
  });

  it('labels manual automations as Run-now-only', () => {
    expect(describeTrigger({ triggerType: 'manual', schedule: '0 0 1 1 *' })).toContain('Manual');
    expect(describeTrigger({ triggerType: 'manual', schedule: '0 0 1 1 *' })).toContain('Run now');
  });
});
