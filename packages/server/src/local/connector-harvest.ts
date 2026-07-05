/**
 * Connector auto-fetch: pull fresh data from connectors into the personal mind
 * (docs/analysis/openhuman-adoption-2026-06-28.md §3.C — OpenHuman's auto-fetch).
 *
 * The connector SDK has no generic data-pull (`execute(action,…)` only, untyped
 * `data`), and most read actions need required params — so a blind "call every
 * action" sweep would be unsafe to run autonomously. Instead this is OPT-IN: a
 * connector exposes a single SAFE, read-only `harvestAction` (no required
 * params) and only those are harvested. Results are written as RAW frames (no
 * LLM extraction → zero proxy cost), mirroring the existing `harvest_sync`
 * writer; the substrate's normal embedding/KG pipeline does the rest.
 *
 * Side effects (frame writes, hash persistence) are injected so the orchestration
 * is unit-testable without a DB or filesystem.
 */

import { createHash } from 'node:crypto';
import { scanForInjection, type ConnectorResult } from '@waggle/agent';

export interface ConnectorHarvestItem {
  title: string;
  content: string;
}

const DEFAULT_MAX_ITEMS = 50;
const MAX_CONTENT_CHARS = 4000;
const TITLE_KEYS = ['title', 'name', 'subject', 'summary', 'displayName', 'full_name', 'id'] as const;

function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function pickTitle(rec: Record<string, unknown>, idx: number): string {
  for (const k of TITLE_KEYS) {
    const v = rec[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120);
    if (typeof v === 'number') return String(v);
  }
  return `Item ${idx + 1}`;
}

/**
 * Generic, lossy-but-safe mapping of a connector action result into harvest
 * items. Handles an array, a single `{ key: array }` wrapper, a lone object, or
 * a scalar. Never throws; returns [] when there is nothing textual to keep.
 */
export function connectorDataToItems(data: unknown, opts: { maxItems?: number } = {}): ConnectorHarvestItem[] {
  const maxItems = opts.maxItems ?? DEFAULT_MAX_ITEMS;

  let arr: unknown[] | null = null;
  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === 'object') {
    // Only unwrap when there is exactly ONE NON-EMPTY array field — picking the
    // first (or an empty one) would silently drop data.
    const arrays = Object.values(data as Record<string, unknown>).filter(
      (v): v is unknown[] => Array.isArray(v) && v.length > 0,
    );
    if (arrays.length === 1) arr = arrays[0];
  }

  if (arr) {
    const items: ConnectorHarvestItem[] = [];
    for (let i = 0; i < arr.length && items.length < maxItems; i++) {
      const el = arr[i];
      if (el && typeof el === 'object' && !Array.isArray(el)) {
        items.push({ title: pickTitle(el as Record<string, unknown>, i), content: toText(el).slice(0, MAX_CONTENT_CHARS) });
      } else {
        const text = toText(el).trim();
        if (text) items.push({ title: `Item ${i + 1}`, content: text.slice(0, MAX_CONTENT_CHARS) });
      }
    }
    return items;
  }

  const text = toText(data).trim();
  if (!text) return [];
  const title = data && typeof data === 'object' ? pickTitle(data as Record<string, unknown>, 0) : 'Result';
  return [{ title, content: text.slice(0, MAX_CONTENT_CHARS) }];
}

/** Minimal structural view of a connector the fetch loop needs (a WaggleConnector). */
export interface ConnectorLike {
  readonly id: string;
  readonly name: string;
  readonly harvestAction?: { action: string; params?: Record<string, unknown> };
  /** Declared actions (carry riskLevel) — used to refuse a non-read-only harvest. */
  readonly actions?: ReadonlyArray<{ name: string; riskLevel: 'low' | 'medium' | 'high' }>;
  execute(action: string, params: Record<string, unknown>): Promise<ConnectorResult>;
}

/** Persisted state: per-connector content hashes + the last REAL sweep time. */
export interface ConnectorHarvestState {
  /** ISO timestamp of the last actual connector sweep — drives the frequency floor. */
  lastFetchedAt?: string;
  /** Per-connector last-content-hash (skip-unchanged). */
  hashes: Record<string, string>;
}

