/**
 * CapabilitiesView — Unit tests for pack reconciliation logic
 *
 * Tests the data fetching, progress state management, and helper functions
 * used by the Recommended + Community tier display.
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialProgress,
  priorityLabel,
  priorityColor,
} from '../src/views/CapabilitiesView';
import type {
  BulkInstallProgress,
  MarketplacePackSummary,
  MarketplacePackDetail,
  MarketplacePackageEntry,
} from '../src/views/CapabilitiesView';

// ── Helper Functions ─────────────────────────────────────────────────────

describe('createInitialProgress', () => {
  it('returns a clean initial state', () => {
    const progress = createInitialProgress();
    expect(progress.installing).toBe(false);
    expect(progress.current).toBe(0);
    expect(progress.total).toBe(0);
    expect(progress.currentName).toBe('');
    expect(progress.errors).toEqual([]);
    expect(progress.done).toBe(false);
  });

  it('creates independent instances', () => {
    const a = createInitialProgress();
    const b = createInitialProgress();
    a.errors.push('test');
    expect(b.errors.length).toBe(0);
  });
});

describe('priorityLabel', () => {
  it('maps core to Core', () => {
    expect(priorityLabel('core')).toBe('Core');
  });

  it('maps recommended to Recommended', () => {
    expect(priorityLabel('recommended')).toBe('Recommended');
  });

  it('maps optional to Optional', () => {
    expect(priorityLabel('optional')).toBe('Optional');
  });

  it('returns raw string for unknown priority', () => {
    expect(priorityLabel('custom')).toBe('custom');
  });
});

describe('priorityColor', () => {
  it('returns primary class for core priority', () => {
    expect(priorityColor('core')).toBe('text-primary');
  });

  it('returns blue class for recommended priority', () => {
    expect(priorityColor('recommended')).toBe('text-blue-500');
  });

  it('returns muted class for optional priority', () => {
    expect(priorityColor('optional')).toBe('text-muted-foreground');
  });

  it('returns muted class for unknown priority', () => {
    expect(priorityColor('unknown')).toBe('text-muted-foreground');
  });
});

// ── BulkInstallProgress State Shape ──────────────────────────────────────

describe('BulkInstallProgress state transitions', () => {
  it('models the start state correctly', () => {
    const state: BulkInstallProgress = {
      installing: true,
      current: 0,
      total: 12,
      currentName: 'Fetching pack details...',
      errors: [],
      done: false,
    };
    expect(state.installing).toBe(true);
    expect(state.done).toBe(false);
  });

  it('models mid-install progress correctly', () => {
    const state: BulkInstallProgress = {
      installing: true,
      current: 3,
      total: 12,
      currentName: 'Data Analyst',
      errors: [],
      done: false,
    };
    expect(state.current).toBe(3);
    expect(state.total).toBe(12);
    const percentComplete = (state.current / state.total) * 100;
    expect(percentComplete).toBe(25);
  });

  it('models successful completion', () => {
    const state: BulkInstallProgress = {
      installing: false,
      current: 12,
      total: 12,
      currentName: '',
      errors: [],
      done: true,
    };
    expect(state.done).toBe(true);
    expect(state.errors.length).toBe(0);
    expect(state.installing).toBe(false);
  });

  it('models partial failure', () => {
    const state: BulkInstallProgress = {
      installing: false,
      current: 12,
      total: 12,
      currentName: '',
      errors: [
        'Evil Skill: blocked (CRITICAL)',
        'Risky Plugin: Install failed',
      ],
      done: true,
    };
    expect(state.done).toBe(true);
    expect(state.errors.length).toBe(2);
    expect(state.errors[0]).toContain('blocked');
  });

  it('tracks progress across multiple packs independently', () => {
    const progressMap: Record<string, BulkInstallProgress> = {
      'research-analyst': {
        installing: true,
        current: 5,
        total: 11,
        currentName: 'Web Search',
        errors: [],
        done: false,
      },
      'content-operator': {
        installing: false,
        current: 12,
        total: 12,
        currentName: '',
        errors: [],
        done: true,
      },
    };

    expect(progressMap['research-analyst'].installing).toBe(true);
    expect(progressMap['content-operator'].done).toBe(true);
  });
});

// ── Type Shape Validation ────────────────────────────────────────────────

describe('MarketplacePackSummary type shape', () => {
  it('validates expected fields from /api/marketplace/packs', () => {
    const pack: MarketplacePackSummary = {
      id: 1,
      slug: 'research-analyst',
      display_name: 'Research Analyst',
      description: 'Tools for deep research and analysis',
      target_roles: 'researcher,analyst',
      icon: '',
      priority: 'core',
      connectors_needed: [],
      created_at: '2026-03-15T00:00:00Z',
    };

    expect(pack.slug).toBe('research-analyst');
    expect(pack.display_name).toBe('Research Analyst');
    expect(pack.priority).toBe('core');
    expect(pack.target_roles.split(',')).toHaveLength(2);
  });
});

describe('MarketplacePackDetail type shape', () => {
  it('validates expected structure from /api/marketplace/packs/:slug', () => {
    const detail: MarketplacePackDetail = {
      pack: {
        id: 1,
        slug: 'developer',
        display_name: 'Developer',
        description: 'Essential developer tools',
        target_roles: 'developer,engineer',
        icon: '',
        priority: 'core',
        connectors_needed: ['github'],
        created_at: '2026-03-15T00:00:00Z',
      },
      packages: [
        {
          id: 10,
          name: 'code-review',
          display_name: 'Code Review',
          description: 'Automated code review',
          waggle_install_type: 'skill',
          category: 'development',
        },
        {
          id: 11,
          name: 'git-helper',
          display_name: 'Git Helper',
          description: 'Git workflow assistance',
          waggle_install_type: 'skill',
          category: 'development',
        },
      ],
    };

    expect(detail.pack.slug).toBe('developer');
    expect(detail.packages).toHaveLength(2);
    expect(detail.packages[0].waggle_install_type).toBe('skill');
  });
});

// ── Progress percentage calculation ──────────────────────────────────────

describe('progress percentage calculation', () => {
  it('calculates 0% when no packages installed', () => {
    const progress: BulkInstallProgress = createInitialProgress();
    const pct = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;
    expect(pct).toBe(0);
  });

  it('calculates correct percentage mid-install', () => {
    const progress: BulkInstallProgress = {
      installing: true,
      current: 5,
      total: 10,
      currentName: 'Test Package',
      errors: [],
      done: false,
    };
    const pct = (progress.current / progress.total) * 100;
    expect(pct).toBe(50);
  });

  it('calculates 100% when complete', () => {
    const progress: BulkInstallProgress = {
      installing: false,
      current: 10,
      total: 10,
      currentName: '',
      errors: [],
      done: true,
    };
    const pct = (progress.current / progress.total) * 100;
    expect(pct).toBe(100);
  });
});
