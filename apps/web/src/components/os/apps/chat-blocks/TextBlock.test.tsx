/**
 * Pure-function tests for the TextBlock segmenter that extracts capability
 * install requests from agent text. Component-level rendering tests are
 * blocked by @testing-library/react 16 (React 19) running against this
 * app's React 18.3 — same constraint as useDeveloperMode.test.ts — so we
 * test the parser surface area directly. Playwright covers full render.
 */
import { describe, it, expect } from 'vitest';
import { segmentText } from './capability-request-parser';

describe('TextBlock.segmentText — capability request parser', () => {
  it('returns a single text segment when no marker is present', () => {
    const segs = segmentText('Hello world.');
    expect(segs).toEqual([{ kind: 'text', content: 'Hello world.' }]);
  });

  it('parses Pattern A structured marker', () => {
    const content = 'Before. <!--waggle:capability_request {"name":"risk-assessment","source":"starter-pack","reason":"You asked for a risk write-up."}--> After.';
    const segs = segmentText(content);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toEqual({ kind: 'text', content: 'Before. ' });
    expect(segs[1]).toEqual({
      kind: 'capability',
      request: { name: 'risk-assessment', source: 'starter-pack', reason: 'You asked for a risk write-up.' },
    });
    expect(segs[2]).toEqual({ kind: 'text', content: ' After.' });
  });

  it('parses Pattern B legacy markdown phrasing', () => {
    const content = 'To install, call: `install_capability` with name "research-synthesis" and source "starter-pack".';
    const segs = segmentText(content);
    const cap = segs.find(s => s.kind === 'capability');
    expect(cap).toBeDefined();
    if (cap?.kind === 'capability') {
      expect(cap.request.name).toBe('research-synthesis');
      expect(cap.request.source).toBe('starter-pack');
    }
  });

  it('dedupes when the agent mentions the same install twice (body + recommendation)', () => {
    const content = `
Body: call \`install_capability\` with name "code-review" and source "starter-pack".
Recommendation: call \`install_capability\` with name "code-review" and source "starter-pack".
`.trim();
    const caps = segmentText(content).filter(s => s.kind === 'capability');
    expect(caps).toHaveLength(1);
  });

  it('distinct names produce distinct cards', () => {
    const content = 'First: `install_capability` with name "a" and source "starter-pack". Then `install_capability` with name "b" and source "starter-pack".';
    const caps = segmentText(content).filter(s => s.kind === 'capability');
    expect(caps).toHaveLength(2);
  });

  it('captures marketplace source via Pattern A', () => {
    const content = '<!--waggle:capability_request {"name":"pubmed-search","source":"marketplace","kind":"marketplace"}-->';
    const segs = segmentText(content);
    const cap = segs.find(s => s.kind === 'capability');
    if (cap?.kind === 'capability') {
      expect(cap.request.source).toBe('marketplace');
      expect(cap.request.kind).toBe('marketplace');
    }
  });

  it('ignores malformed Pattern A markers (bad JSON) without losing text', () => {
    const content = 'Before <!--waggle:capability_request {bad json} --> after.';
    const segs = segmentText(content);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toEqual({ kind: 'text', content });
  });

  it('handles Pattern A marker that is missing required fields', () => {
    const content = '<!--waggle:capability_request {"foo":"bar"}-->';
    const segs = segmentText(content);
    expect(segs).toHaveLength(1);
    expect(segs[0].kind).toBe('text');
  });
});
