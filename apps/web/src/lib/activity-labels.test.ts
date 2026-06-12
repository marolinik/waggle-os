import { describe, it, expect } from 'vitest';
import { humanizeActivitySummary } from './activity-labels';

describe('humanizeActivitySummary', () => {
  it('maps known tool events to plain language', () => {
    expect(humanizeActivitySummary('tool_result: create_skill')).toBe('Created a skill');
    expect(humanizeActivitySummary('tool_use: web_search')).toBe('Searched the web');
  });

  it('falls back to "Used <words>" for unknown tools', () => {
    expect(humanizeActivitySummary('tool_result: fancy_new_tool')).toBe('Used fancy new tool');
  });

  it('passes plain summaries through untouched', () => {
    expect(humanizeActivitySummary('Drafted the Q3 editorial memo')).toBe('Drafted the Q3 editorial memo');
  });
});
