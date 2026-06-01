import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  HERMES_EVENT_NAME,
  HERMES_SESSION_START_OBSERVE_EVENT,
  hermesAdapter,
} from '../src/adapter.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

describe('HERMES_EVENT_NAME (lifecycle → native event key)', () => {
  it('maps the three live lifecycles to snake_case Hermes events; pre-compact is undefined', () => {
    expect(HERMES_EVENT_NAME['session-start']).toBe('pre_llm_call');
    expect(HERMES_EVENT_NAME['user-prompt-submit']).toBe('pre_llm_call');
    expect(HERMES_EVENT_NAME['stop']).toBe('post_llm_call');
    // CONFIRMED ABSENT in source — Hermes ships no compaction hook.
    expect(HERMES_EVENT_NAME['pre-compact']).toBeUndefined();
  });

  it('exposes the observer-only SessionStart key registered alongside pre_llm_call', () => {
    expect(HERMES_SESSION_START_OBSERVE_EVENT).toBe('on_session_start');
  });
});

describe('hermesAdapter field extraction (reads from the `extra` envelope)', () => {
  const payload = {
    extra: {
      cwd: '/work/dir',
      session_id: 'sess-42',
      user_message: 'the user prompt',
      assistant_response: 'the assistant reply',
      parent_frame_id: 'frame-99',
    },
  };

  it('source is hermes', () => {
    expect(hermesAdapter.source).toBe('hermes');
  });

  it('extractCwd / extractSessionId / extractPrompt read from extra', () => {
    expect(hermesAdapter.extractCwd(payload)).toBe('/work/dir');
    expect(hermesAdapter.extractSessionId(payload)).toBe('sess-42');
    expect(hermesAdapter.extractPrompt(payload)).toBe('the user prompt');
  });

  it('extractResponse / extractParent read from extra', async () => {
    expect(await hermesAdapter.extractResponse(payload, {})).toBe('the assistant reply');
    expect(hermesAdapter.extractParent(payload)).toBe('frame-99');
  });

  it('falls back to top-level keys when the extra envelope is absent (forward-compat)', () => {
    const flat = { cwd: '/c', session_id: 's', user_message: 'p', parent_frame_id: 'pp' };
    expect(hermesAdapter.extractCwd(flat)).toBe('/c');
    expect(hermesAdapter.extractSessionId(flat)).toBe('s');
    expect(hermesAdapter.extractPrompt(flat)).toBe('p');
    expect(hermesAdapter.extractParent(flat)).toBe('pp');
  });

  it('formatInject produces the { context } shape (appended to the user message)', () => {
    expect(hermesAdapter.formatInject?.('recalled frames here')).toEqual({ context: 'recalled frames here' });
  });

  it('returns undefined for missing fields rather than throwing', () => {
    expect(hermesAdapter.extractCwd({})).toBeUndefined();
    expect(hermesAdapter.extractSessionId({})).toBeUndefined();
    expect(hermesAdapter.extractPrompt({})).toBeUndefined();
    expect(hermesAdapter.extractParent({})).toBeUndefined();
  });
});

describe('NO pre-compact entrypoint exists (structural invariant)', () => {
  it('ships exactly the three hook entrypoints — session-start / user-prompt-submit / stop', () => {
    expect(existsSync(join(SRC, 'hooks', 'session-start.ts'))).toBe(true);
    expect(existsSync(join(SRC, 'hooks', 'user-prompt-submit.ts'))).toBe(true);
    expect(existsSync(join(SRC, 'hooks', 'stop.ts'))).toBe(true);
    // There is genuinely nothing to hook for compaction — no entrypoint.
    expect(existsSync(join(SRC, 'hooks', 'pre-compact.ts'))).toBe(false);
  });
});
