import { vi } from 'vitest';
import type { CliBridge, MemoryHit } from '@waggle/hive-mind-shim-core';

export interface MockBridgeOverrides {
  saveMemoryResult?: { id: string; success: boolean; workspace: string };
  recallMemoryHits?: MemoryHit[];
  cleanupFramesResult?: { pruned: number };
  saveMemoryThrows?: Error;
}

export interface MockBridge extends CliBridge {
  saveMemory: ReturnType<typeof vi.fn>;
  recallMemory: ReturnType<typeof vi.fn>;
  cleanupFrames: ReturnType<typeof vi.fn>;
  callMcpTool: ReturnType<typeof vi.fn>;
  setWorkspaceById: ReturnType<typeof vi.fn>;
  getActiveWorkspaceId: ReturnType<typeof vi.fn>;
}

export function makeMockBridge(overrides: MockBridgeOverrides = {}): MockBridge {
  let activeWorkspaceId: string | undefined;
  const saveMemory = overrides.saveMemoryThrows
    ? vi.fn(async () => { throw overrides.saveMemoryThrows; })
    : vi.fn(async () => overrides.saveMemoryResult ?? { id: 'frame-1', success: true, workspace: 'personal' });
  const recallMemory = vi.fn(async () => overrides.recallMemoryHits ?? []);
  const cleanupFrames = vi.fn(async () => overrides.cleanupFramesResult ?? { pruned: 0 });
  const callMcpTool = vi.fn(async () => ({}));
  const setWorkspaceById = vi.fn((id?: string) => { activeWorkspaceId = id; });
  const getActiveWorkspaceId = vi.fn(() => activeWorkspaceId);
  return {
    saveMemory,
    recallMemory,
    cleanupFrames,
    callMcpTool,
    setWorkspaceById,
    getActiveWorkspaceId,
  } as unknown as MockBridge;
}

export interface CapturedHookOutput {
  stdout: string[];
  exits: number[];
}

export function makeHookCaptures(): CapturedHookOutput & {
  writeStdout: (s: string) => void;
  exit: (code: number) => void;
} {
  const stdout: string[] = [];
  const exits: number[] = [];
  return {
    stdout,
    exits,
    writeStdout: (s) => stdout.push(s),
    exit: (c) => exits.push(c),
  };
}
