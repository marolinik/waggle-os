/**
 * InstalledMcpList — the S08 Installed tab body (UX-Refactor Phase 4B).
 * One row per installed MCP server: state badge (raw runtime state, §14.7),
 * C19 scope chip, tools, and the action set — Start/Stop, Test (C21, mode
 * labelled live/static honestly), Scope, Logs (honest coming-soon: no
 * log-capture route exists in v1), Revoke (parent-owned confirm).
 */
import { useState } from 'react';
import {
  FlaskConical, Loader2, Play, ScrollText, ShieldOff, Square, Target,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { StatusBadge } from '@/components/ui/status-badge';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { mcpStateBadge, type McpListItem } from './mcp-hub-types';

interface TestResult {
  ok: boolean;
  mode?: 'live' | 'static';
  tools?: string[];
  error?: string;
  note?: string;
}

interface InstalledMcpListProps {
  items: McpListItem[];
  /** Opens the parent's revoke confirm. */
  onRevoke: (item: McpListItem) => void;
  /** Opens the parent's C19 scope dialog. */
  onScope: (item: McpListItem) => void;
  /** Refresh the list after a start/stop changed runtime state. */
  onChanged: () => void;
}

const InstalledMcpList = ({ items, onRevoke, onScope, onChanged }: InstalledMcpListProps) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  // Per-row start/stop failure detail. The server returns the reason (502
  // {status, error}) as DATA — adapter.fetch never throws on HTTP errors —
  // so it must be read and rendered, not dropped; a thrown network error
  // must be caught (an uncaught one escapes `void handleStart(...)` as an
  // unhandled promise rejection with zero user feedback).
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const runLifecycle = async (id: string, action: 'start' | 'stop') => {
    const verb = action === 'start' ? 'Start' : 'Stop';
    setBusyId(id);
    setActionErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const res = action === 'start' ? await adapter.startMcp(id) : await adapter.stopMcp(id);
      if (res.error) {
        setActionErrors(prev => ({ ...prev, [id]: `${verb} failed — ${res.error}` }));
      }
    } catch (err) {
      setActionErrors(prev => ({
        ...prev,
        [id]: `${verb} failed — ${err instanceof Error ? err.message : 'server unreachable'}`,
      }));
    } finally {
      setBusyId(null);
      onChanged();
    }
  };

  const handleStart = (id: string) => runLifecycle(id, 'start');
  const handleStop = (id: string) => runLifecycle(id, 'stop');

  const handleTest = async (id: string) => {
    setBusyId(id);
    try {
      const res = await adapter.testMcp(id) as TestResult;
      setTestResults(prev => ({ ...prev, [id]: res }));
    } catch (err) {
      setTestResults(prev => ({ ...prev, [id]: { ok: false, error: err instanceof Error ? err.message : 'Test failed' } }));
    } finally {
      setBusyId(null);
      onChanged();
    }
  };

  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-8" role="status">
        No MCP servers installed yet — install one from the Catalog tab or add a custom server.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5" data-testid="installed-mcp-list">
      {items.map(item => {
        const badge = mcpStateBadge(item);
        const running = item.state === 'ready' || item.state === 'starting' || item.status === 'running';
        const busy = busyId === item.id;
        const test = testResults[item.id];
        const actionError = actionErrors[item.id];
        return (
          <li key={item.id} className="rounded-xl border border-border/30 p-2.5 space-y-1.5 hover:border-primary/30 transition-colors">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-display font-semibold text-foreground">{item.name}</span>
              <StatusBadge tone={badge.tone} label={badge.label} />
              <span className="text-[10px] px-1.5 py-px rounded bg-muted/60 text-muted-foreground">
                {item.scope === 'workspace' && item.connectedTo?.length
                  ? `workspace: ${item.connectedTo[0]}`
                  : 'personal'}
              </span>
              {item.source === 'custom' && <span className="text-[10px] text-muted-foreground">custom</span>}

              <div className="ml-auto flex items-center gap-1">
                {running ? (
                  <button onClick={() => void handleStop(item.id)} disabled={busy}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:bg-muted/40 disabled:opacity-50 transition-colors">
                    <Square className="w-3 h-3" /> Stop
                  </button>
                ) : (
                  <button onClick={() => void handleStart(item.id)} disabled={busy}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors">
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Start
                  </button>
                )}
                <HintTooltip content="Runs a real spawn + tools/list round-trip when possible; falls back to a static manifest check (the result says which ran).">
                  <button onClick={() => void handleTest(item.id)} disabled={busy}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:bg-muted/40 disabled:opacity-50 transition-colors">
                    <FlaskConical className="w-3 h-3" /> Test
                  </button>
                </HintTooltip>
                <button onClick={() => onScope(item)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors">
                  <Target className="w-3 h-3" /> Scope
                </button>
                <HintTooltip content="Log capture is coming soon — the runtime does not retain server logs yet, so there is nothing to show honestly.">
                  {/* aria-disabled (not `disabled`) keeps the trigger focusable
                      and hoverable — Radix tooltips never fire on a
                      hard-disabled trigger, which made this honest
                      coming-soon explanation unreachable. */}
                  <button type="button" aria-disabled="true"
                    className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-muted-foreground/50 cursor-not-allowed">
                    <ScrollText className="w-3 h-3" /> Logs (soon)
                  </button>
                </HintTooltip>
                <button onClick={() => onRevoke(item)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-destructive hover:bg-destructive/10 transition-colors">
                  <ShieldOff className="w-3 h-3" /> Revoke
                </button>
              </div>
            </div>

            {item.tools.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tools.slice(0, 8).map(t => (
                  <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-muted/50 text-muted-foreground font-mono">{t}</span>
                ))}
                {item.tools.length > 8 && <span className="text-[10px] text-muted-foreground">+{item.tools.length - 8}</span>}
              </div>
            )}

            {actionError && (
              <p role="alert" data-testid={`mcp-action-error-${item.id}`}
                className="text-[11px] rounded-md px-2 py-1.5 border bg-destructive/10 border-destructive/30 text-destructive">
                {actionError}
              </p>
            )}

            {test && (
              <div data-testid={`mcp-test-result-${item.id}`}
                className={`text-[11px] rounded-md px-2 py-1.5 border ${test.ok ? 'bg-muted/40 border-border/30 text-foreground' : 'bg-destructive/10 border-destructive/30 text-destructive'}`}>
                <span className="font-medium">
                  {test.mode === 'live' ? 'Live test' : test.mode === 'static' ? 'Static manifest check' : 'Test'}
                  {': '}{test.ok ? 'passed' : 'failed'}
                </span>
                {test.tools && test.tools.length > 0 && <> — {test.tools.length} tool(s): {test.tools.slice(0, 6).join(', ')}{test.tools.length > 6 ? '…' : ''}</>}
                {test.error && <> — {test.error}</>}
                {test.note && <p className="text-muted-foreground mt-0.5">{test.note}</p>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default InstalledMcpList;
