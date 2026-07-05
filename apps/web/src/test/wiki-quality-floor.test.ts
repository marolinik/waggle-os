import { describe, it, expect } from 'vitest';
import { passesQualityFloor, type WikiPage } from '@/components/os/apps/memory/WikiTab';

function page(overrides: Partial<WikiPage>): WikiPage {
  return {
    slug: 's',
    pageType: 'entity',
    name: 'Kubernetes',
    contentHash: 'h',
    markdown: '',
    frameIds: '',
    compiledAt: '',
    sourceCount: 5,
    ...overrides,
  };
}

describe('passesQualityFloor', () => {
  it('keeps a well-formed entity (long name, >=2 sources)', () => {
    expect(passesQualityFloor(page({}))).toBe(true);
  });

  it('preserves 3-char tech acronyms', () => {
    expect(passesQualityFloor(page({ name: 'AWS', sourceCount: 3 }))).toBe(true);
    expect(passesQualityFloor(page({ name: 'GPT', sourceCount: 2 }))).toBe(true);
  });

  it('hides 1–2 char entity noise fragments', () => {
    expect(passesQualityFloor(page({ name: 'A' }))).toBe(false);
    expect(passesQualityFloor(page({ name: 'Ab' }))).toBe(false);
  });

  it('treats whitespace-padded short names as too short', () => {
    expect(passesQualityFloor(page({ name: '  x ' }))).toBe(false);
  });

  it('hides thin-provenance entities (<2 sources)', () => {
    expect(passesQualityFloor(page({ sourceCount: 1 }))).toBe(false);
    expect(passesQualityFloor(page({ sourceCount: 0 }))).toBe(false);
  });

  it('keeps entities with exactly 2 sources', () => {
    expect(passesQualityFloor(page({ sourceCount: 2 }))).toBe(true);
  });

  it('never floors non-entity page types, even short/thin ones', () => {
    for (const pageType of ['concept', 'synthesis', 'index', 'health']) {
      expect(passesQualityFloor(page({ pageType, name: 'A', sourceCount: 0 }))).toBe(true);
    }
  });

  it('hides entity date-fragment names (month abbrev or bare year token)', () => {
    expect(passesQualityFloor(page({ name: 'Act Aug', sourceCount: 30 }))).toBe(false);
    expect(passesQualityFloor(page({ name: 'Roadmap 2026', sourceCount: 30 }))).toBe(false);
  });

  it('preserves names where a date-like string is only a substring or a full month word', () => {
    expect(passesQualityFloor(page({ name: 'August Company', sourceCount: 30 }))).toBe(true);
    expect(passesQualityFloor(page({ name: 'AI Act', sourceCount: 30 }))).toBe(true);
    expect(passesQualityFloor(page({ name: 'EU AI Act', sourceCount: 30 }))).toBe(true);
    expect(passesQualityFloor(page({ name: 'GPT API', sourceCount: 30 }))).toBe(true);
    expect(passesQualityFloor(page({ name: 'New York', sourceCount: 30 }))).toBe(true);
  });
});
