import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ChevronRight, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { HintTooltip } from '@/components/ui/hint-tooltip';
import { fadeSlide, TEMPLATES } from './constants';
import { getTemplatesForTier } from '@/lib/onboarding-tier-filter';
import type { TemplateStepProps } from './types';

const TemplateStep = ({
  selectedTemplate,
  workspaceName,
  onSelectTemplate,
  onWorkspaceNameChange,
  selectedTier,
  goToStep,
}: TemplateStepProps) => {
  // Phase 4.1: at simple tier, default to the 3 essentials with a per-session
  // "Show all" toggle. Other tiers see the full 15 by default — no toggle needed.
  const [showAll, setShowAll] = useState(false);
  const isEssentialFiltered = selectedTier === 'simple' && !showAll;
  const visibleTemplates = isEssentialFiltered
    ? getTemplatesForTier('simple', TEMPLATES)
    : TEMPLATES;

  return (
  <motion.div key="step-4" {...fadeSlide}>
    <div className="text-center mb-6">
      <Sparkles className="w-10 h-10 text-primary mx-auto mb-3" />
      <h2 className="text-2xl font-display font-bold text-foreground mb-2">
        What are you working on?
      </h2>
      <p className="text-sm text-muted-foreground">
        Choose a template to pre-configure your first workspace
      </p>
    </div>

    {/* Agent explainer tip */}
    <div className="mb-5 flex items-start gap-3 px-4 py-3 rounded-xl bg-primary/5 border border-primary/20">
      <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-display font-medium text-foreground mb-0.5">Template = What your agent knows</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          This sets the <span className="text-foreground font-medium">domain, tools, and goals</span> for your workspace.
          In the next step, you'll choose <span className="text-foreground font-medium">how</span> the agent works — its personality and style. Together, they define your agent.
        </p>
      </div>
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-3">
      {visibleTemplates.map((t) => {
        const Icon = t.icon;
        const selected = selectedTemplate === t.id;
        return (
          // FR #40: hover tooltip carries the template description (the full
          // sentence that didn't fit under the small tile label). Lets users
          // confirm what each template includes — domain focus + suggested
          // first prompt — before committing the click.
          <HintTooltip key={t.id} content={`${t.desc}. First prompt: "${t.hint}"`}>
            <button
              onClick={() => onSelectTemplate(t.id, t.id === 'blank' ? '' : t.name)}
              className={`w-full flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
                selected
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-border/40 bg-secondary/20 hover:border-border'
              }`}
            >
              <Icon className={`w-5 h-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`text-xs font-display font-medium ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
                {t.name}
              </span>
            </button>
          </HintTooltip>
        );
      })}
    </div>

    {/* Phase 4.1: "Show all" reveal at simple tier — soft gate, never blocks. */}
    {selectedTier === 'simple' && (
      <button
        onClick={() => setShowAll(prev => !prev)}
        className="w-full mb-5 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors font-display"
      >
        <Layers className="w-3 h-3" />
        {showAll ? 'Show essentials only' : `Show all ${TEMPLATES.length} templates`}
      </button>
    )}

    {selectedTemplate && (
      <div className="mb-5">
        <label className="text-xs font-display text-muted-foreground mb-1.5 block">Workspace name</label>
        <Input
          value={workspaceName}
          onChange={e => onWorkspaceNameChange(e.target.value)}
          placeholder="My workspace"
          className="w-full bg-muted/30 rounded-xl"
        />
      </div>
    )}

    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={() => goToStep(3)}
          className="px-4 py-2.5 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => goToStep(5)}
          disabled={!selectedTemplate}
          className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-primary-foreground font-display text-sm font-semibold hover:bg-primary/80 disabled:opacity-40 transition-colors"
        >
          Continue <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      {/* FR #39: surface the disabled-state reason inline so users don't have
          to guess why the Continue button is greyed out. Disappears as soon as
          a template is picked. */}
      {!selectedTemplate && (
        <p className="text-[11px] text-muted-foreground/80 font-display text-right">
          Pick a template to continue
        </p>
      )}
    </div>
  </motion.div>
  );
};

export default TemplateStep;
