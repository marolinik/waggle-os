import { describe, it, expect } from 'vitest';
import { dedupePacks, packKey } from './dedupe-packs';
import type { SkillPack } from '@/lib/types';

const pack = (over: Partial<SkillPack>): SkillPack => ({
  id: 'x',
  name: 'X',
  description: '',
  category: 'research',
  skills: [],
  installed: false,
  trust: 'community',
  ...over,
});

describe('packKey', () => {
  it('prefers id over name', () => {
    expect(packKey(pack({ id: 'abc', name: 'Different' }))).toBe('abc');
  });

  it('falls back to name when id is empty', () => {
    expect(packKey(pack({ id: '', name: 'Only Name' }))).toBe('Only Name');
  });

  it('returns empty string when both missing', () => {
    expect(packKey(pack({ id: '', name: '' }))).toBe('');
  });
});

describe('dedupePacks', () => {
  it('keeps first occurrence by id', () => {
    const a = pack({ id: 'dup', name: 'Skills version', installed: true });
    const b = pack({ id: 'dup', name: 'Starter version', installed: false });
    expect(dedupePacks([a, b])).toEqual([a]);
  });

  it('treats id-less packs as keyed by name', () => {
    const a = pack({ id: '', name: 'Research', installed: true });
    const b = pack({ id: '', name: 'Research', installed: false });
    const c = pack({ id: '', name: 'Writing' });
    expect(dedupePacks([a, b, c])).toEqual([a, c]);
  });

  it('drops entries without any key rather than keeping them all', () => {
    const a = pack({ id: '', name: '' });
    const b = pack({ id: '', name: '' });
    const c = pack({ id: 'real', name: 'Real' });
    expect(dedupePacks([a, b, c])).toEqual([c]);
  });

  it('returns empty on empty input', () => {
    expect(dedupePacks([])).toEqual([]);
  });

  it('preserves order across non-duplicate entries', () => {
    const a = pack({ id: 'a' });
    const b = pack({ id: 'b' });
    const c = pack({ id: 'c' });
    expect(dedupePacks([a, b, c, a, b])).toEqual([a, b, c]);
  });

  it('keeps installed:true marker when it comes first', () => {
    const installed = pack({ id: 'dup', installed: true });
    const catalog = pack({ id: 'dup', installed: false });
    expect(dedupePacks([installed, catalog])[0].installed).toBe(true);
  });
});
