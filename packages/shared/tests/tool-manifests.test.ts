import { describe, it, expect } from 'vitest';
import {
  BUILTIN_TOOL_MANIFESTS, SUPPORTED_TOOLS, LAUNCH_COHORT, TOOL_DISPLAY_NAMES,
  applyPromptArgTemplate,
} from '../src/tool-detection.js';

describe('BUILTIN_TOOL_MANIFESTS', () => {
  it('has one manifest per supported tool, ids matching SUPPORTED_TOOLS', () => {
    expect(BUILTIN_TOOL_MANIFESTS.map((m) => m.id).sort()).toEqual([...SUPPORTED_TOOLS].sort());
  });
  it('marks every built-in as builtin:true and launchable', () => {
    for (const m of BUILTIN_TOOL_MANIFESTS) {
      expect(m.builtin).toBe(true);
      expect(m.launchable).toBe(true);
    }
  });
  it('keeps desktop-only surfaces out of the hook cohort', () => {
    expect(BUILTIN_TOOL_MANIFESTS.filter((m) => !m.hookCapable).map((m) => m.id)).toEqual([
      'hermes-desktop',
    ]);
  });
  it('derives TOOL_DISPLAY_NAMES + LAUNCH_COHORT from the manifests (unchanged values)', () => {
    expect(TOOL_DISPLAY_NAMES['claude-code']).toBe('Claude Code');
    expect(TOOL_DISPLAY_NAMES['codex']).toBe('Codex CLI');
    expect(TOOL_DISPLAY_NAMES['hermes-desktop']).toBe('Hermes Desktop');
    expect([...LAUNCH_COHORT].sort()).toEqual([...SUPPORTED_TOOLS].sort());
  });
  it('models Hermes CLI and Desktop as separate execution surfaces', () => {
    const cli = BUILTIN_TOOL_MANIFESTS.find((m) => m.id === 'hermes')!;
    const desktop = BUILTIN_TOOL_MANIFESTS.find((m) => m.id === 'hermes-desktop')!;

    expect(cli).toMatchObject({
      displayName: 'Hermes Agent CLI',
      hookCapable: true,
      capabilities: { interactiveLaunch: true, headlessTask: true },
    });
    expect(desktop).toMatchObject({
      displayName: 'Hermes Desktop',
      hookCapable: false,
      detect: { kind: 'candidates' },
      capabilities: { interactiveLaunch: true, headlessTask: false, resumable: false },
    });
    expect(desktop.task).toBeUndefined();
  });
  it('claude-code detects by PATH binary "claude" (not its id)', () => {
    const cc = BUILTIN_TOOL_MANIFESTS.find((m) => m.id === 'claude-code')!;
    expect(cc.detect).toEqual({ kind: 'path', binaryName: 'claude' });
  });
});

describe('applyPromptArgTemplate (#5 fast-follow)', () => {
  it('substitutes {prompt} in each template entry', () => {
    expect(applyPromptArgTemplate(['--print', '{prompt}'], 'hello')).toEqual(['--print', 'hello']);
  });
  it('substitutes within an entry and across multiple entries', () => {
    expect(applyPromptArgTemplate(['-m', 'msg={prompt}', '{prompt}'], 'hi')).toEqual(['-m', 'msg=hi', 'hi']);
  });
  it('leaves entries without the placeholder untouched', () => {
    expect(applyPromptArgTemplate(['--yes', '--fast'], 'hi')).toEqual(['--yes', '--fast']);
  });
});
