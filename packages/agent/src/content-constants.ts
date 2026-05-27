/**
 * Content-length constants shared between orchestrator's recall path and the
 * pattern-write-back module. Single source of truth — adjust here, both paths
 * inherit. Originally inlined in orchestrator.ts as `// M16` constants.
 */

/** Minimum user message length to be worth memorizing */
export const MIN_CONTENT_LENGTH = 30;

/** Saved-content preview length (autoSave dedup display) */
export const DEDUP_SLICE_LENGTH = 80;

/** Recalled-content snippet length for UI display */
export const RECALLED_SNIPPET_LENGTH = 120;

/** Preloaded-context content preview length */
export const CONTEXT_PREVIEW_LENGTH = 200;

/** Recall line / decision / save content truncation */
export const RECALL_LINE_LENGTH = 300;

/** Research findings / key-points truncation */
export const FINDINGS_SLICE_LENGTH = 400;

/** Assistant response length threshold for structured extraction */
export const STRUCTURED_EXTRACT_THRESHOLD = 500;
