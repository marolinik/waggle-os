/**
 * E-2 — promptArgsForTool unit tests.
 *
 * Locks the mapping between tool id and CLI args shape. When a tool's
 * CLI convention changes (or a new tool is added), the lock surfaces
 * a test diff so the LauncherApp's launch flow doesn't silently send
 * the wrong args.
 */

import { describe, it, expect } from 'vitest';
import {
  promptArgsForTool,
  toolAcceptsInlinePrompt,
} from './launcher-prompt-args';

describe('promptArgsForTool', () => {
  // ── Empty / whitespace handling ────────────────────────────────────

  it.each(['', '   ', '\t\n'])(
    'returns null for empty/whitespace prompt %j',
    (empty) => {
      expect(promptArgsForTool('claude-code', empty)).toBeNull();
    },
  );

  it('trims the prompt before building args', () => {
    const args = promptArgsForTool('claude-code', '   refactor x   ');
    expect(args).toEqual(['--print', 'refactor x']);
  });

  // ── Per-tool shapes ────────────────────────────────────────────────

  describe('claude-code', () => {
    it('uses --print flag (non-interactive Claude Code)', () => {
      expect(promptArgsForTool('claude-code', 'rotate the webhook secret')).toEqual([
        '--print',
        'rotate the webhook secret',
      ]);
    });
  });

  describe('openclaw', () => {
    it('inherits claude-code --print convention (Claude Code fork)', () => {
      expect(promptArgsForTool('openclaw', 'list open PRs')).toEqual([
        '--print',
        'list open PRs',
      ]);
    });
  });

  describe('codex', () => {
    it('passes prompt as positional argument (OpenAI Codex CLI)', () => {
      expect(promptArgsForTool('codex', 'fix the failing test in main.py')).toEqual([
        'fix the failing test in main.py',
      ]);
    });
  });

  describe('hermes', () => {
    it('passes prompt as positional argument (best-effort convention)', () => {
      expect(promptArgsForTool('hermes', 'summarize todays standup')).toEqual([
        'summarize todays standup',
      ]);
    });
  });

  // ── GUI / folder-based tools ───────────────────────────────────────

  describe('GUI-only / folder-based tools return null', () => {
    it.each(['cursor', 'claude-desktop', 'codex-desktop'])(
      '%s — no CLI prompt surface',
      (toolId) => {
        expect(promptArgsForTool(toolId, 'anything')).toBeNull();
      },
    );
  });

  // ── Unknown tool ───────────────────────────────────────────────────

  it('returns null for unknown tool ids (defensive default)', () => {
    expect(promptArgsForTool('made-up-tool', 'anything')).toBeNull();
  });
});

describe('toolAcceptsInlinePrompt', () => {
  it.each([
    ['claude-code', true],
    ['openclaw', true],
    ['codex', true],
    ['hermes', true],
    ['cursor', false],
    ['claude-desktop', false],
    ['codex-desktop', false],
    ['made-up', false],
  ])('%s → %s', (toolId, expected) => {
    expect(toolAcceptsInlinePrompt(toolId)).toBe(expected);
  });
});
