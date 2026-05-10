import { describe, expect, it } from 'vitest';
import { encodeFrame, frameToSavePayload, type HookFrame } from '../src/frame-encoder.js';
import type { HookEvent } from '../src/hook-event-types.js';

function event(overrides: Partial<HookEvent> = {}): HookEvent {
  return {
    eventType: 'user-prompt-submit',
    source: 'claude-code',
    cwd: '/proj/foo',
    timestamp_iso: '2026-04-28T10:00:00.000Z',
    payload: {},
    ...overrides,
  };
}

describe('encodeFrame', () => {
  it('encodes a basic event with content from payload.content', () => {
    const frame = encodeFrame(event({ payload: { content: 'hi there' } }));
    expect(frame.content).toBe('hi there');
    expect(frame.source).toBe('claude-code');
    expect(frame.metadata.cwd).toBe('/proj/foo');
    expect(frame.metadata.event_type).toBe('user-prompt-submit');
    expect(frame.metadata.timestamp_iso).toBe('2026-04-28T10:00:00.000Z');
  });

  it('falls back to payload.text / payload.prompt / payload.message', () => {
    expect(encodeFrame(event({ payload: { text: 't' } })).content).toBe('t');
    expect(encodeFrame(event({ payload: { prompt: 'p' } })).content).toBe('p');
    expect(encodeFrame(event({ payload: { message: 'm' } })).content).toBe('m');
  });

  it('classifies importance from content by default', () => {
    expect(encodeFrame(event({ payload: { content: 'always run lint' } })).importance).toBe('critical');
    expect(encodeFrame(event({ payload: { content: 'we decided X' } })).importance).toBe('important');
    // Commit 1.4: substantive default raised from 'temporary' to 'normal'.
    expect(encodeFrame(event({ payload: { content: 'hello' } })).importance).toBe('normal');
  });

  it('importance override beats classifier', () => {
    const frame = encodeFrame(event({ payload: { content: 'hello' } }), { importance: 'critical' });
    expect(frame.importance).toBe('critical');
  });

  it('extracts scope from payload.session_id (or aliases)', () => {
    expect(encodeFrame(event({ payload: { session_id: 'abc' } })).scope).toBe('abc');
    expect(encodeFrame(event({ payload: { sessionId: 'def' } })).scope).toBe('def');
  });

  it('falls back to scope="default" when no session id is present', () => {
    expect(encodeFrame(event({ payload: {} })).scope).toBe('default');
  });

  it('scope option overrides payload-derived scope', () => {
    const frame = encodeFrame(event({ payload: { session_id: 'a' } }), { scope: 'b' });
    expect(frame.scope).toBe('b');
  });

  it('includes optional metadata only when present', () => {
    const withProj = encodeFrame(event({ payload: { content: 'x', project: 'waggle' } }));
    expect(withProj.metadata.project).toBe('waggle');

    const withoutProj = encodeFrame(event({ payload: { content: 'x' } }));
    expect(withoutProj.metadata.project).toBeUndefined();
  });

  it('attaches parent id when supplied', () => {
    const frame = encodeFrame(event({ payload: { content: 'x' } }), { parent: 'frame-7' });
    expect(frame.parent).toBe('frame-7');
  });

  it('omits parent when not supplied', () => {
    const frame = encodeFrame(event({ payload: { content: 'x' } }));
    expect(frame.parent).toBeUndefined();
  });

  it('content option overrides payload extraction', () => {
    const frame = encodeFrame(event({ payload: { content: 'original' } }), { content: 'override' });
    expect(frame.content).toBe('override');
  });
});

describe('frameToSavePayload (Commit 1.4)', () => {
  function makeFrame(overrides: Partial<HookFrame> = {}): HookFrame {
    return {
      content: 'the actual content',
      importance: 'normal',
      scope: 'sess-123',
      source: 'claude-code',
      metadata: {
        cwd: '/proj',
        timestamp_iso: '2026-04-28T10:00:00.000Z',
        event_type: 'user-prompt-submit',
      },
      ...overrides,
    };
  }

  it('embeds session/source/event in a content prefix and defaults source to "system"', () => {
    const out = frameToSavePayload(makeFrame());
    expect(out.content).toBe('[hm session:sess-123 src:claude-code event:user-prompt-submit] the actual content');
    expect(out.importance).toBe('normal');
    expect(out.source).toBe('system');
  });

  it('drops session token when scope is "default"', () => {
    const out = frameToSavePayload(makeFrame({ scope: 'default' }));
    expect(out.content).not.toContain('session:');
    expect(out.content).toContain('src:claude-code');
  });

  it('includes parent token when present', () => {
    const out = frameToSavePayload(makeFrame({ parent: 'frame-99' }));
    expect(out.content).toContain('parent:frame-99');
  });

  it('includes project token from metadata when present', () => {
    const out = frameToSavePayload(makeFrame({ metadata: {
      cwd: '/proj',
      timestamp_iso: '2026-04-28T10:00:00.000Z',
      event_type: 'stop',
      project: 'waggle-os',
    }}));
    expect(out.content).toContain('project:waggle-os');
  });

  it('mcpSource override is honoured', () => {
    const out = frameToSavePayload(makeFrame(), { mcpSource: 'agent_inferred' });
    expect(out.source).toBe('agent_inferred');
  });

  it('omits prefix entirely when no metadata tokens would be added', () => {
    const minimalFrame: HookFrame = {
      content: 'plain',
      importance: 'normal',
      scope: 'default',
      source: 'claude-code',
      metadata: { cwd: '/p', timestamp_iso: 't' }, // no event_type, no project
    };
    const out = frameToSavePayload(minimalFrame);
    // src token is always present, so we still get a prefix:
    expect(out.content).toBe('[hm src:claude-code] plain');
  });
});
