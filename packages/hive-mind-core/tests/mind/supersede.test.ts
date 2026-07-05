import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore, type MemoryFrame } from '../../src/mind/frames.js';
import {
  detectSupersessionChains,
  detectEntityGroups,
  applyConsolidation,
  collectObservations,
  getCurrentValues,
  type ConsolidationLlm,
  type Observation,
} from '../../src/mind/supersede.js';

/**
 * Fake llm callback: branches on the system prompt (supersession vs group) and
 * returns canned JSON. No API calls. `chains` / `groups` are the raw response
 * strings so malformed-JSON cases can be exercised too.
 */
function fakeLlm(responses: { chains?: string; groups?: string }): ConsolidationLlm {
  return async (system: string) => {
    if (/UPDATE CHAINS/.test(system)) return responses.chains ?? '{"chains":[]}';
    if (/ENUMERABLE GROUPS/.test(system)) return responses.groups ?? '{"groups":[]}';
    return '{}';
  };
}

describe('consolidate', () => {
  let dbPath: string;
  let db: MindDB;
  let frames: FrameStore;

  beforeEach(() => {
    dbPath = join(tmpdir(), `hive-mind-consolidate-test-${Date.now()}-${Math.random()}.mind`);
    db = new MindDB(dbPath);
    db.getDatabase()
      .prepare("INSERT INTO sessions (gop_id, status, started_at) VALUES ('gop-test', 'active', datetime('now'))")
      .run();
    frames = new FrameStore(db);
  });

  afterEach(() => {
    db.close();
    if (existsSync(dbPath)) rmSync(dbPath);
    for (const suffix of ['-shm', '-wal']) {
      if (existsSync(dbPath + suffix)) rmSync(dbPath + suffix);
    }
  });

  /** Create an agent_inferred I-frame (distiller-shaped observation). */
  const obs = (content: string): MemoryFrame =>
    frames.createIFrame('gop-test', content, 'normal', 'agent_inferred');

  const toObservations = (fs: MemoryFrame[]): Observation[] =>
    fs.map((f) => ({ id: f.id, content: f.content, created_at: f.created_at }));

  it('applyConsolidation deprecates stale members, boosts the newest, and writes a based P-frame', () => {
    const f1 = obs('user has 1250 followers');
    const f2 = obs('user has 1280 followers');
    const f3 = obs('user has 1300 followers');

    const result = applyConsolidation(
      frames,
      [{ attribute: 'follower count', currentValue: '1300 followers', frameIds: [f1.id, f2.id, f3.id] }],
      [],
      'gop-test',
    );

    // Stale members deprecated, newest boosted.
    expect(result.deprecated).toEqual([f1.id, f2.id]);
    expect(frames.getById(f1.id)?.importance).toBe('deprecated');
    expect(frames.getById(f2.id)?.importance).toBe('deprecated');
    expect(frames.getById(f3.id)?.importance).toBe('critical');

    // One P-frame, based on the OLDEST member, carrying the clean current value.
    expect(result.pframes).toHaveLength(1);
    const pf = result.pframes[0];
    expect(pf.frame_type).toBe('P');
    expect(pf.base_frame_id).toBe(f1.id);
    expect(pf.importance).toBe('critical');
    expect(pf.source).toBe('agent_inferred');
    expect(pf.content).toContain('[current] follower count: 1300 followers');
  });

  it('applyConsolidation bridges an entity group into a B-frame whose references resolve', () => {
    const a = obs('user set up a 40-gallon reef tank');
    const b = obs('user set up a 20-gallon nano tank');
    const c = obs('user set up a 10-gallon quarantine tank');

    const result = applyConsolidation(
      frames,
      [],
      [{ label: 'aquarium tanks the user owns', frameIds: [a.id, b.id, c.id] }],
      'gop-test',
    );

    expect(result.bframes).toHaveLength(1);
    const bf = result.bframes[0];
    expect(bf.frame_type).toBe('B');
    // References survive the JSON round-trip and are retrievable.
    expect(frames.getBFrameReferences(bf.id)).toEqual([a.id, b.id, c.id]);
    const parsed = JSON.parse(bf.content) as { description: string };
    expect(parsed.description).toBe('aquarium tanks the user owns (3 members)');
  });

  it('falls back to the newest frame content when current_value is missing', () => {
    const f1 = obs('the guitar lives on the wall hook');
    const f2 = obs('the guitar now lives in a hard case under the bed');

    const result = applyConsolidation(
      frames,
      [{ attribute: '', currentValue: '', frameIds: [f1.id, f2.id] }],
      [],
      'gop-test',
    );

    const asOf = String(f2.created_at).slice(0, 10);
    // Empty attribute → 'value'; empty current_value → newest frame content.
    expect(result.pframes[0].content).toBe(
      `[current] value: the guitar now lives in a hard case under the bed  (as of ${asOf})`,
    );
  });

  it('detectSupersessionChains tolerates malformed LLM JSON (returns [])', async () => {
    const list = toObservations([obs('a'), obs('b')]);
    const chains = await detectSupersessionChains(list, fakeLlm({ chains: 'sorry, no JSON here' }));
    expect(chains).toEqual([]);
  });

  it('detectSupersessionChains recovers a JSON object embedded in prose', async () => {
    const f1 = obs('salary is 90k');
    const f2 = obs('salary is 110k');
    const list = toObservations([f1, f2]);

    const chains = await detectSupersessionChains(
      list,
      fakeLlm({ chains: 'Here you go:\n{"chains":[{"attribute":"salary","current_value":"110k","ids":[1,2]}]}\nhope that helps' }),
    );
    expect(chains).toHaveLength(1);
    expect(chains[0].frameIds).toEqual([f1.id, f2.id]);
    expect(chains[0].currentValue).toBe('110k');
  });

  it('detectEntityGroups maps observation numbers to frame ids and drops groups with <2 members', async () => {
    const f1 = obs('attended cousin wedding in May');
    const f2 = obs('bought a new laptop');
    const f3 = obs('attended college roommate wedding in September');
    const list = toObservations([f1, f2, f3]);

    const groups = await detectEntityGroups(
      list,
      fakeLlm({ groups: '{"groups":[{"label":"weddings attended","ids":[1,3]},{"label":"loner","ids":[2]}]}' }),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('weddings attended');
    expect(groups[0].frameIds).toEqual([f1.id, f3.id]);
  });

  it('reconstructState surfaces the consolidation P-frame', () => {
    const f1 = obs('the office is on the 3rd floor');
    const f2 = obs('the office moved to the 7th floor');

    applyConsolidation(
      frames,
      [{ attribute: 'office floor', currentValue: '7th floor', frameIds: [f1.id, f2.id] }],
      [],
      'gop-test',
    );

    const state = frames.reconstructState('gop-test');
    // Latest I-frame is the (boosted) newest member; the P-frame follows it.
    expect(state.iframe?.id).toBe(f2.id);
    expect(state.pframes.some((p) => p.content.includes('[current] office floor: 7th floor'))).toBe(true);
  });

  it('getCurrentValues returns P-frame lines with the [current] marker stripped', () => {
    const f1 = obs('weight was 82 kg');
    const f2 = obs('weight is 78 kg');
    applyConsolidation(
      frames,
      [{ attribute: 'body weight', currentValue: '78 kg', frameIds: [f1.id, f2.id] }],
      [],
      'gop-test',
    );

    const values = getCurrentValues(db, 'gop-test');
    expect(values).toHaveLength(1);
    expect(values[0]).toMatch(/^body weight: 78 kg/);
    expect(values[0]).not.toContain('[current]');
  });

  it('collectObservations returns only non-deprecated agent_inferred I-frames, chronological', () => {
    const f1 = obs('first agent observation');
    const f2 = obs('second agent observation');
    frames.createIFrame('gop-test', 'a user-stated note', 'normal', 'user_stated');
    // Deprecate the first — it must drop out of the observation set.
    frames.update(f1.id, f1.content, 'deprecated');

    const list = collectObservations(db);
    const ids = list.map((o) => o.id);
    expect(ids).toContain(f2.id);
    expect(ids).not.toContain(f1.id);
    // The user_stated frame is excluded by the default source filter.
    expect(list.every((o) => o.content !== 'a user-stated note')).toBe(true);
  });

  it('detect → apply end-to-end with a fake llm produces both P and B frames', async () => {
    const f1 = obs('subscribes to National Geographic');
    const f2 = obs('subscribes to The Economist');
    const f3 = obs('rank was silver tier');
    const f4 = obs('rank is now gold tier');
    const list = toObservations([f1, f2, f3, f4]);

    const llm = fakeLlm({
      chains: '{"chains":[{"attribute":"loyalty rank","current_value":"gold tier","ids":[3,4]}]}',
      groups: '{"groups":[{"label":"magazine subscriptions","ids":[1,2]}]}',
    });

    const [chains, groups] = await Promise.all([
      detectSupersessionChains(list, llm),
      detectEntityGroups(list, llm),
    ]);
    const result = applyConsolidation(frames, chains, groups, 'gop-test');

    expect(result.pframes).toHaveLength(1);
    expect(result.bframes).toHaveLength(1);
    expect(result.deprecated).toEqual([f3.id]);
    expect(frames.getById(f4.id)?.importance).toBe('critical');
    expect(frames.getBFrameReferences(result.bframes[0].id)).toEqual([f1.id, f2.id]);
  });

  it('applyConsolidation rejects a missing gopId', () => {
    expect(() => applyConsolidation(frames, [], [], '')).toThrow(/gopId is required/);
  });
});
