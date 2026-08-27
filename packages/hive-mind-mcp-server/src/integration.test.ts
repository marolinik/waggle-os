import { describe, expect, it } from 'vitest';
import { win32 as pathWin32 } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerMemoryTools } from './tools/memory.js';
import { registerKnowledgeTools } from './tools/knowledge.js';
import { registerIdentityTools } from './tools/identity.js';
import { registerAwarenessTools } from './tools/awareness.js';
import { registerWorkspaceTools } from './tools/workspace.js';
import { registerHarvestTools } from './tools/harvest.js';
import {
  buildClaudeLaunch,
  registerCleanupTools,
  resolveConsolidationGop,
} from './tools/cleanup.js';
import {
  collectObservations,
  FrameStore,
  MindDB,
  SessionStore,
} from '@waggle/hive-mind-core';
import { registerIngestTools } from './tools/ingest.js';
import { registerWikiTools } from './tools/wiki.js';
import { registerResources } from './resources/memory.js';

/**
 * A hand-rolled stub that satisfies the subset of the McpServer API
 * the register functions call:
 *
 *   server.tool(name, description, schema, handler)
 *   server.resource(name, uri, handler)
 *
 * The stub captures `name` / `description` / `uri` so tests can assert
 * which tools got wired up, without spinning up a real MCP server or
 * the stdio transport.
 */
function makeStub(): {
  server: McpServer;
  tools: { name: string; description: string }[];
  resources: { name: string; uri: string }[];
} {
  const tools: { name: string; description: string }[] = [];
  const resources: { name: string; uri: string }[] = [];
  const server = {
    tool: (name: string, description: string, _schema: unknown, _handler: unknown) => {
      tools.push({ name, description });
    },
    resource: (name: string, uri: string, _handler: unknown) => {
      resources.push({ name, uri });
    },
  } as unknown as McpServer;
  return { server, tools, resources };
}

