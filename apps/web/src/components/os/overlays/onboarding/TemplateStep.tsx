import { motion } from 'framer-motion';
import { Sparkles, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { fadeSlide, TEMPLATES } from './constants';
import type { TemplateStepProps } from './types';

const TemplateStep = ({
  selectedTemplate,
  workspaceName,
  onSelectTemplate,
  onWorkspaceNameChange,
  goToStep,
}: TemplateStepProps) => (
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

    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-5">
      {TEMPLATES.map((t) => {
        const Icon = t.icon;
        const selected = selectedTemplate === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelectTemplate(t.id, t.id === 'blank' ? '' : t.name)}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
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
        );
      })}
    </div>

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
  </motion.div>
);

export default TemplateStep;
