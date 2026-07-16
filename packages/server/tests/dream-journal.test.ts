/**
 * DreamJournal — event recording, deterministic summary composition,
 * atomic persistence, quiet nights, narrative staleness, listing
 * (DREAM-DIARY spec).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DreamJournal, QUIET_NIGHT_SUMMARY, composeSummary, localDateString,
} from '../src/local/dream-journal.js';
import type { DreamEvent } from '../src/local/dream-journal.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-dreams-'));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

function evt(action: DreamEvent['action'], stats: Record<string, number>): DreamEvent {
  return { action, at: new Date().toISOString(), stats };
}

describe('composeSummary', () => {
  it('returns the quiet-night line when every counter is zero', () => {
    expect(composeSummary([])).toBe(QUIET_NIGHT_SUMMARY);
    expect(composeSummary([
      evt('memory_compact', { temporaryPruned: 0, deprecatedPruned: 0, pframesMerged: 0 }),
      evt('index_reconcile', { ftsFixed: 0, vecFixed: 0 }),
    ])).toBe(QUIET_NIGHT_SUMMARY);
  });

  it('names every kind of work with real counts and joins clauses with "and"', () => {
    const summary = composeSummary([
      evt('memory_compact', { temporaryPruned: 10, deprecatedPruned: 2, pframesMerged: 3 }),
      evt('harvest_sync', { framesSaved: 5, itemsScanned: 40, sourcesScanned: 1, couldNotVerify: 0 }),
      evt('memory_lane_extract', { framesProcessed: 20, factsWritten: 4, eventsWritten: 2, profilesWritten: 1 }),
      evt('index_reconcile', { ftsFixed: 1, vecFixed: 1 }),
    ]);
    expect(summary).toContain('merged 3 related memory fragments');
    expect(summary).toContain('cleared 12 stale memories');
    expect(summary).toContain('imported 5 new memories from 1 source');
    expect(summary).toContain('distilled 7 quick-recall notes');
    expect(summary).toContain('and repaired 2 search-index entries');
    expect(summary.startsWith('Overnight I ')).toBe(true);
  });

  it('aggregates repeated runs of the same action across the day', () => {
    const summary = composeSummary([
      evt('memory_compact', { temporaryPruned: 1, deprecatedPruned: 0, pframesMerged: 0 }),
      evt('memory_compact', { temporaryPruned: 2, deprecatedPruned: 1, pframesMerged: 0 }),
    ]);
    expect(summary).toBe('Overnight I cleared 4 stale memories.');
  });

  it('surfaces erasure-suppressed items honestly', () => {
    const summary = composeSummary([
      evt('harvest_sync', { framesSaved: 3, itemsScanned: 10, sourcesScanned: 1, couldNotVerify: 2 }),
    ]);
    expect(summary).toContain('left 2 items out (could not verify against your erasure list)');
  });

  it('uses singular nouns for count 1', () => {
    const summary = composeSummary([evt('index_reconcile', { ftsFixed: 1, vecFixed: 0 })]);
    expect(summary).toBe('Overnight I repaired 1 search-index entry.');
  });
});

describe('DreamJournal record + persistence', () => {
  it('records events into the local-date file and refreshes the summary', () => {
    const j = new DreamJournal(dir);
    const day = j.record('memory_compact', { temporaryPruned: 5, deprecatedPruned: 0, pframesMerged: 1 });
    expect(day.date).toBe(localDateString());
    expect(day.events).toHaveLength(1);
    expect(day.summary).toContain('merged 1 related memory fragment');

    // Fresh instance reads the same day from disk.
    const again = new DreamJournal(dir).read(day.date);
    expect(again?.events).toHaveLength(1);
    expect(again?.summary).toBe(day.summary);
  });

  it('retries transient rename failures before persisting', () => {
    const rename = vi.spyOn(fs, 'renameSync')
      .mockImplementationOnce(() => { throw Object.assign(new Error('locked'), { code: 'EPERM' }); })
      .mockImplementationOnce(() => { throw Object.assign(new Error('locked'), { code: 'EPERM' }); });
    const j = new DreamJournal(dir);

    expect(() => {
      j.record('index_reconcile', { ftsFixed: 1, vecFixed: 0 }, new Date('2026-07-09T03:00:00'));
    }).not.toThrow();
    expect(rename).toHaveBeenCalledTimes(3);
    expect(new DreamJournal(dir).read('2026-07-09')?.events).toHaveLength(1);
  });

  it('invalidates a stale narrative when new events arrive', () => {
    const j = new DreamJournal(dir);
    const day = j.record('memory_compact', { temporaryPruned: 1, deprecatedPruned: 0, pframesMerged: 0 });
    j.setNarrative(day.date, 'I tidied one memory.');
    expect(j.read(day.date)?.narrative).toBe('I tidied one memory.');

    j.record('harvest_sync', { framesSaved: 9, itemsScanned: 9, sourcesScanned: 1, couldNotVerify: 0 });
    expect(j.read(day.date)?.narrative).toBeUndefined();
  });

  it('setNarrative on a missing date is a no-op', () => {
    const j = new DreamJournal(dir);
    j.setNarrative('1999-01-01', 'ghost');
    expect(j.read('1999-01-01')).toBeNull();
  });

  it('writes separate files per calendar day (rollover)', () => {
    const j = new DreamJournal(dir);
    j.record('memory_compact', { temporaryPruned: 1, deprecatedPruned: 0, pframesMerged: 0 }, new Date('2026-07-08T23:50:00'));
    j.record('memory_compact', { temporaryPruned: 2, deprecatedPruned: 0, pframesMerged: 0 }, new Date('2026-07-09T00:10:00'));
    expect(j.read('2026-07-08')?.events).toHaveLength(1);
    expect(j.read('2026-07-09')?.events).toHaveLength(1);
  });

  it('survives a corrupt day file by treating it as absent', () => {
    fs.mkdirSync(path.join(dir, 'dreams'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dreams', '2026-07-09.json'), '{nope', 'utf8');
    const j = new DreamJournal(dir);
    expect(j.read('2026-07-09')).toBeNull();
    // Recording over it heals the file.
    const day = j.record('index_reconcile', { ftsFixed: 1, vecFixed: 0 }, new Date('2026-07-09T03:00:00'));
    expect(day.events).toHaveLength(1);
  });
});

describe('DreamJournal list', () => {
  it('returns newest-first, limited to the requested window', () => {
    const j = new DreamJournal(dir);
    j.record('memory_compact', { temporaryPruned: 1, deprecatedPruned: 0, pframesMerged: 0 }, new Date('2026-07-05T03:00:00'));
    j.record('memory_compact', { temporaryPruned: 2, deprecatedPruned: 0, pframesMerged: 0 }, new Date('2026-07-07T03:00:00'));
    j.record('memory_compact', { temporaryPruned: 3, deprecatedPruned: 0, pframesMerged: 0 }, new Date('2026-07-09T03:00:00'));

    const two = j.list(2);
    expect(two.map(d => d.date)).toEqual(['2026-07-09', '2026-07-07']);
  });

  it('returns [] when nothing was ever recorded', () => {
    expect(new DreamJournal(dir).list(7)).toEqual([]);
  });
});
