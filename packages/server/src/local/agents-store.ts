/**
 * Agents store (UX-Refactor Phase 3, gap card S09/S18 / gate B3).
 *
 * The Agent entity is a real object persisted in the flat `{dataDir}/agents.json`
 * file (B3 ratified 2026-06-10) — NO `.mind` migration (M3 explicitly NOT
 * shipped), mirroring the `agent-groups.json` precedent but with the Phase-2C
 * store quality bar (artifact-index.ts): pure I/O, immutable updates, corrupt-file
 * degradation, atomic write (temp file + rename).
 *
 * `lastRunAt`/`successRate` are NEVER stored here — they are derived at read
 * from `execution_traces` by the route layer (B3). This module owns only the
 * declared record.
 */

import type { AgentRunState, AgentType, AutonomyLevel, Scope } from '@waggle/shared';
import { AGENT_RUN_STATES } from '@waggle/shared';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// PRD §14.5 agent lifecycle states — single source of truth lives in
// @waggle/shared (the FE re-exports the same union). Re-exported here so the
// existing route/test import sites keep working.
export { AGENT_RUN_STATES };
export type { AgentRunState };

/** The persisted agents.json record (PRD §15.5 / build spec §1.1). */
export interface AgentRecord {
  id: string;
  name: string;
  /** Required — Agent Builder hard gate. */
  goal: string;
  description?: string;
  type: AgentType;
  /** Persona = behavioral template FIELD of the agent (B3). */
  personaId?: string;
  avatar?: string;
  /** Required — Agent Builder hard gate. */
  model: string;
  /** Required — Agent Builder hard gate. */
  autonomyLevel: AutonomyLevel;
  workspaceIds?: string[];
  teamId?: string;
  /** Required — Agent Builder hard gate. */
  memoryScopes: Scope[];
  skillIds?: string[];
  connectorIds?: string[];
  mcpIds?: string[];
  permissions?: Record<string, unknown>;
  status: AgentRunState;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentsFile {
  agents: AgentRecord[];
}

function agentsFilePath(dataDir: string): string {
  return path.join(dataDir, 'agents.json');
}

/** Read the agent index. Empty list on a missing/corrupt file. */
export function readAgents(dataDir: string): AgentRecord[] {
  const filePath = agentsFilePath(dataDir);
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AgentsFile;
      return Array.isArray(parsed.agents) ? parsed.agents : [];
    }
  } catch {
    // Corrupted file — degrade to empty rather than throw.
  }
  return [];
}

/** Atomic write: temp file in the same directory, then rename over the target. */
function writeAgents(dataDir: string, agents: AgentRecord[]): void {
  const filePath = agentsFilePath(dataDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify({ agents }, null, 2), 'utf-8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Windows AV/file-lock on the target is a real occurrence — don't orphan
    // the temp file when the swap fails; surface the original error.
    try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
    throw err;
  }
}

/** Fields a caller may supply on create. id/createdAt/updatedAt assigned here. */
export type NewAgentInput = Omit<AgentRecord, 'id' | 'createdAt' | 'updatedAt'>;

/** Append a new agent record and return the saved row. */
export function addAgent(dataDir: string, input: NewAgentInput): AgentRecord {
  const now = new Date().toISOString();
  const record: AgentRecord = {
    ...input,
    id: `agent_${randomUUID()}`,
    createdAt: now,
    updatedAt: now,
  };
  const agents = readAgents(dataDir);
  writeAgents(dataDir, [...agents, record]);
  return record;
}

/** Find one agent by id. */
export function getAgent(dataDir: string, id: string): AgentRecord | undefined {
  return readAgents(dataDir).find((a) => a.id === id);
}

/** Apply a partial update. Immutable fields (id/createdAt) are never overwritten;
 *  updatedAt is restamped. Returns the updated record, or undefined if absent. */
export function patchAgent(
  dataDir: string,
  id: string,
  patch: Partial<AgentRecord>,
): AgentRecord | undefined {
  const agents = readAgents(dataDir);
  const idx = agents.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  const existing = agents[idx];
  const updated: AgentRecord = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  const next = agents.map((a, i) => (i === idx ? updated : a));
  writeAgents(dataDir, next);
  return updated;
}

/** Remove an agent record (hard delete). Returns whether a row was removed. */
export function deleteAgent(dataDir: string, id: string): boolean {
  const agents = readAgents(dataDir);
  const next = agents.filter((a) => a.id !== id);
  if (next.length === agents.length) return false;
  writeAgents(dataDir, next);
  return true;
}
