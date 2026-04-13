import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, ExecutionTraceStore } from '@waggle/core';
import {
  EvalDatasetBuilder,
  detectSecrets,
  SECRET_PATTERN_NAMES,
  toJSONL as evalToJSONL,
  fromJSONL as evalFromJSONL,
  type EvalExample,
} from '../src/eval-dataset.js';

describe('detectSecrets', () => {
  it('returns null for clean text', () => {
    expect(detectSecrets('Hello world, no secrets here.')).toBeNull();
    expect(detectSecrets('pk_test_looks_partial')).toBeNull(); // too short
  });

  it('detects AWS access keys', () => {
    expect(detectSecrets('AKIAIOSFODNN7EXAMPLE used for upload')).toBe('aws-access-key');
  });

  it('detects GitHub PATs', () => {
    expect(detectSecrets('token=ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789')).toBe('github-pat');
  });

  it('detects OpenAI keys', () => {
    expect(detectSecrets('sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa')).toBe('openai-key');
  });

  it('detects Anthropic keys', () => {
    expect(detectSecrets('key = sk-ant-api03-aaaaaaaaaaaaaaaaaaa')).toBe('anthropic-key');
  });

  it('detects Google API keys', () => {
    // Google API keys = literal "AIza" + exactly 35 chars
    expect(detectSecrets('AIzaSyA0B1c2d3e4F5G6H7I8J9K0L1M2N3O4P5Q')).toBe('google-api-key');
  });

  it('detects Stripe keys', () => {
    expect(detectSecrets('sk_live_51AbCdEfGhIjKlMnOpQrStUvWxYz')).toBe('stripe-secret');
  });

  it('detects private key blocks', () => {
    expect(detectSecrets('-----BEGIN RSA PRIVATE KEY-----\nMII...')).toBe('private-key-block');
  });

  it('detects JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(detectSecrets(jwt)).toBe('jwt');
  });

  it('detects basic-auth URLs', () => {
    expect(detectSecrets('Use https://user:hunter2@example.com/api'))
      .toBe('basic-auth-url');
  });

  it('detects env-var password assignments', () => {
    expect(detectSecrets('PASSWORD=supersecret123'))
      .toBe('env-password');
  });

  it('detects postgres connection strings with creds', () => {
    expect(detectSecrets('postgres://admin:pw1234@db.local:5432/prod'))
      .toBe('pgsql-url');
  });

  it('SECRET_PATTERN_NAMES is non-empty and unique', () => {
    expect(SECRET_PATTERN_NAMES.length).toBeGreaterThan(10);
    expect(new Set(SECRET_PATTERN_NAMES).size).toBe(SECRET_PATTERN_NAMES.length);
  });
});

describe('JSONL round-trip', () => {
  const examples: EvalExample[] = [
    {
      input: 'write a haiku',
      expected_output: 'Cherry blossoms fall / ...',
      metadata: { source: 'trace', personaId: 'writer', outcome: 'success' },
    },
    {
      input: 'explain closures',
      expected_output: 'A closure captures variables from its enclosing scope.',
      metadata: { source: 'trace', personaId: 'coder', outcome: 'verified' },
    },
  ];

  it('round-trips through JSONL', () => {
    const jsonl = evalToJSONL(examples);
    expect(jsonl.split('\n')).toHaveLength(2);
    const parsed = evalFromJSONL(jsonl);
    expect(parsed).toEqual(examples);
  });

  it('skips malformed lines silently', () => {
    const jsonl = [
      JSON.stringify(examples[0]),
      '{ this is not valid json',
      '',
      JSON.stringify(examples[1]),
    ].join('\n');
    const parsed = evalFromJSONL(jsonl);
    expect(parsed).toHaveLength(2);
  });

  it('skips lines missing required fields', () => {
    const jsonl = [
      JSON.stringify({ input: 'x' }), // missing expected_output + metadata
      JSON.stringify(examples[0]),
    ].join('\n');
    const parsed = evalFromJSONL(jsonl);
    expect(parsed).toHaveLength(1);
  });
});

