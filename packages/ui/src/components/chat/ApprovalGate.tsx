/**
 * ApprovalGate — inline approval dialog for external mutation tools.
 *
 * C1: Shows human-readable descriptions instead of raw JSON.
 */

import { useState } from 'react';
import type { ToolUseEvent } from '../../services/types.js';

export interface ApprovalGateProps {
  tool: ToolUseEvent;
  onApprove: () => void;
  onDeny: (reason?: string) => void;
}

/** C1: Generate a human-readable description of what the tool wants to do */
function describeApproval(name: string, input: Record<string, unknown>): { title: string; detail: string } {
  switch (name) {
    case 'bash':
      return {
        title: 'Run a shell command',
        detail: String(input.command ?? ''),
      };
    case 'write_file':
      return {
        title: `Create/overwrite file: ${input.path ?? ''}`,
        detail: String(input.content ?? '').slice(0, 200) + (String(input.content ?? '').length > 200 ? '...' : ''),
      };
    case 'edit_file':
      return {
        title: `Edit file: ${input.path ?? ''}`,
        detail: `Replace: "${String(input.old_string ?? '').slice(0, 80)}" → "${String(input.new_string ?? '').slice(0, 80)}"`,
      };
    case 'git_commit':
      return {
        title: 'Create a git commit',
        detail: String(input.message ?? ''),
      };
    case 'generate_docx':
      return {
        title: `Generate document: ${input.path ?? ''}`,
        detail: `Title: ${input.title ?? 'untitled'}`,
      };
    case 'delete_skill':
      return {
        title: `Delete skill: ${input.name ?? ''}`,
        detail: 'This will permanently remove the skill file.',
      };
    default:
      return {
        title: `Execute: ${name.replace(/_/g, ' ')}`,
        detail: Object.entries(input).map(([k, v]) =>
          `${k}: ${typeof v === 'string' ? v.slice(0, 100) : JSON.stringify(v)}`
        ).join('\n'),
      };
  }
}

export function ApprovalGate({ tool, onApprove, onDeny }: ApprovalGateProps) {
  const [showRaw, setShowRaw] = useState(false);
  const { title, detail } = describeApproval(tool.name, tool.input);

  return (
    <div className="approval-gate rounded-lg border border-yellow-600/50 bg-yellow-950/30 p-3">
      {/* Header */}
      <div className="approval-gate__header mb-2 flex items-center gap-2">
        <span className="text-yellow-500 text-lg">{'\u26A0'}</span>
        <span className="font-semibold text-yellow-200">
          Approval Required
        </span>
      </div>

      {/* Tool info — human-readable */}
      <div className="approval-gate__info mb-3">
        <div className="text-sm font-medium text-foreground mb-1">
          {title}
        </div>
        <pre className="mt-1 overflow-x-auto rounded bg-background px-3 py-2 text-xs text-foreground/80 whitespace-pre-wrap">
          {detail}
        </pre>
        {/* Toggle for raw JSON */}
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="mt-1 text-[10px] text-muted-foreground hover:text-foreground"
          type="button"
        >
          {showRaw ? 'Hide raw data' : 'Show raw data'}
        </button>
        {showRaw && (
          <pre className="mt-1 overflow-x-auto rounded bg-background px-3 py-2 text-[10px] text-muted-foreground">
            {JSON.stringify(tool.input, null, 2)}
          </pre>
        )}
      </div>

      {/* Actions */}
      <div className="approval-gate__actions flex gap-2">
        <button
          onClick={onApprove}
          className="rounded bg-green-700 px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-green-600"
        >
          Approve
        </button>
        <button
          onClick={() => onDeny()}
          className="rounded bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
        >
          Deny
        </button>
      </div>
    </div>
  );
}
