/**
 * Characterization tests for `buildChatCommandContext` (routes/chat.ts).
 *
 * These pin the branches of the slash-command context that no route test
 * executes: the recall-hit list and the catch in `searchMemory`, and the
 * conversation-history sentinel and the managed-workspace block in
 * `getWorkspaceState`. They call the helper directly with a stub orchestrator
 * and a stub server instead of going through POST /api/chat. They pin CURRENT
 * behavior and are not a spec: a bug found while pinning is marked `QUIRK` and
 * ledgered, never fixed here (docs/TESTING.md Characterization Backlog).
 *
 * The turn policy is classified from the message the way the handler does it,
 * and the helper derives its memory gates from that policy, so a directive
 * suffix steers a pin from the message text alone, as in the route pins in
 * chat-route-characterization.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Orchestrator } from '@waggle/agent';
import { FrameStore, MindDB, SessionStore } from '@waggle/core';
import { buildChatCommandContext } from '../../src/local/routes/chat.js';
import {
  allowsConversationHistory,
  allowsPersistedMemoryRead,
  classifyExplicitTurnMutationPolicy,
} from '../../src/local/routes/chat-helpers.js';
import { buildWorkspaceNowBlock, formatWorkspaceNowPrompt } from '../../src/local/routes/workspace-context.js';

type CommandContextInput = Parameters<typeof buildChatCommandContext>[0];
type RecallResult = Awaited<ReturnType<Orchestrator['recallMemory']>>;

const EMPTY_RECALL: RecallResult = { text: '', count: 0, recalled: [], recalledFrames: [] };
/** The shape `Orchestrator.recallMemory` returns from its own catch block. */
const OUTAGE_RECALL: RecallResult = {
  text: '[Memory recall temporarily unavailable. Proceed without prior context.]',
  count: 0,
  recalled: [],
  recalledFrames: [],
};

interface StubWorkspace { id: string; name: string; mindPath: string }

function stubOrchestrator(recall: () => Promise<RecallResult>) {
  let calls = 0;
  const orchestrator = {
    recallMemory: async () => { calls += 1; return recall(); },
  } as unknown as Orchestrator;
  return { orchestrator, callCount: () => calls };
}

/** Knows exactly one workspace; every other id is unknown with a missing mind. */
function stubWorkspaceManager(dataDir: string, workspace?: StubWorkspace) {
  return {
    get: (id: string) => (workspace && id === workspace.id ? { id, name: workspace.name } : null),
    getMindPath: (id: string) => (workspace && id === workspace.id ? workspace.mindPath : path.join(dataDir, `${id}.mind`)),
  };
}

/** The four server members `buildChatCommandContext` reads, nothing else. */
function stubServer(
  dataDir: string,
  workspace?: StubWorkspace,
  skills: Array<{ name: string }> = [],
): CommandContextInput['server'] {
  return {
    localConfig: { dataDir },
    workspaceManager: stubWorkspaceManager(dataDir, workspace),
    agentState: { activateWorkspaceMind: () => true, skills },
    cronStore: { list: () => [] },
  } as unknown as CommandContextInput['server'];
}

/** Builds the context for `message` the way the handler does before `commandRegistry.execute`. */
function contextFor(message: string, overrides: Partial<CommandContextInput> = {}) {
  const turnMutationPolicy = classifyExplicitTurnMutationPolicy(message);
  return buildChatCommandContext({
    server: stubServer(os.tmpdir()),
    orchestrator: stubOrchestrator(async () => EMPTY_RECALL).orchestrator,
    executionWorkspaceId: undefined,
    sessionId: 'pin-session',
    turnMutationPolicy,
    ...overrides,
  });
}

