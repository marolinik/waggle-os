import { memo, useState } from 'react';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ToolUseContentBlock } from '@/lib/types';

interface ToolUseBlockProps {
  block: ToolUseContentBlock;
}

const StatusIcon = ({ status }: { status: ToolUseContentBlock['status'] }) => {
  switch (status) {
    case 'running': return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
    case 'done': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case 'error': return <XCircle className="w-3.5 h-3.5 text-destructive" />;
    case 'denied': return <XCircle className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function summarizeInput(name: string, input?: Record<string, unknown>): string {
  if (!input) return '';
  if (input.query) return String(input.query);
  if (input.path) return String(input.path);
  if (input.url) return String(input.url);
  if (input.pattern) return String(input.pattern);
  if (input.command) return String(input.command).slice(0, 60);
  if (input.content) return String(input.content).slice(0, 60);
  const first = Object.values(input)[0];
  return first ? String(first).slice(0, 60) : '';
}

const ToolUseBlock = memo(({ block }: ToolUseBlockProps) => {
  const [expanded, setExpanded] = useState(false);
  const inputSummary = summarizeInput(block.name, block.input);

  return (
    <div className="my-1.5 rounded-lg border border-border/40 bg-secondary/30 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-secondary/50 transition-colors"
      >
        <StatusIcon status={block.status} />
        <span className="font-display font-medium text-foreground">{formatToolName(block.name)}</span>
        {inputSummary && (
          <span className="text-muted-foreground truncate max-w-[200px]">{inputSummary}</span>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          {block.duration != null && <span>{block.duration}ms</span>}
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </span>
      </button>
      {expanded && (block.input || block.result) && (
        <div className="px-2.5 pb-2 border-t border-border/30">
          {block.input && (
            <pre className="mt-1.5 text-[10px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto max-h-24">
              {JSON.stringify(block.input, null, 2)}
            </pre>
          )}
          {block.result && (
            <pre className="mt-1 text-[10px] text-muted-foreground bg-background/50 rounded p-1.5 overflow-x-auto max-h-32">
              {typeof block.result === 'string' ? block.result.slice(0, 2000) : JSON.stringify(block.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
});

ToolUseBlock.displayName = 'ToolUseBlock';
export default ToolUseBlock;