export interface RunConnectorFetchDeps {
  connectors: ReadonlyArray<ConnectorLike>;
  /** Persist one harvested item as a memory frame. */
  writeFrame: (content: string) => void;
  loadState: () => ConnectorHarvestState;
  saveState: (state: ConnectorHarvestState) => void;
  /** Minimum gap between real sweeps (frequency floor); omit to disable. */
  minIntervalMs?: number;
  /** Injectable clock (ms since epoch) for deterministic tests. */
  now?: () => number;
  log?: (msg: string) => void;
  maxItemsPerConnector?: number;
}

export interface ConnectorFetchResult {
  connectorsFetched: number;
  framesWritten: number;
  skippedUnchanged: number;
  skippedNoAction: number;
  /** Frames dropped because their content tripped the injection scanner. */
  skippedUnsafe: number;
  /** True when the whole sweep was suppressed by the frequency floor. */
  skippedByFloor: boolean;
  errors: string[];
}

function hashItems(items: ConnectorHarvestItem[]): string {
  return createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0, 32);
}

/**
 * Walk opted-in connectors, harvest each one's `harvestAction`, and write new
 * frames. Refuses any action not declared low-risk; injection-scans every frame
 * before it lands in memory; skips connectors whose result is unchanged; and is
 * frequency-floored on the last REAL sweep (NOT on cron ticks). Each connector
 * failure is isolated — one bad connector never sinks the sweep.
 */
export async function runConnectorFetch(deps: RunConnectorFetchDeps): Promise<ConnectorFetchResult> {
  const res: ConnectorFetchResult = {
    connectorsFetched: 0, framesWritten: 0, skippedUnchanged: 0, skippedNoAction: 0,
    skippedUnsafe: 0, skippedByFloor: false, errors: [],
  };
  const nowMs = deps.now?.() ?? Date.now();
  const state = deps.loadState();
  const hashes = { ...state.hashes };

  // Frequency floor — keyed on the last ACTUAL sweep (persisted here), never on
  // schedule.last_run_at (which the scheduler advances on every tick, skip or not).
  if (deps.minIntervalMs && state.lastFetchedAt) {
    const since = nowMs - Date.parse(state.lastFetchedAt);
    if (Number.isFinite(since) && since < deps.minIntervalMs) {
      res.skippedByFloor = true;
      deps.log?.(`within ${Math.round(deps.minIntervalMs / 3.6e6)}h floor — skipping`);
      return res;
    }
  }

  let attempted = 0;
  for (const c of deps.connectors) {
    if (!c.harvestAction) { res.skippedNoAction++; continue; }
    // Refuse to auto-run anything but a DECLARED LOW-RISK action (defence against
    // a connector author wiring a write/side-effect action as their harvest).
    if (c.actions) {
      const meta = c.actions.find((a) => a.name === c.harvestAction!.action);
      if (!meta || meta.riskLevel !== 'low') {
        res.errors.push(`${c.id}: harvestAction '${c.harvestAction.action}' is not a declared low-risk action — refusing`);
        continue;
      }
    }
    attempted++;
    try {
      const out = await c.execute(c.harvestAction.action, c.harvestAction.params ?? {});
      if (!out.success) { res.errors.push(`${c.id}: ${out.error ?? 'action failed'}`); continue; }

      const items = connectorDataToItems(out.data, { maxItems: deps.maxItemsPerConnector });
      if (items.length === 0) { deps.log?.(`${c.id}: nothing to harvest`); continue; }

      const hash = hashItems(items);
      if (hashes[c.id] === hash) { res.skippedUnchanged++; continue; }

      let wrote = 0;
      for (const item of items) {
        const content = `[Harvest:connector:${c.id}] ${item.title}\n\n${item.content}`;
        // §7: external connector data is injection-scanned before it lands in
        // memory (it is recalled into model context in later sessions).
        if (!scanForInjection(content, 'tool_output').safe) { res.skippedUnsafe++; continue; }
        deps.writeFrame(content);
        wrote++;
      }
      res.framesWritten += wrote;
      hashes[c.id] = hash;
      if (wrote > 0) res.connectorsFetched++;
      deps.log?.(`${c.id}: ${wrote}/${items.length} item(s) harvested`);
    } catch (err) {
      res.errors.push(`${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Stamp the sweep time only if we actually hit ≥1 connector API, so an all-
  // skipped tick (no opted-in connectors) doesn't reset the floor.
  deps.saveState({
    hashes,
    lastFetchedAt: attempted > 0 ? new Date(nowMs).toISOString() : state.lastFetchedAt,
  });
  return res;
}