describe('buildChatCommandContext (characterization)', () => {
  it('reports the Personal sentinel as the workspace id when there is no execution workspace', () => {
    expect(contextFor('/status').workspaceId).toBe('Personal');
    expect(contextFor('/status', { executionWorkspaceId: 'ws-1' }).workspaceId).toBe('ws-1');
  });

  describe('listSkills', () => {
    // Row-57 Gap: `listSkills` had no direct pin, only incidental traversal.
    const skills = [{ name: 'risk-assessment' }, { name: 'release-notes' }];

    it('returns the installed skill names when a persisted memory read is allowed', () => {
      expect(contextFor('/skills', { server: stubServer(os.tmpdir(), undefined, skills) }).listSkills())
        .toEqual(['risk-assessment', 'release-notes']);
    });

    it('returns nothing when the turn denies a persisted memory read', () => {
      // The skill roster is persisted state, so the same read boundary that
      // hides saved memory hides it -- the list is empty, not withheld with an
      // error, and the caller cannot tell "none installed" from "not allowed".
      const message = '/skills - do not use my saved memory';
      const denied = classifyExplicitTurnMutationPolicy(message);
      expect(allowsPersistedMemoryRead(denied)).toBe(false);
      expect(contextFor(message, {
        server: stubServer(os.tmpdir(), undefined, skills),
        turnMutationPolicy: denied,
      }).listSkills()).toEqual([]);
    });
  });

  describe('searchMemory', () => {
    it('renders the first five recall hits as a numbered list', async () => {
      const hits = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
      const stub = stubOrchestrator(async () => ({ ...EMPTY_RECALL, count: hits.length, recalled: hits }));
      const result = await contextFor('/memory anything', { orchestrator: stub.orchestrator }).searchMemory('anything');
      expect(result).toBe('1. one\n2. two\n3. three\n4. four\n5. five');
      expect(stub.callCount()).toBe(1);
    });

    it('reports no matches when the recall count is zero', async () => {
      expect(await contextFor('/memory anything').searchMemory('anything')).toBe('No relevant memories found.');
    });

    it('reports a recall outage as no matches', async () => {
      // QUIRK (docs/TECH-DEBT.md TD-CHAT-29): Orchestrator.recallMemory never
      // rejects for a string query — its own catch returns count 0 with an
      // outage notice in `text`, which searchMemory ignores. The user sees
      // "no matches"; the branch below is reachable only from a test double.
      const stub = stubOrchestrator(async () => OUTAGE_RECALL);
      expect(await contextFor('/memory anything', { orchestrator: stub.orchestrator }).searchMemory('anything'))
        .toBe('No relevant memories found.');
    });

    it('reports the search as unavailable only when recallMemory itself throws', async () => {
      const stub = stubOrchestrator(async () => { throw new Error('recall exploded'); });
      expect(await contextFor('/memory anything', { orchestrator: stub.orchestrator }).searchMemory('anything'))
        .toBe('Memory search unavailable.');
    });

    it('refuses without consulting the orchestrator when persisted memory reads are denied', async () => {
      const stub = stubOrchestrator(async () => ({ ...EMPTY_RECALL, count: 1, recalled: ['hit'] }));
      const result = await contextFor('/memory anything - do not use my saved memory', { orchestrator: stub.orchestrator })
        .searchMemory('anything - do not use my saved memory');
      expect(result).toBe('Persisted memory access is disabled for this turn.');
      expect(stub.callCount()).toBe(0);
    });
  });

  describe('getWorkspaceState', () => {
    let tmpDir: string;
    let emptyMindPath: string;
    let seededMindPath: string;
    const ABOUT = 'Pinned workspace is about characterization tests';

    beforeAll(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cmd-ctx-char-'));
      emptyMindPath = path.join(tmpDir, 'empty.mind');
      new MindDB(emptyMindPath).close();
      seededMindPath = path.join(tmpDir, 'seeded.mind');
      const mind = new MindDB(seededMindPath);
      const session = new SessionStore(mind).create('pinned');
      new FrameStore(mind).createIFrame(session.gop_id, ABOUT, 'normal');
      mind.close();
      // One session file under <dataDir>/workspaces/<id>/sessions so the
      // block's session count observes the dataDir the helper passes through.
      const sessionsDir = path.join(tmpDir, 'workspaces', 'ws-seeded', 'sessions');
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.writeFileSync(path.join(sessionsDir, 'pinned.jsonl'), '');
    });

    afterAll(() => {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* EBUSY on Windows */ }
    });

    it.each([
      ['/status - do not use conversation history'],
      ['/now - do not use conversation history'],
    ])('%s reports conversation-derived state as disabled', async (message) => {
      const policy = classifyExplicitTurnMutationPolicy(message);
      expect(allowsPersistedMemoryRead(policy)).toBe(true);
      expect(allowsConversationHistory(policy)).toBe(false);
      expect(await contextFor(message, { executionWorkspaceId: 'ws-1' }).getWorkspaceState())
        .toBe('Conversation-derived workspace state is disabled for this turn.');
    });

    it('a bounded context scope is refused by the persisted-memory gate before the history gate', async () => {
      // Every non-default contextScope fails allowsPersistedMemoryRead as well
      // as allowsConversationHistory, so the scope half of the history gate is
      // unreachable here: the route only reaches the conversation-derived
      // sentinel through an explicit history denial (the two pins above).
      const message = '/now - use only the supplied evidence';
      const policy = classifyExplicitTurnMutationPolicy(message);
      expect(policy.contextScope).toBe('supplied-only');
      expect(allowsConversationHistory(policy)).toBe(false);
      expect(await contextFor(message, { executionWorkspaceId: 'ws-1' }).getWorkspaceState())
        .toBe('Persisted workspace state is disabled for this turn.');
    });

    it('the persisted-memory denial wins over the conversation-history denial', async () => {
      // One directive denies both, so the precedence is observed on a turn the
      // route can actually receive rather than forced through the helper's
      // inputs. Without the two policy assertions the pin would be vacuous:
      // the persisted-memory gate returns before the history gate is read.
      const message = '/now - do not use my saved memory or conversation history';
      const policy = classifyExplicitTurnMutationPolicy(message);
      expect(allowsPersistedMemoryRead(policy)).toBe(false);
      expect(allowsConversationHistory(policy)).toBe(false);
      expect(await contextFor(message, { executionWorkspaceId: 'ws-1' }).getWorkspaceState())
        .toBe('Persisted workspace state is disabled for this turn.');
    });

    it('reports no state for a personal chat with no effective workspace', async () => {
      expect(await contextFor('/status').getWorkspaceState()).toBe('No workspace state available.');
    });

    it('reports no state when the effective workspace is unknown to the workspace manager', async () => {
      expect(await contextFor('/now', { server: stubServer(tmpDir), executionWorkspaceId: 'ws-unknown' }).getWorkspaceState())
        .toBe('No workspace state available.');
    });

    it('reports no state when the managed workspace mind holds no frames', async () => {
      const workspace = { id: 'ws-empty', name: 'Empty Workspace', mindPath: emptyMindPath };
      expect(await contextFor('/now', { server: stubServer(tmpDir, workspace), executionWorkspaceId: workspace.id }).getWorkspaceState())
        .toBe('No workspace state available.');
    });

    it('renders the Workspace Now block for a managed workspace with memory', async () => {
      const workspace = { id: 'ws-seeded', name: 'Pinned Workspace', mindPath: seededMindPath };
      const expected = formatWorkspaceNowPrompt(buildWorkspaceNowBlock({
        dataDir: tmpDir,
        workspaceId: workspace.id,
        wsManager: stubWorkspaceManager(tmpDir, workspace),
        cronSchedules: [],
      })!);
      const context = contextFor('/now', { server: stubServer(tmpDir, workspace), executionWorkspaceId: workspace.id });
      const state = await context.getWorkspaceState();
      expect(state).toBe(expected);
      // One execution id feeds both the command context and the state block, so
      // they name the same workspace (TD-TEST-8).
      expect(context.workspaceId).toBe(workspace.id);
      expect(state.startsWith(`# Workspace Now — ${workspace.name}\n\n`)).toBe(true);
      expect(state).toContain(`${ABOUT}.`);
      // The session count comes from <dataDir>/workspaces/ws-seeded/sessions.
      expect(state).toContain('across 1 session.');
    });
  });
});
