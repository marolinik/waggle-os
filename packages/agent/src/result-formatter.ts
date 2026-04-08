import type { CombinedRetrievalResult, CombinedResult } from './combined-retrieval.js';

// ── Combined retrieval result formatter ─────────────────────────────────

function formatResultEntry(r: CombinedResult, includeFrameType: boolean): string {
  const lines = [`- ${r.content} ${r.attribution} (score: ${r.score.toFixed(3)}`];
  if (includeFrameType && r.metadata.frameType) {
    lines[0] += `, type: ${r.metadata.frameType}`;
  }
  if (includeFrameType && r.metadata.importance) {
    lines[0] += `, importance: ${r.metadata.importance}`;
  }
  lines[0] += ')';
  return lines.join('\n');
}

/**
 * Format a CombinedRetrievalResult into a human-readable string for the agent.
 * @param result The combined retrieval result
 * @param hasWorkspace Whether a workspace is active (controls header display)
 */
export function formatCombinedResult(result: CombinedRetrievalResult, hasWorkspace: boolean): string {
  const sections: string[] = [];

  // Workspace results
  if (result.workspaceResults.length > 0) {
    const header = '## Workspace Memory';
    const entries = result.workspaceResults.map(r => formatResultEntry(r, true)).join('\n');
    sections.push(`${header}\n${entries}`);
  }

  // Personal results
  if (result.personalResults.length > 0) {
    if (hasWorkspace) {
      const header = '## Personal Memory';
      const entries = result.personalResults.map(r => formatResultEntry(r, true)).join('\n');
      sections.push(`${header}\n${entries}`);
    } else {
      // No workspace = no header, just results
      const entries = result.personalResults.map(r => formatResultEntry(r, true)).join('\n');
      sections.push(entries);
    }
  }

  // KVARK results
  if (result.kvarkResults.length > 0) {
    const header = '## Enterprise Knowledge (KVARK)';
    // KVARK results: score only, no frame_type/importance
    const entries = result.kvarkResults.map(r => formatResultEntry(r, false)).join('\n');
    sections.push(`${header}\n${entries}`);
  }

  // Source conflict notice
  if (result.hasConflict && result.conflictNote) {
    sections.push(`## Source Conflict\n${result.conflictNote}\nReview both sources carefully and note which is more recent or authoritative.`);
  }

  // KVARK error notice
  if (result.kvarkError && result.kvarkAvailable) {
    sections.push(`> Enterprise search encountered an error: ${result.kvarkError}\n> Results shown are from local memory only.`);
  }

  if (sections.length === 0) {
    return 'No relevant memories found.';
  }

  return sections.join('\n\n');
}
