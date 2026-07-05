/**
 * `hive-mind-cli maintenance` — batch maintenance ops for a nightly
 * cron. Composes FrameStore.compact + optional wipe-imports + index
 * reconciliation + KG cognify + wiki compile behind a single flag surface.
 */

import { spawn } from 'node:child_process';
import { openPersonalMind, type CliEnv } from '../setup.js';
import {
  reconcileIndexes,
  HybridSearch,
  collectObservations,
  detectSupersessionChains,
  detectEntityGroups,
  applyConsolidation,
  type ConsolidationLlm,
} from '@waggle/hive-mind-core';
import { runCognify } from './cognify.js';
import { runCompileWiki } from './compile-wiki.js';

export interface MaintenanceOptions {
  compact?: boolean;
  wipeImports?: boolean;
  reconcile?: boolean;
  /**
   * Consolidate the dormant P/B frame types: LLM-detect supersession chains
   * (deprecate stale I-frames + emit a clean-valued P-frame) and enumerable
   * entity groups (emit a B-frame referencing every member), then vec-index the
   * new frames. Opt-in — requires an LLM (see `consolidateModel`).
   */
  consolidate?: boolean;
  /**
   * LLM model for --consolidate. An OpenAI-style id (e.g. `gpt-4o-mini`, with
   * OPENAI_API_KEY set) routes to the OpenAI chat API — the executor the
   * benchmark validated with. Anything else (or omitted) uses the zero-key
   * `claude -p` subprocess.
   */
  consolidateModel?: string;
  /** Max observations fed to the consolidation LLM (default 400). */
  consolidateLimit?: number;
  cognify?: boolean;
  wiki?: boolean;
  maxTempAgeDays?: number;
  maxDeprecatedAgeDays?: number;
  env?: CliEnv;
}

export interface MaintenanceResult {
  compact?: {
    temporaryPruned: number;
    deprecatedPruned: number;
    pframesMerged: number;
  };
  wipeImports?: {
    framesDeleted: number;
  };
  reconcile?: {
    ftsFixed: number;
    vecFixed: number;
  };
  consolidate?: {
    chains: number;
    groups: number;
    pframes: number;
    bframes: number;
    deprecated: number;
  };
  cognify?: {
    framesScanned: number;
    entitiesCreated: number;
    entitiesUpdated: number;
  };
  wiki?: {
    provider: string;
    pagesCreated: number;
    pagesUpdated: number;
    pagesUnchanged: number;
  };
  durationMs: number;
}

// ── P/B consolidation executor ─────────────────────────────────────────────
// The core supersede.ts module is provider-agnostic (pure) — the LLM transport
// lives here at the call site. Default: zero-key `claude -p` subprocess. An
// OpenAI-style model id + OPENAI_API_KEY routes to the OpenAI chat API — the
// executor the benchmark validated with.

/**
 * Spawn `claude -p --output-format=text` and resolve its stdout. Zero API key
 * (uses the operator's Claude Code subscription), HIVE_MIND_NO_SYNTH=1 so the
 * child's Stop hook doesn't enqueue a successor synth task.
 */
function spawnClaudeText(prompt: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p', '--output-format=text'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // claude on Windows is a .cmd shim; spawn needs shell:true to find it.
      shell: process.platform === 'win32',
      env: { ...process.env, HIVE_MIND_NO_SYNTH: '1' },
    });
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

/**
 * OpenAI chat completion with JSON-object response format — the executor the
 * consolidation benchmark validated with (temperature 0, deterministic). Local
 * fetch helper (NOT in core); requires OPENAI_API_KEY.
 */
async function callOpenAIChat(model: string, system: string, user: string, timeoutMs = 120_000): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('consolidation --consolidate-model requires OPENAI_API_KEY');
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

/**
 * Build the LLM callback injected into the consolidation passes. An OpenAI-style
 * model id routes to the OpenAI API; anything else falls back to the zero-key
 * `claude -p` subprocess (system + user folded into one prompt).
 */
function buildConsolidationLlm(model?: string): ConsolidationLlm {
  if (model && /^(gpt-|o[0-9])/.test(model)) {
    return (system, user) => callOpenAIChat(model, system, user);
  }
  return (system, user) => spawnClaudeText(`${system}\n\n${user}`);
}

/**
 * Human-readable text to vec-index a B-frame under (its stored content is JSON,
 * which embeds poorly). Mirrors the benchmark's `<desc>: bridge of N items`.
 */
function bridgeIndexText(frame: { content: string }): string {
  try {
    const parsed = JSON.parse(frame.content) as { description?: string; references?: unknown[] };
    const n = Array.isArray(parsed.references) ? parsed.references.length : 0;
    return `${parsed.description ?? 'group'}: bridge of ${n} items`;
  } catch {
    return frame.content;
  }
}

