/**
 * AI-OS #6 — chat goal-ancestry wiring: project resolves from the active
 * workspace name. Focused unit on the exported resolver (no SSE turn needed).
 */
import { describe, it, expect } from 'vitest';
import { resolveChatAncestry } from '../src/local/routes/chat.js';

describe('resolveChatAncestry (#6)', () => {
  const server = {
    workspaceManager: {
      get: (id: string) => (id === 'ws1' ? { name: 'Acme Redesign' } : null),
    },
  };

  it('resolves project from the active workspace name', () => {
    expect(resolveChatAncestry(server as never, 'ws1')).toEqual({ project: 'Acme Redesign' });
  });

  it('returns empty for unknown / missing workspace', () => {
    expect(resolveChatAncestry(server as never, 'missing')).toEqual({});
    expect(resolveChatAncestry(server as never, undefined)).toEqual({});
  });
});
