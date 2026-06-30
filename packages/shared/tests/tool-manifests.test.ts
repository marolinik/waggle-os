import { describe, it, expect } from 'vitest';
import {
  BUILTIN_TOOL_MANIFESTS, SUPPORTED_TOOLS, LAUNCH_COHORT, TOOL_DISPLAY_NAMES,
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
  it('claude-desktop is the only non-hook-capable tool', () => {
    const nonHook = BUILTIN_TOOL_MANIFESTS.filter((m) => !m.hookCapable).map((m) => m.id);
    expect(nonHook).toEqual(['claude-desktop']);
  });
  it('derives TOOL_DISPLAY_NAMES + LAUNCH_COHORT from the manifests (unchanged values)', () => {
    expect(TOOL_DISPLAY_NAMES['claude-code']).toBe('Claude Code');
    expect(TOOL_DISPLAY_NAMES['codex']).toBe('Codex CLI');
    expect([...LAUNCH_COHORT].sort()).toEqual([...SUPPORTED_TOOLS].sort());
  });
  it('claude-code detects by PATH binary "claude" (not its id)', () => {
    const cc = BUILTIN_TOOL_MANIFESTS.find((m) => m.id === 'claude-code')!;
    expect(cc.detect).toEqual({ kind: 'path', binaryName: 'claude' });
  });
});
