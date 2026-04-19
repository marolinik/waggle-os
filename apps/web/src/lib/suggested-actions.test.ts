/**
 * M-28 / ENG-7 — suggested next-action extraction regression.
 * Pure function, deterministic.
 */
import { describe, it, expect } from 'vitest';
import {
  extractSuggestedActions,
  SUGGESTED_ACTIONS_MAX,
} from './suggested-actions';

describe('extractSuggestedActions — direct offers', () => {
  it('picks up "Want me to X?" offers', () => {
    const actions = extractSuggestedActions('Done. Want me to file the bug report?');
    expect(actions).toEqual(['file the bug report']);
  });

  it('picks up "Should I X?" offers', () => {
    const actions = extractSuggestedActions('The tests passed. Should I open a PR?');
    expect(actions).toEqual(['open a PR']);
  });

  it('picks up "Would you like me to X?" offers', () => {
    const actions = extractSuggestedActions('Would you like me to summarise the changes?');
    expect(actions).toEqual(['summarise the changes']);
  });

  it('collects multiple offers in order', () => {
    const actions = extractSuggestedActions(
      'Ready. Want me to commit? Should I also push to origin?',
    );
    // "also" is preserved — strips nothing mid-phrase.
    expect(actions).toEqual(['commit', 'also push to origin']);
  });

  it('caps at SUGGESTED_ACTIONS_MAX entries', () => {
    const actions = extractSuggestedActions(
      'Want me to do A? Should I do B? Shall I do C? Can I help you do D?',
    );
    expect(actions.length).toBe(SUGGESTED_ACTIONS_MAX);
    expect(actions).toEqual(['do A', 'do B', 'do C']);
  });
});

describe('extractSuggestedActions — list sections', () => {
  it('extracts bullet items under a "Next steps:" heading', () => {
    const content = [
      'All done.',
      '',
      'Next steps:',
      '- Run the migration',
      '- Deploy to staging',
      '- Notify the team',
    ].join('\n');
    expect(extractSuggestedActions(content)).toEqual([
      'Run the migration',
      'Deploy to staging',
      'Notify the team',
    ]);
  });

  it('extracts numbered items under a "You can:" heading', () => {
    const content = [
      'Here are the options.',
      '',
      'You can:',
      '1. Retry with a different key',
      '2. Switch to OpenRouter',
      '3. Keep going offline',
    ].join('\n');
    expect(extractSuggestedActions(content)).toEqual([
      'Retry with a different key',
      'Switch to OpenRouter',
      'Keep going offline',
    ]);
  });

  it('handles unicode bullets •', () => {
    const content = 'Suggestions:\n• Check the logs\n• Restart the service';
    expect(extractSuggestedActions(content)).toEqual(['Check the logs', 'Restart the service']);
  });

  it('stops at the first blank line after the list', () => {
    const content = [
      'Next steps:',
      '- First thing',
      '- Second thing',
      '',
      '- Third thing (shouldn\'t be included)',
    ].join('\n');
    expect(extractSuggestedActions(content)).toEqual(['First thing', 'Second thing']);
  });

  it('combines offers and list items (offers first, deduped)', () => {
    const content = [
      'Want me to start the build?',
      '',
      'Suggestions:',
      '- Start the build',
      '- Run the tests',
    ].join('\n');
    // "start the build" (offer) dedups the "Start the build" bullet.
    expect(extractSuggestedActions(content)).toEqual([
      'start the build',
      'Run the tests',
    ]);
  });
});

describe('extractSuggestedActions — normalisation', () => {
  it('trims punctuation from the end of offers', () => {
    expect(extractSuggestedActions('Should I commit now?,')).toEqual(['commit now']);
  });

  it('collapses internal whitespace in actions', () => {
    const content = 'Next steps:\n- Run   the    migration';
    expect(extractSuggestedActions(content)).toEqual(['Run the migration']);
  });

  it('rejects very short phrases (< 3 chars)', () => {
    // "Want me to a?" → body is "a" → 1 char → rejected.
    expect(extractSuggestedActions('Want me to a?')).toEqual([]);
  });

  it('rejects very long phrases (> 120 chars) — unsuitable as button text', () => {
    const huge = 'x'.repeat(150);
    expect(extractSuggestedActions(`Want me to ${huge}?`)).toEqual([]);
  });
});

describe('extractSuggestedActions — defensive', () => {
  it('returns [] for empty / whitespace-only input', () => {
    expect(extractSuggestedActions('')).toEqual([]);
    expect(extractSuggestedActions('   \n  ')).toEqual([]);
  });

  it('returns [] for a plain statement with no offer and no list', () => {
    expect(extractSuggestedActions('The file has been saved.')).toEqual([]);
  });

  it('does not flag non-action questions', () => {
    // "What should I know?" isn't an actionable offer, just a question.
    expect(extractSuggestedActions('What should I know about this repo?')).toEqual([]);
  });

  it('tolerates non-string input without throwing', () => {
    expect(extractSuggestedActions(undefined as unknown as string)).toEqual([]);
    expect(extractSuggestedActions(null as unknown as string)).toEqual([]);
  });
});
