import { describe, expect, it } from 'vitest';
import { isUserFacingError, markUserFacingError } from '../src/user-facing-error.js';

describe('user-facing error marker (TD-CHAT-15)', () => {
  it('marks an error in place and returns it', () => {
    const error = new Error('The selected model is still loading.');
    expect(markUserFacingError(error)).toBe(error);
    expect(isUserFacingError(error)).toBe(true);
  });

  it('leaves a plain error, a lookalike object and a non-error unmarked', () => {
    expect(isUserFacingError(new Error('internal'))).toBe(false);
    expect(isUserFacingError({ message: 'shaped like an error' })).toBe(false);
    expect(isUserFacingError('plain string')).toBe(false);
    expect(isUserFacingError(null)).toBe(false);
  });

  it('adds no enumerable key, so error equality and serialization are unchanged', () => {
    const error = markUserFacingError(new Error('x'));
    expect(Object.keys(error)).toEqual([]);
    expect(JSON.stringify(error)).toBe('{}');
  });
});
