/**
 * Humanize raw activity-event summaries for user-facing surfaces.
 *
 * The activity feed stores machine summaries like "tool_result: create_skill".
 * Showing those verbatim in the workspace rail read as "the app is talking to
 * itself, not to me" (judge-flagged on every non-developer persona).
 */

const TOOL_LABELS: Record<string, string> = {
  create_skill: 'Created a skill',
  delete_skill: 'Removed a skill',
  read_skill: 'Looked up a skill',
  promote_skill: 'Promoted a skill',
  write_file: 'Wrote a file',
  read_file: 'Read a file',
  search_memory: 'Searched memory',
  save_memory: 'Saved a memory',
  recall_memory: 'Recalled a memory',
  web_search: 'Searched the web',
  install_capability: 'Installed a capability',
  spawn_agent: 'Started an agent',
  bash: 'Ran a command',
};

function humanizeToolName(tool: string): string {
  const known = TOOL_LABELS[tool];
  if (known) return known;
  const words = tool.replace(/[_-]+/g, ' ').trim();
  return `Used ${words}`;
}

/** "tool_result: create_skill" → "Created a skill"; plain text passes through. */
export function humanizeActivitySummary(summary: string): string {
  const m = /^(tool_result|tool_use|tool_call):\s*([\w-]+)\s*$/.exec(summary.trim());
  if (m) return humanizeToolName(m[2]);
  return summary;
}