describe('EvalDatasetBuilder', () => {
  let db: MindDB;
  let store: ExecutionTraceStore;
  let builder: EvalDatasetBuilder;

  beforeEach(() => {
    db = new MindDB(':memory:');
    store = new ExecutionTraceStore(db);
    builder = new EvalDatasetBuilder(store);
  });

  afterEach(() => {
    db.close();
  });

  function seedTrace(input: string, output: string, outcome: 'success' | 'verified' | 'corrected' | 'abandoned' = 'success', personaId = 'coder'): number {
    const id = store.start({ input, personaId });
    store.finalize(id, { outcome, output });
    return id;
  }

  // ── sourceFromTraces ──

  describe('sourceFromTraces', () => {
    it('pulls only traces matching the requested outcomes', () => {
      seedTrace('a?', 'A.', 'success');
      seedTrace('b?', 'B.', 'verified');
      seedTrace('c?', 'C.', 'corrected');
      seedTrace('d?', 'D.', 'abandoned');

      const examples = builder.sourceFromTraces(['success', 'verified'], false);
      expect(examples).toHaveLength(2);
      expect(examples.map(e => e.input).sort()).toEqual(['a?', 'b?']);
    });

    it('includes corrections when flag set', () => {
      seedTrace('a?', 'A.', 'success');
      seedTrace('b?', 'B.', 'corrected');

      const examples = builder.sourceFromTraces(['success'], true);
      expect(examples).toHaveLength(2);
      const corrected = examples.find(e => e.metadata.outcome === 'corrected');
      expect(corrected?.metadata.source).toBe('correction');
    });

    it('maps trace fields onto metadata', () => {
      seedTrace('hello', 'world', 'success', 'writer');
      const [example] = builder.sourceFromTraces(['success'], false);
      expect(example.metadata.personaId).toBe('writer');
      expect(example.metadata.traceId).toBeGreaterThan(0);
      expect(example.metadata.source).toBe('trace');
    });
  });

  // ── build (end-to-end) ──

  describe('build', () => {
    it('returns deterministic split with same seed', async () => {
      for (let i = 0; i < 20; i++) {
        seedTrace(`question ${i}?`, `answer ${i}.`, 'success');
      }

      const a = await builder.build({ seed: 42 });
      const b = await builder.build({ seed: 42 });

      expect(a.train.map(e => e.input)).toEqual(b.train.map(e => e.input));
      expect(a.val.map(e => e.input)).toEqual(b.val.map(e => e.input));
      expect(a.holdout.map(e => e.input)).toEqual(b.holdout.map(e => e.input));
    });

    it('different seeds produce different orderings', async () => {
      for (let i = 0; i < 30; i++) {
        seedTrace(`question ${i} here?`, `answer ${i} here.`, 'success');
      }
      const a = await builder.build({ seed: 1 });
      const b = await builder.build({ seed: 999 });

      const aIds = a.train.map(e => e.input).join('|');
      const bIds = b.train.map(e => e.input).join('|');
      expect(aIds).not.toBe(bIds);
    });

    it('splits 60/20/20 when enough examples', async () => {
      for (let i = 0; i < 100; i++) {
        seedTrace(`question ${i} here?`, `answer ${i} here.`, 'success');
      }
      const split = await builder.build({ seed: 1 });
      expect(split.train.length).toBe(60);
      expect(split.val.length).toBe(20);
      expect(split.holdout.length).toBe(20);
      expect(split.stats.total).toBe(100);
    });

    it('honors custom split ratios', async () => {
      for (let i = 0; i < 50; i++) {
        seedTrace(`question ${i} here?`, `answer ${i} here.`, 'success');
      }
      const split = await builder.build({ seed: 1, splitRatios: [0.8, 0.1, 0.1] });
      expect(split.train.length).toBe(40);
      expect(split.val.length).toBe(5);
      expect(split.holdout.length).toBe(5);
    });

    it('rejects ratios that do not sum to 1', async () => {
      await expect(builder.build({ splitRatios: [0.5, 0.3, 0.3] })).rejects.toThrow();
    });

    it('filters out examples containing secrets', async () => {
      seedTrace('clean input', 'clean output', 'success');
      seedTrace('here is a key: AKIAIOSFODNN7EXAMPLE', 'sure', 'success');
      seedTrace('what is your token?', 'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789', 'success');

      const split = await builder.build({ seed: 1 });
      expect(split.stats.sourced).toBe(3);
      expect(split.stats.acceptedAfterSecretScan).toBe(1);
      expect(split.rejected.filter(r => r.reason.startsWith('secret:'))).toHaveLength(2);
    });

    it('filters examples by min length', async () => {
      seedTrace('?', 'ok', 'success'); // below both mins
      seedTrace('a proper question', 'a proper answer', 'success');

      const split = await builder.build({ seed: 1, minInputChars: 5, minOutputChars: 3 });
      expect(split.stats.total).toBe(1);
      expect(split.rejected.some(r => r.reason === 'too-short-input')).toBe(true);
    });

    it('filters examples over max combined length', async () => {
      seedTrace('this is an ok prompt', 'this is an ok answer', 'success');
      seedTrace('x'.repeat(5000), 'y'.repeat(5000), 'success');

      const split = await builder.build({ seed: 1, maxCombinedChars: 1000 });
      expect(split.stats.total).toBe(1);
      expect(split.rejected.some(r => r.reason === 'too-long')).toBe(true);
    });

    it('filters low-signal garbage', async () => {
      seedTrace('.......................', '!!!!!!!!!!!!!!!!', 'success');
      seedTrace('real question?', 'real answer.', 'success');

      const split = await builder.build({ seed: 1 });
      expect(split.stats.total).toBe(1);
      expect(split.rejected.some(r => r.reason === 'low-signal')).toBe(true);
    });

    it('dedupes by input hash', async () => {
      seedTrace('same prompt', 'answer a', 'success');
      seedTrace('same prompt', 'answer b', 'success');
      seedTrace('different prompt', 'answer c', 'success');

      const split = await builder.build({ seed: 1 });
      expect(split.stats.unique).toBe(2);
      expect(split.rejected.some(r => r.reason === 'duplicate')).toBe(true);
    });

    it('applies optional LLM judge', async () => {
      seedTrace('keep this example please', 'kept response', 'success');
      seedTrace('drop this example please', 'dropped response', 'success');

      const split = await builder.build({
        seed: 1,
        judge: async (ex) => ({
          keep: !ex.input.includes('drop'),
          reason: ex.input.includes('drop') ? 'contains drop' : undefined,
        }),
      });

      expect(split.stats.acceptedAfterJudge).toBe(1);
      expect(split.rejected.some(r => r.reason.startsWith('judge:'))).toBe(true);
    });

    it('keeps example when judge throws (fail-open)', async () => {
      seedTrace('some prompt text', 'some answer text', 'success');
      const split = await builder.build({
        seed: 1,
        judge: async () => {
          throw new Error('llm down');
        },
      });
      expect(split.stats.acceptedAfterJudge).toBe(1);
      expect(split.stats.total).toBe(1);
    });

    it('accepts external harvest/correction examples', async () => {
      const harvest: EvalExample = {
        input: 'harvest prompt',
        expected_output: 'harvest answer',
        metadata: { source: 'harvest' },
      };
      const correction: EvalExample = {
        input: 'correction prompt',
        expected_output: 'correction answer',
        metadata: { source: 'correction' },
      };

      const split = await builder.build({
        seed: 1,
        harvestExamples: [harvest],
        correctionExamples: [correction],
      });

      const allInputs = [...split.train, ...split.val, ...split.holdout].map(e => e.input);
      expect(allInputs).toContain('harvest prompt');
      expect(allInputs).toContain('correction prompt');
    });

    it('maps correction trace output to correctionFeedback when available', async () => {
      const id = store.start({ input: 'wrong approach', personaId: 'coder' });
      store.finalize(id, { outcome: 'success', output: 'first try' });
      store.markCorrected(id, 'Should use async/await here');

      const examples = builder.sourceFromTraces(['success'], true);
      const corrected = examples.find(e => e.metadata.outcome === 'corrected');
      expect(corrected?.expected_output).toBe('Should use async/await here');
    });

    it('returns empty splits when no traces match', async () => {
      const split = await builder.build({ seed: 1 });
      expect(split.stats.total).toBe(0);
      expect(split.train).toEqual([]);
      expect(split.val).toEqual([]);
      expect(split.holdout).toEqual([]);
    });

    it('tiny datasets assign leftover to holdout', async () => {
      for (let i = 0; i < 3; i++) {
        seedTrace(`question ${i} here?`, `answer ${i} here.`, 'success');
      }
      // Ratios 0.6/0.2/0.2 with n=3 → floor(1.8)=1, floor(0.6)=0, remainder=2 → holdout
      const split = await builder.build({ seed: 1 });
      expect(split.train.length + split.val.length + split.holdout.length).toBe(3);
    });
  });
});
