/** PR5 D5 — the curated 6 onboarding templates resolve to real data + personas. */
import { describe, it, expect } from 'vitest';
import {
  CURATED_ONBOARDING_TEMPLATES,
  CURATED_ONBOARDING_TEMPLATE_IDS,
  TEMPLATE_PERSONA,
} from './constants';

describe('curated onboarding templates (PR5 D5)', () => {
  it('resolves all 6 curated ids to real templates (no silent drops)', () => {
    expect(CURATED_ONBOARDING_TEMPLATE_IDS).toHaveLength(6);
    expect(CURATED_ONBOARDING_TEMPLATES).toHaveLength(CURATED_ONBOARDING_TEMPLATE_IDS.length);
  });

  it('maps every curated template to a specialist persona', () => {
    for (const t of CURATED_ONBOARDING_TEMPLATES) {
      expect(TEMPLATE_PERSONA[t.id]).toBeTruthy();
    }
  });

  it('gives every curated template a non-empty hint for the first-task seed', () => {
    for (const t of CURATED_ONBOARDING_TEMPLATES) {
      expect(t.hint.length).toBeGreaterThan(0);
    }
  });
});
