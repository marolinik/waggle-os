import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search, Rocket, Plus, Play, Compass, Puzzle, Loader2,
  Sparkles, Brain, MessageSquare, Package, Plug, Server,
  Bot, Workflow, FileText, UserCircle, Terminal, AlertTriangle,
  CheckCircle2, History, Lightbulb, CornerDownLeft,
} from 'lucide-react';
import { Command as CommandPrimitive } from 'cmdk';
import {
  Command as CommandMenu, CommandList,
  CommandEmpty, CommandGroup, CommandItem,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { adapter } from '@/lib/adapter';
import { fuzzyMatch } from '@/lib/fuzzy-match';
import { useToast } from '@/hooks/use-toast';
import type { CommandCategory, CommandResultType, CommandResult } from '@/lib/types';
import type { Command } from '@waggle/shared';

/* ── Verb sections (PRD §12.3) ──
 * The six command verbs, in display order. Each backend `CommandResult`
 * declares its `category`; we bucket results into these sections. The
 * Search bucket also catches federated object hits (workspace/memory/…).
 */
const CATEGORY_ORDER: readonly CommandCategory[] = [
  'search', 'launch', 'create', 'run', 'navigate', 'extend',
] as const;

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  search: 'Search',
  launch: 'Launch',
  create: 'Create',
  run: 'Run',
  navigate: 'Navigate',
  extend: 'Extend',
};

const CATEGORY_ICONS: Record<CommandCategory, React.ElementType> = {
  search: Search,
  launch: Rocket,
  create: Plus,
  run: Play,
  navigate: Compass,
  extend: Puzzle,
};

/* Per-object-type fallback icon when a result omits its own `icon`. */
const TYPE_ICONS: Record<CommandResultType, React.ElementType> = {
  workspace: Sparkles,
  memory: Brain,
  artifact: FileText,
  session: MessageSquare,
  person: UserCircle,
  agent: Bot,
  skill: Package,
  command: Terminal,
  connector: Plug,
  mcp: Server,
  automation: Workflow,
};

/* Object types that resolve to a window/app the integrator can open (Navigate)
 * vs. types that must be dispatched through the execute pipeline (Run/Create/
 * Extend). Search results that point at a navigable object deep-link instead
 * of executing. */
const NAVIGABLE_TYPES: ReadonlySet<CommandResultType> = new Set<CommandResultType>([
  'workspace', 'memory', 'session', 'person', 'command',
]);

const DEBOUNCE_MS = 220;
const MIN_QUERY = 1;

/* ── Permission prompt (C9 — reuses the chat ApprovalGate visual pattern) ──
 * Command Center does not own its own approval mechanism; gated executes flow
 * through the same approve/deny affordance the chat surface uses. Here the
 * decision is local-to-the-overlay: the caller confirms, then we run execute.
 */
