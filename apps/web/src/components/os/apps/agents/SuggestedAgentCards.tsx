import { getPersonaAvatar, type PersonaConfig } from '@/lib/personas';

interface SuggestedAgentCardsProps {
  personas: PersonaConfig[];
  onPick: (persona: PersonaConfig) => void;
}

/**
 * F-W5C sparse-state affordance for the Agent Center: 2-3 click-to-create
 * cards over the persona catalog, shown under the list when the fleet is
 * near-empty. Presentational only — the parent owns the create flow
 * (startFromPersona → AgentBuilder → adapter.createAgent).
 */
const SuggestedAgentCards = ({ personas, onPick }: SuggestedAgentCardsProps) => {
  if (personas.length === 0) return null;
  return (
    <div className="mt-4 max-w-md mx-auto">
      <p className="text-[11px] font-display font-semibold text-primary/80 uppercase tracking-wider mb-1.5">
        Suggested agents
      </p>
      <ul className="space-y-1">
        {personas.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/30 border border-border/30 hover:border-primary/30 transition-colors text-left"
            >
              <img src={getPersonaAvatar(p.id)} alt="" className="w-8 h-8 rounded-full shrink-0 object-cover" />
              <span className="flex-1 min-w-0">
                <span className="block text-xs text-foreground truncate">{p.name}</span>
                <span className="block text-[11px] text-muted-foreground truncate">{p.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SuggestedAgentCards;
