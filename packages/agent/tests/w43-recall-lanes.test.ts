import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, SessionStore, MIND_FACT_PREFIX, MIND_EVENT_PREFIX, MIND_PROFILE_PREFIX } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

/**
 * W4.3b — extraction-lane rendering in recallMemory (plan components
 * #5/#6/#8 query side). Lane frames are written by extract-memory-lanes
 * (W4.3a); here we seed them directly and assert the render contract:
 * profiles first, dated facts, chronological events, windowed events
 * section, and the profile-never-as-snippet dedup rule.
 */

describe('W4.3b — recallMemory extraction lanes', () => {
  let db: MindDB;
  let orchestrator: Orchestrator;
  let frames: FrameStore;
  let gopId: string;

  beforeEach(() => {
    db = new MindDB(':memory:');
    orchestrator = new Orchestrator({ db, embedder: new MockEmbedder() });
    frames = new FrameStore(db);
    gopId = new SessionStore(db).create().gop_id;
  });

  afterEach(() => {
    db.close();
  });

  function seedLanes(): void {
    frames.createIFrame(gopId, `${MIND_PROFILE_PREFIX} Ana]\nAna is a designer based in Belgrade who plays Hollow Knight.`, 'normal', 'system');
    frames.createIFrame(gopId, `${MIND_FACT_PREFIX}\nUser preference: Ana prefers dark mode`, 'normal', 'system');
    frames.createIFrame(gopId, `${MIND_EVENT_PREFIX}\n[2026-05-07] Ana visited the dentist`, 'normal', 'system', '2026-05-07T00:00:00.000Z');
    frames.createIFrame(gopId, `${MIND_EVENT_PREFIX}\n[2026-06-02] Ana shipped the redesign`, 'normal', 'system', '2026-06-02T00:00:00.000Z');
  }

  it('renders profiles, facts, and chronological events sections', async () => {
    seedLanes();
    const result = await orchestrator.recallMemory('what is happening');

    expect(result.count).toBeGreaterThanOrEqual(4);
    const text = result.text;
    expect(text).toContain('## Profiles');
    expect(text).toContain('- Ana: Ana is a designer');
    expect(text).toContain('## Memory Facts');
    expect(text).toContain('Ana prefers dark mode');
    expect(text).toContain('## Events (chronological)');
    expect(text).toContain('[2026-05-07] Ana visited the dentist');

    // render order: profiles before facts before events
    expect(text.indexOf('## Profiles')).toBeLessThan(text.indexOf('## Memory Facts'));
    expect(text.indexOf('## Memory Facts')).toBeLessThan(text.indexOf('## Events (chronological)'));
  });

  it('explicit-period query gets a dedicated windowed events section', async () => {
    seedLanes();
    const result = await orchestrator.recallMemory('what did Ana do in May 2026?');
    expect(result.text).toContain('## Events during may 2026');
    // windowed section carries the in-window event, not the June one
    const windowed = result.text.slice(result.text.indexOf('## Events during'));
    expect(windowed).toContain('dentist');
    expect(windowed).not.toContain('redesign');
  });

  it('profile frames never double-render as search snippets', async () => {
    seedLanes();
    // Query keyword-matches the profile card content — the semantic lane
    // would surface the profile frame; the dedup rule must keep it out.
    const result = await orchestrator.recallMemory('Hollow Knight designer Belgrade');
    const occurrences = result.text.split('Hollow Knight').length - 1;
    expect(occurrences).toBe(1); // once under ## Profiles, never as a snippet
  });

  it('lane-only recall still returns content (no search hits required)', async () => {
    frames.createIFrame(gopId, `${MIND_FACT_PREFIX}\nUser preference: Ana prefers dark mode`, 'normal', 'system');
    const result = await orchestrator.recallMemory('zebra quantum xylophone');
    expect(result.count).toBeGreaterThan(0);
    expect(result.text).toContain('## Memory Facts');
  });
});
