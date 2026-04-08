import { describe, it, expect } from 'vitest';
import {
  normalizeForDedup,
  cosineSimilarity,
  detectDramaticClaims,
  DRAMATIC_CLAIM_PATTERNS,
  deriveConfidence,
} from '../src/text-analysis.js';
import type { ConfidenceLevel } from '../src/text-analysis.js';

// ── normalizeForDedup ────────────────────────────────────────────────────

describe('normalizeForDedup', () => {
  it('lowercases text', () => {
    expect(normalizeForDedup('Hello World')).toBe('hello world');
  });

  it('strips punctuation', () => {
    expect(normalizeForDedup('hello, world!')).toBe('hello world');
    expect(normalizeForDedup('foo@bar.com')).toBe('foobarcom');
    expect(normalizeForDedup('price: $100')).toBe('price 100');
  });

  it('collapses multiple whitespace into single space', () => {
    expect(normalizeForDedup('hello   world')).toBe('hello world');
    expect(normalizeForDedup('a\t\tb')).toBe('a b');
    expect(normalizeForDedup('a\n\nb')).toBe('a b');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeForDedup('  hello  ')).toBe('hello');
    expect(normalizeForDedup('\thello\n')).toBe('hello');
  });

  it('handles combined transformations', () => {
    expect(normalizeForDedup('  Hello,   WORLD!!  ')).toBe('hello world');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeForDedup('')).toBe('');
  });

  it('returns empty string for punctuation-only input', () => {
    expect(normalizeForDedup('...!!!')).toBe('');
  });

  it('preserves underscores (\\w includes _)', () => {
    expect(normalizeForDedup('hello_world')).toBe('hello_world');
  });

  it('preserves digits', () => {
    expect(normalizeForDedup('Order #123')).toBe('order 123');
  });
});

