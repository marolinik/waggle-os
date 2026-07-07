/**
 * AgentSearchBox — screen 09's centered agent-search bar (PR4 Variation A).
 * Type a need → POST /api/marketplace/agent-search → a "connector + skill +
 * tool" three-up, each with the engine's deterministic "why" and a one-click
 * action wired to the shared install store (so it reflects in the grid + count
 * bar). Connectors hand off to the Hub's token-paste; starter skills install
 * via the starter-pack path; native tools you already have read "Available".
 */
import { useState, useEffect, useRef } from 'react';
import { Loader2, Plug, Zap, Download, ExternalLink, Check } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useInstallStore } from '@/providers/InstallProvider';
import { useToast } from '@/hooks/use-toast';
import { AskBar } from '@/components/os/warm/AskBar';
import { BeeLoader } from '@/components/ui/BeeLoader';
import { StatusBadge } from '@/components/ui/status-badge';
import { describeError } from '@/lib/install-store';
import {
  installTargetFor, type AgentSearchResponse, type AgentSearchSuggestion,
} from '@/lib/agent-search';

const EXAMPLES = [
  'send a message to my team',
  'turn a report into a slide deck',
  'query my production database',
];

const SLOT_LABEL: Record<'connector' | 'skill' | 'tool', string> = {
  connector: 'Connector', skill: 'Skill', tool: 'Tool',
};

function openApp(appId: string) {
  window.dispatchEvent(new CustomEvent('waggle:open-app', { detail: { appId } }));
}

/** The auto-match lifecycle the box reports up so the Marketplace can compose
 *  the no-match area: suppress its dead-end while matching / on a hit, and show
 *  the catalog fallback ONLY when the semantic match also finds nothing. */
export type AutoMatchState = 'idle' | 'searching' | 'matched' | 'empty';

interface AgentSearchBoxProps {
  /** Live keystroke tap — the Marketplace uses this to filter the grid while
   *  the same input still answers NL intent on Enter (single smart input). */
  onQueryChange?: (q: string) => void;
  /** Wave U Lane C §1: when live keyword filtering finds nothing for a ≥3-word
   *  described need, the Marketplace hands the need here and the box AUTO-RUNS
   *  the semantic match after a ~600ms settle — no "press Enter" dead-end. Null
   *  when the query is not an unmatched NL need. */
  autoRunNeed?: string | null;
  /** Reports the auto-match lifecycle (Wave U Lane C §1/§2). */
  onAutoStateChange?: (state: AutoMatchState) => void;
}

