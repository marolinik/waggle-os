import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adapter } from '@/lib/adapter';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/**
 * Compact skill create dialog (UX-Refactor Phase 3B, S06). The full Skill
 * Builder (S19) is Phase 3C — this is the Center-side minimal create path
 * (PRD §22.1 "create a skill"): name, description, steps (one per line —
 * POST /api/skills/create requires a non-empty steps[]).
 *
 * Body-portaled (AppWindow's transform confines inline fixed overlays to the
 * window box) with useFocusTrap for Escape / Tab trap / focus restore.
 */
interface CreateSkillDialogProps {
  onCreated: (name: string) => void;
  onCancel: () => void;
  /** Shared 403→UpgradeModal routing. NOTE: POST /api/skills/create carries
   *  no requireTier gate today — this path goes live if/when the server gate
   *  lands (tier strategy: skills are the upgrade trigger). */
  onTierError: (err: unknown, name: string) => boolean;
}

const CreateSkillDialog = ({ onCreated, onCancel, onTierError }: CreateSkillDialogProps) => {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onCancel);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = stepsText.split('\n').map((s) => s.trim()).filter(Boolean);
  // Mirrors the server's normalization (lowercase, non-[a-z0-9] runs → '-'):
  // accept only names that survive it unchanged, so the created skill is
  // exactly the name the user typed (and the traversal guard is satisfied).
  const nameOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name.trim());
  const valid = nameOk && description.trim().length > 0 && steps.length > 0;

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await adapter.createSkill({ name: name.trim(), description: description.trim(), steps });
      onCreated(name.trim());
    } catch (err) {
      if (!onTierError(err, name.trim())) {
        setError(err instanceof Error ? err.message : 'Failed to create skill');
      }
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onCancel}
      data-testid="create-skill-dialog-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Create skill"
        className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
        data-testid="create-skill-dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-sm font-display font-semibold text-foreground">New skill</h3>
          <button onClick={onCancel} aria-label="Close create skill" className="p-1 rounded hover:bg-muted/50 text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Quick create — the full Skill Builder (inputs/outputs, tools, test runs) arrives in the next phase.
        </p>
        <div className="space-y-1">
          <label htmlFor="cs-name" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Name (lowercase letters, digits, single dashes)</label>
          <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. weekly-report" className="text-xs h-8" autoFocus />
        </div>
        <div className="space-y-1">
          <label htmlFor="cs-desc" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Description</label>
          <Input id="cs-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this skill do?" className="text-xs h-8" />
        </div>
        <div className="space-y-1">
          <label htmlFor="cs-steps" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Steps (one per line)</label>
          <Textarea
            id="cs-steps"
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            placeholder={'Gather this week\'s activity\nSummarise highlights\nDraft the report'}
            className="min-h-[100px] text-xs"
          />
        </div>
        {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
          <button
            onClick={() => void create()}
            disabled={busy || !valid}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            data-testid="create-skill-submit"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />} Create skill
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CreateSkillDialog;
