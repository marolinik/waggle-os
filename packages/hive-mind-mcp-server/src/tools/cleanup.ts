/**
 * Cleanup tools — data maintenance for the memory system.
 *
 * cleanup_frames:   Wipe test pollution, compact stale frames, reconcile indexes.
 * cleanup_entities: Delete misclassified KG entities, dedup, retire orphans.
 */

import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { win32 as pathWin32 } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getPersonalDb,
  getFrameStore,
  getKnowledgeGraph,
  getEmbedder,
  getSearch,
  getWorkspaceMind,
} from '../core/setup.js';
import {
  reconcileIndexes,
  normalizeEntityName,
  collectObservations,
  detectSupersessionChains,
  detectEntityGroups,
  applyConsolidation,
  type MindDB,
  type FrameStore,
  type HybridSearch,
  type ConsolidationLlm,
} from '@waggle/hive-mind-core';

// Common nouns that get misclassified as person/project entities
const NOISE_ENTITY_NAMES = new Set([
  'begin week', 'end week', 'begin day', 'end day',
  'test', 'testing', 'tests', 'todo', 'todos', 'fix', 'bug',
  'error', 'warning', 'success', 'failure', 'result', 'results',
  'start', 'stop', 'begin', 'end', 'run', 'running',
  'true', 'false', 'null', 'undefined', 'none',
  'yes', 'no', 'ok', 'okay',
  'step 1', 'step 2', 'step 3', 'step 4', 'step 5',
  'phase 1', 'phase 2', 'phase 3', 'phase 4',
  'part 1', 'part 2', 'part 3',
  'item', 'items', 'thing', 'things', 'stuff',
  'data', 'file', 'files', 'folder', 'path',
  'input', 'output', 'response', 'request',
  'user', 'admin', 'system', 'server', 'client',
  'the', 'a', 'an', 'this', 'that',
]);

function isNoiseEntity(name: string, entityType: string): boolean {
  const lower = name.toLowerCase().trim();

  // Very short names are usually noise
  if (lower.length <= 2) return true;

  // Check the noise list
  if (NOISE_ENTITY_NAMES.has(lower)) return true;

  // Single character or number-only names
  if (/^\d+$/.test(lower)) return true;

  // Common nouns misclassified as person
  if (entityType === 'person') {
    // Names that are clearly not people
    if (/^(step|phase|part|section|item|task|bug|fix|test)\b/i.test(lower)) return true;
    // Names that are too generic
    if (/^(the|a|an|this|that|my|your)\s/i.test(lower)) return true;
  }

  return false;
}

// ── P/B consolidation executor ─────────────────────────────────────
// The core supersede.ts module is provider-agnostic (pure) — the LLM transport
// lives here at the call site. Default: zero-key `claude -p` subprocess. An
// OpenAI-style model id + OPENAI_API_KEY routes to the OpenAI chat API — the
// executor the benchmark validated with.

const CLAUDE_ENV_ALLOWLIST = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'COMSPEC',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'USER', 'USERNAME',
  'LOGNAME', 'SHELL', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
  'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432',
  'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LANGUAGE', 'LC_ALL', 'LC_CTYPE',
  'TERM', 'COLORTERM', 'TZ', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
  'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'CLAUDE_CONFIG_DIR',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
]);

export interface ClaudeLaunchDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  isFile?: (candidate: string) => boolean;
}

export interface ClaudeLaunch {
  command: string;
  args: string[];
  options: {
    stdio: ['pipe', 'pipe', 'pipe'];
    shell: false;
    windowsHide: true;
    env: NodeJS.ProcessEnv;
  };
}

function regularFile(candidate: string): boolean {
  try { return statSync(candidate).isFile(); } catch { return false; }
}

function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const found = Object.entries(env).find(([key]) => key.toUpperCase() === name);
  return found?.[1];
}

function claudeProcessEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined && CLAUDE_ENV_ALLOWLIST.has(key.toUpperCase())) env[key] = value;
  }
  env.HIVE_MIND_NO_SYNTH = '1';
  return env;
}

