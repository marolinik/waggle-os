import { motion } from 'framer-motion';
import { Brain, ChevronRight, Loader2, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { fadeSlide, TEMPLATES, TEMPLATE_PERSONA, getPersonasForTemplate } from './constants';
import type { PersonaStepProps } from './types';

const PersonaStep = ({
  selectedTemplate,
  selectedPersona,
  onSelectPersona,
  showCustomPersona,
  onToggleCustomPersona,
  customPersonaName,
  customPersonaDesc,
  onCustomPersonaNameChange,
  onCustomPersonaDescChange,
  onCreateCustomPersona,
  creatingPersona,
  goToStep,
}: PersonaStepProps) => {
  const templateName = selectedTemplate
    ? TEMPLATES.find(t => t.id === selectedTemplate)?.name
    : 'Blank';

  return (
    <motion.div key="step-5" {...fadeSlide}>
      <div className="text-center mb-6">
        <h2 className="text-2xl font-display font-bold text-foreground mb-2">
          How should I work?
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose a working style for your agent
        </p>
      </div>

      {/* Agent explainer tip */}
      <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
        <Brain className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-display font-medium text-foreground mb-0.5">Persona = How your agent thinks</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This sets the agent's <span className="text-foreground font-medium">tone, reasoning style, and specialization</span>.
            Combined with the template you chose ({templateName}), this creates your unique agent.
          </p>
        </div>
      </div>

      {/* FR #43: previously a `scrollbar-thin` rail with no visual cue that the
          grid clipped. Now we wrap the grid in a relative container, surface a
          subtle gradient + chevron at the bottom when more rows exist below
          the fold, and keep the scrollbar thin for taste. */}
      {(() => {
        const personas = getPersonasForTemplate(selectedTemplate);
        const overflowing = personas.length > 8; // 4 cols × 2 rows visible at once
        return (
          <div className="relative mb-4">
            <div className="grid grid-cols-4 gap-2 max-h-[280px] overflow-y-auto scrollbar-thin pr-1">
              {personas.map((p) => {
                const Icon = p.icon;
                const selected = selectedPersona === p.id;
                const isRecommended = TEMPLATE_PERSONA[selectedTemplate] === p.id;
                return (
                  <HintTooltip key={p.id} content={p.desc}>
                    <button
                      onClick={() => { onSelectPersona(p.id); onToggleCustomPersona(false); }}
                      className={`w-full flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all relative ${
                        selected
                          ? 'border-primary/60 bg-primary/10'
                          : 'border-border/40 bg-secondary/20 hover:border-border'
                      }`}
                    >
                      {isRecommended && (
                        // FR #42: REC badge tooltip — surfaces the rationale
                        // ("recommended based on the template you picked")
                        // for users who don't know what the orange chip means.
                        <HintTooltip content="Recommended based on your template choice.">
                          <span className="absolute -top-1.5 -right-1.5 text-[11px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold cursor-help">
                            REC
                          </span>
                        </HintTooltip>
                      )}
                      <Icon className={`w-5 h-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className={`text-[11px] font-display font-medium leading-tight ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {p.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground/70 leading-tight">{p.desc}</span>
                    </button>
                  </HintTooltip>
                );
              })}
            </div>
            {overflowing && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent flex items-end justify-center pb-0.5">
                <ChevronDown className="w-3 h-3 text-muted-foreground/60 animate-bounce" />
              </div>
            )}
          </div>
        );
      })()}

      {!showCustomPersona ? (
        <button
          onClick={() => onToggleCustomPersona(true)}
          className="w-full p-3 rounded-xl border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors font-display"
        >
          + Create Custom Persona
        </button>
      ) : (
        <div className="glass-strong rounded-xl p-4 space-y-3">
          {/* FR #44: previous flow surfaced two empty inputs with no context.
              The inline hint explains WHAT a custom persona does and roughly
              HOW LONG creating one takes — sets expectations before the user
              decides to invest in writing prompt copy. */}
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Create your own persona by describing tone, expertise, and behaviours.
            Takes ~2 minutes. The description becomes the system prompt your
            agent uses on every turn.
          </p>
          <Input
            value={customPersonaName}
            onChange={e => onCustomPersonaNameChange(e.target.value)}
            placeholder="Persona name"
            className="w-full bg-muted/30"
          />
          <textarea
            value={customPersonaDesc}
            onChange={e => onCustomPersonaDescChange(e.target.value)}
            placeholder="Describe how this persona should work…"
            rows={3}
            className="w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onToggleCustomPersona(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onCreateCustomPersona}
              disabled={!customPersonaName.trim() || creatingPersona}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors"
            >
              {creatingPersona ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Create Persona
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 mt-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => goToStep(4)}
            className="px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => goToStep(6)}
            disabled={!selectedPersona}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:opacity-40 transition-colors"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        {/* FR #39: surface the disabled-state reason inline. Same pattern as
            TemplateStep so the wizard reads consistent across steps. */}
        {!selectedPersona && (
          <p className="text-[11px] text-muted-foreground/80 font-display text-right">
            Pick a persona to continue
          </p>
        )}
      </div>
    </motion.div>
  );
};

export default PersonaStep;