const PermissionPrompt = ({
  result,
  onConfirm,
  onCancel,
  busy,
}: {
  result: CommandResult;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) => {
  const target =
    (result.action?.payload?.path as string | undefined) ||
    (result.action?.payload?.command as string | undefined) ||
    result.action?.endpoint ||
    result.action?.route;

  return (
    <div className="m-2 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 p-3">
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <span className="font-display text-sm font-semibold text-foreground">Approval required</span>
      </div>
      <p className="mb-1 text-xs text-muted-foreground">
        {result.title}
        {result.subtitle ? <span className="text-foreground"> — {result.subtitle}</span> : null}
      </p>
      {target && (
        <p className="mb-2 truncate font-mono text-[11px] text-muted-foreground">→ {target}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1 text-xs text-foreground transition-colors hover:bg-emerald-500 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          Allow &amp; run
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg bg-secondary px-3 py-1 text-xs text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

/* ── Result row ── */
const ResultRow = ({ result, onSelect }: { result: CommandResult; onSelect: () => void }) => {
  const Icon = TYPE_ICONS[result.type] ?? Terminal;
  return (
    <CommandItem
      value={result.id}
      onSelect={onSelect}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-[var(--honey-glow,rgba(229,160,0,0.08))]"
    >
      <Icon className="h-4 w-4 shrink-0" style={{ color: 'var(--hive-400)' }} />
      <div className="min-w-0 flex-1 text-left">
        <span className="block truncate font-display" style={{ color: 'var(--hive-100)' }}>
          {result.title}
        </span>
        {result.subtitle && (
          <span className="block truncate text-xs" style={{ color: 'var(--hive-400)' }}>
            {result.subtitle}
          </span>
        )}
      </div>
      {result.requiresApproval && (
        <span
          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]"
          style={{ backgroundColor: 'rgba(229,160,0,0.15)', color: 'var(--honey-500)' }}
        >
          gated
        </span>
      )}
      <span className="shrink-0 text-[11px] capitalize" style={{ color: 'var(--hive-500)' }}>
        {result.type}
      </span>
    </CommandItem>
  );
};

/* ── Props (integrator wires to Desktop) ── */
interface CommandCenterProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (type: string, id: string) => void;
  onExecute: (result: CommandResult) => void;
  /** Active workspace for execute scoping (C7/C5 deep-links + execute payloads). */
  workspaceId?: string;
}

type ViewState =
  | 'idle'
  | 'query'
  | 'results'
  | 'no-results'
  | 'permission'
  | 'success'
  | 'failure';

/* Group a flat result list into the six verb sections, preserving order. */
function groupByCategory(results: readonly CommandResult[]): Array<{ category: CommandCategory; items: CommandResult[] }> {
  const buckets = new Map<CommandCategory, CommandResult[]>();
  for (const r of results) {
    const list = buckets.get(r.category) ?? [];
    list.push(r);
    buckets.set(r.category, list);
  }
  return CATEGORY_ORDER
    .map((category) => ({ category, items: buckets.get(category) ?? [] }))
    .filter((s) => s.items.length > 0);
}

/* ── Component ── */
const CommandCenter = ({ open, onClose, onNavigate, onExecute, workspaceId }: CommandCenterProps) => {
  const { toast } = useToast();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [results, setResults] = useState<CommandResult[]>([]);
  const [recent, setRecent] = useState<CommandResult[]>([]);
  const [suggestions, setSuggestions] = useState<CommandResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [pending, setPending] = useState<CommandResult | null>(null);
  /** Tracks the last command outcome so we can render success/failure state. */
  const [outcome, setOutcome] = useState<'success' | 'failure' | null>(null);

  // The cmdk `value` (selected) is keyed by result id; map it back to look up.
  const byId = useRef(new Map<string, CommandResult>());

  // Reset transient state every time the overlay opens, and hydrate the idle
  // strips (recent + suggested). Each call degrades independently — a failing
  // suggestions endpoint must not blank out recents.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected('');
    setResults([]);
    setPending(null);
    setOutcome(null);

    adapter.commandRecent()
      .then((r) => setRecent(r.recent ?? []))
      .catch(() => setRecent([]));
    adapter.commandSuggestions()
      .then((s) => setSuggestions(s.suggestions ?? []))
      .catch(() => setSuggestions([]));
  }, [open]);

  // Server-backed search, debounced. Falls back to a client offline filter over
  // the already-loaded recent + suggested pools when the endpoint is unreachable
  // (reuses lib/fuzzy-match — same matcher the legacy Win+K used).
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await adapter.commandSearch(q, workspaceId);
        setResults(res.results ?? []);
      } catch {
        // Offline fallback: fuzzy-match across recent + suggested.
        const pool = [...recent, ...suggestions];
        const seen = new Set<string>();
        const matched: Array<CommandResult & { _score: number }> = [];
        for (const item of pool) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          const hit = fuzzyMatch(q, `${item.title} ${item.subtitle ?? ''}`);
          if (hit.match) matched.push({ ...item, _score: hit.score });
        }
        matched.sort((a, b) => b._score - a._score);
        setResults(matched.map(({ _score, ...rest }) => rest));
      } finally {
        setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, workspaceId, recent, suggestions]);

  // Natural-language fallback row (PRD line 464): when a non-empty query yields
  // no structured matches, offer to run the raw string as a command.
  const nlResult = useMemo<CommandResult | null>(() => {
    const q = query.trim();
    if (!q || results.length > 0) return null;
    return {
      id: `__nl__:${q}`,
      type: 'command',
      title: `Run as command: "${q}"`,
      subtitle: 'Interpret your input as a natural-language command',
      category: 'run',
      requiresApproval: false,
      action: { endpoint: '/api/command/execute', payload: { input: q } },
    };
  }, [query, results]);

  // Choose which result pool feeds the list for the current view.
  const sections = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const idle: CommandResult[] = [...recent, ...suggestions];
      return groupByCategory(idle.length > 0 ? idle : []);
    }
    const live = nlResult ? [...results, nlResult] : results;
    return groupByCategory(live);
  }, [query, results, recent, suggestions, nlResult]);

  // Keep an id→result lookup in sync with whatever is currently rendered so a
  // cmdk onSelect (which yields the value/id) can resolve back to the object.
  useEffect(() => {
    const map = new Map<string, CommandResult>();
    for (const sec of sections) for (const item of sec.items) map.set(item.id, item);
    byId.current = map;
  }, [sections]);

  const viewState: ViewState = useMemo(() => {
    if (pending) return 'permission';
    if (outcome === 'success') return 'success';
    if (outcome === 'failure') return 'failure';
    const q = query.trim();
    if (!q) return 'idle';
    if (searching) return 'query';
    return sections.length > 0 ? 'results' : 'no-results';
  }, [pending, outcome, query, searching, sections]);

  // Dispatch a chosen result. Navigable objects deep-link via onNavigate; Run/
  // Create/Extend and gated items go through the execute pipeline. Gated results
  // first raise the permission prompt (C9).
  const runResult = useCallback(async (result: CommandResult) => {
    setOutcome(null);
    setExecuting(true);
    try {
      const payload: Command = {
        id: result.id.startsWith('__nl__:') ? undefined : result.id,
        input: result.action?.payload?.input as string | undefined,
        category: result.category,
        type: result.type,
        workspaceId,
        payload: result.action?.payload,
      };
      const res = await adapter.commandExecute(payload);
      if (res.ok) {
        setOutcome('success');
        onExecute(result);
        toast({ title: 'Command ran', description: result.title });
        onClose();
      } else {
        setOutcome('failure');
        toast({ title: 'Command failed', description: result.title, variant: 'destructive' });
      }
    } catch {
      setOutcome('failure');
      toast({ title: 'Command failed', description: result.title, variant: 'destructive' });
    } finally {
      setExecuting(false);
      setPending(null);
    }
  }, [workspaceId, onExecute, onClose, toast]);

  const handleSelect = useCallback((result: CommandResult) => {
    // Navigate intents (and navigable search hits without a gate) deep-link.
    const isNavigate =
      result.category === 'navigate' ||
      (result.category === 'search' && NAVIGABLE_TYPES.has(result.type) && !result.requiresApproval);
    if (isNavigate) {
      onNavigate(result.type, result.id);
      onClose();
      return;
    }
    // Gated executes raise the permission prompt before running (C9).
    if (result.requiresApproval) {
      setPending(result);
      return;
    }
    void runResult(result);
  }, [onNavigate, onClose, runResult]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className="overflow-hidden p-0 shadow-2xl sm:max-w-xl"
        style={{ backgroundColor: 'var(--hive-850)', border: '1px solid var(--hive-700)' }}
        data-testid="command-center-dialog"
      >
        {/* Accessible label for the Radix dialog; visually hidden (sr-only is
            the convention already used in ui/dialog.tsx). */}
        <DialogTitle className="sr-only">Command Center</DialogTitle>

        <CommandMenu
          label="Command Center"
          shouldFilter={false}
          loop
          value={selected}
          onValueChange={setSelected}
          className="bg-transparent"
        >
          {/* Query input */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: '1px solid var(--hive-700)' }}
          >
            <Search className="h-5 w-5 shrink-0" style={{ color: 'var(--hive-400)' }} />
            <CommandPrimitive.Input
              value={query}
              onValueChange={setQuery}
              placeholder="What do you want to do? Search, launch, create, run, navigate, extend…"
              className="h-auto flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-[var(--hive-500)]"
              aria-label="Command Center search"
            />
            {searching && <Loader2 className="h-4 w-4 animate-spin" style={{ color: 'var(--honey-500)' }} />}
            <kbd
              className="rounded px-1.5 py-0.5 font-display text-[11px]"
              style={{ backgroundColor: 'var(--hive-800)', color: 'var(--hive-400)' }}
            >
              ESC
            </kbd>
          </div>

          {/* Permission prompt (C9) takes over the body when a gated item is chosen. */}
          {viewState === 'permission' && pending && (
            <PermissionPrompt
              result={pending}
              busy={executing}
              onConfirm={() => void runResult(pending)}
              onCancel={() => setPending(null)}
            />
          )}

          {viewState !== 'permission' && (
            <CommandList className="max-h-[60vh] overflow-auto p-2">
              {/* No results / NL hint is folded into the NL row, so a true empty
                  only shows when there is genuinely nothing to offer. */}
              <CommandEmpty>
                <span className="text-sm" style={{ color: 'var(--hive-400)' }}>
                  {query.trim() ? `No results for "${query.trim()}"` : 'Start typing to search everything'}
                </span>
              </CommandEmpty>

              {/* Idle: surface Recent + Suggested strips (PRD §12.3). */}
              {viewState === 'idle' && recent.length > 0 && (
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-1.5">
                      <History className="h-3 w-3" /> Recent
                    </span>
                  }
                >
                  {recent.map((r) => (
                    <ResultRow key={`recent-${r.id}`} result={r} onSelect={() => handleSelect(r)} />
                  ))}
                </CommandGroup>
              )}

              {viewState === 'idle' && suggestions.length > 0 && (
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-1.5">
                      <Lightbulb className="h-3 w-3" /> Suggested for you
                    </span>
                  }
                >
                  {suggestions.map((r) => (
                    <ResultRow key={`sugg-${r.id}`} result={r} onSelect={() => handleSelect(r)} />
                  ))}
                </CommandGroup>
              )}

              {/* Grouped verb sections for an active query. */}
              {viewState !== 'idle' && sections.map((sec) => {
                const HeadIcon = CATEGORY_ICONS[sec.category];
                return (
                  <CommandGroup
                    key={sec.category}
                    heading={
                      <span className="flex items-center gap-1.5 uppercase tracking-wider">
                        <HeadIcon className="h-3 w-3" /> {CATEGORY_LABELS[sec.category]}
                      </span>
                    }
                  >
                    {sec.items.map((r) => (
                      <ResultRow key={`${sec.category}-${r.id}`} result={r} onSelect={() => handleSelect(r)} />
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          )}

          {/* Footer hints */}
          <div
            className="flex items-center gap-4 px-4 py-2 text-[11px]"
            style={{ borderTop: '1px solid var(--hive-700)', color: 'var(--hive-500)' }}
          >
            <span>{'↑↓'} Navigate</span>
            <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> Run / Open</span>
            <span>{'⌘'}K Toggle</span>
            {viewState === 'failure' && (
              <span className="ml-auto text-amber-400">Last command failed</span>
            )}
          </div>
        </CommandMenu>
      </DialogContent>
    </Dialog>
  );
};

export default CommandCenter;
