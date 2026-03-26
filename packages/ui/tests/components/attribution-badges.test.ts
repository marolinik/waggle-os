/**
 * Attribution badge rendering tests (B4).
 *
 * Tests the pure HTML transformation function that converts
 * attribution markers into styled badge spans.
 */

import { describe, it, expect } from 'vitest';
import { renderAttributionBadges } from '../../src/index.js';

describe('renderAttributionBadges', () => {
  it('replaces [workspace memory] with styled badge', () => {
    const html = '<p>[1] (score: 0.850) [workspace memory]\nSome fact</p>';
    const result = renderAttributionBadges(html);

    expect(result).toContain('class="attribution-badge attribution-badge--workspace"');
    expect(result).toContain('workspace memory</span>');
    expect(result).not.toContain('[workspace memory]');
  });

  it('replaces [personal memory] with styled badge', () => {
    const html = '<p>[1] (score: 0.700) [personal memory]\nUser prefers bullets</p>';
    const result = renderAttributionBadges(html);

    expect(result).toContain('class="attribution-badge attribution-badge--personal"');
    expect(result).toContain('personal memory</span>');
    expect(result).not.toContain('[personal memory]');
  });

  it('replaces [KVARK: type: title] with styled badge', () => {
    const html = '<p>[1] (score: 0.920) [KVARK: pdf: Project Status]\nRevenue grew 15%</p>';
    const result = renderAttributionBadges(html);

    expect(result).toContain('class="attribution-badge attribution-badge--kvark"');
    expect(result).toContain('KVARK: pdf: Project Status</span>');
    expect(result).not.toContain('[KVARK:');
  });

  it('replaces [KVARK: title] without type', () => {
    const html = '<p>[KVARK: Team Notes]</p>';
    const result = renderAttributionBadges(html);

    expect(result).toContain('attribution-badge--kvark');
    expect(result).toContain('KVARK: Team Notes</span>');
  });

  it('handles multiple badges in the same HTML', () => {
    const html = `<h2>Workspace Memory</h2>
<p>[1] [workspace memory] fact A</p>
<h2>Personal Memory</h2>
<p>[1] [personal memory] fact B</p>
<h2>Enterprise Knowledge</h2>
<p>[1] [KVARK: pdf: Report] fact C</p>`;

    const result = renderAttributionBadges(html);

    expect(result).toContain('attribution-badge--workspace');
    expect(result).toContain('attribution-badge--personal');
    expect(result).toContain('attribution-badge--kvark');
  });

  it('leaves HTML unchanged when no markers are present', () => {
    const html = '<p>This is normal markdown content with [no special markers].</p>';
    const result = renderAttributionBadges(html);

    // Only [KVARK: ...], [workspace memory], [personal memory] are matched
    expect(result).toBe(html);
  });

  it('does not match partial markers', () => {
    const html = '<p>[workspace] [memory] [kvark]</p>';
    const result = renderAttributionBadges(html);

    expect(result).not.toContain('attribution-badge');
    expect(result).toBe(html);
  });

  it('handles multiple workspace memory markers in same block', () => {
    const html = '<p>[workspace memory] fact A</p><p>[workspace memory] fact B</p>';
    const result = renderAttributionBadges(html);

    const matches = result.match(/attribution-badge--workspace/g);
    expect(matches).toHaveLength(2);
  });

  it('preserves surrounding HTML structure', () => {
    const html = '<strong>[workspace memory]</strong>';
    const result = renderAttributionBadges(html);

    expect(result).toContain('<strong>');
    expect(result).toContain('</strong>');
    expect(result).toContain('attribution-badge--workspace');
  });

  it('adds title attribute for tooltip', () => {
    const wsResult = renderAttributionBadges('[workspace memory]');
    expect(wsResult).toContain('title="From workspace memory"');

    const pResult = renderAttributionBadges('[personal memory]');
    expect(pResult).toContain('title="From personal memory"');

    const kResult = renderAttributionBadges('[KVARK: pdf: Doc]');
    expect(kResult).toContain('title="From enterprise documents (KVARK)"');
  });
});
