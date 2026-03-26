/**
 * Shared utility functions for chat components.
 */

import type { ToolUseEvent } from '../../services/types.js';

/**
 * Return a color string based on tool execution status.
 * Uses the new `status` field when available, falls back to legacy logic.
 * - 'yellow' if the tool requires approval and hasn't been decided yet
 * - 'red' if the tool was denied or errored
 * - 'blue' if the tool is currently running
 * - 'green' otherwise (completed successfully)
 */
export function getToolStatusColor(tool: ToolUseEvent): string {
  // Use status field when available
  if (tool.status) {
    switch (tool.status) {
      case 'running': return 'blue';
      case 'done': return 'green';
      case 'error': return 'red';
      case 'denied': return 'red';
      case 'pending_approval': return 'yellow';
    }
  }
  // Legacy fallback
  if (tool.requiresApproval && tool.approved === undefined) return 'yellow';
  if (tool.approved === false) return 'red';
  return 'green';
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