// ── cosineSimilarity ─────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical unit vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('returns 1 for scaled identical vectors', () => {
    const a = new Float32Array([2, 4, 6]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });

  it('returns 0 for empty arrays', () => {
    const a = new Float32Array([]);
    const b = new Float32Array([]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 when first vector is zero-magnitude', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 when second vector is zero-magnitude', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 when both vectors are zero-magnitude', () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('computes correct similarity for arbitrary vectors', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    // dot = 4+10+18 = 32, magA = sqrt(14), magB = sqrt(77)
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77));
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 4);
  });

  it('works with single-element vectors', () => {
    const a = new Float32Array([3]);
    const b = new Float32Array([5]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});

// ── detectDramaticClaims ─────────────────────────────────────────────────

describe('detectDramaticClaims', () => {
  it('returns empty array for benign content', () => {
    expect(detectDramaticClaims('The weather is nice today')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(detectDramaticClaims('')).toEqual([]);
  });

  // Pattern 0: company_shutdown
  describe('company_shutdown pattern', () => {
    it('detects "shutting down"', () => {
      expect(detectDramaticClaims('The company is shutting down')).toContain('company_shutdown');
    });

    it('detects "shut down"', () => {
      expect(detectDramaticClaims('They shut down operations')).toContain('company_shutdown');
    });

    it('detects "closing the company"', () => {
      expect(detectDramaticClaims('We are closing the company')).toContain('company_shutdown');
    });

    it('detects "closed company"', () => {
      expect(detectDramaticClaims('They closed company offices')).toContain('company_shutdown');
    });

    it('detects "going bankrupt"', () => {
      expect(detectDramaticClaims('The firm is going bankrupt')).toContain('company_shutdown');
    });

    it('detects "bankruptcy"', () => {
      expect(detectDramaticClaims('They filed for bankruptcy')).toContain('company_shutdown');
    });

    it('detects "dissolving"', () => {
      expect(detectDramaticClaims('The board is dissolving the entity')).toContain('company_shutdown');
    });

    it('detects "dissolved"', () => {
      expect(detectDramaticClaims('The partnership dissolved')).toContain('company_shutdown');
    });
  });

  // Pattern 1: mass_layoffs
  describe('mass_layoffs pattern', () => {
    it('detects "mass layoff"', () => {
      expect(detectDramaticClaims('There was a mass layoff yesterday')).toContain('mass_layoffs');
    });

    it('detects "laid off everyone"', () => {
      expect(detectDramaticClaims('They laid off everyone')).toContain('mass_layoffs');
    });

    it('detects "firing all"', () => {
      expect(detectDramaticClaims('The CEO is firing all employees')).toContain('mass_layoffs');
    });

    it('detects "fired everyone"', () => {
      expect(detectDramaticClaims('Management fired everyone last week')).toContain('mass_layoffs');
    });

    it('detects "fired the entire"', () => {
      expect(detectDramaticClaims('They fired the entire team')).toContain('mass_layoffs');
    });
  });

  // Pattern 2: legal_threats
  describe('legal_threats pattern', () => {
    it('detects "lawsuit"', () => {
      expect(detectDramaticClaims('A major lawsuit has been filed')).toContain('legal_threats');
    });

    it('detects "legal threat"', () => {
      expect(detectDramaticClaims('We received a legal threat')).toContain('legal_threats');
    });

    it('detects "suing us"', () => {
      expect(detectDramaticClaims('The vendor is suing us')).toContain('legal_threats');
    });

    it('detects "sued the company"', () => {
      expect(detectDramaticClaims('An employee sued the company')).toContain('legal_threats');
    });

    it('detects "cease and desist"', () => {
      expect(detectDramaticClaims('We got a cease and desist letter')).toContain('legal_threats');
    });
  });

  // Pattern 3: dramatic_financial
  describe('dramatic_financial pattern', () => {
    it('detects "revenue dropped to 0"', () => {
      expect(detectDramaticClaims('Our revenue dropped to 0')).toContain('dramatic_financial');
    });

    it('detects "revenue is $0"', () => {
      expect(detectDramaticClaims('Monthly revenue is $0')).toContain('dramatic_financial');
    });

    it('detects "lost all funding"', () => {
      expect(detectDramaticClaims('We lost all funding this quarter')).toContain('dramatic_financial');
    });

    it('detects "lost all our funding"', () => {
      expect(detectDramaticClaims('The startup lost all our funding')).toContain('dramatic_financial');
    });

    it('detects "funding fell through"', () => {
      expect(detectDramaticClaims('Series B funding fell through')).toContain('dramatic_financial');
    });

    it('detects "funding collapsed"', () => {
      expect(detectDramaticClaims('Our funding collapsed overnight')).toContain('dramatic_financial');
    });
  });

  // Multiple matches
  it('detects multiple dramatic claims in one string', () => {
    const content = 'The company is going bankrupt and fired everyone. A lawsuit followed.';
    const result = detectDramaticClaims(content);
    expect(result).toContain('company_shutdown');
    expect(result).toContain('mass_layoffs');
    expect(result).toContain('legal_threats');
    expect(result).toHaveLength(3);
  });

  it('is case-insensitive', () => {
    expect(detectDramaticClaims('GOING BANKRUPT')).toContain('company_shutdown');
    expect(detectDramaticClaims('MASS LAYOFF')).toContain('mass_layoffs');
    expect(detectDramaticClaims('LAWSUIT')).toContain('legal_threats');
  });

  it('DRAMATIC_CLAIM_PATTERNS has exactly 4 entries', () => {
    expect(DRAMATIC_CLAIM_PATTERNS).toHaveLength(4);
  });
});

// ── deriveConfidence ─────────────────────────────────────────────────────

describe('deriveConfidence', () => {
  it('returns "high" for "tool_verified"', () => {
    expect(deriveConfidence('tool_verified')).toBe('high');
  });

  it('returns "medium" for "user_stated"', () => {
    expect(deriveConfidence('user_stated')).toBe('medium');
  });

  it('returns "low" for "agent_inferred"', () => {
    expect(deriveConfidence('agent_inferred')).toBe('low');
  });

  it('returns "unverified" for unknown sources', () => {
    expect(deriveConfidence('unknown')).toBe('unverified');
    expect(deriveConfidence('random_source')).toBe('unverified');
    expect(deriveConfidence('')).toBe('unverified');
  });

  it('is case-sensitive (uppercase variants return "unverified")', () => {
    expect(deriveConfidence('Tool_Verified')).toBe('unverified');
    expect(deriveConfidence('USER_STATED')).toBe('unverified');
    expect(deriveConfidence('AGENT_INFERRED')).toBe('unverified');
  });

  it('returns correct ConfidenceLevel type for all known sources', () => {
    const knownSources: Array<{ source: string; expected: ConfidenceLevel }> = [
      { source: 'tool_verified', expected: 'high' },
      { source: 'user_stated', expected: 'medium' },
      { source: 'agent_inferred', expected: 'low' },
    ];
    for (const { source, expected } of knownSources) {
      const result: ConfidenceLevel = deriveConfidence(source);
      expect(result).toBe(expected);
    }
  });
});
