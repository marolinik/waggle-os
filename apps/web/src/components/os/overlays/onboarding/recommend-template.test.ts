/** Who-are-you → curated template recommendation (badge + first ordering). */
import { describe, it, expect } from 'vitest';
import { recommendTemplateId } from './recommend-template';
import { CURATED_ONBOARDING_TEMPLATE_IDS } from './constants';

describe('recommendTemplateId', () => {
  it('maps each supported work type to a curated template id', () => {
    expect(recommendTemplateId('engineering')).toBe('code-review');
    expect(recommendTemplateId('product')).toBe('product-launch');
    expect(recommendTemplateId('research')).toBe('research-project');
    expect(recommendTemplateId('sales')).toBe('sales-pipeline');
    expect(recommendTemplateId('marketing')).toBe('marketing-campaign');
    // Consulting has no curated card — Research Hub is the proxy.
    expect(recommendTemplateId('consulting')).toBe('research-project');
  });

  it('only ever recommends a curated id', () => {
    const curated = new Set<string>(CURATED_ONBOARDING_TEMPLATE_IDS);
    for (const wt of ['engineering', 'product', 'research', 'sales', 'marketing', 'consulting']) {
      const id = recommendTemplateId(wt);
      expect(id).not.toBeNull();
      expect(curated.has(id as string)).toBe(true);
    }
  });

  it('returns null for work types without a curated match', () => {
    for (const wt of ['operations', 'finance', 'legal', 'design', 'leadership', 'other']) {
      expect(recommendTemplateId(wt)).toBeNull();
    }
  });

  it('falls back to keyword-matching the free-text role when work type is empty', () => {
    expect(recommendTemplateId('', 'Senior Software Engineer')).toBe('code-review');
    expect(recommendTemplateId(undefined, 'Strategy Consultant')).toBe('research-project');
    expect(recommendTemplateId('', 'Head of Sales')).toBe('sales-pipeline');
    expect(recommendTemplateId('', 'Growth Marketer')).toBe('marketing-campaign');
    expect(recommendTemplateId('', 'Product Manager')).toBe('product-launch');
    expect(recommendTemplateId('', 'Research Scientist')).toBe('research-project');
  });

  it('prefers the explicit work type over the role text', () => {
    expect(recommendTemplateId('sales', 'Software Engineer')).toBe('sales-pipeline');
  });

  it('returns null when neither signal matches', () => {
    expect(recommendTemplateId()).toBeNull();
    expect(recommendTemplateId('', '')).toBeNull();
    expect(recommendTemplateId('', 'Operations Lead')).toBeNull();
  });
});
