/**
 * Direct unit pins for `validateChatRequestFields` (TD-TEST-1).
 *
 * The route pins in `chat-route-characterization.test.ts` reach these rules
 * through `buildLocalServer`; these call the exported function with no server,
 * so the field order that the doc comment calls part of the contract is pinned
 * in milliseconds.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { validateChatRequestFields } from '../../src/local/routes/chat.js';

type FieldInput = Parameters<typeof validateChatRequestFields>[0];

const EMPTY: FieldInput = {
  message: 'hello',
  workspace: undefined,
  workspaceId: undefined,
  session: undefined,
  sessionId: undefined,
  selectedSkill: undefined,
  retry: undefined,
  retryTarget: undefined,
};

const installed = (name: string) => name === 'research';
const validate = (fields: Partial<FieldInput>) =>
  validateChatRequestFields({ ...EMPTY, ...fields }, installed);

describe('validateChatRequestFields', () => {
  const previousLimit = process.env.WAGGLE_MAX_MESSAGE_LENGTH;
  afterEach(() => {
    if (previousLimit === undefined) delete process.env.WAGGLE_MAX_MESSAGE_LENGTH;
    else process.env.WAGGLE_MAX_MESSAGE_LENGTH = previousLimit;
  });

  it('accepts a plain message and normalizes an installed skill', () => {
    expect(validate({})).toEqual({ selectedSkill: undefined, retryTarget: null });
    expect(validate({ selectedSkill: '  Research ' })).toEqual({ selectedSkill: 'research', retryTarget: null });
  });

  it.each([
    [{ message: undefined }, 400, { error: 'message is required' }],
    [{ message: '' }, 400, { error: 'message is required' }],
    [{ message: 42 }, 400, { error: 'message must be a string', code: 'INVALID_FIELD_TYPE' }],
    [{ selectedSkill: 7 }, 400, { error: 'selectedSkill must be a string', code: 'INVALID_FIELD_TYPE' }],
    [{ selectedSkill: '-bad-' }, 400, { error: 'selectedSkill is invalid', code: 'INVALID_SELECTED_SKILL' }],
    [{ selectedSkill: 'writer' }, 409, { error: 'The selected skill is not available', code: 'SKILL_NOT_AVAILABLE' }],
    [{ retry: 'yes' }, 400, { error: 'retry must be a boolean', code: 'INVALID_FIELD_TYPE' }],
    [{ retryTarget: { kind: 'lone-user' } }, 400, { error: 'retryTarget is invalid', code: 'INVALID_RETRY_TARGET' }],
    [
      { retryTarget: { kind: 'lone-user', expectedMessageCount: 1 } },
      400,
      { error: 'retryTarget requires retry: true', code: 'INVALID_RETRY_TARGET' },
    ],
    [{ workspace: 5 }, 400, { error: 'workspace must be a string', code: 'INVALID_FIELD_TYPE' }],
    [{ sessionId: 'x'.repeat(201) }, 400, { error: 'sessionId is too long (max 200 chars)', code: 'INVALID_FIELD_LENGTH' }],
  ] as const)('rejects %o with %i', (fields, status, body) => {
    expect(validate(fields as Partial<FieldInput>)).toEqual({ rejection: { status, body } });
  });

  it('parses a well-formed retry target when retry is true', () => {
    expect(validate({ retry: true, retryTarget: { kind: 'lone-user', expectedMessageCount: 2 } }))
      .toEqual({ selectedSkill: undefined, retryTarget: { kind: 'lone-user', expectedMessageCount: 2 } });
  });

  it('checks fields in source order: an uninstalled skill outranks a malformed retry', () => {
    expect(validate({ selectedSkill: 'writer', retry: 'yes' })).toMatchObject({ rejection: { status: 409 } });
    expect(validate({ message: 42, selectedSkill: 'writer' })).toMatchObject({ rejection: { status: 400 } });
  });

  it('applies the configured message limit, and the default when it is not a positive integer', () => {
    process.env.WAGGLE_MAX_MESSAGE_LENGTH = '5';
    expect(validate({ message: 'toolong' })).toEqual({
      rejection: { status: 400, body: { error: 'Message too long (7 chars, max 5)', code: 'MESSAGE_TOO_LONG' } },
    });
    process.env.WAGGLE_MAX_MESSAGE_LENGTH = 'abc';
    expect(validate({ message: 'x'.repeat(50_000) })).toEqual({ selectedSkill: undefined, retryTarget: null });
    expect(validate({ message: 'x'.repeat(50_001) })).toMatchObject({ rejection: { body: { code: 'MESSAGE_TOO_LONG' } } });
  });

  it('throws a 400 for an unsafe path segment instead of returning a rejection', () => {
    expect(() => validate({ workspace: '../evil' })).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'Invalid workspace: contains illegal characters' }),
    );
  });
});
