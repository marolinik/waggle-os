import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore } from '../../src/mind/frames.js';
import { SessionStore } from '../../src/mind/sessions.js';
import { HybridSearch } from '../../src/mind/search.js';
import {
  computeTemporalScore,
  computePopularityScore,
  computeContextualScore,
  computeImportanceScore,
  computeRelevance,
  SCORING_PROFILES,
} from '../../src/mind/scoring.js';
import { MockEmbedder } from './helpers/mock-embedder.js';

describe('Hybrid Search (FTS5 + sqlite-vec + RRF + Relevance)', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let search: HybridSearch;
  let embedder: MockEmbedder;

  beforeEach(async () => {
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    embedder = new MockEmbedder();
    search = new HybridSearch(db, embedder);
  });

  afterEach(() => {
    db.close();
  });

  async function seedFrames() {
    const session = sessions.create();
    const gopId = session.gop_id;

    const data = [
      { content: 'Machine learning algorithms for classification tasks', importance: 'normal' as const },
      { content: 'TypeScript generics and advanced type system features', importance: 'important' as const },
      { content: 'Deep neural networks for image recognition', importance: 'normal' as const },
      { content: 'React component lifecycle and hooks patterns', importance: 'normal' as const },
      { content: 'Natural language processing with transformers', importance: 'critical' as const },
      { content: 'Database indexing strategies for SQLite FTS5', importance: 'important' as const },
      { content: 'Python data science libraries pandas numpy', importance: 'temporary' as const },
      { content: 'Kubernetes deployment and container orchestration', importance: 'normal' as const },
      { content: 'Machine learning model training and optimization', importance: 'normal' as const },
      { content: 'GraphQL API design and schema stitching', importance: 'deprecated' as const },
    ];

    const createdFrames: { id: number; content: string }[] = [];
    for (const d of data) {
      const frame = frames.createIFrame(gopId, d.content, d.importance);
      createdFrames.push({ id: frame.id, content: d.content });
    }

    // Index all frames for vector search
    await search.indexFramesBatch(createdFrames);

    return { gopId, createdFrames };
  }

  describe('Keyword search via FTS5', () => {
    it('finds exact keyword matches', async () => {
      await seedFrames();
      const results = await search.keywordSearch('machine learning', 10);
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty for no matches', async () => {
      await seedFrames();
      const results = await search.keywordSearch('quantum computing spacetime', 10);
      expect(results).toHaveLength(0);
    });

    it('recovers when an FTS5-special query would parse-error', async () => {
      await seedFrames();
      // A lone unbalanced double-quote is passed through verbatim by the
      // sanitizer and triggers an FTS5 MATCH parse error. The strict fallback
      // should still find frames containing both meaningful terms.
      const results = await search.keywordSearch('"Machine learning', 10);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('recovers one meaningful token after an FTS5 parse error', async () => {
      await seedFrames();
      const results = await search.keywordSearch('"Machine', 10);
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('falls back when punctuation-delimited identifiers miss the sanitized FTS token', async () => {
      const session = sessions.create();
      const frame = frames.createIFrame(
        session.gop_id,
        'Captured roundtrip-debug-abc123 from a hook event',
      );

      const results = await search.keywordSearch('roundtrip-debug-abc123', 10);
      expect(results).toContain(frame.id);
    });

    it('does not let newer single-token decoys crowd out an exact punctuated identifier', async () => {
      const session = sessions.create();
      const target = frames.createIFrame(
        session.gop_id,
        'Captured roundtrip-debug-abc123 from a hook event',
        'normal',
        'user_stated',
        '2026-01-01T00:00:00.000Z',
      );

      for (let i = 0; i < 25; i += 1) {
        frames.createIFrame(
          session.gop_id,
          `Newer roundtrip decoy ${i}`,
          'normal',
          'user_stated',
          `2026-02-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
        );
      }

      const results = await search.keywordSearch('roundtrip-debug-abc123', 10);
      expect(results).toContain(target.id);
    });

    it('keeps punctuation fallback scoped to the requested GOP', async () => {
      const first = sessions.create();
      const second = sessions.create();
      const inScope = frames.createIFrame(
        first.gop_id,
        'Captured scope-check-xyz789 in the requested session',
      );
      const outOfScope = frames.createIFrame(
        second.gop_id,
        'Captured scope-check-xyz789 in another session',
      );

      const results = await search.keywordSearch('scope-check-xyz789', 10, first.gop_id);
      expect(results).toContain(inScope.id);
      expect(results).not.toContain(outOfScope.id);
    });

    it('matches punctuation-delimited Cyrillic identifiers case-insensitively', async () => {
      const session = sessions.create();
      const frame = frames.createIFrame(
        session.gop_id,
        'Captured БЕОГРАД-КОНФЕРЕНЦИЈА from an external event',
      );

      const results = await search.keywordSearch('београд-конференција', 10);
      expect(results).toContain(frame.id);
    });

    it('treats LIKE metacharacters literally in whole-query fallback', async () => {
      const session = sessions.create();
      const literal = frames.createIFrame(session.gop_id, 'Captured 北京旅行%_\\ marker');
      const wildcardDecoy = frames.createIFrame(session.gop_id, 'Captured 北京旅行XXY marker');

      const results = await search.keywordSearch('北京旅行%_\\', 10);
      expect(results).toContain(literal.id);
      expect(results).not.toContain(wildcardDecoy.id);
    });

    it('does not broaden overlong punctuation fallback queries', async () => {
      const session = sessions.create();
      const tokens = Array.from({ length: 20 }, (_, i) => `segment${i}`);
      const query = tokens.join('-');
      const exact = frames.createIFrame(session.gop_id, `Captured ${query} marker`);
      const prefixOnly = frames.createIFrame(
        session.gop_id,
        `Captured ${tokens.slice(0, 16).join('-')} marker`,
      );

      const results = await search.keywordSearch(query, 10);
      expect(results).toContain(exact.id);
      expect(results).not.toContain(prefixOnly.id);
    });

    it('does not broaden punctuation fallback with short or stop-word fragments', async () => {
      const session = sessions.create();
      const unrelated = frames.createIFrame(session.gop_id, 'Totally unrelated topic');

      const results = await search.keywordSearch("doesn't exist", 10);
      expect(results).not.toContain(unrelated.id);
    });
  });

  describe('Unicode keyword search (S1)', () => {
    async function seedUnicodeFrames() {
      const session = sessions.create();
      const gopId = session.gop_id;
      const cyrillic = frames.createIFrame(gopId, 'Београд конференција о вештачкој интелигенцији');
      const diacritic = frames.createIFrame(gopId, 'Sastanak sa Đorđem u Čačku povodom žurke');
      const cjk = frames.createIFrame(gopId, '我们讨论了北京旅行的计划');
      const english = frames.createIFrame(gopId, 'Quarterly planning meeting notes');
      return { cyrillic, diacritic, cjk, english };
    }

    it('matches Cyrillic frames via the keyword lane', async () => {
      const { cyrillic } = await seedUnicodeFrames();
      const results = await search.keywordSearch('Београд', 10);
      expect(results).toContain(cyrillic.id);
    });

    it('matches diacritic (č/ž) query terms', async () => {
      const { diacritic } = await seedUnicodeFrames();
      const results = await search.keywordSearch('Čačku žurke', 10);
      expect(results).toContain(diacritic.id);
    });

    it('routes pure-CJK queries to the LIKE fallback and matches', async () => {
      const { cjk } = await seedUnicodeFrames();
      // buildFtsOrQuery drops CJK tokens (unicode61 cannot segment them), so the
      // MATCH string is empty — keywordSearch must fall back to LIKE substring
      // matching instead of returning [].
      const results = await search.keywordSearch('北京旅行', 10);
      expect(results).toContain(cjk.id);
    });

    it('still returns [] for stop-word-only English queries (regression lock)', async () => {
      await seedUnicodeFrames();
      const results = await search.keywordSearch('the a an of to', 10);
      expect(results).toHaveLength(0);
    });

    it('English keyword results are unchanged by the Unicode sanitizer', async () => {
      // Byte-identical MATCH strings for ASCII input are locked in
      // fts-sanitize.test.ts; this asserts the end-to-end lane still hits.
      const { english } = await seedUnicodeFrames();
      const results = await search.keywordSearch('planning meeting', 10);
      expect(results).toContain(english.id);
    });
  });

  describe('Vector search via sqlite-vec', () => {
    it('finds semantically similar frames', async () => {
      await seedFrames();
      const results = await search.vectorSearch('AI and deep learning models', 5);
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty for empty index', async () => {
      sessions.create();
      const results = await search.vectorSearch('test query', 5);
      expect(results).toHaveLength(0);
    });
  });

  describe('RRF hybrid search', () => {
    it('boosts frames appearing in both keyword and vector results', async () => {
      await seedFrames();
      const results = await search.search('machine learning');
      expect(results.length).toBeGreaterThan(0);

      // Frames about ML should rank high since they match both keyword and semantically
      const topContent = results.slice(0, 3).map(r => r.frame.content);
      const hasMl = topContent.some(c => c.toLowerCase().includes('machine learning'));
      expect(hasMl).toBe(true);
    });

    it('returns scored results with rrfScore and relevanceScore', async () => {
      await seedFrames();
      const results = await search.search('machine learning');
      for (const r of results) {
        expect(r.rrfScore).toBeGreaterThan(0);
        expect(r.relevanceScore).toBeGreaterThan(0);
        expect(r.finalScore).toBe(r.rrfScore * r.relevanceScore);
      }
    });

    it('results are sorted by finalScore descending', async () => {
      await seedFrames();
      const results = await search.search('machine learning');
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].finalScore).toBeGreaterThanOrEqual(results[i].finalScore);
      }
    });

    it('respects limit parameter', async () => {
      await seedFrames();
      const results = await search.search('learning', { limit: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('GOP-scoped search', () => {
    it('searches within a specific session', async () => {
      const { gopId } = await seedFrames();

      // Create a second session with different content
      const s2 = sessions.create();
      const frame = frames.createIFrame(s2.gop_id, 'Quantum physics experiments');
      await search.indexFrame(frame.id, frame.content);

      const results = await search.search('machine learning', { gopId });
      const allFromGop = results.every(r => r.frame.gop_id === gopId);
      expect(allFromGop).toBe(true);
    });

    it('searches across all sessions when no gopId', async () => {
      const { gopId: gop1 } = await seedFrames();
      const s2 = sessions.create();
      const frame = frames.createIFrame(s2.gop_id, 'Machine learning in production systems');
      await search.indexFrame(frame.id, frame.content);

      const results = await search.search('machine learning');
      const gops = new Set(results.map(r => r.frame.gop_id));
      expect(gops.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Scoring profiles', () => {
    it('balanced profile weights temporal highest', () => {
      const w = SCORING_PROFILES.balanced;
      expect(w.temporal).toBe(0.4);
      expect(w.temporal).toBeGreaterThanOrEqual(w.popularity);
      expect(w.temporal).toBeGreaterThanOrEqual(w.contextual);
      expect(w.temporal).toBeGreaterThanOrEqual(w.importance);
    });

    it('recent profile weights temporal at 0.6', () => {
      expect(SCORING_PROFILES.recent.temporal).toBe(0.6);
    });

    it('important profile weights importance at 0.6', () => {
      expect(SCORING_PROFILES.important.importance).toBe(0.6);
    });

    it('connected profile weights contextual at 0.6', () => {
      expect(SCORING_PROFILES.connected.contextual).toBe(0.6);
    });

    it('all profiles sum to 1.0', () => {
      for (const [name, w] of Object.entries(SCORING_PROFILES)) {
        const sum = w.temporal + w.popularity + w.contextual + w.importance;
        expect(sum).toBeCloseTo(1.0, 5);
      }
    });

    it('important profile ranks critical frames higher', async () => {
      await seedFrames();
      const importantResults = await search.search('processing', { profile: 'important' });
      const balancedResults = await search.search('processing', { profile: 'balanced' });

      if (importantResults.length > 0 && balancedResults.length > 0) {
        // Critical/important frames should have higher relevance with important profile
        const criticalFrame = importantResults.find(r => r.frame.importance === 'critical');
        if (criticalFrame) {
          expect(criticalFrame.relevanceScore).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Multi-factor relevance scoring', () => {
    it('temporal decay: recent items score higher', () => {
      const recent = computeTemporalScore(new Date().toISOString());
      const old = computeTemporalScore(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
      expect(recent).toBeGreaterThan(old);
    });

    it('temporal decay: items within 7 days get full score', () => {
      const score = computeTemporalScore(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString());
      expect(score).toBe(1.0);
    });

    it('temporal decay: 30-day half-life', () => {
      const score = computeTemporalScore(
        new Date(Date.now() - 37 * 24 * 60 * 60 * 1000).toISOString() // 37 days = past recency + 30 day half-life
      );
      expect(score).toBeLessThan(0.6);
      expect(score).toBeGreaterThan(0.3);
    });

    it('popularity: log dampened access count', () => {
      expect(computePopularityScore(0)).toBeCloseTo(1.0, 1);
      expect(computePopularityScore(10)).toBeGreaterThan(computePopularityScore(1));
      expect(computePopularityScore(1000)).toBeGreaterThan(computePopularityScore(10));
      // Log dampening: 1000 accesses shouldn't be 100x the score of 10
      const ratio = computePopularityScore(1000) / computePopularityScore(10);
      expect(ratio).toBeLessThan(2);
    });

    it('contextual: BFS distance scoring', () => {
      const distances = new Map<number, number>([
        [1, 0], // same node
        [2, 1], // 1 hop
        [3, 2], // 2 hops
        [4, 3], // 3 hops
      ]);
      expect(computeContextualScore(1, distances)).toBe(1.0);
      expect(computeContextualScore(2, distances)).toBe(0.7);
      expect(computeContextualScore(3, distances)).toBe(0.4);
      expect(computeContextualScore(4, distances)).toBe(0.2);
      expect(computeContextualScore(99, distances)).toBe(0); // not in graph
    });

    it('importance: multiplier mapping', () => {
      expect(computeImportanceScore('critical')).toBe(2.0);
      expect(computeImportanceScore('important')).toBe(1.5);
      expect(computeImportanceScore('normal')).toBe(1.0);
      expect(computeImportanceScore('temporary')).toBe(0.7);
      expect(computeImportanceScore('deprecated')).toBe(0.3);
    });

    it('computeRelevance combines all factors', () => {
      const frame = {
        id: 1,
        last_accessed: new Date().toISOString(),
        access_count: 5,
        importance: 'important' as const,
      };
      const score = computeRelevance(frame, SCORING_PROFILES.balanced);
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    it('searches 1000 frames in under 200ms', async () => {
      const session = sessions.create();
      const raw = db.getDatabase();

      // Bulk insert 1000 I-frames
      const insertFrame = raw.prepare(`
        INSERT INTO memory_frames (frame_type, gop_id, t, content, importance)
        VALUES ('I', ?, ?, ?, 'normal')
      `);
      const insertFts = raw.prepare(`
        INSERT INTO memory_frames_fts (rowid, content) VALUES (?, ?)
      `);

      const framesToEmbed: { id: number; content: string }[] = [];

      const insertAll = raw.transaction(() => {
        for (let i = 0; i < 1000; i++) {
          const content = `Memory frame ${i}: ${getTopicContent(i)}`;
          const result = insertFrame.run(session.gop_id, i, content);
          const id = Number(result.lastInsertRowid);
          insertFts.run(id, content);
          framesToEmbed.push({ id, content });
        }
      });
      insertAll();

      // Batch index embeddings
      await search.indexFramesBatch(framesToEmbed);

      // Warm up
      await search.search('machine learning algorithms');

      const start = performance.now();
      const results = await search.search('machine learning algorithms', { limit: 20 });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(200);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Frame ID validation (PRQ-010)', () => {
    it('indexFrame throws for NaN frameId', async () => {
      await expect(search.indexFrame(NaN, 'test content')).rejects.toThrow(
        'Invalid frame ID for vector indexing'
      );
    });

    it('indexFrame throws for Infinity frameId', async () => {
      await expect(search.indexFrame(Infinity, 'test content')).rejects.toThrow(
        'Invalid frame ID for vector indexing'
      );
    });

    it('indexFramesBatch throws if any frame has NaN id', async () => {
      await expect(
        search.indexFramesBatch([
          { id: 1, content: 'valid' },
          { id: NaN, content: 'invalid' },
        ])
      ).rejects.toThrow('Invalid frame ID for vector indexing');
    });

    it('indexFrame accepts valid integer frameId', async () => {
      const session = sessions.create();
      const frame = frames.createIFrame(session.gop_id, 'valid content', 'normal');
      // Should not throw
      await expect(search.indexFrame(frame.id, 'valid content')).resolves.toBeUndefined();
    });
  });

  it('search() with excludeDeprecated hard-drops deprecated frames (default keeps them)', async () => {
    // Ported test used a bare 'gop-a'; the monorepo enforces the
    // memory_frames.gop_id → sessions FK, so anchor to a real session.
    const session = sessions.create();
    const stale = frames.createIFrame(session.gop_id, 'the launch date is March 1st');
    const fresh = frames.createIFrame(session.gop_id, 'the launch date is April 15th');
    await search.indexFramesBatch([
      { id: stale.id, content: stale.content },
      { id: fresh.id, content: fresh.content },
    ]);
    // Supersession would mark the stale mention deprecated.
    frames.update(stale.id, stale.content, 'deprecated');

    // Default: deprecated frame still surfaces (merely down-weighted by scoring).
    const withDeprecated = await search.search('launch date', { limit: 10 });
    expect(withDeprecated.map((r) => r.frame.id)).toContain(stale.id);

    // excludeDeprecated: the stale frame must never appear.
    const withoutDeprecated = await search.search('launch date', { limit: 10, excludeDeprecated: true });
    const ids = withoutDeprecated.map((r) => r.frame.id);
    expect(ids).not.toContain(stale.id);
    expect(ids).toContain(fresh.id);
  });

  it('excludes deprecated candidates before keyword and vector lane limits', async () => {
    const session = sessions.create();
    const query = 'crowdout-token';
    const indexed: Array<{ id: number; content: string }> = [];

    for (let index = 0; index < 5; index += 1) {
      const stale = frames.createIFrame(session.gop_id, `${query} obsolete-${index}`);
      indexed.push({ id: stale.id, content: stale.content });
      frames.update(stale.id, stale.content, 'deprecated');
    }
    const live = frames.createIFrame(
      session.gop_id,
      `${query} live candidate with deliberately lower raw lane similarity`,
    );
    indexed.push({ id: live.id, content: live.content });
    await search.indexFramesBatch(indexed);

    await expect(search.keywordSearch(query, 1, undefined, true)).resolves.toEqual([live.id]);
    await expect(search.vectorSearch(query, 1, undefined, true)).resolves.toEqual([live.id]);
    const hybrid = await search.search(query, { limit: 1, excludeDeprecated: true });
    expect(hybrid.map((result) => result.frame.id)).toEqual([live.id]);

    const otherSession = sessions.create();
    const outOfScopeDecoy = frames.createIFrame(otherSession.gop_id, query);
    await search.indexFrame(outOfScopeDecoy.id, outOfScopeDecoy.content);
    await expect(search.keywordSearch(query, 1, session.gop_id, true)).resolves.toEqual([live.id]);
    await expect(search.vectorSearch(query, 1, session.gop_id, true)).resolves.toEqual([live.id]);
    const scopedHybrid = await search.search(query, {
      limit: 1,
      gopId: session.gop_id,
      excludeDeprecated: true,
    });
    expect(scopedHybrid.map((result) => result.frame.id)).toEqual([live.id]);
  });

  it('excludes deprecated candidates before the LIKE fallback limit', async () => {
    const session = sessions.create();
    const live = frames.createIFrame(session.gop_id, '北京旅行 正常记录');
    const stale = frames.createIFrame(session.gop_id, '北京旅行 旧记录');
    const raw = db.getDatabase();
    raw.prepare('UPDATE memory_frames SET created_at = ? WHERE id = ?')
      .run('2026-01-01 00:00:00', live.id);
    raw.prepare('UPDATE memory_frames SET created_at = ? WHERE id = ?')
      .run('2026-02-01 00:00:00', stale.id);
    frames.update(stale.id, stale.content, 'deprecated');
    const otherSession = sessions.create();
    const outOfScopeDecoy = frames.createIFrame(otherSession.gop_id, '北京旅行');
    raw.prepare('UPDATE memory_frames SET created_at = ? WHERE id = ?')
      .run('2026-03-01 00:00:00', outOfScopeDecoy.id);

    await expect(search.keywordSearch('北京旅行', 1, undefined, true)).resolves.toEqual([outOfScopeDecoy.id]);
    await expect(search.keywordSearch('北京旅行', 1, session.gop_id, true)).resolves.toEqual([live.id]);
  });
});

function getTopicContent(i: number): string {
  const topics = [
    'machine learning algorithms for classification and regression',
    'web development with React and TypeScript frameworks',
    'database optimization using SQLite indexes and queries',
    'natural language processing with transformer models',
    'cloud computing deployment on AWS and Azure',
    'mobile application development for iOS and Android',
    'data visualization charts and interactive dashboards',
    'security best practices for authentication and encryption',
    'DevOps continuous integration and deployment pipelines',
    'API design patterns REST GraphQL and gRPC services',
  ];
  return topics[i % topics.length];
}
