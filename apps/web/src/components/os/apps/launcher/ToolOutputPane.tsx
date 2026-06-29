import { useEffect, useRef, useState } from 'react';
import { Loader2, Terminal } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { adapter } from '@/lib/adapter';

interface ToolOutputPaneProps {
  pid: number;
  toolId: string;
  /** True only for launches started in observed mode (piped stdio). */
  observed: boolean;
}

const RENDER_CAP = 2000; // mirror the server ring-buffer cap

/**
 * AI-OS #4 — progressive-disclosure live-output pane for an observed launch.
 * Opened from the dock's Running badge. Streams stdout/stderr via the adapter's
 * SSE subscription. For a non-observed (detached) launch there is no buffer, so
 * it shows a hint pointing at the ⌘K watch entry instead of a dead stream.
 */
export const ToolOutputPane = ({ pid, toolId, observed }: ToolOutputPaneProps) => {
  const [lines, setLines] = useState<string[]>([]);
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!observed) return;
    const off = adapter.streamToolOutput(pid, {
      onLine: (line) =>
        setLines((prev) => {
          const base = prev.length >= RENDER_CAP ? prev.slice(prev.length - RENDER_CAP + 1) : prev;
          return [...base, line];
        }),
      onExit: (code) => setExitCode(code),
    });
    return off;
  }, [pid, observed]);

  // Auto-scroll to the bottom on new output.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  if (!observed) {
    return (
      <div className="mt-2 rounded-lg border border-border/40 bg-card/30 p-3 text-[11px] text-muted-foreground">
        This agent was launched in the background (no live output). Use{' '}
        <span className="font-medium text-foreground">⌘K → “Watch a coding agent live”</span> to
        start one you can watch.
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-border/40 bg-[var(--bg-2,#0a0b0e)]">
      <div className="flex items-center gap-1.5 border-b border-border/30 px-2.5 py-1.5 text-[11px] text-muted-foreground">
        <Terminal className="h-3 w-3" />
        <span>{toolId} · live output</span>
        {exitCode === undefined ? (
          <Loader2 className="ml-auto h-3 w-3 animate-spin" />
        ) : (
          <span
            className="ml-auto rounded px-1.5 py-0.5 text-[10px]"
            style={
              exitCode === 0
                ? { background: 'var(--healthy-wash)', color: 'var(--healthy)' }
                : { background: 'var(--risk-wash)', color: 'var(--risk)' }
            }
          >
            {`exit ${exitCode ?? 'signal'}`}
          </span>
        )}
      </div>
      <ScrollArea className="max-h-56">
        <div
          ref={scrollRef}
          className="whitespace-pre-wrap break-all p-2.5 font-mono text-[11px] leading-[1.5] text-[var(--text-2)]"
        >
          {lines.length === 0 && exitCode === undefined ? (
            <span className="text-muted-foreground">Waiting for output…</span>
          ) : (
            lines.map((l, i) => <div key={i}>{l || ' '}</div>)
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ToolOutputPane;
