import { Play, Pause, Loader2 } from 'lucide-react';
import type { Agent } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';
import { AGENT_STATE_META, formatSuccessRate, formatRelativeTime } from '@/lib/agent-center-display';
import { getPersonaAvatar } from '@/lib/personas';

/**
 * Agent Center list row (UX-Refactor Phase 3B, S09 — the "AgentCard" DS
 * variant; blueprint density rule says TABLE rows for Agents). Renders the
 * §12.9 at-a-glance fields: name, goal, type, model, status (§14.5 badge),
 * success rate, last run + Run/Pause actions.
 */
interface AgentCenterRowProps {
  agent: Agent;
  busy?: boolean;
  onOpen: (agent: Agent) => void;
  onRun: (agent: Agent) => void;
  onPause: (agent: Agent) => void;
}

const AgentCenterRow = ({ agent, busy, onOpen, onRun, onPause }: AgentCenterRowProps) => {
  const meta = AGENT_STATE_META[agent.status];
  const rate = typeof agent.successRate === 'number' ? agent.successRate : null;
  // Round-6 fix 4a — ONE truth for run history: a real lastRun timestamp shows
  // "run Xago"; "no runs yet" appears ONLY when there is genuinely no run.
  // (Previously "no runs yet" doubled as the null-sparkline placeholder and
  // contradicted a visible "run 23d ago" in the next column.)
  const lastRun = agent.lastRunAt && !Number.isNaN(Date.parse(agent.lastRunAt))
    ? formatRelativeTime(agent.lastRunAt)
    : null;
  return (
    <li className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 px-2.5 py-2 hover:bg-muted/50 transition-colors">
      <button
        onClick={() => onOpen(agent)}
        className="flex-1 min-w-0 flex items-center gap-2.5 text-left"
        aria-label={`Open agent ${agent.name}`}
      >
        {/* Wave S Lane E (brand): one illustration language — the persona's
            flat-geometric hex-bee, never a platform emoji (custom agents like
            "Editorial Critic" previously fell back to 🤖). Bare transparent PNG
            (no tile) so it reads as the same mascot family as the persona picker
            and chat turns; unmapped/custom personas fall back to general-purpose. */}
        {/* Wave T Lane F item 2: the bee responds on row hover — a 2px lift +
            ~3° tilt (transform only, motion-safe so reduced-motion stays still)
            so the daily fleet surface feels alive, not frozen. */}
        <img
          src={getPersonaAvatar(agent.personaId || 'general-purpose')}
          alt=""
          aria-hidden
          className="w-7 h-7 shrink-0 rounded-lg object-contain transition-transform duration-200 ease-out motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:-rotate-3"
        />
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-foreground truncate">{agent.name}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted/50 text-muted-foreground capitalize shrink-0">{agent.type}</span>
          </span>
          <span className="block text-[10px] text-muted-foreground truncate">{agent.goal}</span>
        </span>
        {/* Tidy fixed meta grid (model · last-run · success · status), one
            type size (11px, --text-muted — round-7 fix 3c raised the 10px
            whisper to the AA meta tier) so the cluster scans as columns. */}
        <span className="hidden sm:flex flex-col items-end gap-0.5 shrink-0 w-24">
          <span className="text-[11px] text-[var(--text-muted)] truncate max-w-full">{agent.model}</span>
          <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
            {lastRun ? `run ${lastRun}` : 'no runs yet'}
          </span>
        </span>
        <span
          className="hidden md:flex items-center gap-1.5 shrink-0 w-20"
          title={rate !== null ? 'Success rate over recorded runs' : undefined}
        >
          {rate !== null && (
            <>
              <span className="flex-1 h-1 rounded-full bg-muted/60 overflow-hidden" aria-hidden>
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(rate * 100)}%` }} />
              </span>
              <span className="text-[11px] text-[var(--text-muted)] tabular-nums">{formatSuccessRate(agent.successRate)}</span>
            </>
          )}
          {/* rate === null → empty fixed-width column; the run-history truth
              lives ONLY in the last-run slot above (no contradiction). */}
        </span>
        <StatusBadge tone={meta.tone} label={meta.label} />
      </button>
      {agent.status === 'running' ? (
        <button
          onClick={() => onPause(agent)}
          disabled={busy}
          aria-label={`Pause ${agent.name}`}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 shrink-0"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
        </button>
      ) : (
        <button
          onClick={() => onRun(agent)}
          disabled={busy || agent.status === 'archived'}
          aria-label={`Run ${agent.name}`}
          className="p-1.5 rounded-lg text-honey hover:bg-primary/10 transition-colors disabled:opacity-50 shrink-0"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
        </button>
      )}
    </li>
  );
};

export default AgentCenterRow;
