import { Plus } from 'lucide-react';
import { getPersonaAvatar, type PersonaConfig } from '@/lib/personas';

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
};

/**
 * F-W5C sparse-state affordance for the Agent Center: click-to-create cards
 * over the persona catalog, shown under the list when the fleet is near-empty.
 * Presentational only — the parent owns the create flow (startFromPersona →
 * AgentBuilder → adapter.createAgent). H2 redesign: full-width, left-aligned
 * header, responsive card grid with the bee mascots front and center.
 */
const SuggestedAgentCards = ({ personas, onPick, allPersonas, onBrowseAll }: SuggestedAgentCardsProps) => {
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
        {personas.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="group flex h-full w-full flex-col rounded-[14px] border border-[var(--line-soft)] bg-card p-4 text-left transition-colors hover:border-[var(--honey-line)]"
            >
              <span className="mb-2.5 flex items-center gap-3">
                <img src={getPersonaAvatar(p.id)} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                <span className="text-[13.5px] font-display font-semibold text-foreground">{p.name}</span>
              </span>
              <span className="block text-[12px] leading-snug text-muted-foreground">{p.description}</span>
              {WHY[p.id] && (
                <span className="mt-1.5 block text-[11px] leading-snug text-muted-foreground/70">{WHY[p.id]}</span>
              )}
              <span className="mt-auto inline-flex items-center gap-1 pt-3 text-[12px] font-display font-semibold text-honey opacity-80 transition-opacity group-hover:opacity-100">
                <Plus className="h-3.5 w-3.5" /> Create
              </span>
            </button>
          </li>
        ))}
      </ul>
      {/* Round-4: quiet full-roster strip — every specialist at a glance, one
          tap into the Templates catalog. No new data fetch (static PERSONAS). */}
      {allPersonas && allPersonas.length > 0 && onBrowseAll && (
        <div className="mt-5" data-testid="persona-roster">
          <p className="text-[11px] font-display font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Meet all {allPersonas.length} specialists
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allPersonas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={onBrowseAll}
                title={p.name}
                aria-label={`${p.name} — browse all templates`}
                className="rounded-full transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary"
              >
                <img src={getPersonaAvatar(p.id)} alt="" className="h-7 w-7 rounded-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SuggestedAgentCards;
