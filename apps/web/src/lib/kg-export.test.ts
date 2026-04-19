/**
 * M-30 — kg-export vitest. Pure / DOM-only helpers under jsdom.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  KG_THEME_VARS,
  buildKgExportFilename,
  resolveThemeStyleAttr,
  serializeKgSvg,
  downloadKgSvg,
} from './kg-export';

function makeSvg(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100');
  svg.setAttribute('height', '100');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '50');
  circle.setAttribute('cy', '50');
  circle.setAttribute('r', '20');
  circle.setAttribute('fill', 'hsl(var(--primary))');
  svg.appendChild(circle);
  return svg as SVGSVGElement;
}

describe('buildKgExportFilename', () => {
  it('produces ISO-dated .svg filename', () => {
    const name = buildKgExportFilename(new Date('2026-04-19T12:34:56Z'));
    expect(name).toBe('waggle-knowledge-graph-2026-04-19.svg');
  });

  it('defaults to "now" when no date provided', () => {
    const name = buildKgExportFilename();
    expect(name).toMatch(/^waggle-knowledge-graph-\d{4}-\d{2}-\d{2}\.svg$/);
  });
});

describe('resolveThemeStyleAttr', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  it('returns empty string when no vars are set on the root', () => {
    // jsdom returns '' for missing CSS vars — nothing to emit.
    expect(resolveThemeStyleAttr(root, ['--not-set', '--also-not-set'])).toBe('');
  });

  it('emits declarations only for vars that resolve', () => {
    root.style.setProperty('--primary', '45 100% 50%');
    root.style.setProperty('--foreground', '0 0% 10%');
    const attr = resolveThemeStyleAttr(root, ['--primary', '--foreground', '--missing']);
    expect(attr).toContain('--primary: 45 100% 50%');
    expect(attr).toContain('--foreground: 0 0% 10%');
    expect(attr).not.toContain('--missing');
  });

  it('uses semicolon+space separator so it stacks with an existing style attr', () => {
    root.style.setProperty('--primary', '45 100% 50%');
    root.style.setProperty('--background', '0 0% 100%');
    const attr = resolveThemeStyleAttr(root, ['--primary', '--background']);
    expect(attr).toBe('--primary: 45 100% 50%; --background: 0 0% 100%');
  });

  it('exports the canonical KG theme variable list', () => {
    // Regression guard: the list MUST include at least the five page-level
    // tokens used in the KG SVG markup. Changing the list is intentional.
    const required = ['--primary', '--foreground', '--muted-foreground', '--background', '--border'];
    for (const v of required) {
      expect(KG_THEME_VARS).toContain(v);
    }
  });
});

describe('serializeKgSvg', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    root.style.setProperty('--primary', '45 100% 50%');
  });

  afterEach(() => {
    root.remove();
  });

  it('prepends XML declaration', () => {
    const xml = serializeKgSvg(makeSvg(), root);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
  });

  it('injects xmlns on the root svg', () => {
    const xml = serializeKgSvg(makeSvg(), root);
    expect(xml).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('injects resolved theme variables as inline style on the root svg', () => {
    const xml = serializeKgSvg(makeSvg(), root);
    expect(xml).toContain('--primary: 45 100% 50%');
  });

  it('does NOT mutate the original SVG element', () => {
    const svg = makeSvg();
    const before = svg.outerHTML;
    serializeKgSvg(svg, root);
    expect(svg.outerHTML).toBe(before);
  });

  it('preserves inner markup (circle survives the clone)', () => {
    const xml = serializeKgSvg(makeSvg(), root);
    expect(xml).toContain('<circle');
    expect(xml).toContain('cx="50"');
    expect(xml).toContain('fill="hsl(var(--primary))"');
  });
});

describe('downloadKgSvg', () => {
  let createdUrls: string[];
  let revokedUrls: string[];
  let clickedAnchors: HTMLAnchorElement[];
  let originalCreate: typeof URL.createObjectURL;
  let originalRevoke: typeof URL.revokeObjectURL;

  beforeEach(() => {
    createdUrls = [];
    revokedUrls = [];
    clickedAnchors = [];
    originalCreate = URL.createObjectURL;
    originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
      const url = `blob:mock-${createdUrls.length}`;
      createdUrls.push(url);
      void blob;
      return url;
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      revokedUrls.push(url);
    });
    // Capture anchor clicks without navigating the jsdom window.
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clickedAnchors.push(this);
    };
  });

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  it('returns the filename used for the download', () => {
    const filename = downloadKgSvg(makeSvg(), 'custom.svg');
    expect(filename).toBe('custom.svg');
  });

  it('defaults to the ISO-dated filename when none provided', () => {
    const filename = downloadKgSvg(makeSvg());
    expect(filename).toMatch(/^waggle-knowledge-graph-\d{4}-\d{2}-\d{2}\.svg$/);
  });

  it('creates a blob URL, clicks an anchor, and revokes the URL', () => {
    downloadKgSvg(makeSvg(), 'custom.svg');
    expect(createdUrls).toHaveLength(1);
    expect(clickedAnchors).toHaveLength(1);
    expect(clickedAnchors[0].href).toBe(createdUrls[0]);
    expect(clickedAnchors[0].download).toBe('custom.svg');
    expect(revokedUrls).toEqual(createdUrls);
  });
});
