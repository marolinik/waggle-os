/**
 * Harvest tools — harvest_import + harvest_sources.
 * Import conversations from ChatGPT, Claude, Gemini, and other AI systems.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'node:fs';
import {
  evaluateExternalMemoryIngress,
  projectExternalMemoryContent,
  resolveRelativeDate,
  HARVEST_FRAME_CONTENT_CAP,
  MAX_TURNS_PER_ITEM,
  writeRawTurnFrames,
  RawArchive,
  SuppressionStore,
  readArchiveUids,
  withArchiveUid,
} from '@waggle/hive-mind-core';
import {
  getFrameStore,
  getSessions,
  getSearch,
  getKnowledgeGraph,
  getHarvestSourceStore,
  getPersonalDb,
  getAdapter,
} from '../core/setup.js';
import { resolveImportFilePath } from './ingest.js';

export function registerHarvestTools(server: McpServer): void {

  // ── harvest_import ──────────────────────────────────────────────
  server.tool(
    'harvest_import',
    'Import conversation history from external AI systems (ChatGPT, Claude, Gemini, etc.). Parses the export data and saves extracted memories to the personal mind.',
    {
      source: z.enum([
        'chatgpt', 'claude', 'claude-code', 'gemini', 'universal',
      ]).describe('Source AI system'),
      data: z.string().optional()
        .describe('JSON string of the export data. Provide this OR file_path, not both'),
      file_path: z.string().optional()
        .describe('Relative path beneath HIVE_MIND_MCP_IMPORT_ROOT. Provide this OR data, not both'),
    },
    async ({ source, data, file_path }) => {
      // Keep raw JSON and local path inputs separate. Local files are resolved
      // only beneath the explicit MCP import root.
      if ((data === undefined) === (file_path === undefined)) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: provide either "data" (JSON string) or "file_path" (relative import path), not both',
          }],
          isError: true,
        };
      }

      // Parse input
      let parsed: unknown;
      try {
        if (file_path !== undefined) {
          const safePath = resolveImportFilePath(file_path);
          const raw = fs.readFileSync(safePath, 'utf-8');
          parsed = JSON.parse(raw);
        } else {
          parsed = JSON.parse(data!);
        }
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error parsing input: ${err instanceof Error ? err.message : 'invalid JSON'}`,
          }],
          isError: true,
        };
      }

      // Get the appropriate adapter
      const adapter = getAdapter(source);
      const items = adapter.parse(parsed);

      if (items.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No conversations found in ${source} export data.`,
          }],
        };
      }

      const preparedItems = items.map((item) => {
        const storedContent = item.content.slice(0, HARVEST_FRAME_CONTENT_CAP);
        const content = item.title
          ? `[${item.source}] ${item.title}: ${storedContent}`
          : `[${item.source}] ${storedContent}`;
        const ingressContent = projectExternalMemoryContent({
          content: item.content,
          messages: item.messages,
          parseMethod: item.metadata?.parseMethod,
          maxChars: HARVEST_FRAME_CONTENT_CAP,
        });
        const ingressFrameContent = item.title
          ? `[${item.source}] ${item.title}: ${ingressContent}`
          : `[${item.source}] ${ingressContent}`;
        const archiveIngressContent = projectExternalMemoryContent({
          content: item.content,
          messages: item.messages,
          parseMethod: item.metadata?.parseMethod,
        });
        const entityProjections: Array<{ type: string; name: string; recalled: string }> = [];
        if (Array.isArray(item.metadata?.entities)) {
          for (const entity of item.metadata.entities) {
            if (!entity || typeof entity !== 'object') continue;
            const { name, type } = entity as Record<string, unknown>;
            if (typeof name !== 'string') continue;
            const storedType = typeof type === 'string' && type ? type : 'concept';
            entityProjections.push({
              type: storedType,
              name,
              recalled: `${storedType}: ${name}`,
            });
          }
        }
        const rawTurnProjections: Array<{ content: string; timestamp?: string }> = [];
        if (process.env.WAGGLE_RAWDETAIL !== '0' && Array.isArray(item.messages)) {
          for (const message of item.messages) {
            if (message.role !== 'user' && message.role !== 'assistant') continue;
            const rawTurnContent = (message.text ?? '').trim();
            if (!rawTurnContent) continue;
            if (rawTurnProjections.length >= MAX_TURNS_PER_ITEM) break;
            rawTurnProjections.push({
              content: rawTurnContent.slice(0, HARVEST_FRAME_CONTENT_CAP),
              timestamp: message.timestamp,
            });
          }
        }
        return {
          item,
          content,
          ingressFrameContent,
          archiveIngressContent,
          entityProjections,
          rawTurnProjections,
        };
      });
      const hasUnsafeContent = (file_path !== undefined
        && evaluateExternalMemoryIngress({ content: file_path }).action !== 'allow')
        || preparedItems.some(({
          item,
          ingressFrameContent,
          archiveIngressContent,
          entityProjections,
          rawTurnProjections,
        }) => {
          if (evaluateExternalMemoryIngress({ content: ingressFrameContent }).action !== 'allow'
            || evaluateExternalMemoryIngress({
              title: item.title,
              content: archiveIngressContent,
            }).action !== 'allow'
            || [item.source, item.id, item.timestamp].some((value) =>
              evaluateExternalMemoryIngress({ content: value }).action !== 'allow')) {
            return true;
          }
          if (entityProjections.some(({ type, name, recalled }) =>
            evaluateExternalMemoryIngress({ content: recalled }).action !== 'allow'
            || evaluateExternalMemoryIngress({ title: type, content: name }).action !== 'allow')) {
            return true;
          }
          return rawTurnProjections.some(({ content: rawTurnContent, timestamp }) =>
            evaluateExternalMemoryIngress({ content: rawTurnContent }).action !== 'allow'
            || (timestamp !== undefined
              && evaluateExternalMemoryIngress({ content: timestamp }).action !== 'allow'));
        });
      if (hasUnsafeContent) {
        return {
          content: [{
            type: 'text' as const,
            text: 'Error: imported content was blocked by the memory safety policy.',
          }],
          isError: true,
        };
      }

      // Save each item as an I-Frame in the personal mind
      const frameStore = getFrameStore();
      const sessions = getSessions();
      const search = getSearch();
      const kg = getKnowledgeGraph();
      const harvestStore = getHarvestSourceStore();

      // Ensure a persistent harvest session
      const session = sessions.ensure(
        `harvest:${source}`,
        undefined,
        `Harvest import from ${source}`,
      );

      let framesCreated = 0;
      let duplicatesSkipped = 0;
      let entitiesCreated = 0;
      let rawTurnsWritten = 0;

      // Record max frame id before the batch. createIFrame dedups by content,
      // so a "not new" frame returns an older id. id-based detection is
      // format-agnostic; comparing timestamps here would trip on the mismatch
      // between JS's ISO format and SQLite's space-separated datetime('now').
      const rawDb = getPersonalDb().getDatabase();
      const maxBefore =
        (rawDb.prepare('SELECT COALESCE(MAX(id), 0) AS m FROM memory_frames').get() as { m: number }).m;

      // #7: verbatim provenance archive — full immutable source per item, linked
      // from the summary frame via metadata.archiveUid. Append-only; idempotent.
      const rawArchive = new RawArchive(getPersonalDb());
      // #7 sticky erasure: skip re-importing an Art.17-erased subject. One `continue`
      // short-circuits the whole per-item fan-out (archive + summary + raw-turns + KG).
      const suppression = new SuppressionStore(getPersonalDb());
      let suppressedSkipped = 0;

      for (const { item, content } of preparedItems) {
        if (suppression.isSuppressed(item.source, item.id)) { suppressedSkipped++; continue; }

        // Write-time temporal anchoring. The frame's created_at should reflect WHEN the
        // event happened, not the ingest wall-clock. Start from the source timestamp; if
        // the content carries a relative cue ("yesterday", "last week"), resolve it
        // against that source date to the true event date. Benchmark-validated: this is
        // the production counterpart of the LoCoMo Phase-4 win (temporal parity vs Memori
        // — see benchmarks/results/memori-phase22-RESULT.md). createIFrame validates the
        // ISO string and falls back to datetime('now') if it's unusable.
        const resolved = resolveRelativeDate(content, item.timestamp);
        const createdAt = resolved ? `${resolved.iso}T00:00:00Z` : (item.timestamp || undefined);

        // #7: archive the FULL untruncated verbatim source BEFORE the frame's
        // capped preview is built. Best-effort — a failure must not abort the
        // item (degraded provenance beats a lost import); never silent.
        let archiveUid: string | undefined;
        try {
          archiveUid = rawArchive.append({
            source: item.source,
            sourceRef: item.id,
            title: item.title,
            content: item.content,
            sourceTimestamp: item.timestamp,
          }).archiveUid;
        } catch (err) {
          console.error(
            `[harvest] raw_archive append failed for ${item.source}/${item.id} — frame persists without provenance link:`,
            err instanceof Error ? err.message : 'unknown',
          );
        }

        // createIFrame handles dedup internally — returns existing frame if content matches
        const frame = frameStore.createIFrame(
          session.gop_id,
          content,
          'normal',
          'import',
          createdAt,
        );

        // #7: stamp provenance metadata. On a fresh frame (default '{}' metadata)
        // record sourceId + the archive link; on an already-stamped/dedup'd frame,
        // accumulate the archiveUid into the canonical archiveUids[] without clobbering
        // existing metadata.
        // Multi-source accumulation (resolved): two DIFFERENT sources with byte-identical
        // content dedup to ONE frame, and that frame now links to EVERY source's archive
        // row via metadata.archiveUids[] (withArchiveUid migrates any legacy scalar and
        // set-unions). reconstructSource resolves them all; no frame→source link is lost.
        // (Server harvest route shares this.)
        if (!frame.metadata || frame.metadata === '{}') {
          frameStore.setMetadata(frame.id, JSON.stringify({
            sourceId: item.id,
            ...(archiveUid ? { archiveUids: [archiveUid] } : {}),
          }));
        } else if (archiveUid) {
          try {
            const meta = JSON.parse(frame.metadata) as Record<string, unknown>;
            // Only write when the uid set actually grows (avoids needless setMetadata
            // churn on re-imports). withArchiveUid migrates any legacy scalar → array.
            if (!readArchiveUids(meta).includes(archiveUid)) {
              frameStore.setMetadata(frame.id, JSON.stringify(withArchiveUid(meta, archiveUid)));
            }
          } catch { /* malformed metadata — leave as-is */ }
        }

        // Frames created during this batch have id > maxBefore.
        // Dedup hits return the original frame whose id is older.
        const isNew = frame.id > maxBefore;

        if (isNew) {
          framesCreated++;

          // Index for semantic search (non-fatal)
          try {
            await search.indexFrame(frame.id, content);
          } catch { /* vector indexing failure is non-fatal */ }

          // Extract basic entities from metadata if present. Route through
          // importEntitiesForFrame so each entity is LINKED to its frame — the
          // provenance anchor GDPR Art.17 erasure's orphan sweep needs (an
          // unlinked entity name, often PII, would otherwise survive erasure).
          if (item.metadata?.entities && Array.isArray(item.metadata.entities)) {
            entitiesCreated += kg.importEntitiesForFrame(
              frame.id,
              item.metadata.entities as { name: string; type: string }[],
              { source: item.source, importedFrom: item.title },
            );
          }
        } else {
          duplicatesSkipped++;
        }

        // W4.6: per-turn verbatim dialogue storage — source material for the
        // RAWDETAIL recall lane. Items without messages are a no-op; dedup
        // inside makes re-imports idempotent. Kill switch: WAGGLE_RAWDETAIL=0.
        if (process.env.WAGGLE_RAWDETAIL !== '0') {
          rawTurnsWritten += writeRawTurnFrames(frameStore, session.gop_id, item).written;
        }
      }

      // Record the sync in harvest source store
      harvestStore.upsert(
        source as Parameters<typeof harvestStore.upsert>[0],
        adapter.displayName,
        file_path ?? undefined,
      );
      harvestStore.recordSync(
        source as Parameters<typeof harvestStore.recordSync>[0],
        items.length,
        framesCreated,
      );

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            source,
            items_found: items.length,
            frames_created: framesCreated,
            duplicates_skipped: duplicatesSkipped,
            suppressed_skipped: suppressedSkipped,
            entities_created: entitiesCreated,
            raw_turns_written: rawTurnsWritten,
          }, null, 2),
        }],
      };
    },
  );

  // ── harvest_sources ─────────────────────────────────────────────
  server.tool(
    'harvest_sources',
    'List all registered harvest sources and their sync status.',
    {},
    async () => {
      const store = getHarvestSourceStore();
      const sources = store.getAll();

      if (sources.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No harvest sources registered yet. Use harvest_import to import conversation data.',
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(sources.map(s => ({
            source: s.source,
            display_name: s.displayName,
            last_synced: s.lastSyncedAt,
            items_imported: s.itemsImported,
            frames_created: s.framesCreated,
            auto_sync: s.autoSync,
          })), null, 2),
        }],
      };
    },
  );
}