describe('@waggle/hive-mind-mcp-server registration wiring', () => {
  it('builds a shell-free Windows Claude launch without ambient secrets', () => {
    const npmRoot = 'C:\\Users\\test\\AppData\\Roaming\\npm';
    const shim = pathWin32.join(npmRoot, 'claude.cmd');
    const cli = pathWin32.join(npmRoot, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    const files = new Set([shim.toLowerCase(), cli.toLowerCase()]);
    const launch = buildClaudeLaunch(['-p', '--output-format=text'], {
      platform: 'win32',
      env: {
        Path: npmRoot,
        USERPROFILE: 'C:\\Users\\test',
        APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
        CLAUDE_CONFIG_DIR: 'C:\\Users\\test\\.claude-profile',
        ANTHROPIC_API_KEY: 'must-not-reach-claude',
        OPENAI_API_KEY: 'must-not-reach-claude',
        WAGGLE_FUTURE_PROVIDER_SECRET: 'must-also-be-denied',
      },
      isFile: (candidate) => files.has(pathWin32.normalize(candidate).toLowerCase()),
    });

    expect(launch.command).toBe(process.execPath);
    expect(launch.args).toEqual([cli, '-p', '--output-format=text']);
    expect(launch.options.shell).toBe(false);
    expect(launch.options.env).toMatchObject({
      Path: npmRoot,
      USERPROFILE: 'C:\\Users\\test',
      APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
      CLAUDE_CONFIG_DIR: 'C:\\Users\\test\\.claude-profile',
      HIVE_MIND_NO_SYNTH: '1',
    });
    expect(launch.options.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(launch.options.env.OPENAI_API_KEY).toBeUndefined();
    expect(launch.options.env.WAGGLE_FUTURE_PROVIDER_SECRET).toBeUndefined();
  });

  it('registerMemoryTools registers save_memory + recall_memory', () => {
    const { server, tools } = makeStub();
    registerMemoryTools(server);
    expect(tools.map((t) => t.name).sort()).toEqual(['recall_memory', 'save_memory']);
    // Every tool description should be non-trivial (> 30 chars) so the MCP
    // client actually sees useful guidance.
    for (const t of tools) expect(t.description.length).toBeGreaterThan(30);
  });

  it('registerKnowledgeTools registers search_entities + save_entity + create_relation', () => {
    const { server, tools } = makeStub();
    registerKnowledgeTools(server);
    expect(tools.map((t) => t.name).sort()).toEqual(['create_relation', 'save_entity', 'search_entities']);
  });

  it('registerIdentityTools registers get_identity + set_identity', () => {
    const { server, tools } = makeStub();
    registerIdentityTools(server);
    expect(tools.map((t) => t.name).sort()).toEqual(['get_identity', 'set_identity']);
  });

  it('registerAwarenessTools registers get/set/clear_awareness', () => {
    const { server, tools } = makeStub();
    registerAwarenessTools(server);
    expect(tools.map((t) => t.name).sort()).toEqual(['clear_awareness', 'get_awareness', 'set_awareness']);
  });

  it('registerWorkspaceTools registers list_workspaces + create_workspace', () => {
    const { server, tools } = makeStub();
    registerWorkspaceTools(server);
    expect(tools.map((t) => t.name).sort()).toEqual(['create_workspace', 'list_workspaces']);
  });

  it('registerHarvestTools registers harvest_import + harvest_sources', () => {
    const { server, tools } = makeStub();
    registerHarvestTools(server);
    expect(tools.map((t) => t.name).sort()).toEqual(['harvest_import', 'harvest_sources']);
  });

  it('registerCleanupTools registers cleanup_frames + cleanup_entities', () => {
    const { server, tools } = makeStub();
    registerCleanupTools(server);
    expect(tools.map((t) => t.name).sort()).toEqual(['cleanup_entities', 'cleanup_frames']);
  });

  it('registerIngestTools registers ingest_source', () => {
    const { server, tools } = makeStub();
    registerIngestTools(server);
    expect(tools.map((t) => t.name)).toEqual(['ingest_source']);
  });

  it('registerWikiTools registers compile_wiki + get_page + search_wiki + compile_health', () => {
    const { server, tools } = makeStub();
    registerWikiTools(server);
    expect(tools.map((t) => t.name).sort()).toEqual([
      'compile_health', 'compile_wiki', 'get_page', 'search_wiki',
    ]);
  });

  it('registerResources registers the 4 memory:// resource roots', () => {
    const { server, resources } = makeStub();
    registerResources(server);
    const names = resources.map((r) => r.name).sort();
    expect(names).toEqual(['awareness', 'identity', 'personal-stats', 'workspace']);
    // All URIs should be under the memory:// scheme so the client namespaces them together.
    for (const r of resources) expect(r.uri.startsWith('memory://')).toBe(true);
  });

  it('full registration surface adds up to 21 tools + 4 resources', () => {
    const { server, tools, resources } = makeStub();
    registerMemoryTools(server);
    registerKnowledgeTools(server);
    registerIdentityTools(server);
    registerAwarenessTools(server);
    registerWorkspaceTools(server);
    registerHarvestTools(server);
    registerCleanupTools(server);
    registerIngestTools(server);
    registerWikiTools(server);
    registerResources(server);

    expect(tools).toHaveLength(21);
    expect(resources).toHaveLength(4);

    // Every tool name is unique — duplicates would cause MCP registration errors at runtime.
    const names = new Set(tools.map((t) => t.name));
    expect(names.size).toBe(tools.length);
  });
});

describe('@waggle/hive-mind-mcp-server consolidation GOP anchor', () => {
  function fixture(): { db: MindDB; frames: FrameStore; sessions: SessionStore } {
    const db = new MindDB(':memory:');
    return { db, frames: new FrameStore(db), sessions: new SessionStore(db) };
  }

  function setCreatedAt(db: MindDB, id: number, createdAt: string): void {
    db.getDatabase().prepare('UPDATE memory_frames SET created_at = ? WHERE id = ?')
      .run(createdAt, id);
  }

  it('ignores a newer excluded-source frame', () => {
    const { db, frames, sessions } = fixture();
    try {
      const target = sessions.create();
      const decoy = sessions.create();
      const first = frames.createIFrame(target.gop_id, 'eligible first', 'normal', 'agent_inferred');
      const second = frames.createIFrame(target.gop_id, 'eligible second', 'normal', 'agent_inferred');
      const excluded = frames.createIFrame(decoy.gop_id, 'excluded future', 'normal', 'user_stated');
      setCreatedAt(db, first.id, '2026-01-01 00:00:00');
      setCreatedAt(db, second.id, '2026-01-02 00:00:00');
      setCreatedAt(db, excluded.id, '2026-12-01 00:00:00');
      const observations = collectObservations(db, { limit: 400 });

      expect(resolveConsolidationGop(frames, observations)).toBe(target.gop_id);
    } finally {
      db.close();
    }
  });

  it('uses canonical offset chronology instead of textual order', () => {
    const { db, frames, sessions } = fixture();
    try {
      const olderSession = sessions.create();
      const newerSession = sessions.create();
      const older = frames.createIFrame(olderSession.gop_id, 'older instant', 'normal', 'agent_inferred');
      const newer = frames.createIFrame(newerSession.gop_id, 'newer instant', 'normal', 'agent_inferred');
      setCreatedAt(db, older.id, '2026-01-01 01:00:00+0200');
      setCreatedAt(db, newer.id, '2026-01-01 00:30:00+0100');
      const observations = collectObservations(db, { limit: 400 });

      expect(resolveConsolidationGop(frames, observations)).toBe(newerSession.gop_id);
    } finally {
      db.close();
    }
  });

  it('breaks equal-instant ties with the higher frame id', () => {
    const { db, frames, sessions } = fixture();
    try {
      const lowerSession = sessions.create();
      const higherSession = sessions.create();
      const lower = frames.createIFrame(lowerSession.gop_id, 'equal lower id', 'normal', 'agent_inferred');
      const higher = frames.createIFrame(higherSession.gop_id, 'equal higher id', 'normal', 'agent_inferred');
      setCreatedAt(db, lower.id, '2026-01-01 13:00:00+0100');
      setCreatedAt(db, higher.id, '2026-01-01 12:00:00Z');
      const observations = collectObservations(db, { limit: 400 });

      expect(resolveConsolidationGop(frames, observations)).toBe(higherSession.gop_id);
    } finally {
      db.close();
    }
  });

  it('returns no anchor when there are no eligible observations', () => {
    const { db, frames, sessions } = fixture();
    try {
      const session = sessions.create();
      frames.createIFrame(session.gop_id, 'excluded one', 'normal', 'user_stated');
      frames.createIFrame(session.gop_id, 'excluded two', 'normal', 'user_stated');
      const observations = collectObservations(db, { limit: 400 });

      expect(observations).toEqual([]);
      expect(resolveConsolidationGop(frames, observations)).toBeNull();
    } finally {
      db.close();
    }
  });
});
