import { describe, it, expect } from 'vitest';
import { initialTabFor, FILES_TAB_ORDER } from './files-tabs';

describe('FILES_TAB_ORDER', () => {
  it('is virtual → local → team in that order', () => {
    expect(FILES_TAB_ORDER).toEqual(['virtual', 'local', 'team']);
  });
});

describe('initialTabFor', () => {
  it("returns the workspace's configured storageType when it's one of the known tabs", () => {
    expect(initialTabFor('virtual')).toBe('virtual');
    expect(initialTabFor('local')).toBe('local');
    expect(initialTabFor('team')).toBe('team');
  });

  it("falls back to 'virtual' when storageType is undefined", () => {
    expect(initialTabFor(undefined)).toBe('virtual');
  });

  it("falls back to 'virtual' on an unknown value (defensive)", () => {
    // This path is only reachable if the Workspace type is loosened or
    // disk data is corrupt; the pure helper should still be safe.
    expect(initialTabFor('bogus' as never)).toBe('virtual');
  });
});
