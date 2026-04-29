import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger.js';

function captureLines(): { lines: string[]; write: (l: string) => void } {
  const lines: string[] = [];
  return { lines, write: (l) => lines.push(l) };
}

const FROZEN_NOW = new Date('2026-04-28T10:00:00.000Z');

describe('createLogger', () => {
  it('emits a JSON line per call with name + level + msg + timestamp', () => {
    const cap = captureLines();
    const log = createLogger({ name: 'test', level: 'debug', write: cap.write, now: () => FROZEN_NOW });
    log.info('hello');
    expect(cap.lines).toHaveLength(1);
    const entry = JSON.parse(cap.lines[0]) as Record<string, unknown>;
    expect(entry).toMatchObject({
      timestamp: '2026-04-28T10:00:00.000Z',
      level: 'info',
      name: 'test',
      msg: 'hello',
    });
  });

  it('filters levels below threshold', () => {
    const cap = captureLines();
    const log = createLogger({ level: 'warn', write: cap.write, now: () => FROZEN_NOW });
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(cap.lines.map((l) => (JSON.parse(l) as { level: string }).level))
      .toEqual(['warn', 'error']);
  });

  it('merges meta fields into the entry without clobbering core fields', () => {
    const cap = captureLines();
    const log = createLogger({ level: 'info', write: cap.write, now: () => FROZEN_NOW });
    log.info('x', { tool: 'save_memory', latencyMs: 42 });
    const entry = JSON.parse(cap.lines[0]) as Record<string, unknown>;
    expect(entry['tool']).toBe('save_memory');
    expect(entry['latencyMs']).toBe(42);
    expect(entry['msg']).toBe('x');
  });

  it('honours HIVE_MIND_SHIM_LOG_LEVEL when no explicit level is provided', () => {
    const prior = process.env['HIVE_MIND_SHIM_LOG_LEVEL'];
    process.env['HIVE_MIND_SHIM_LOG_LEVEL'] = 'error';
    try {
      const cap = captureLines();
      const log = createLogger({ write: cap.write, now: () => FROZEN_NOW });
      log.info('i');
      log.error('e');
      expect(cap.lines).toHaveLength(1);
      expect((JSON.parse(cap.lines[0]) as { level: string }).level).toBe('error');
    } finally {
      if (prior === undefined) delete process.env['HIVE_MIND_SHIM_LOG_LEVEL'];
      else process.env['HIVE_MIND_SHIM_LOG_LEVEL'] = prior;
    }
  });

  it('explicit level option overrides env var', () => {
    const prior = process.env['HIVE_MIND_SHIM_LOG_LEVEL'];
    process.env['HIVE_MIND_SHIM_LOG_LEVEL'] = 'error';
    try {
      const cap = captureLines();
      const log = createLogger({ level: 'debug', write: cap.write, now: () => FROZEN_NOW });
      log.debug('d');
      expect(cap.lines).toHaveLength(1);
    } finally {
      if (prior === undefined) delete process.env['HIVE_MIND_SHIM_LOG_LEVEL'];
      else process.env['HIVE_MIND_SHIM_LOG_LEVEL'] = prior;
    }
  });

  it('falls back to default name "shim-core"', () => {
    const cap = captureLines();
    const log = createLogger({ write: cap.write, now: () => FROZEN_NOW });
    log.info('hi');
    const entry = JSON.parse(cap.lines[0]) as { name: string };
    expect(entry.name).toBe('shim-core');
  });
});
