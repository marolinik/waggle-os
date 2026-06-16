import { useState, useEffect, type ReactNode } from 'react';
import { Loader2, Info, Sparkles } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import type { MemoryTrace } from '@/lib/types';
import { HexAvatar, DotLive, type WarmTone } from '../../warm';

/**
 * Memory-Trust "Why did you do that?" view (screen 19 §6, PR3.5 Phase D).
 *
 * Renders the REAL execution trace that wrote a memory — resolved via the
 * metadata.trace_id backlink (GET /api/memory/:id/trace). The goal→tool-calls→
 * acted chain comes straight from the trace payload (input / toolCalls / outcome
 * / output). When a memory has no linked trace (manual / harvested / pre-PR3.5
 * frames) the route honestly returns { trace: null } and we show a "no trace"
 * state — NEVER a synthesized reason.
 */

interface MemoryTrustWhyProps {
  mind: 'personal' | 'workspace';
  workspaceId?: string;
  /** The memory whose trace to explain (set from the Manage view). Null → pick-one prompt. */
  memoryId: string | null;
  onToast: (msg: string) => void;
  /** "That memory is wrong → correct it" — hand back to Manage's editor. */
  onCorrect: (id: string) => void;
  /** "Forget … & redo" — hard delete, then back to Manage. */
  onForget: (id: string) => void;
}

const OUTCOME_LABEL: Record<MemoryTrace['outcome'], string> = {
  success: 'completed', verified: 'verified', corrected: 'corrected',
  abandoned: 'abandoned', pending: 'in progress',
};

/** Friendly verb for a tool call in the trace chain. */
function humanizeTool(tool: string): string {
  if (tool === 'auto_recall') return 'Recalled memories';
  return tool.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface TraceNode {
  tone: WarmTone;
  title: string;
  body: ReactNode;
}

function NodeRow({ node, last }: { node: TraceNode; last: boolean }) {
  return (
    <li className="relative grid grid-cols-[24px_1fr] gap-3 pb-4 last:pb-0">
      {!last && <span className="absolute left-[11px] top-7 bottom-1 w-px bg-[var(--line)]" aria-hidden="true" />}
      <span className="z-10 mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-[var(--surface)]">
        <DotLive tone={node.tone} live={false} size={9} />
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-[var(--text)]">{node.title}</p>
        <div className="mt-0.5 text-[13px] leading-relaxed text-[var(--text-muted)]">{node.body}</div>
      </div>
    </li>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[var(--line-soft)] bg-[var(--bg-2)] px-6 py-10 text-center">
      {children}
    </div>
  );
}

export default function MemoryTrustWhy({ mind, workspaceId, memoryId, onToast, onCorrect, onForget }: MemoryTrustWhyProps) {
  const wsParam = mind === 'workspace' ? workspaceId : undefined;
  const [trace, setTrace] = useState<MemoryTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memoryId) { setTrace(null); setError(null); setLoading(false); return; }
    let alive = true;
    setLoading(true); setError(null); setTrace(null);
    adapter.getMemoryTrace(memoryId, wsParam, mind)
      .then((r) => { if (alive) setTrace(r.trace); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load trace'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [memoryId, wsParam, mind]);

  // No memory chosen yet — point the user at the Manage view.
  if (!memoryId) {
    return (
      <Shell>
        <Info className="mx-auto mb-3 h-6 w-6 text-[var(--intel)]" strokeWidth={1.8} />
        <p className="text-[14px] text-[var(--text-2)]">Open a memory&rsquo;s ⬡ trace to see why Waggle acted on it.</p>
        <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          In <b className="text-[var(--text-2)]">Manage memory</b>, open any memory and choose &ldquo;Why is this here?&rdquo;.
          Memories the agent wrote link back to the turn that produced them.
        </p>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-[var(--text-dim)]" />
        <p className="text-[13px] text-[var(--text-muted)]">Resolving the trace for M-{memoryId}…</p>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <p className="text-[13px] text-[var(--risk)]">{error}</p>
      </Shell>
    );
  }

  // Honest no-data state — the frame carries no trace_id backlink.
  if (!trace) {
    return (
      <Shell>
        <Info className="mx-auto mb-3 h-6 w-6 text-[var(--text-dim)]" strokeWidth={1.8} />
        <p className="text-[14px] text-[var(--text-2)]">No trace is linked to M-{memoryId}.</p>
        <p className="mx-auto mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-[var(--text-muted)]">
          This memory was added manually, imported, or written before traces were linked — so there&rsquo;s no
          recorded decision behind it. Memories the agent writes from here on will carry their trace.
        </p>
      </Shell>
    );
  }

  const nodes: TraceNode[] = [
    { tone: 'intel', title: 'Goal received', body: <span className="font-mono text-[11.5px] text-[var(--text-dim)]">&ldquo;{trace.input}&rdquo;</span> },
    ...trace.toolCalls.map((c): TraceNode => ({
      tone: c.ok ? 'honey' : 'risk',
      title: humanizeTool(c.tool),
      body: <span className="font-mono text-[11px] text-[var(--text-dim)]">{c.ok ? 'ok' : 'failed'} · {Math.max(1, Math.round(c.durationMs))}ms</span>,
    })),
    { tone: 'healthy', title: `Acted — ${OUTCOME_LABEL[trace.outcome]}`, body: trace.output || '(no output recorded)' },
  ];

  return (
    <div className="overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--bg-2)]">
      {/* §6a header */}
      <div className="flex items-center gap-3 border-b border-[var(--line-soft)] px-5 py-4">
        <HexAvatar label="Trace" size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-[650] text-[var(--text)]">Why memory M-{memoryId} is here</p>
          <p className="truncate text-[12px] text-[var(--text-muted)]">
            {[trace.model, OUTCOME_LABEL[trace.outcome], trace.sessionId ? `session ${trace.sessionId.slice(0, 8)}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-[var(--text-dim)]">trace #{trace.id}</span>
      </div>

      {/* §6b chain */}
      <ol className="px-5 py-4">
        {nodes.map((n, i) => <NodeRow key={i} node={n} last={i === nodes.length - 1} />)}
      </ol>

      {/* §6c footer */}
      <div className="flex flex-wrap gap-2 border-t border-[var(--line-soft)] bg-[var(--surface)] px-5 py-4">
        <button
          type="button"
          onClick={() => onToast(`Kept M-${memoryId} — looks right`)}
          className="rounded-[9px] bg-[var(--honey)] px-3.5 py-2 text-[12.5px] font-[650] text-[#1a1407]"
        >
          Looks right
        </button>
        <button
          type="button"
          onClick={() => onCorrect(memoryId)}
          className="rounded-[9px] border border-[var(--line-strong)] bg-[var(--surface-2)] px-3.5 py-2 text-[12.5px] font-[650] text-[var(--text-2)]"
        >
          That memory is wrong → correct it
        </button>
        <button
          type="button"
          onClick={() => onForget(memoryId)}
          className="rounded-[9px] border border-[color-mix(in_srgb,var(--risk)_35%,transparent)] bg-transparent px-3.5 py-2 text-[12.5px] font-[650] text-[var(--risk)]"
        >
          Forget M-{memoryId} &amp; redo
        </button>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-dim)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--intel)]" strokeWidth={1.8} /> real execution trace
        </span>
      </div>
    </div>
  );
}
