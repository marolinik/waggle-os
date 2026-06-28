/**
 * PRO auto-fetch: pull fresh data from connectors into the personal mind
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
    const arrEntry = Object.values(data as Record<string, unknown>).find((v) => Array.isArray(v));
    if (arrEntry) arr = arrEntry as unknown[];
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

/** Minimal structural view of a connector the fetch loop needs. */
export interface ConnectorLike {
  id: string;
  name: string;
  harvestAction?: { action: string; params?: Record<string, unknown> };
  execute(action: string, params: Record<string, unknown>): Promise<{ success: boolean; data?: unknown; error?: string }>;
}

export interface RunConnectorFetchDeps {
  connectors: ReadonlyArray<ConnectorLike>;
  /** Persist one harvested item as a memory frame. */
  writeFrame: (content: string) => void;
  /** Per-connector last-content-hash store (skip-unchanged). */
  loadHashes: () => Record<string, string>;
  saveHashes: (hashes: Record<string, string>) => void;
  log?: (msg: string) => void;
  maxItemsPerConnector?: number;
}

export interface ConnectorFetchResult {
  connectorsFetched: number;
  framesWritten: number;
  skippedUnchanged: number;
  skippedNoAction: number;
  errors: string[];
}

function hashItems(items: ConnectorHarvestItem[]): string {
  return createHash('sha256').update(JSON.stringify(items)).digest('hex').slice(0, 32);
}

/**
 * Walk opted-in connectors, harvest each one's `harvestAction`, and write new
 * frames. Skips connectors whose result is byte-identical to last run (cheap
 * dedup). Each connector failure is isolated — one bad connector never sinks
 * the sweep.
 */
export async function runConnectorFetch(deps: RunConnectorFetchDeps): Promise<ConnectorFetchResult> {
  const res: ConnectorFetchResult = {
    connectorsFetched: 0, framesWritten: 0, skippedUnchanged: 0, skippedNoAction: 0, errors: [],
  };
  const hashes = { ...deps.loadHashes() };

  for (const c of deps.connectors) {
    if (!c.harvestAction) { res.skippedNoAction++; continue; }
    try {
      const out = await c.execute(c.harvestAction.action, c.harvestAction.params ?? {});
      if (!out.success) { res.errors.push(`${c.id}: ${out.error ?? 'action failed'}`); continue; }

      const items = connectorDataToItems(out.data, { maxItems: deps.maxItemsPerConnector });
      if (items.length === 0) { deps.log?.(`${c.id}: nothing to harvest`); continue; }

      const hash = hashItems(items);
      if (hashes[c.id] === hash) { res.skippedUnchanged++; continue; }

      for (const item of items) {
        deps.writeFrame(`[Harvest:connector:${c.id}] ${item.title}\n\n${item.content}`);
        res.framesWritten++;
      }
      hashes[c.id] = hash;
      res.connectorsFetched++;
      deps.log?.(`${c.id}: ${items.length} item(s) harvested`);
    } catch (err) {
      res.errors.push(`${c.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  deps.saveHashes(hashes);
  return res;
}