const AgentSearchBox = ({ onQueryChange, autoRunNeed = null, onAutoStateChange }: AgentSearchBoxProps = {}) => {
  const { install, isInstalling } = useInstallStore();
  const { toast } = useToast();
  const [result, setResult] = useState<AgentSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingPack, setStartingPack] = useState<string | null>(null);
  // Whether the CURRENT search/settle was auto-triggered (NL bridge) vs a manual
  // Enter/chip. Drives the BeeLoader + "Matched to your request" composition and
  // the deferral of the plain empty line to the host's catalog fallback.
  const [autoActive, setAutoActive] = useState(false);
  const autoActiveRef = useRef(false);

  const run = async (need: string, opts?: { auto?: boolean }) => {
    const auto = opts?.auto ?? false;
    autoActiveRef.current = auto;
    setAutoActive(auto);
    setSearching(true);
    setError(null);
    try {
      const res = await adapter.agentSearch(need);
      setResult(res);
      if (auto) {
        const has = Boolean(res.picks.connector || res.picks.skill || res.picks.tool);
        onAutoStateChange?.(has ? 'matched' : 'empty');
      }
    } catch (e) {
      setError(describeError(e));
      setResult(null);
      if (auto) onAutoStateChange?.('empty');
    } finally {
      setSearching(false);
    }
  };

  // Auto-run the semantic match when the Marketplace hands off an unmatched NL
  // need. Refs hold the freshest run/callback so the effect can key on the need
  // alone (no re-scheduling on unrelated re-renders). Same need never re-runs.
  const runRef = useRef(run);
  runRef.current = run;
  const onAutoStateChangeRef = useRef(onAutoStateChange);
  onAutoStateChangeRef.current = onAutoStateChange;
  const lastAutoNeedRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoRunNeed == null) {
      // The query is no longer an unmatched NL need — drop any auto result so a
      // stale match can't linger over a now-different query.
      if (autoActiveRef.current) {
        autoActiveRef.current = false;
        setAutoActive(false);
        setResult(null);
        setError(null);
        setSearching(false);
        lastAutoNeedRef.current = null;
        onAutoStateChangeRef.current?.('idle');
      }
      return;
    }
    if (autoRunNeed === lastAutoNeedRef.current) return; // already matching/matched this need
    lastAutoNeedRef.current = autoRunNeed;
    autoActiveRef.current = true;
    setAutoActive(true);
    onAutoStateChangeRef.current?.('searching');
    const t = setTimeout(() => { void runRef.current(autoRunNeed, { auto: true }); }, 600);
    return () => clearTimeout(t);
  }, [autoRunNeed]);

  const act = async (s: AgentSearchSuggestion) => {
    const i = s.install;
    if (i.mode === 'store') {
      if (i.type === 'connector') { openApp('connectors'); return; } // token-paste lives in the Hub/shelf
      const target = installTargetFor(s);
      if (target) await install(target);
      return;
    }
    if (i.mode === 'starter-pack' && i.name) {
      setStartingPack(i.name);
      try {
        await adapter.installPack(i.name);
        toast({ title: 'Installed', description: `${s.name} is now active.` });
      } catch (e) {
        toast({ title: 'Install failed', description: describeError(e), variant: 'destructive' });
      } finally {
        setStartingPack(null);
      }
      return;
    }
    if (i.mode === 'open-in' && i.appId) openApp(i.appId);
  };

  const renderAction = (s: AgentSearchSuggestion) => {
    const i = s.install;
    const busy = (i.mode === 'store' && i.extensionId && isInstalling(i.extensionId)) ||
      (i.mode === 'starter-pack' && startingPack === i.name);
    if (i.mode === 'active') {
      return (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Check className="w-3 h-3" /> Available
        </span>
      );
    }
    const { label, Icon } =
      i.mode === 'open-in' ? { label: 'Open', Icon: ExternalLink }
        : i.type === 'connector' ? { label: 'Connect', Icon: Plug }
          : i.type === 'mcp' ? { label: 'Enable', Icon: Zap }
            : { label: 'Add', Icon: Download };
    return (
      <button
        onClick={() => void act(s)}
        disabled={Boolean(busy)}
        data-testid={`agent-search-act-${s.name}`}
        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-lg text-honey hover:bg-primary/10 transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
        {label}
      </button>
    );
  };

  const slots: Array<['connector' | 'skill' | 'tool', AgentSearchSuggestion | undefined]> =
    result ? [['connector', result.picks.connector], ['skill', result.picks.skill], ['tool', result.picks.tool]] : [];
  const anyPick = slots.some(([, s]) => s);

  return (
    <div data-testid="agent-search-box" className="space-y-2">
      <AskBar
        placeholder="Search — or describe what you need and press Enter…"
        onSubmit={(t) => void run(t)}
        onChange={onQueryChange}
        cmdkHint={false}
        submitVariant="search"
      />

      {!result && !searching && !error && !autoActive && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex}
              onClick={() => void run(ex)}
              data-testid={`agent-search-chip-${i}`}
              className="rounded-full px-2.5 py-0.5 text-[11px] bg-secondary/40 text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {/* Auto-match (NL bridge): the signature BeeLoader from settle through the
          in-flight match — no dead-end frame. Manual search keeps its arc spinner. */}
      {autoActive && !result && !error ? (
        <div data-testid="nl-matching" className="flex items-center gap-2 px-1">
          <BeeLoader size={28} label="Matching skills to this job" />
          <span className="text-[11px] text-muted-foreground">Matching skills to this job…</span>
        </div>
      ) : searching ? (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Finding the right capability…
        </p>
      ) : null}

      {error && (
        <p role="alert" className="text-[11px] text-destructive px-1">{error}</p>
      )}

      {/* Manual empty stays here; the auto-match empty defers to the host's
          "Closest in the catalog" + escape composition (Wave U Lane C §2). */}
      {result && !anyPick && !autoActive && (
        <p data-testid="agent-search-empty" className="text-[11px] text-muted-foreground px-1">
          No capability matched “{result.need}”. Try the shelves below.
        </p>
      )}

      {result && anyPick && (
        <div className="space-y-1.5">
          {autoActive && (
            <p data-testid="nl-matched-label" className="px-1 text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
              Matched to your request
            </p>
          )}
          {slots.map(([slot, s]) => s && (
            <div
              key={slot}
              data-testid={`agent-search-pick-${slot}`}
              className="flex items-start gap-3 p-2.5 rounded-xl border border-border/30 bg-secondary/20"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <StatusBadge tone="neutral" label={SLOT_LABEL[slot]} />
                  <span className="text-sm font-display font-medium text-foreground truncate">{s.name}</span>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{s.description}</p>
                {/* the deterministic "why" */}
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">{s.matchReason}</p>
              </div>
              <div className="shrink-0 self-center">{renderAction(s)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgentSearchBox;
