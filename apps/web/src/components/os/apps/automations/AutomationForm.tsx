import { useState, useMemo } from 'react';
import { Info, Loader2, FlaskConical, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adapter } from '@/lib/adapter';
import type { Automation } from '@waggle/shared';
import {
  CRON_SCHEDULE_PRESETS,
  CRON_JOB_TYPES,
  DEFAULT_CRON_PRESET_ID,
  DEFAULT_CRON_JOB_TYPE,
  getCronPreset,
  presetForExpr,
  describeCronExpr,
  isPlausibleCronExpr,
  type CronJobType,
} from '@/lib/cron-presets';

/**
 * Automation create/edit form (UX-Refactor Phase 3B, S11 — the Center-side
 * minimal path; the full Builder S20 is Phase 3C). Extends the M-44 cron form
 * with the PRD automation vocabulary:
 *  - C24: trigger = Schedule (cron) or Manual (runs only via "Run now").
 *    Event triggers are not offered.
 *  - C25: condition is an ADVISORY note — stored and shown, never evaluated.
 *  - C26: "Check configuration" calls POST /api/automations/test, a
 *    VALIDATION-ONLY preview. It is a config check: nothing runs, nothing is
 *    saved — `executed` is always false.
 */
export interface AutomationDraft {
  name: string;
  trigger: { type: 'schedule' | 'manual'; cron?: string };
  condition?: string;
  jobType?: CronJobType;
  jobConfig?: Record<string, unknown>;
}

interface PreviewResult {
  ok: boolean;
  jobType: string;
  triggerType: string;
  issues: string[];
  executed: false;
  wouldRun: string;
  condition?: string;
}

interface AutomationFormProps {
  /** Present = edit mode (name/trigger/schedule/condition patch; jobType is Builder territory). */
  initial?: Automation;
  busy?: boolean;
  onSubmit: (draft: AutomationDraft) => void;
  onCancel: () => void;
}