/**
 * Run the P/B consolidation pass on the personal mind: gather I-frame
 * observations, LLM-detect supersession chains + entity groups, apply them
 * (deprecate stale + emit P/B frames), then vec-index the new frames —
 * createPFrame/createBFrame index FTS only, so this step is what makes them
 * semantically recallable.
 *
 * New P/B frames are anchored to the gop of the most-recent observation (a
 * guaranteed-valid session gop_id; the "current value" belongs to the latest
 * session), while their base/references still point at the original source
 * frames — which may be cross-gop.
 */
async function runConsolidate(
  env: CliEnv,
  options: MaintenanceOptions,
): Promise<NonNullable<MaintenanceResult['consolidate']>> {
  const empty = { chains: 0, groups: 0, pframes: 0, bframes: 0, deprecated: 0 };
  const observations = collectObservations(env.db, { limit: options.consolidateLimit ?? 400 });
  if (observations.length < 2) return empty;

  // Anchor gop = newest non-deprecated I-frame's session.
  const anchor = env.db
    .getDatabase()
    .prepare(
      "SELECT gop_id FROM memory_frames WHERE frame_type = 'I' AND importance != 'deprecated' ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .get() as { gop_id: string } | undefined;
  if (!anchor) return empty;

  const llm = buildConsolidationLlm(options.consolidateModel);
  const [chains, groups] = await Promise.all([
    detectSupersessionChains(observations, llm),
    detectEntityGroups(observations, llm),
  ]);
  const { pframes, bframes, deprecated } = applyConsolidation(env.frames, chains, groups, anchor.gop_id);

  const toIndex = [
    ...pframes.map((f) => ({ id: f.id, content: f.content })),
    ...bframes.map((f) => ({ id: f.id, content: bridgeIndexText(f) })),
  ];
  if (toIndex.length > 0) {
    try {
      const embedder = await env.getEmbedder();
      await new HybridSearch(env.db, embedder).indexFramesBatch(toIndex);
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

export async function runMaintenance(options: MaintenanceOptions): Promise<MaintenanceResult> {
  const env = options.env ?? openPersonalMind();
  const close = options.env ? () => { /* caller owns */ } : env.close;
  const start = Date.now();
  const result: MaintenanceResult = { durationMs: 0 };

  try {
    if (options.compact) {
      const r = env.frames.compact(
        options.maxTempAgeDays ?? 30,
        options.maxDeprecatedAgeDays ?? 90,
      );
      result.compact = {
        temporaryPruned: r.temporaryPruned,
        deprecatedPruned: r.deprecatedPruned,
        pframesMerged: r.pframesMerged,
      };
    }

    if (options.wipeImports) {
      const raw = env.db.getDatabase();
      const countRow = raw
        .prepare("SELECT COUNT(*) as cnt FROM memory_frames WHERE source = 'import'")
        .get() as { cnt: number };

      if (countRow.cnt > 0) {
        const frameIds = raw
          .prepare("SELECT id FROM memory_frames WHERE source = 'import'")
          .all() as { id: number }[];

        const tx = raw.transaction(() => {
          for (const { id } of frameIds) {
            raw.prepare('DELETE FROM memory_frames_fts WHERE rowid = ?').run(id);
            try {
              raw.prepare('DELETE FROM memory_frames_vec WHERE rowid = ?').run(id);
            } catch { /* vec optional */ }
          }
          raw.prepare("DELETE FROM memory_frames WHERE source = 'import'").run();
        });
        tx();
      }

      result.wipeImports = { framesDeleted: countRow.cnt };
    }

    if (options.reconcile) {
      const embedder = await env.getEmbedder();
      const r = await reconcileIndexes(env.db, embedder);
      result.reconcile = { ftsFixed: r.ftsFixed, vecFixed: r.vecFixed };
    }

    if (options.consolidate) {
      result.consolidate = await runConsolidate(env, options);
    }

    if (options.cognify) {
      const r = await runCognify({ env });
      result.cognify = {
        framesScanned: r.framesScanned,
        entitiesCreated: r.entitiesCreated,
        entitiesUpdated: r.entitiesUpdated,
      };
    }

    if (options.wiki) {
      const r = await runCompileWiki({ env });
      result.wiki = {
        provider: r.provider,
        pagesCreated: r.pagesCreated,
        pagesUpdated: r.pagesUpdated,
        pagesUnchanged: r.pagesUnchanged,
      };
    }

    result.durationMs = Date.now() - start;
    return result;
  } finally {
    close();
  }
}
