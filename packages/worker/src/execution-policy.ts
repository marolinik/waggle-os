import fs from 'node:fs';
import path from 'node:path';
import {
  createSystemTools,
  PermissionManager,
  type ToolDefinition,
} from '@waggle/agent';

const SAFE_TEAM_ID = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,127})$/;

export const READ_ONLY_WORKER_SYSTEM_PROMPT = [
  'You are a Waggle AI agent running as a non-interactive read-only worker.',
  'You may inspect the tenant workspace with read_file, search_files, and search_content, and use web_search or web_fetch for research.',
  'You cannot run shell commands, execute code, or write, edit, or delete files.',
  'If a task requires changes, return a proposed patch or exact instructions for a human-approved interactive run.',
  'Be helpful, concise, and proactive.',
].join('\n');

export interface WorkerExecutionContext {
  workspaceDir: string;
  tools: ToolDefinition[];
  systemPrompt: string;
}

function isContained(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === '' || (
    !path.isAbsolute(relative)
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
  );
}

function canonicalChild(parent: string, childName: string): string {
  const child = path.join(parent, childName);
  fs.mkdirSync(child, { recursive: true });
  const canonical = fs.realpathSync.native(child);
  if (!isContained(parent, canonical)) {
    throw new Error(`Worker tenant path escapes WAGGLE_DATA_DIR: ${childName}`);
  }
  if (path.relative(child, canonical) !== '') {
    throw new Error(`Worker tenant path must not traverse a link or junction: ${childName}`);
  }
  return canonical;
}

export function createWorkerExecutionContext(teamId: string): WorkerExecutionContext {
  const configuredDataDir = process.env.WAGGLE_DATA_DIR;
  if (!configuredDataDir?.trim()) {
    throw new Error('WAGGLE_DATA_DIR is required for non-interactive worker execution');
  }
  if (typeof teamId !== 'string' || !SAFE_TEAM_ID.test(teamId)) {
    throw new Error('Invalid teamId for non-interactive worker execution');
  }

  const dataDir = path.resolve(configuredDataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  const canonicalDataDir = fs.realpathSync.native(dataDir);
  const teamsDir = canonicalChild(canonicalDataDir, 'teams');
  const teamDir = canonicalChild(teamsDir, teamId);
  const workspaceDir = canonicalChild(teamDir, 'files');
  const tools = PermissionManager.sandbox().filterTools(createSystemTools(workspaceDir));

  return {
    workspaceDir,
    tools,
    systemPrompt: READ_ONLY_WORKER_SYSTEM_PROMPT,
  };
}
