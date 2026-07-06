/**
 * AgentSearchBox — screen 09's centered agent-search bar (PR4 Variation A).
 * Type a need → POST /api/marketplace/agent-search → a "connector + skill +
 * tool" three-up, each with the engine's deterministic "why" and a one-click
 * action wired to the shared install store (so it reflects in the grid + count
 * bar). Connectors hand off to the Hub's token-paste; starter skills install
 * via the starter-pack path; native tools you already have read "Available".
 */
import { useState } from 'react';
import { Loader2, Plug, Zap, Download, ExternalLink, Check } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useInstallStore } from '@/providers/InstallProvider';
import { useToast } from '@/hooks/use-toast';
import { AskBar } from '@/components/os/warm/AskBar';
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

interface AgentSearchBoxProps {
  /** Live keystroke tap — the Marketplace uses this to filter the grid while
   *  the same input still answers NL intent on Enter (single smart input). */
  onQueryChange?: (q: string) => void;
}

const AgentSearchBox = ({ onQueryChange }: AgentSearchBoxProps = {}) => {
  const { install, isInstalling } = useInstallStore();
  const { toast } = useToast();
  const [result, setResult] = useState<AgentSearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingPack, setStartingPack] = useState<string | null>(null);

  const run = async (need: string) => {
    setSearching(true);
    setError(null);
    try {
      setResult(await adapter.agentSearch(need));
    } catch (e) {
      setError(describeError(e));
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

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

      {!result && !searching && !error && (
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

      {searching && (
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Finding the right capability…
        </p>
      )}

      {error && (
        <p role="alert" className="text-[11px] text-destructive px-1">{error}</p>
      )}

      {result && !anyPick && (
        <p data-testid="agent-search-empty" className="text-[11px] text-muted-foreground px-1">
          No capability matched “{result.need}”. Try the shelves below.
        </p>
      )}

      {result && anyPick && (
        <div className="space-y-1.5">
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
