/**
 * Internal low-latency path used by short-lived IDE hooks.
 *
 * This module intentionally bypasses the MCP process handshake and imports
 * only the lightweight SQLite hook runtime. It is not a general replacement
 * for `mcp call`: semantic queries and wider scopes must stay on MCP.
 */

import {
  recallHookFrames,
  saveHookFrame,
} from '@waggle/hive-mind-core/hook-runtime';
import {
  isToolAllowed,
  parseScopes,
} from '@waggle/hive-mind-mcp-server/scope';
import type { McpCallResult } from './mcp-call.js';

export interface HookCallOptions {
  tool: string;
  args: unknown;
}

export interface HookCallCommandArgs {
  values: Record<string, unknown>;
  positionals: string[];
}

const SAVE_KEYS = new Set(['content', 'importance', 'source', 'workspace']);
const RECALL_KEYS = new Set(['query', 'limit', 'scope', 'profile', 'workspace']);
const IMPORTANCE = new Set(['critical', 'important', 'normal', 'temporary']);
const SOURCE = new Set(['user_stated', 'tool_verified', 'agent_inferred', 'system']);

function objectArgs(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('hook-call --args must decode to a JSON object');
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(args: Record<string, unknown>, allowed: Set<string>): void {
  const unsupported = Object.keys(args).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new Error(`Unsupported hook-call argument(s): ${unsupported.join(', ')}`);
  }
}

function optionalEnum(
  args: Record<string, unknown>,
  key: string,
  allowed: Set<string>,
  fallback: string,
): string {
  const value = args[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`Invalid ${key}: ${String(value)}`);
  }
  return value;
}

function optionalWorkspace(args: Record<string, unknown>): string | undefined {
  const value = args['workspace'];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('workspace must be a non-empty string');
  }
  return value;
}

function success(tool: string, payload: unknown): McpCallResult {
  return {
    ok: true,
    tool,
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError: false,
  };
}

function failure(tool: string, error: unknown): McpCallResult {
  return {
    ok: false,
    tool,
    error: error instanceof Error ? error.message : String(error),
  };
}

function assertToolScope(tool: 'save_memory' | 'recall_memory'): void {
  const scopes = parseScopes(process.env.HIVE_MIND_SCOPES);
  if (isToolAllowed(tool, scopes)) return;
  const required = tool === 'save_memory' ? 'memory:write' : 'memory:read';
  throw new Error(`${tool} requires the ${required} scope`);
}

function saveMemory(args: Record<string, unknown>): McpCallResult {
  assertAllowedKeys(args, SAVE_KEYS);
  if (typeof args['content'] !== 'string') {
    throw new Error('save_memory content must be a string');
  }
  const importance = optionalEnum(args, 'importance', IMPORTANCE, 'normal');
  const source = optionalEnum(args, 'source', SOURCE, 'agent_inferred');
  const workspace = optionalWorkspace(args);
  const result = saveHookFrame({
    content: args['content'],
    importance: importance as 'critical' | 'important' | 'normal' | 'temporary',
    source: source as 'user_stated' | 'tool_verified' | 'agent_inferred' | 'system',
    ...(workspace ? { workspace } : {}),
  });
  return success('save_memory', result);
}

function recallMemory(args: Record<string, unknown>): McpCallResult {
  assertAllowedKeys(args, RECALL_KEYS);
  if (args['query'] !== '') {
    throw new Error('hook-call recall_memory requires an exactly empty query');
  }
  if (args['profile'] !== undefined) {
    throw new Error('hook-call recall_memory does not support a scoring profile');
  }

  const rawScope = args['scope'];
  if (rawScope !== undefined && rawScope !== 'personal' && rawScope !== 'current') {
    throw new Error(`Unsupported hook-call recall scope: ${String(rawScope)}`);
  }
  const scope = rawScope ?? 'personal';
  const workspace = optionalWorkspace(args);
  if (scope === 'personal' && workspace !== undefined) {
    throw new Error('workspace is not allowed for personal hook recall');
  }
  if (scope === 'current' && workspace === undefined) {
    throw new Error('current hook recall requires a workspace');
  }

  const rawLimit = args['limit'];
  if (rawLimit !== undefined && (
    typeof rawLimit !== 'number'
    || !Number.isFinite(rawLimit)
    || rawLimit < 1
    || rawLimit > 100
  )) {
    throw new Error(`Invalid recall limit: ${String(rawLimit)}`);
  }
  const hits = recallHookFrames({
    ...(scope === 'current' ? { workspace } : {}),
    ...(typeof rawLimit === 'number' ? { limit: rawLimit } : {}),
  });
  if (hits.length === 0) {
    return {
      ok: true,
      tool: 'recall_memory',
      content: [{ type: 'text', text: 'No memories found for query: ""' }],
      isError: false,
    };
  }
  return success('recall_memory', hits);
}

export function runHookCall(options: HookCallOptions): McpCallResult {
  try {
    const args = objectArgs(options.args);
    if (options.tool === 'save_memory') {
      assertToolScope(options.tool);
      return saveMemory(args);
    }
    if (options.tool === 'recall_memory') {
      assertToolScope(options.tool);
      return recallMemory(args);
    }
    throw new Error(`Unsupported tool for hook-call: ${options.tool}`);
  } catch (error) {
    return failure(options.tool, error);
  }
}

export function runHookCallCommand(command: HookCallCommandArgs): string {
  if (command.values['json'] !== true) {
    throw new Error('hook-call is an internal JSON command and requires --json');
  }
  const toolValue = command.values['tool'];
  const tool = typeof toolValue === 'string' ? toolValue : command.positionals[0];
  if (!tool) throw new Error('hook-call requires a tool name');

  let args: unknown = {};
  const rawArgs = command.values['args'];
  if (rawArgs !== undefined && rawArgs !== '') {
    if (typeof rawArgs !== 'string') throw new Error('--args must be a JSON string');
    try {
      args = JSON.parse(rawArgs) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`--args is not valid JSON: ${message}`);
    }
  }
  return JSON.stringify(runHookCall({ tool, args }), null, 2);
}
