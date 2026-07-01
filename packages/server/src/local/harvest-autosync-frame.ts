/**
 * harvest-autosync-frame.ts — shared writer for auto-synced harvest summary frames.
 *
 * The 30-min in-process auto-sync (index.ts runHarvestAutoSync) and the cron
 * `harvest_sync` both scan filesystem sources (currently claude-code) and persist
 * a lighter summary frame than the manual /api/harvest route. They previously
 * wrote the frame with NO metadata, so a subject-level GDPR Art.17 erasure
 * (MindErasure.eraseBySourceRef) could not reach them: step 2a keys on archiveUids
 * (absent here), 2b on the raw-turn conversation prefix (these paths write no
 * raw-turns), and 2c on metadata.sourceId (absent) — so the distilled PII stayed
 * recall-able after a DSAR. This helper stamps the subject key so 2c reaches it,
 * matching the manual path (routes/harvest.ts) and the harvest_import MCP tool;
 * routing both call sites through it keeps that contract from drifting between them.
 */

import { type FrameStore, type MemoryFrame, type UniversalImportItem } from '@waggle/core';

/** Preview cap for auto-synced summaries — intentionally lighter than the manual
 *  path's HARVEST_PREVIEW_CAP_CHARS (these are unattended background scans). */
export const AUTOSYNC_PREVIEW_CAP = 4000;

/**
 * Write one auto-synced harvest summary frame and stamp its subject key
 * (metadata.sourceId = item.id) so a subject-mode DSAR can reach it. Guarded so a
 * re-synced dedup'd frame never clobbers a review status the user already set
 * (createIFrame returns the existing frame on a content-hash match).
 */
export function writeAutoSyncSummaryFrame(frames: FrameStore, item: UniversalImportItem): MemoryFrame {
  const label = `[Harvest:${item.source}] ${item.title}`;
  const content = item.content.slice(0, AUTOSYNC_PREVIEW_CAP);
  const frame = frames.createIFrame('harvest', `${label}\n\n${content}`, 'normal', 'import');
  if (!frame.metadata || frame.metadata === '{}') {
    frames.setMetadata(frame.id, JSON.stringify({ sourceId: item.id }));
  }
  return frame;
}
