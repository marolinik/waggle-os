import { motion } from 'framer-motion';
import { Brain, ChevronRight, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
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

      <div className="grid grid-cols-4 gap-2 max-h-[280px] overflow-y-auto scrollbar-thin mb-4">
        {getPersonasForTemplate(selectedTemplate).map((p) => {
          const Icon = p.icon;
          const selected = selectedPersona === p.id;
          const isRecommended = TEMPLATE_PERSONA[selectedTemplate] === p.id;
          return (
            <button
              key={p.id}
              onClick={() => { onSelectPersona(p.id); onToggleCustomPersona(false); }}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all relative ${
                selected
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-border/40 bg-secondary/20 hover:border-border'
              }`}
            >
              {isRecommended && (
                <span className="absolute -top-1.5 -right-1.5 text-[11px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">
                  REC
                </span>
              )}
              <Icon className={`w-5 h-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-[11px] font-display font-medium leading-tight ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
                {p.name}
              </span>
              <span className="text-[11px] text-muted-foreground/70 leading-tight">{p.desc}</span>
            </button>
          );
        })}
      </div>

      {!showCustomPersona ? (
        <button
          onClick={() => onToggleCustomPersona(true)}
          className="w-full p-3 rounded-xl border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors font-display"
        >
          + Create Custom Persona
        </button>
      ) : (
        <div className="glass-strong rounded-xl p-4 space-y-3">
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

      <div className="flex items-center gap-3 mt-5">
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
    </motion.div>
  );
};

export default PersonaStep;