export function buildClaudeLaunch(
  args: string[],
  deps: ClaudeLaunchDeps = {},
): ClaudeLaunch {
  const platform = deps.platform ?? process.platform;
  const sourceEnv = deps.env ?? process.env;
  const env = claudeProcessEnv(sourceEnv);
  const isFile = deps.isFile ?? regularFile;
  let command = 'claude';
  let launchArgs = [...args];

  if (platform === 'win32') {
    const pathEntries = (envValue(env, 'PATH') ?? '')
      .split(';')
      .map((entry) => entry.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    let resolved = false;
    for (const directory of pathEntries) {
      const executable = pathWin32.join(directory, 'claude.exe');
      if (isFile(executable)) {
        command = executable;
        resolved = true;
        break;
      }
      const shim = pathWin32.join(directory, 'claude.cmd');
      if (!isFile(shim)) continue;
      const cliCandidates = [
        pathWin32.join(directory, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
        pathWin32.resolve(directory, '..', '@anthropic-ai', 'claude-code', 'cli.js'),
      ];
      const cli = cliCandidates.find(isFile);
      if (!cli) continue;
      command = process.execPath;
      launchArgs = [cli, ...args];
      resolved = true;
      break;
    }
    if (!resolved) throw new Error('Claude CLI not found on the sanitized Windows PATH');
  }

  return {
    command,
    args: launchArgs,
    options: { stdio: ['pipe', 'pipe', 'pipe'], shell: false, windowsHide: true, env },
  };
}

function spawnClaudeText(prompt: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const launch = buildClaudeLaunch(['-p', '--output-format=text']);
    const proc = spawn(launch.command, launch.args, launch.options);
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
      reject(new Error(`claude -p timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf8'); });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`spawn claude failed: ${err.message}`));
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`claude -p exited ${code}: ${stderr.slice(0, 300)}`));
    });
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

async function callOpenAIChat(model: string, system: string, user: string, timeoutMs = 120_000): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('consolidation consolidate_model requires OPENAI_API_KEY');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`openai ${res.status}: ${text.slice(0, 200)}`);
    return (JSON.parse(text).choices?.[0]?.message?.content ?? '').trim();
  } finally {
    clearTimeout(timer);
  }
}

function buildConsolidationLlm(model?: string): ConsolidationLlm {
  if (model && /^(gpt-|o[0-9])/.test(model)) {
    return (system, user) => callOpenAIChat(model, system, user);
  }
  return (system, user) => spawnClaudeText(`${system}\n\n${user}`);
}

function bridgeIndexText(frame: { content: string }): string {
  try {
    const parsed = JSON.parse(frame.content) as { description?: string; references?: unknown[] };
    const n = Array.isArray(parsed.references) ? parsed.references.length : 0;
    return `${parsed.description ?? 'group'}: bridge of ${n} items`;
  } catch {
    return frame.content;
  }
}

interface ConsolidationCounts {
  chains: number;
  groups: number;
  pframes: number;
  bframes: number;
  deprecated: number;
}

/**
 * Run the P/B consolidation pass on a mind: gather I-frame observations,
 * LLM-detect chains + groups, apply (deprecate stale + emit P/B frames), then
 * frames anchor to the newest observation's gop.
 */
async function runConsolidation(
  db: MindDB,
  frameStore: FrameStore,
  search: HybridSearch,
  model?: string,
  limit = 400,
): Promise<ConsolidationCounts> {
  const empty: ConsolidationCounts = { chains: 0, groups: 0, pframes: 0, bframes: 0, deprecated: 0 };
  const observations = collectObservations(db, { limit });
  if (observations.length < 2) return empty;

  const anchor = db
    .getDatabase()
    .prepare(
      "SELECT gop_id FROM memory_frames WHERE frame_type = 'I' AND importance != 'deprecated' ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .get() as { gop_id: string } | undefined;
  if (!anchor) return empty;

  const llm = buildConsolidationLlm(model);
  const [chains, groups] = await Promise.all([
    detectSupersessionChains(observations, llm),
    detectEntityGroups(observations, llm),
  ]);
  const { pframes, bframes, deprecated } = applyConsolidation(frameStore, chains, groups, anchor.gop_id);

  const toIndex = [
    ...pframes.map((f) => ({ id: f.id, content: f.content })),
    ...bframes.map((f) => ({ id: f.id, content: bridgeIndexText(f) })),
  ];
  if (toIndex.length > 0) {
    try {
      await search.indexFramesBatch(toIndex);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[consolidate] vec-index failed (frames remain FTS-searchable): ${msg}\n`);
    }
  }

  return {
    chains: chains.length,
    groups: groups.length,
    pframes: pframes.length,
    bframes: bframes.length,
    deprecated: deprecated.length,
  };
}

export function registerCleanupTools(server: McpServer): void {

  // ── cleanup_frames ─────────────────────────────────────────────
  server.tool(
    'cleanup_frames',
    'Maintenance tool: compact stale frames, remove test pollution, and reconcile search indexes. Use with mode="compact" for routine maintenance, or mode="wipe_imports" to remove all imported frames (e.g., E2E test data).',
    {
      mode: z.enum(['compact', 'wipe_imports', 'wipe_all', 'reconcile'])
        .describe('compact: prune old temp/deprecated + merge P-frames. wipe_imports: delete all source=import frames. wipe_all: delete ALL frames (DANGER). reconcile: repair FTS/vector indexes.'),
      workspace: z.string().optional()
        .describe('Workspace ID. Omit for personal mind.'),
      max_temp_age_days: z.number().optional()
        .describe('For compact mode: delete temporary frames older than N days (default 30)'),
      max_deprecated_age_days: z.number().optional()
        .describe('For compact mode: delete deprecated frames older than N days (default 90)'),
      consolidate: z.boolean().optional()
        .describe('For compact mode: additionally run P/B consolidation — LLM-detect supersession chains (deprecate stale I-frames + emit a current-value P-frame) and enumerable entity groups (emit a B-frame per group), then vec-index the new frames. Requires an LLM (see consolidate_model).'),
      consolidate_model: z.string().optional()
        .describe('LLM for consolidate: an OpenAI-style id (e.g. gpt-4o-mini, needs OPENAI_API_KEY) uses the OpenAI API; otherwise the zero-key `claude -p` subprocess.'),
    },
    async ({ mode, workspace, max_temp_age_days, max_deprecated_age_days, consolidate, consolidate_model }) => {
      const db = workspace
        ? getWorkspaceMind(workspace)?.db ?? null
        : getPersonalDb();

      if (!db) {
        return {
          content: [{ type: 'text' as const, text: `Workspace "${workspace}" not found.` }],
          isError: true,
        };
      }

      const frameStore = workspace
        ? getWorkspaceMind(workspace)!.frameStore
        : getFrameStore();
      const raw = db.getDatabase();

      if (mode === 'compact') {
        const result = frameStore.compact(
          max_temp_age_days ?? 30,
          max_deprecated_age_days ?? 90,
        );
        // Optional P/B consolidation pass, additive to compaction.
        let consolidation: ConsolidationCounts | undefined;
        if (consolidate) {
          const search = workspace
            ? getWorkspaceMind(workspace)!.search
            : getSearch();
          consolidation = await runConsolidation(db, frameStore, search, consolidate_model);
        }
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: 'compact',
              temporary_pruned: result.temporaryPruned,
              deprecated_pruned: result.deprecatedPruned,
              pframes_merged: result.pframesMerged,
              ...(consolidation ? { consolidation } : {}),
            }, null, 2),
          }],
        };
      }

      if (mode === 'wipe_imports') {
        // Delete all frames with source='import'
        const countRow = raw.prepare(
          "SELECT COUNT(*) as cnt FROM memory_frames WHERE source = 'import'",
        ).get() as { cnt: number };

        if (countRow.cnt === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No imported frames found.' }],
          };
        }

        // Get IDs for cascade cleanup
        const frameIds = raw.prepare(
          "SELECT id FROM memory_frames WHERE source = 'import'",
        ).all() as { id: number }[];

        const deleteTx = raw.transaction(() => {
          for (const { id } of frameIds) {
            // Clean FTS
            raw.prepare('DELETE FROM memory_frames_fts WHERE rowid = ?').run(id);
            // Clean vector
            try { raw.prepare('DELETE FROM memory_frames_vec WHERE rowid = ?').run(id); } catch { /* ok */ }
          }
          // Bulk delete frames
          raw.prepare("DELETE FROM memory_frames WHERE source = 'import'").run();
        });
        deleteTx();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: 'wipe_imports',
              frames_deleted: countRow.cnt,
            }, null, 2),
          }],
        };
      }

      if (mode === 'wipe_all') {
        const stats = frameStore.getStats();

        const deleteTx = raw.transaction(() => {
          raw.prepare('DELETE FROM memory_frames_fts').run();
          try { raw.prepare('DELETE FROM memory_frames_vec').run(); } catch { /* ok */ }
          raw.prepare('DELETE FROM memory_frames').run();
          raw.prepare('DELETE FROM sessions').run();
        });
        deleteTx();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: 'wipe_all',
              frames_deleted: stats.total,
              warning: 'ALL frames and sessions deleted. This cannot be undone.',
            }, null, 2),
          }],
        };
      }

      if (mode === 'reconcile') {
        const result = await reconcileIndexes(db, getEmbedder());
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: 'reconcile',
              fts_fixed: result.ftsFixed,
              vec_fixed: result.vecFixed,
            }, null, 2),
          }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: `Unknown mode: ${mode}` }],
        isError: true,
      };
    },
  );

  // ── cleanup_entities ───────────────────────────────────────────
  server.tool(
    'cleanup_entities',
    'Maintenance tool: remove noise entities from the knowledge graph, deduplicate by normalized name, and retire orphan entities with no relations.',
    {
      mode: z.enum(['audit', 'remove_noise', 'dedup', 'retire_orphans', 'wipe_all'])
        .describe('audit: report noise + duplicates without deleting. remove_noise: delete misclassified entities. dedup: merge duplicate entities. retire_orphans: soft-delete entities with 0 relations. wipe_all: delete ALL entities and relations.'),
      workspace: z.string().optional()
        .describe('Workspace ID. Omit for personal mind.'),
    },
    async ({ mode, workspace }) => {
      const kg = workspace
        ? getWorkspaceMind(workspace)?.knowledgeGraph ?? null
        : getKnowledgeGraph();
      const db = workspace
        ? getWorkspaceMind(workspace)?.db ?? null
        : getPersonalDb();

      if (!kg || !db) {
        return {
          content: [{ type: 'text' as const, text: `Workspace "${workspace}" not found.` }],
          isError: true,
        };
      }

      const raw = db.getDatabase();

      if (mode === 'audit') {
        // Count noise entities
        const allEntities = kg.getEntities(10000);
        const noiseEntities = allEntities.filter(e => isNoiseEntity(e.name, e.entity_type));

        // Find duplicates
        const normalizedGroups = new Map<string, typeof allEntities>();
        for (const entity of allEntities) {
          const key = `${normalizeEntityName(entity.name)}::${entity.entity_type.toLowerCase()}`;
          let group = normalizedGroups.get(key);
          if (!group) {
            group = [];
            normalizedGroups.set(key, group);
          }
          group.push(entity);
        }
        const duplicateGroups = Array.from(normalizedGroups.values()).filter(g => g.length > 1);

        // Count orphans (entities with no relations)
        const orphanCount = raw.prepare(`
          SELECT COUNT(*) as cnt FROM knowledge_entities e
          WHERE e.valid_to IS NULL
            AND e.id NOT IN (SELECT source_id FROM knowledge_relations WHERE valid_to IS NULL)
            AND e.id NOT IN (SELECT target_id FROM knowledge_relations WHERE valid_to IS NULL)
        `).get() as { cnt: number };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: 'audit',
              total_entities: allEntities.length,
              noise_entities: noiseEntities.length,
              noise_sample: noiseEntities.slice(0, 20).map(e => ({ id: e.id, name: e.name, type: e.entity_type })),
              duplicate_groups: duplicateGroups.length,
              duplicate_sample: duplicateGroups.slice(0, 10).map(g => g.map(e => ({ id: e.id, name: e.name, type: e.entity_type }))),
              orphan_entities: orphanCount.cnt,
            }, null, 2),
          }],
        };
      }

      if (mode === 'remove_noise') {
        const allEntities = kg.getEntities(10000);
        const noiseEntities = allEntities.filter(e => isNoiseEntity(e.name, e.entity_type));

        let removed = 0;
        const removeTx = raw.transaction(() => {
          for (const entity of noiseEntities) {
            // Retire relations first
            const rels = [
              ...kg.getRelationsFrom(entity.id),
              ...kg.getRelationsTo(entity.id),
            ];
            for (const rel of rels) {
              kg.retireRelation(rel.id);
            }
            kg.retireEntity(entity.id);
            removed++;
          }
        });
        removeTx();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: 'remove_noise',
              entities_retired: removed,
            }, null, 2),
          }],
        };
      }

      if (mode === 'dedup') {
        const allEntities = kg.getEntities(10000);
        const normalizedGroups = new Map<string, typeof allEntities>();
        for (const entity of allEntities) {
          const key = `${normalizeEntityName(entity.name)}::${entity.entity_type.toLowerCase()}`;
          let group = normalizedGroups.get(key);
          if (!group) {
            group = [];
            normalizedGroups.set(key, group);
          }
          group.push(entity);
        }

        let merged = 0;
        const dedupTx = raw.transaction(() => {
          for (const group of normalizedGroups.values()) {
            if (group.length <= 1) continue;

            // Keep the entity with the most relations (or the oldest)
            const sorted = group.sort((a, b) => {
              const aRels = kg.getRelationsFrom(a.id).length + kg.getRelationsTo(a.id).length;
              const bRels = kg.getRelationsFrom(b.id).length + kg.getRelationsTo(b.id).length;
              return bRels - aRels;
            });
            const keep = sorted[0];
            const retire = sorted.slice(1);

            for (const dup of retire) {
              // Re-point relations from dup to keep
              for (const rel of kg.getRelationsFrom(dup.id)) {
                try {
                  kg.createRelation(keep.id, rel.target_id, rel.relation_type, rel.confidence);
                } catch { /* may already exist */ }
                kg.retireRelation(rel.id);
              }
              for (const rel of kg.getRelationsTo(dup.id)) {
                try {
                  kg.createRelation(rel.source_id, keep.id, rel.relation_type, rel.confidence);
                } catch { /* may already exist */ }
                kg.retireRelation(rel.id);
              }

              // Merge properties
              try {
                const keepProps = JSON.parse(keep.properties || '{}');
                const dupProps = JSON.parse(dup.properties || '{}');
                const mergedProps = { ...dupProps, ...keepProps };
                kg.updateEntity(keep.id, { properties: mergedProps });
              } catch { /* ok */ }

              kg.retireEntity(dup.id);
              merged++;
            }
          }
        });
        dedupTx();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: 'dedup',
              entities_merged: merged,
            }, null, 2),
          }],
        };
      }

      if (mode === 'retire_orphans') {
        const orphans = raw.prepare(`
          SELECT id FROM knowledge_entities e
          WHERE e.valid_to IS NULL
            AND e.id NOT IN (SELECT source_id FROM knowledge_relations WHERE valid_to IS NULL)
            AND e.id NOT IN (SELECT target_id FROM knowledge_relations WHERE valid_to IS NULL)
        `).all() as { id: number }[];

        let retired = 0;
        const retireTx = raw.transaction(() => {
          for (const { id } of orphans) {
            kg.retireEntity(id);
            retired++;
          }
        });
        retireTx();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: 'retire_orphans',
              entities_retired: retired,
            }, null, 2),
          }],
        };
      }

      if (mode === 'wipe_all') {
        const entityCount = kg.getEntityCount();

        const wipeTx = raw.transaction(() => {
          raw.prepare("UPDATE knowledge_relations SET valid_to = datetime('now') WHERE valid_to IS NULL").run();
          raw.prepare("UPDATE knowledge_entities SET valid_to = datetime('now') WHERE valid_to IS NULL").run();
        });
        wipeTx();

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              action: 'wipe_all',
              entities_retired: entityCount,
              warning: 'ALL entities and relations soft-deleted. This cannot be undone.',
            }, null, 2),
          }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: `Unknown mode: ${mode}` }],
        isError: true,
      };
    },
  );
}
