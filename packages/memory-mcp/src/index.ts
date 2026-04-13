#!/usr/bin/env node

/**
 * Waggle Memory MCP Server
 *
 * Persistent memory for Claude Code, Claude Desktop, and any MCP-compatible AI system.
 * Powered by the Waggle OS memory engine — FrameStore + HybridSearch + KnowledgeGraph.
 *
 * Transport: stdio (Claude Code / Claude Desktop standard)
 * Data: ~/.waggle/ (shared with Waggle OS desktop app)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { initialize, shutdown } from './core/setup.js';
import { registerMemoryTools } from './tools/memory.js';
import { registerKnowledgeTools } from './tools/knowledge.js';
import { registerIdentityTools } from './tools/identity.js';
import { registerAwarenessTools } from './tools/awareness.js';
import { registerWorkspaceTools } from './tools/workspace.js';
import { registerHarvestTools } from './tools/harvest.js';
import { registerResources } from './resources/memory.js';

// ── Server creation ─────────────────────────────────────────────────

const server = new McpServer(
  {
    name: 'waggle-memory',
    version: '0.1.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      logging: {},
    },
    instructions: [
      'Waggle Memory gives you persistent memory across conversations.',
      '',
      'Core workflow:',
      '1. Use recall_memory FIRST to check if relevant context exists',
      '2. Use save_memory to persist important facts, decisions, and preferences',
      '3. Use search_entities to explore the knowledge graph',
      '4. Use get_identity / get_awareness for user context',
      '',
      'Memory is stored locally in ~/.waggle/ and persists across sessions.',
      'Workspaces provide isolated memory spaces for different projects.',
    ].join('\n'),
  },
);

// ── Register all tools ──────────────────────────────────────────────

registerMemoryTools(server);
registerKnowledgeTools(server);
registerIdentityTools(server);
registerAwarenessTools(server);
registerWorkspaceTools(server);
registerHarvestTools(server);

// ── Register all resources ──────────────────────────────────────────

registerResources(server);

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Initialize the memory engine (MindDB, embeddings, workspace manager)
  await initialize();

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error('Waggle Memory MCP server running on stdio');
  console.error(`Data directory: ${process.env.WAGGLE_DATA_DIR ?? '~/.waggle'}`);
}

// ── Graceful shutdown ───────────────────────────────────────────────

function handleShutdown(): void {
  console.error('Shutting down Waggle Memory MCP server...');
  shutdown();
  process.exit(0);
}

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// ── Launch ──────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('Fatal error starting Waggle Memory MCP server:', err);
  shutdown();
  process.exit(1);
});
