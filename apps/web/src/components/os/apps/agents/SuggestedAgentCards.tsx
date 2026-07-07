import { useReducedMotion } from 'framer-motion';
import { Plus, ArrowRight } from 'lucide-react';
import { getPersonaAvatar, type PersonaConfig } from '@/lib/personas';
import { STAGGER } from '@/lib/motion/tokens';

/** Phase-0.6 retrofit: per-card entrance cadence in ms from the motion
 *  vocabulary (STAGGER.list = 0.04s). Pre-scaled ONCE so `index * ms` stays an
 *  exact integer (`index * STAGGER.list * 1000` drifts on float). */
const STAGGER_LIST_MS = STAGGER.list * 1000;

interface SuggestedAgentCardsProps {
  personas: PersonaConfig[];
  onPick: (persona: PersonaConfig) => void;
  /** Full persona catalog for the quiet below-the-fold roster strip (round-4);
   *  omit either prop to hide it. The parent owns navigation to Templates. */
  allPersonas?: PersonaConfig[];
  onBrowseAll?: () => void;
}

/** One warm "why this one" line per curated persona (H2: cards need a reason,
 *  not just a role). Falls back to nothing for uncurated ids — never invented. */
const WHY: Record<string, string> = {
  researcher: 'A strong first hire — every investigation it runs feeds your hive memory.',
  writer: 'Turns what the hive already knows into drafts you can ship.',
  analyst: 'Reads your numbers and surfaces the patterns worth acting on.',
  planner: 'Maps the work before anyone commits — plans your other agents can execute.',
  coder: 'Builds, debugs, and reviews code with your project context behind it.',
  consultant: 'Research, analysis, and client-ready deliverables in one specialist.',
};

/**
 * F-W5C sparse-state affordance for the Agent Center: click-to-create cards
 * over the persona catalog, shown under the list when the fleet is near-empty.
 * Presentational only — the parent owns the create flow (startFromPersona →
 * AgentBuilder → adapter.createAgent). H2 redesign: full-width, left-aligned
 * header, responsive card grid with the bee mascots front and center.
 */
const SuggestedAgentCards = ({ personas, onPick, allPersonas, onBrowseAll }: SuggestedAgentCardsProps) => {
  // Wave W (Lane A) item 2: the suggested bee cards share the shelf's entrance
  // grammar — the memory `card-enter` keyframe (8px rise + fade, --mo-ease),
  // ~40ms stagger, capped so the last card settles ≤500ms; the roster strip
  // follows one beat after the last card. `backwards` fill holds the hidden
  // start-state through the delay without pinning the cards' hover -translate
  // tier. Reduced motion opts out entirely (instant, no rise/fade).
  const reduceMotion = !!useReducedMotion();
  const stripDelayMs = (Math.min(personas.length - 1, 4) + 1) * STAGGER_LIST_MS;
  if (personas.length === 0) return null;
  return (
    <div className="mt-5" data-testid="suggested-agents">
      <p className="text-[11px] font-display font-semibold text-honey/80 uppercase tracking-wider mb-1">
        Suggested agents
      </p>
      <p className="text-[13px] text-muted-foreground mb-3">
        Your hive is quiet — spawn a specialist and put it to work.
      </p>
      <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-3">
        {personas.map((p, i) => (
          <li
            key={p.id}
            style={reduceMotion ? undefined : { animation: 'card-enter var(--mo-slow) var(--mo-ease) backwards', animationDelay: `${Math.min(i, 4) * STAGGER_LIST_MS}ms` }}
          >
            <button
              type="button"
              onClick={() => onPick(p)}
              className="hive-interactive group relative flex h-full w-full flex-col overflow-hidden rounded-[14px] border border-[var(--line-soft)] bg-card p-4 text-left shadow-[var(--shadow-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
            >
              {/* Wave T Lane F item 1: honey top hairline that blooms on
                  hover/focus — the perceivable delta the video judges missed
                  ("pixel-identical frames"). */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-0 transition-opacity duration-[var(--mo-fast)] group-hover:opacity-100 group-focus-visible:opacity-100"
                style={{ background: 'color-mix(in srgb, var(--honey) 70%, transparent)' }}
              />
              <span className="mb-2.5 flex items-center gap-3">
                {/* Item 2: the bee responds — a 2px lift + ~3° tilt on card hover
                    (transform only, motion-safe so reduced-motion stays still). */}
                <img
                  src={getPersonaAvatar(p.id)}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full object-cover transition-transform duration-[var(--mo-base)] ease-[var(--mo-ease)] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:-rotate-3"
                />
                <span className="text-[13.5px] font-display font-semibold text-foreground">{p.name}</span>
              </span>
              <span className="block text-[12px] leading-snug text-muted-foreground">{p.description}</span>
              {WHY[p.id] && (
                // Wave U Lane E (item 1): the "why this one" whisper line was
                // text-muted-foreground/70 (~2.3:1 dark / ~3.0:1 light — sub-AA).
                // Drop the /70 to the full --muted-foreground token (~6.1:1 dark,
                // ~5.7:1 light); the 11px size + spacing keep it subordinate to
                // the 12px description without falling below the AA text floor.
                <span className="mt-1.5 block text-[11px] leading-snug text-muted-foreground">{WHY[p.id]}</span>
              )}
              <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[12px] font-display font-semibold text-honey">
                <Plus className="h-3.5 w-3.5" /> Create
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/* Round-6 fix 4b: the old per-persona thumbnail strip read as "22
          indistinguishable circles" — replaced by ONE affordance: a compact
          browse-all card with a small overlapping avatar sample + the count.
          Names live in the Templates catalog it opens. No new data fetch. */}
      {allPersonas && allPersonas.length > 0 && onBrowseAll && (
        <div
          className="mt-5"
          data-testid="persona-roster"
          style={reduceMotion ? undefined : { animation: 'card-enter var(--mo-slow) var(--mo-ease) backwards', animationDelay: `${stripDelayMs}ms` }}
        >
          <button
            type="button"
            onClick={onBrowseAll}
            className="hive-interactive group relative flex w-full items-center gap-3 overflow-hidden rounded-[14px] border border-[var(--line-soft)] bg-card px-4 py-3 text-left shadow-[var(--shadow-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--honey-line)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
          >
            {/* Wave T Lane F item 1: same honey top hairline as the bee cards. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px] opacity-0 transition-opacity duration-[var(--mo-fast)] group-hover:opacity-100 group-focus-visible:opacity-100"
              style={{ background: 'color-mix(in srgb, var(--honey) 70%, transparent)' }}
            />
            <span className="flex shrink-0 -space-x-2.5" aria-hidden>
              {allPersonas.slice(0, 5).map((p) => (
                <img
                  key={p.id}
                  src={getPersonaAvatar(p.id)}
                  alt=""
                  className="h-8 w-8 rounded-full border-2 border-card object-cover"
                />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-display font-semibold text-foreground">
                Browse all {allPersonas.length} specialists
              </span>
              <span className="block text-[11.5px] text-muted-foreground">
                Every role in the Templates catalog — pick one and put it to work.
              </span>
            </span>
            {/* Wave V (Lane C) item 2: the → rides at rest as a dim honey hint
                (not hover-only), brightening + nudging on hover AND focus-visible
                (keyboard parity), so the "browse all" affordance is legible when
                idle. */}
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-honey/60 transition-all duration-[var(--mo-fast)] group-hover:translate-x-0.5 group-hover:text-honey group-focus-visible:translate-x-0.5 group-focus-visible:text-honey" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
};

export default SuggestedAgentCards;