const AutomationForm = ({ initial, busy, onSubmit, onCancel }: AutomationFormProps) => {
  const editMode = !!initial;
  const initialPreset = initial?.schedule ? presetForExpr(initial.schedule)?.id ?? 'custom' : DEFAULT_CRON_PRESET_ID;

  const [name, setName] = useState(initial?.name ?? '');
  const [triggerType, setTriggerType] = useState<'schedule' | 'manual'>(initial?.triggerType === 'manual' ? 'manual' : 'schedule');
  const [presetId, setPresetId] = useState<string>(initialPreset);
  const [customCronExpr, setCustomCronExpr] = useState(initialPreset === 'custom' ? initial?.schedule ?? '' : '');
  const [jobType, setJobType] = useState<CronJobType>(DEFAULT_CRON_JOB_TYPE);
  const [prompt, setPrompt] = useState('');
  const [condition, setCondition] = useState(initial?.condition ?? '');
  const [outputChannel, setOutputChannel] = useState<'log' | 'telegram'>('log');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const cronExpr = useMemo(() => {
    if (presetId === 'custom') return customCronExpr.trim();
    return getCronPreset(presetId)?.cronExpr ?? '';
  }, [presetId, customCronExpr]);
  const scheduleSummary = useMemo(() => describeCronExpr(cronExpr), [cronExpr]);
  const selectedJobType = useMemo(() => CRON_JOB_TYPES.find(j => j.id === jobType), [jobType]);

  const buildDraft = (): AutomationDraft => ({
    name: name.trim(),
    trigger: triggerType === 'manual' ? { type: 'manual' } : { type: 'schedule', cron: cronExpr },
    // C25: edit mode ALWAYS sends condition — an emptied field must reach the
    // PATCH as '' to clear the stored advisory note (the server keeps an
    // absent key unchanged, which made conditions unclearable).
    ...(editMode
      ? { condition: condition.trim() }
      : (condition.trim() ? { condition: condition.trim() } : {})),
    ...(editMode ? {} : {
      jobType,
      jobConfig: {
        ...(outputChannel !== 'log' ? { outputChannel } : {}),
        ...(jobType === 'agent_task' && prompt.trim() ? { prompt: prompt.trim() } : {}),
      },
    }),
  });

  // agent_task without a prompt would be created but silently skipped by the
  // executor — block it at create time (edit mode never touches jobType).
  const valid = name.trim().length > 0
    && (triggerType === 'manual' || isPlausibleCronExpr(cronExpr))
    && (editMode || jobType !== 'agent_task' || prompt.trim().length > 0);

  const runCheck = async () => {
    setPreviewLoading(true);
    try {
      // C26 edit-mode: the form deliberately omits jobType/jobConfig (Builder
      // territory), but the validator must judge the STORED job — not the
      // agent_task fallback (which phantom-flagged a missing prompt on every
      // edit-mode check). Send the row id (the server merges the draft over
      // the stored jobType/jobConfig) + actions as the jobType hint.
      const res = await adapter.testAutomation(
        editMode && initial
          ? { ...buildDraft(), id: initial.id, actions: initial.actions }
          : buildDraft(),
      );
      setPreview(res.previewResult as PreviewResult);
    } catch {
      setPreview({ ok: false, jobType, triggerType, issues: ['Configuration check unavailable — server unreachable'], executed: false, wouldRun: '' });
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2" data-testid="automation-form">
      <div className="space-y-1">
        <label htmlFor="af-name" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Automation name</label>
        <Input
          id="af-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Nightly memory consolidation"
          className="w-full bg-muted/30 h-auto py-1.5"
          autoFocus
        />
      </div>

      {/* C24: schedule-only v1 + manual. Event triggers are not offered. */}
      <div className="space-y-1">
        <label htmlFor="af-trigger" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Trigger</label>
        <select
          id="af-trigger"
          value={triggerType}
          onChange={e => setTriggerType(e.target.value as 'schedule' | 'manual')}
          data-testid="automation-trigger-type"
          className="w-full bg-muted/30 text-xs py-1.5 px-2 rounded-md border border-border/40 text-foreground"
        >
          <option value="schedule">On a schedule</option>
          <option value="manual">Manual — only when I press “Run now”</option>
        </select>
      </div>

      {!editMode && (
        <div className="space-y-1">
          <label htmlFor="af-jobtype" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">What it does</label>
          <select
            id="af-jobtype"
            value={jobType}
            onChange={e => setJobType(e.target.value as CronJobType)}
            data-testid="automation-job-type"
            className="w-full bg-muted/30 text-xs py-1.5 px-2 rounded-md border border-border/40 text-foreground"
          >
            {CRON_JOB_TYPES.map(j => (
              <option key={j.id} value={j.id}>{j.label}</option>
            ))}
          </select>
          {selectedJobType && (
            <p className="text-[10px] text-muted-foreground flex items-start gap-1 mt-0.5">
              <Info className="w-2.5 h-2.5 mt-0.5 shrink-0" /> {selectedJobType.description}
            </p>
          )}
          {jobType === 'agent_task' && (
            <Textarea
              aria-label="Agent task prompt"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Prompt the agent runs each time (required for agent tasks)"
              data-testid="automation-prompt"
              className="min-h-[60px] text-xs bg-muted/30"
            />
          )}
        </div>
      )}

      {triggerType === 'schedule' && (
        <div className="space-y-1">
          <label htmlFor="af-preset" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">When it runs</label>
          <select
            id="af-preset"
            value={presetId}
            onChange={e => setPresetId(e.target.value)}
            data-testid="automation-preset"
            className="w-full bg-muted/30 text-xs py-1.5 px-2 rounded-md border border-border/40 text-foreground"
          >
            {CRON_SCHEDULE_PRESETS.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
            <option value="custom">Custom cron expression…</option>
          </select>
          {presetId === 'custom' && (
            <Input
              aria-label="Custom cron expression"
              value={customCronExpr}
              onChange={e => setCustomCronExpr(e.target.value)}
              placeholder="e.g. 0 8 * * *"
              className="w-full bg-muted/30 text-xs font-mono h-auto py-1.5"
              data-testid="automation-custom-cron"
            />
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5" data-testid="automation-schedule-summary">
            {scheduleSummary}
          </p>
        </div>
      )}

      {/* C25: advisory only — stored and surfaced, never evaluated. */}
      <div className="space-y-1">
        <label htmlFor="af-condition" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Condition (advisory note)</label>
        <Input
          id="af-condition"
          value={condition}
          onChange={e => setCondition(e.target.value)}
          placeholder="e.g. only when the weekly report draft exists"
          className="w-full bg-muted/30 text-xs h-auto py-1.5"
          data-testid="automation-condition"
        />
        <p className="text-[10px] text-muted-foreground flex items-start gap-1 mt-0.5">
          <Info className="w-2.5 h-2.5 mt-0.5 shrink-0" /> Shown alongside the automation as guidance — it is not evaluated automatically.
        </p>
      </div>

      {!editMode && (
        <div className="space-y-1">
          <label htmlFor="af-output" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Where the result goes</label>
          <select
            id="af-output"
            value={outputChannel}
            onChange={e => setOutputChannel(e.target.value as 'log' | 'telegram')}
            data-testid="automation-output-channel"
            className="w-full bg-muted/30 text-xs py-1.5 px-2 rounded-md border border-border/40 text-foreground"
          >
            <option value="log">Notification + cockpit log</option>
            <option value="telegram">Telegram (requires Settings → Advanced → Telegram digest)</option>
          </select>
        </div>
      )}

      {/* C26 preview — a config CHECK, never a run. */}
      {preview && (
        <div
          role="status"
          data-testid="automation-test-preview"
          className={`rounded-lg border px-2.5 py-2 space-y-1 ${preview.ok ? 'border-border/60 bg-muted/30' : 'border-destructive/30 bg-destructive/10'}`}
        >
          <p className="text-[11px] font-medium flex items-center gap-1.5">
            {preview.ok
              ? <><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Configuration looks valid</>
              : <><AlertTriangle className="w-3 h-3 text-destructive" /> {preview.issues.length} issue{preview.issues.length === 1 ? '' : 's'} found</>}
          </p>
          {preview.issues.map((issue, i) => (
            <p key={i} className="text-[11px] text-destructive">• {issue}</p>
          ))}
          {preview.wouldRun && <p className="text-[10px] text-muted-foreground">{preview.wouldRun}</p>}
          {preview.condition && <p className="text-[10px] text-muted-foreground">Advisory condition: {preview.condition}</p>}
          <p className="text-[10px] text-muted-foreground">Validation only — nothing was executed or saved.</p>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSubmit(buildDraft())}
          disabled={busy || !valid}
          className="px-3 py-1 text-[11px] font-display rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="automation-form-submit"
        >
          {editMode ? 'Save changes' : 'Create'}
        </button>
        <button
          onClick={() => void runCheck()}
          disabled={previewLoading || !name.trim()}
          className="flex items-center gap-1 px-3 py-1 text-[11px] font-display rounded-lg bg-secondary/50 text-foreground hover:bg-secondary/70 disabled:opacity-50"
          data-testid="automation-form-test"
        >
          {previewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />} Check configuration
        </button>
        <button onClick={onCancel} className="px-3 py-1 text-[11px] font-display rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
      </div>
    </div>
  );
};

export default AutomationForm;
