import { describe, it, expect } from 'vitest';
import { HarvestPipeline } from '../../src/harvest/pipeline.js';
import type { UniversalImportItem } from '../../src/harvest/types.js';

/**
 * Regression: progress callback numerator must scale with the *instance*
 * batch size, not the module constant. Before the Wave 3C hive-mind
 * extraction we used `i * BATCH_SIZE` (module constant = 20) for the
 * `current` argument even when the caller overrode `batchSize`, so a
 * custom small batch size produced progress events whose numerator
 * walked past the denominator (e.g. classify: 20/3). This silently
 * corrupted UI progress bars for any caller not using the default.
 */
describe('HarvestPipeline — onProgress numerator scales with instance batchSize', () => {
  it('classify progress current <= total when batchSize < default', async () => {
    const items: UniversalImportItem[] = Array.from({ length: 3 }).map((_, i) => ({
      id: `p-${i}`,
      type: 'conversation' as const,
      source: 'chatgpt' as const,
      title: `t${i}`,
      content: `c${i}`,
      timestamp: new Date().toISOString(),
    }));

    const events: Array<[string, number, number]> = [];
    const llm = async (prompt: string): Promise<string> => {
      if (/knowledge classifier/i.test(prompt)) {
        const ids = [...prompt.matchAll(/id:\s*([a-z0-9-]+)/gi)].map((m) => m[1]);
        return JSON.stringify(ids.map((id) => ({ itemId: id, domain: 'work', value: 'skip', categories: [] })));
      }
      return '[]';
    };

    const pipeline = new HarvestPipeline({
      llmCall: llm,
      batchSize: 2,
      concurrency: 1,
      onProgress: (stage, current, total) => { events.push([stage, current, total]); },
    });
    await pipeline.run(items, 'chatgpt');

    // With batchSize=2 over 3 items, classify fires on batch 0 (current=0) and batch 1 (current=2).
    // Before the fix, the second event had current=20 (i * BATCH_SIZE), which exceeded total=3.
    const classify = events.filter((e) => e[0] === 'classify');
    expect(classify.length).toBeGreaterThanOrEqual(1);
    for (const [, current, total] of classify) {
      expect(total).toBe(3);
      expect(current).toBeLessThanOrEqual(total);
    }
  });
});
