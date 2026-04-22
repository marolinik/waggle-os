/**
 * Sprint 12 Task 1 Blocker #3 — CLI flag parsing tests.
 *
 * Exercises the 4 new flags added to runner.parseArgs() for the
 * pre-registration surface: --manifest-hash, --emit-preregistration-event /
 * --no-emit-preregistration-event, --per-cell, --judge-tiebreak.
 *
 * Per R1 verification: the CLI parser is an inline `switch`-based walker in
 * runner.ts rather than commander/yargs. New flags were added alongside the
 * existing Sprint 7/8/9 flags to keep scope minimal — this test file pins
 * the new surface so accidental regressions in the switch cases fail fast.
 */

import { describe, expect, it } from 'vitest';
import { buildRuns, parseArgs } from '../src/runner.js';

describe('--manifest-hash', () => {
  it('accepts a valid 64-char lowercase hex SHA-256', () => {
    const hash = 'a'.repeat(64);
    const args = parseArgs(['--manifest-hash', hash]);
    expect(args.manifestHash).toBe(hash);
  });

  it('lowercases uppercase input for consistency', () => {
    const hash = 'A'.repeat(64);
    const args = parseArgs(['--manifest-hash', hash]);
    expect(args.manifestHash).toBe('a'.repeat(64));
  });

  it('rejects a too-short hash', () => {
    expect(() => parseArgs(['--manifest-hash', 'deadbeef'])).toThrow(/Invalid --manifest-hash/);
  });

  it('rejects a hash with non-hex characters', () => {
    const bad = 'z'.repeat(64);
    expect(() => parseArgs(['--manifest-hash', bad])).toThrow(/Invalid --manifest-hash/);
  });

  it('defaults to undefined when omitted', () => {
    const args = parseArgs(['--cell', 'raw']);
    expect(args.manifestHash).toBeUndefined();
  });
});

describe('--emit-preregistration-event / --no-emit-preregistration-event', () => {
  it('defaults to true when neither flag is supplied', () => {
    const args = parseArgs(['--cell', 'raw']);
    expect(args.emitPreregistrationEvent).toBe(true);
  });

  it('--emit-preregistration-event sets the flag to true explicitly', () => {
    const args = parseArgs(['--emit-preregistration-event', '--cell', 'raw']);
    expect(args.emitPreregistrationEvent).toBe(true);
  });

  it('--no-emit-preregistration-event sets the flag to false', () => {
    const args = parseArgs(['--no-emit-preregistration-event', '--cell', 'raw']);
    expect(args.emitPreregistrationEvent).toBe(false);
  });

  it('last flag wins when both are supplied', () => {
    const args = parseArgs(['--emit-preregistration-event', '--no-emit-preregistration-event']);
    expect(args.emitPreregistrationEvent).toBe(false);
  });
});

describe('--per-cell', () => {
  it('accumulates multiple values into an ordered list', () => {
    const args = parseArgs(['--per-cell', 'raw', '--per-cell', 'filtered', '--per-cell', 'full-context']);
    expect(args.perCell).toEqual(['raw', 'filtered', 'full-context']);
  });

  it('single --per-cell value yields a single-element list', () => {
    const args = parseArgs(['--per-cell', 'raw']);
    expect(args.perCell).toEqual(['raw']);
  });

  it('undefined perCell when flag is omitted', () => {
    const args = parseArgs(['--cell', 'raw']);
    expect(args.perCell).toBeUndefined();
  });

  it('rejects empty value', () => {
    expect(() => parseArgs(['--per-cell', ''])).toThrow(/Invalid --per-cell/);
  });

  it('buildRuns honors --per-cell over --cell and --all-cells', () => {
    const args = parseArgs([
      '--all-cells',
      '--cell', 'raw',
      '--per-cell', 'filtered',
      '--per-cell', 'compressed',
    ]);
    const runs = buildRuns(args);
    expect(runs).toHaveLength(2);
    expect(runs.map(r => r.name)).toEqual(['filtered', 'compressed']);
  });

  it('buildRuns rejects unknown cell names in --per-cell', () => {
    const args = parseArgs(['--per-cell', 'raw', '--per-cell', 'nonsense-cell']);
    expect(() => buildRuns(args)).toThrow(/Unknown cell: nonsense-cell/);
  });
});

describe('--judge-tiebreak', () => {
  it('accepts quadri-vendor', () => {
    const args = parseArgs(['--judge-tiebreak', 'quadri-vendor']);
    expect(args.judgeTiebreak).toBe('quadri-vendor');
  });

  it('accepts pm-escalation', () => {
    const args = parseArgs(['--judge-tiebreak', 'pm-escalation']);
    expect(args.judgeTiebreak).toBe('pm-escalation');
  });

  it('accepts majority', () => {
    const args = parseArgs(['--judge-tiebreak', 'majority']);
    expect(args.judgeTiebreak).toBe('majority');
  });

  it('rejects unknown strategy', () => {
    expect(() => parseArgs(['--judge-tiebreak', 'coin-flip'])).toThrow(/Invalid --judge-tiebreak/);
  });

  it('rejects missing value', () => {
    expect(() => parseArgs(['--judge-tiebreak'])).toThrow(/Invalid --judge-tiebreak/);
  });

  it('defaults to undefined when omitted', () => {
    const args = parseArgs(['--cell', 'raw']);
    expect(args.judgeTiebreak).toBeUndefined();
  });
});
