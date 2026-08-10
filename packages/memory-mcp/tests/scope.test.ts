import { describe, expect, it } from 'vitest';
import { win32 as pathWin32 } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import {
  parseScopes,
  isFullAccess,
  isToolAllowed,
  scopeGatedServer,
  READ_TOOLS,
  WRITE_TOOLS,
} from '../src/scope.js';

import { registerMemoryTools } from '../src/tools/memory.js';
import { registerKnowledgeTools } from '../src/tools/knowledge.js';
import { registerIdentityTools } from '../src/tools/identity.js';
import { registerAwarenessTools } from '../src/tools/awareness.js';
import { registerWorkspaceTools } from '../src/tools/workspace.js';
import { registerHarvestTools } from '../src/tools/harvest.js';
import { buildClaudeLaunch, registerCleanupTools } from '../src/tools/cleanup.js';
import { registerEraseTools } from '../src/tools/erase.js';
import { registerIngestTools } from '../src/tools/ingest.js';
import { registerWikiTools } from '../src/tools/wiki.js';

function makeStub(): { server: McpServer; names: () => string[] } {
  const tools: string[] = [];
  const server = {
    tool: (name: string) => { tools.push(name); },
    resource: () => { /* read-only resources, not gated */ },
  } as unknown as McpServer;
  return { server, names: () => tools.slice().sort() };
}

function registerAll(server: McpServer): void {
  registerMemoryTools(server);
  registerKnowledgeTools(server);
  registerIdentityTools(server);
  registerAwarenessTools(server);
  registerWorkspaceTools(server);
  registerHarvestTools(server);
  registerCleanupTools(server);
  registerEraseTools(server);
  registerIngestTools(server);
  registerWikiTools(server);
}

describe('Claude consolidation launch boundary', () => {
  it('uses the canonical npm CLI without a shell or ambient secrets on Windows', () => {
    const npmRoot = 'C:\\Users\\test\\AppData\\Roaming\\npm';
    const shim = pathWin32.join(npmRoot, 'claude.cmd');
    const cli = pathWin32.join(npmRoot, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    const files = new Set([shim.toLowerCase(), cli.toLowerCase()]);
    const launch = buildClaudeLaunch(['-p', '--output-format=text'], {
      platform: 'win32',
      env: {
        PATH: npmRoot,
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
      PATH: npmRoot,
      USERPROFILE: 'C:\\Users\\test',
      APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
      CLAUDE_CONFIG_DIR: 'C:\\Users\\test\\.claude-profile',
      HIVE_MIND_NO_SYNTH: '1',
    });
    expect(launch.options.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(launch.options.env.OPENAI_API_KEY).toBeUndefined();
    expect(launch.options.env.WAGGLE_FUTURE_PROVIDER_SECRET).toBeUndefined();
  });
});

describe('parseScopes', () => {
  it('defaults to full read+write when unset', () => {
    const s = parseScopes(undefined);
    expect(s.has('memory:read')).toBe(true);
    expect(s.has('memory:write')).toBe(true);
    expect(isFullAccess(s)).toBe(true);
  });

  it('defaults to full read+write when empty/whitespace', () => {
    expect(isFullAccess(parseScopes(''))).toBe(true);
    expect(isFullAccess(parseScopes('   '))).toBe(true);
  });

  it('read-only scope grants read but not write', () => {
    const s = parseScopes('memory:read');
    expect(s.has('memory:read')).toBe(true);
    expect(s.has('memory:write')).toBe(false);
    expect(isFullAccess(s)).toBe(false);
  });

  it('write scope implies read (write-implies-read)', () => {
    const s = parseScopes('memory:write');
    expect(s.has('memory:read')).toBe(true);
    expect(s.has('memory:write')).toBe(true);
  });

  it('comma list with both scopes parses to full (order/space tolerant)', () => {
    expect(isFullAccess(parseScopes('memory:read,memory:write'))).toBe(true);
    expect(isFullAccess(parseScopes(' memory:write , memory:read '))).toBe(true);
  });

  it('explicit-but-unrecognized value falls closed to read-only', () => {
    const s = parseScopes('memory:bogus');
    expect(s.has('memory:read')).toBe(true);
    expect(s.has('memory:write')).toBe(false);
  });
});

describe('isToolAllowed', () => {
  const ro = parseScopes('memory:read');
  const rw = parseScopes('memory:write');

  it('read-only allows every read tool', () => {
    for (const name of READ_TOOLS) expect(isToolAllowed(name, ro)).toBe(true);
  });

  it('read-only denies every write tool', () => {
    for (const name of WRITE_TOOLS) expect(isToolAllowed(name, ro)).toBe(false);
  });

  it('write scope allows both read and write tools', () => {
    for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) {
      expect(isToolAllowed(name, rw)).toBe(true);
    }
  });

  it('unknown tool names fail safe (treated as write)', () => {
    expect(isToolAllowed('totally_new_tool', ro)).toBe(false);
    expect(isToolAllowed('totally_new_tool', rw)).toBe(true);
  });
});

describe('scopeGatedServer registration gating', () => {
  it('read-only scope registers only the 9 read tools — never save/cleanup/ingest', () => {
    const { server, names } = makeStub();
    const gated = scopeGatedServer(server, parseScopes('memory:read'));
    registerAll(gated);

    expect(names()).toEqual([...READ_TOOLS].sort());
    expect(names()).not.toContain('save_memory');
    expect(names()).not.toContain('cleanup_frames');
    expect(names()).not.toContain('cleanup_entities');
    expect(names()).not.toContain('ingest_source');
    expect(names()).not.toContain('erase_memory');   // destructive Art.17 tool is write-only
    expect(names()).toHaveLength(9);
  });

  it('write scope (implies read) registers all 22 tools incl. erase_memory', () => {
    const { server, names } = makeStub();
    const gated = scopeGatedServer(server, parseScopes('memory:write'));
    registerAll(gated);
    expect(names()).toContain('erase_memory');
    expect(names()).toHaveLength(22);
  });

  it('default (unset) is unchanged — proxy skipped, all 22 tools register directly', () => {
    const { server, names } = makeStub();
    const scopes = parseScopes(undefined);
    // mirror index.ts: full access skips the proxy entirely
    const targetServer = isFullAccess(scopes) ? server : scopeGatedServer(server, scopes);
    expect(targetServer).toBe(server);
    registerAll(targetServer);
    expect(names()).toHaveLength(22);
  });
});
