/**
 * P14 regression — breadcrumb rendering across POSIX + Windows + virtual
 * storage types.
 */

import { describe, it, expect } from 'vitest';
import { buildBreadcrumbs } from './browse-breadcrumbs';

describe('buildBreadcrumbs', () => {
  describe('root variants', () => {
    it('returns only the root crumb when path is "/"', () => {
      const out = buildBreadcrumbs('/', 'My Drive', 'local');
      expect(out).toEqual([{ label: 'My Drive', path: '/' }]);
    });

    it('returns only the root crumb when path is empty', () => {
      expect(buildBreadcrumbs('', 'Drives', 'local')).toEqual([
        { label: 'Drives', path: '/' },
      ]);
    });

    it('returns only the root crumb when path is a single backslash', () => {
      expect(buildBreadcrumbs('\\', 'Drives', 'local')).toEqual([
        { label: 'Drives', path: '/' },
      ]);
    });
  });

  describe('Windows local paths', () => {
    it('surfaces the drive letter as the second crumb', () => {
      const out = buildBreadcrumbs('C:\\', 'Drives', 'local');
      expect(out).toEqual([
        { label: 'Drives', path: '/' },
        { label: 'C:', path: 'C:\\' },
      ]);
    });

    it('splits C:\\Users\\Marko into root / drive / Users / Marko', () => {
      const out = buildBreadcrumbs('C:\\Users\\Marko', 'Drives', 'local');
      expect(out).toEqual([
        { label: 'Drives', path: '/' },
        { label: 'C:', path: 'C:\\' },
        { label: 'Users', path: 'C:\\Users' },
        { label: 'Marko', path: 'C:\\Users\\Marko' },
      ]);
    });

    it('handles drive-only paths without trailing separator', () => {
      const out = buildBreadcrumbs('D:', 'Drives', 'local');
      expect(out).toEqual([
        { label: 'Drives', path: '/' },
        { label: 'D:', path: 'D:\\' },
      ]);
    });

    it('uppercases a lowercase drive letter in the crumb label', () => {
      const out = buildBreadcrumbs('c:\\Projects', 'Drives', 'local');
      expect(out[1]).toEqual({ label: 'C:', path: 'C:\\' });
    });

    it('accepts mixed separators (C:/Users/Marko)', () => {
      const out = buildBreadcrumbs('C:/Users/Marko', 'Drives', 'local');
      expect(out).toEqual([
        { label: 'Drives', path: '/' },
        { label: 'C:', path: 'C:\\' },
        { label: 'Users', path: 'C:\\Users' },
        { label: 'Marko', path: 'C:\\Users\\Marko' },
      ]);
    });
  });

  describe('POSIX local paths', () => {
    it('splits /Users/marko/Documents into three crumbs', () => {
      const out = buildBreadcrumbs('/Users/marko/Documents', 'Drives', 'local');
      expect(out).toEqual([
        { label: 'Drives', path: '/' },
        { label: 'Users', path: '/Users' },
        { label: 'marko', path: '/Users/marko' },
        { label: 'Documents', path: '/Users/marko/Documents' },
      ]);
    });
  });

  describe('virtual / team storage', () => {
    it('treats virtual paths as POSIX', () => {
      const out = buildBreadcrumbs('/workspace/docs', 'Virtual', 'virtual');
      expect(out).toEqual([
        { label: 'Virtual', path: '/' },
        { label: 'workspace', path: '/workspace' },
        { label: 'docs', path: '/workspace/docs' },
      ]);
    });

    it('treats team paths as POSIX', () => {
      const out = buildBreadcrumbs('/team/shared', 'Team', 'team');
      expect(out).toEqual([
        { label: 'Team', path: '/' },
        { label: 'team', path: '/team' },
        { label: 'shared', path: '/team/shared' },
      ]);
    });
  });

  it('handles deeply nested Windows paths without collapsing', () => {
    const deep = 'C:\\Users\\Marko\\OneDrive - Egzakta d.o.o\\Desktop';
    const out = buildBreadcrumbs(deep, 'Drives', 'local');
    // root + drive + Users + Marko + OneDrive... + Desktop = 6
    expect(out).toHaveLength(6);
    expect(out[5]).toEqual({ label: 'Desktop', path: deep });
    expect(out[4].label).toBe('OneDrive - Egzakta d.o.o');
  });
});
