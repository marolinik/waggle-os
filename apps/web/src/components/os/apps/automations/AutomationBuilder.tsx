import { useState, useEffect, useMemo } from 'react';
import { Info, Loader2, FlaskConical, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BuilderStepper, type BuilderStep } from '@/components/ui/stepper';
import { ApprovalModal, type ApprovalRequest } from '@/components/ui/approval-modal';
import { actionRisk } from '@/lib/risk-display';
import { adapter } from '@/lib/adapter';
import type { Automation } from '@waggle/shared';
import type { Workspace } from '@/lib/types';
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
 * Automation Builder (UX-Refactor Phase 3C, S20 — PRD §12.10). The 3B
 * AutomationForm extracted/extended into the 4-step stepper: Trigger →
 * Action → Condition → Review & activate.
 *
 * Contracts honoured (carried over from the form):
 *  - C24: trigger = Schedule (cron) or Manual. Event triggers are not offered.
 *  - C25: condition is an ADVISORY note — stored and shown, never evaluated.
 *    Edit mode ALWAYS sends it (an emptied field must reach the PATCH as ''
 *    to clear the stored note).
 *  - C26: "Check configuration" calls POST /api/automations/test — a
 *    VALIDATION-ONLY preview; nothing runs, nothing is saved.
 *
 * New in 3C:
 *  - Edit mode reads the stored jobType/jobConfig via the cron list (the
 *    automations GET projects them away; GET /api/cron rows round-trip both),
 *    so the action prompt/output channel are now EDITABLE — the jobConfig
 *    patch merges server-side over the stored blob. The job TYPE itself stays
 *    read-only: neither PATCH /api/automations/:id nor PATCH /api/cron/:id
 *    accepts a jobType change (switching types = create a new automation).
 *  - agent_task automations route through the ApprovalModal before activate
 *    (the one job type that spawns an agent run on a schedule).
 *  - Create mode offers a workspace scope picker (POST accepts workspaceId).
 */
export interface AutomationDraft {
  name: string;
  trigger: { type: 'schedule' | 'manual'; cron?: string };
  condition?: string;
  jobType?: CronJobType;
  jobConfig?: Record<string, unknown>;
  workspaceId?: string;
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

interface AutomationBuilderProps {
  /** Present = edit mode. */
  initial?: Automation;
  busy?: boolean;
  onSubmit: (draft: AutomationDraft) => void;
  onCancel: () => void;
}

/** Server-side placeholder cron stored on MANUAL rows (automations.ts) — it
 * must never seed the custom-expression field, or flipping manual→schedule
 * silently saves a yearly Jan-1 schedule the summary doesn't expose. */
const MANUAL_CRON_PLACEHOLDER = '0 0 1 1 *';

const AutomationBuilder = ({ initial, busy, onSubmit, onCancel }: AutomationBuilderProps) => {
  const editMode = !!initial;
  const storedCron = initial?.schedule?.trim().replace(/\s+/g, ' ');
  const initialPreset =
    initial?.schedule && !(initial.triggerType === 'manual' && storedCron === MANUAL_CRON_PLACEHOLDER)
      ? presetForExpr(initial.schedule)?.id ?? 'custom'
      : DEFAULT_CRON_PRESET_ID;

  const [step, setStep] = useState(0);
  // Trigger
  const [name, setName] = useState(initial?.name ?? '');
  const [triggerType, setTriggerType] = useState<'schedule' | 'manual'>(initial?.triggerType === 'manual' ? 'manual' : 'schedule');
  const [presetId, setPresetId] = useState<string>(initialPreset);
  const [customCronExpr, setCustomCronExpr] = useState(initialPreset === 'custom' ? initial?.schedule ?? '' : '');
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  // Action
  const [jobType, setJobType] = useState<CronJobType>(DEFAULT_CRON_JOB_TYPE);
  const [prompt, setPrompt] = useState('');
  const [outputChannel, setOutputChannel] = useState<'log' | 'telegram'>('log');
  /** Edit mode: stored jobType/jobConfig loaded from the cron row. */
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configUnavailable, setConfigUnavailable] = useState(false);
  // Condition
  const [condition, setCondition] = useState(initial?.condition ?? '');
  // Review
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);

  // Workspace catalog for the create-mode scope picker + edit-mode label.
  useEffect(() => {
    let cancelled = false;
    adapter.getWorkspaces()
      .then((rows) => { if (!cancelled) setWorkspaces(rows); })
      .catch(() => { /* picker degrades to "All workspaces" only */ });
    return () => { cancelled = true; };
  }, []);

  // Edit mode: source the stored jobType/jobConfig from the cron list — the
  // /api/automations rows project them away; the cron rows round-trip both
  // (automation id === cron row id stringified).
  useEffect(() => {
    if (!initial) return;
    let cancelled = false;
    adapter.getCronJobs()
      .then((rows) => {
        if (cancelled) return;
        const row = rows.find((r) => r.id === initial.id);
        if (!row || !row.jobType) { setConfigUnavailable(true); return; }
        setJobType(row.jobType as CronJobType);
        const jc = row.jobConfig ?? {};
        if (typeof jc.prompt === 'string') setPrompt(jc.prompt);
        setOutputChannel(jc.outputChannel === 'telegram' ? 'telegram' : 'log');
        setConfigLoaded(true);
      })
      .catch(() => { if (!cancelled) setConfigUnavailable(true); });
    return () => { cancelled = true; };
  }, [initial]);

  /** Edit mode, cron read still in flight — neither loaded nor failed. */
  const configPending = editMode && !configLoaded && !configUnavailable;
  /** The stored job type as projected by /api/automations (actions defaults
   * to [row.jobType] server-side) — lets the approval gate work even when
   * the cron read is pending or failed. */
  const storedJobType = initial?.actions?.[0];

  const cronExpr = useMemo(() => {
    if (presetId === 'custom') return customCronExpr.trim();
    return getCronPreset(presetId)?.cronExpr ?? '';
  }, [presetId, customCronExpr]);
  const scheduleSummary = useMemo(() => describeCronExpr(cronExpr), [cronExpr]);
  const selectedJobType = useMemo(() => CRON_JOB_TYPES.find((j) => j.id === jobType), [jobType]);

  // A C26 verdict describes ONE draft snapshot — invalidate it whenever any
  // draft-relevant field changes (the stepper makes edit-after-check
  // mainstream: the edit happens on a different step than the verdict).
  useEffect(() => {
    setPreview(null);
  }, [name, triggerType, cronExpr, jobType, prompt, outputChannel, condition]);

  const buildDraft = (): AutomationDraft => ({
    name: name.trim(),
    trigger: triggerType === 'manual' ? { type: 'manual' } : { type: 'schedule', cron: cronExpr },
    // C25: edit mode ALWAYS sends condition — an emptied field must reach the
    // PATCH as '' to clear the stored advisory note.
    ...(editMode
      ? { condition: condition.trim() }
      : (condition.trim() ? { condition: condition.trim() } : {})),
    ...(editMode
      ? (configLoaded
        ? {
          // Merged server-side over the stored blob. outputChannel is always
          // explicit (same clearability rationale as condition); the prompt
          // only applies to agent_task jobs.
          jobConfig: {
            outputChannel,
            ...(jobType === 'agent_task' && prompt.trim() ? { prompt: prompt.trim() } : {}),
          },
        }
        : {}) // stored config unreadable — leave the blob untouched
      : {
        jobType,
        jobConfig: {
          ...(outputChannel !== 'log' ? { outputChannel } : {}),
          ...(jobType === 'agent_task' && prompt.trim() ? { prompt: prompt.trim() } : {}),
        },
        // agent_task REQUIRES a workspace id at the store layer; '*' is the
        // executor's fan-out-to-all sentinel, so "All workspaces" maps to it.
        // Other job types keep the omit-when-global convention.
        ...(workspaceId
          ? { workspaceId }
          : jobType === 'agent_task' ? { workspaceId: '*' } : {}),
      }),
  });

  // agent_task without a prompt would be created but silently skipped by the
  // executor — block it whenever the prompt is editable. While the edit-mode
  // cron read is PENDING the step is invalid: the review surface would show
  // the default job type for ANY stored automation, and saving must wait for
  // loaded-or-unavailable (Phase-3C review — hydration race).
  const promptOk = jobType !== 'agent_task' || prompt.trim().length > 0;
  const actionValid = editMode
    ? (configPending ? false : (configLoaded ? promptOk : true))
    : promptOk;

  const steps: BuilderStep[] = [
    { id: 'trigger', label: 'Trigger', valid: name.trim().length > 0 && (triggerType === 'manual' || isPlausibleCronExpr(cronExpr)) },
    { id: 'action', label: 'Action', valid: actionValid },
    { id: 'condition', label: 'Condition', valid: true },
    { id: 'review', label: editMode ? 'Review & save' : 'Review & activate', valid: true },
  ];

  const runCheck = async () => {
    setPreviewLoading(true);
    try {
      // C26 edit-mode: send the row id so the server merges the draft over the
      // stored jobType/jobConfig and judges the REAL job (jobType itself is
      // never sent on edit — it is not patchable).
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

  const finish = () => {
    // Elevated action gate: agent_task runs an agent on a schedule — review
    // it before it goes live. (The risky-job-type mapping beyond agent_task
    // is unratified — S20 Q6.) In edit mode the gate must NOT depend on the
    // cron read succeeding: when the stored config couldn't be loaded, fall
    // back to the job type projected into `initial.actions` so a stored
    // agent_task never saves unreviewed (Phase-3C review — §17.3 fail-open).
    const isAgentTask = editMode
      ? (configLoaded ? jobType === 'agent_task' : storedJobType === 'agent_task')
      : jobType === 'agent_task';
    if (isAgentTask) {
      setApproval({
        action: editMode
          ? `Save "${name.trim()}" — it runs an agent task ${triggerType === 'manual' ? 'when triggered manually' : `on schedule (${scheduleSummary})`}.`
          : `Activate "${name.trim()}" — it will run an agent task ${triggerType === 'manual' ? 'when triggered manually' : `on schedule (${scheduleSummary})`}.`,
        scope: editMode && !configLoaded
          ? [
            'Agent prompt: stored prompt (could not be read — saving keeps it unchanged)',
            'Result goes to: stored channel (unchanged)',
          ]
          : [
            `Agent prompt: ${prompt.trim().slice(0, 120)}${prompt.trim().length > 120 ? '…' : ''}`,
            `Result goes to: ${outputChannel === 'telegram' ? 'Telegram' : 'notification + cockpit log'}`,
          ],
        riskLevel: actionRisk('automation-activation'),
      });
      return;
    }
    onSubmit(buildDraft());
  };

  const wsLabel = (id?: string) => {
    if (!id || id === '*') return 'All workspaces';
    return workspaces.find((w) => w.id === id)?.name ?? id;
  };
  // Single source for the active panel — the same `steps` array that drives
  // the stepper pills (a separate STEP_IDS const could silently desync).
  const stepId = steps[step]?.id;
  /** Edit-mode action label honest about the load state — never the default
   * job type while the stored one is unknown. */
  const storedActionLabel = configUnavailable
    ? 'Stored action (configuration unavailable)'
    : configPending
      ? 'Loading stored action…'
      : (selectedJobType?.label ?? jobType);

  return (
    <>
      <BuilderStepper
        title={editMode ? 'Edit automation' : 'Automation Builder'}
        subtitle="Schedule background work — overnight runs stay visible, reviewable and stoppable."
        steps={steps}
        current={step}
        onNavigate={setStep}
        onCancel={onCancel}
        onFinish={finish}
        finishLabel={editMode ? 'Save changes' : 'Activate'}
        busy={busy}
        testId="automation-builder"
        footerExtra={stepId === 'review' ? (
          <button
            onClick={() => void runCheck()}
            disabled={previewLoading || !name.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-secondary/50 text-foreground hover:bg-secondary/70 disabled:opacity-50"
            data-testid="automation-builder-check"
          >
            {previewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />} Check configuration
          </button>
        ) : undefined}
      >
        {stepId === 'trigger' && (
          <>
            <div className="space-y-1">
              <label htmlFor="aub-name" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Automation name</label>
              <Input id="aub-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nightly memory consolidation" className="text-xs h-8" autoFocus />
            </div>
            {/* C24: schedule-only v1 + manual. Event triggers are not offered. */}
            <div className="space-y-1">
              <label htmlFor="aub-trigger" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Trigger</label>
              <select
                id="aub-trigger"
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as 'schedule' | 'manual')}
                data-testid="automation-trigger-type"
                className="w-full bg-muted/30 text-xs py-1.5 px-2 rounded-md border border-border/40 text-foreground"
              >
                <option value="schedule">On a schedule</option>
                <option value="manual">Manual — only when I press “Run now”</option>
              </select>
            </div>
            {triggerType === 'schedule' && (
              <div className="space-y-1">
                <label htmlFor="aub-preset" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">When it runs</label>
                <select
                  id="aub-preset"
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                  data-testid="automation-preset"
                  className="w-full bg-muted/30 text-xs py-1.5 px-2 rounded-md border border-border/40 text-foreground"
                >
                  {CRON_SCHEDULE_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                  <option value="custom">Custom cron expression…</option>
                </select>
                {presetId === 'custom' && (
                  <Input
                    aria-label="Custom cron expression"
                    value={customCronExpr}
                    onChange={(e) => setCustomCronExpr(e.target.value)}
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
            <div className="space-y-1">
              {/* Edit mode renders a read-only value — a <label> with htmlFor
                  pointing at no control is invalid HTML (WCAG 1.3.1), so the
                  heading is only a <label> when the <select> exists. */}
              {editMode ? (
                <>
                  <span className="block text-[10px] font-display uppercase tracking-wide text-muted-foreground">Workspace scope</span>
                  <p className="text-xs text-foreground/90">{wsLabel(initial?.workspaceId)} <span className="text-[10px] text-muted-foreground">(set at creation)</span></p>
                </>
              ) : (
                <>
                <label htmlFor="aub-workspace" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Workspace scope</label>
                <select
                  id="aub-workspace"
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  data-testid="automation-workspace"
                  className="w-full bg-muted/30 text-xs py-1.5 px-2 rounded-md border border-border/40 text-foreground"
                >
                  <option value="">All workspaces</option>
                  {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                </>
              )}
            </div>
          </>
        )}

        {stepId === 'action' && (
          <>
            {editMode && configUnavailable && (
              <p role="status" className="text-[11px] text-amber-400" data-testid="automation-builder-config-unavailable">
                The stored action configuration could not be read — saving will keep it unchanged.
              </p>
            )}
            <div className="space-y-1">
              {/* Same WCAG 1.3.1 rule as the workspace block: only a <label>
                  when the <select> control exists. */}
              {editMode ? (
                <>
                  <span className="block text-[10px] font-display uppercase tracking-wide text-muted-foreground">What it does</span>
                  <p className="text-xs text-foreground/90">
                    {storedActionLabel}
                    <span className="block text-[10px] text-muted-foreground mt-0.5">
                      The action type can’t be changed after creation — create a new automation to switch types.
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <label htmlFor="aub-jobtype" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">What it does</label>
                  <select
                    id="aub-jobtype"
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value as CronJobType)}
                    data-testid="automation-job-type"
                    className="w-full bg-muted/30 text-xs py-1.5 px-2 rounded-md border border-border/40 text-foreground"
                  >
                    {CRON_JOB_TYPES.map((j) => (
                      <option key={j.id} value={j.id}>{j.label}</option>
                    ))}
                  </select>
                  {selectedJobType && (
                    <p className="text-[10px] text-muted-foreground flex items-start gap-1 mt-0.5">
                      <Info className="w-2.5 h-2.5 mt-0.5 shrink-0" /> {selectedJobType.description}
                    </p>
                  )}
                </>
              )}
            </div>
            {jobType === 'agent_task' && (!editMode || configLoaded) && (
              <div className="space-y-1">
                <label htmlFor="aub-prompt" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Agent task prompt</label>
                <Textarea
                  id="aub-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Prompt the agent runs each time (required for agent tasks)"
                  data-testid="automation-prompt"
                  className="min-h-[60px] text-xs bg-muted/30"
                />
              </div>
            )}
            {(!editMode || configLoaded) && (
              <div className="space-y-1">
                <label htmlFor="aub-output" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Where the result goes</label>
                <select
                  id="aub-output"
                  value={outputChannel}
                  onChange={(e) => setOutputChannel(e.target.value as 'log' | 'telegram')}
                  data-testid="automation-output-channel"
                  className="w-full bg-muted/30 text-xs py-1.5 px-2 rounded-md border border-border/40 text-foreground"
                >
                  <option value="log">Notification + cockpit log</option>
                  <option value="telegram">Telegram (requires Settings → Advanced → Telegram digest)</option>
                </select>
              </div>
            )}
          </>
        )}

        {stepId === 'condition' && (
          /* C25: advisory only — stored and surfaced, never evaluated. */
          <div className="space-y-1">
            <label htmlFor="aub-condition" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Condition (advisory note, optional)</label>
            <Input
              id="aub-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              placeholder="e.g. only when the weekly report draft exists"
              className="w-full bg-muted/30 text-xs h-auto py-1.5"
              data-testid="automation-condition"
            />
            <p className="text-[10px] text-muted-foreground flex items-start gap-1 mt-0.5">
              <Info className="w-2.5 h-2.5 mt-0.5 shrink-0" /> Shown alongside the automation as guidance — it is not evaluated automatically.
            </p>
          </div>
        )}

        {stepId === 'review' && (
          <div className="space-y-3" data-testid="automation-builder-review">
            <div className="space-y-1 text-[11px]">
              <p><span className="text-muted-foreground">Name:</span> <span className="text-foreground/90">{name.trim()}</span></p>
              <p>
                <span className="text-muted-foreground">Trigger:</span>{' '}
                <span className="text-foreground/90">
                  {triggerType === 'manual' ? 'Manual — runs only via “Run now”' : scheduleSummary}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Action:</span>{' '}
                <span className="text-foreground/90">
                  {editMode ? storedActionLabel : (selectedJobType?.label ?? jobType)}
                </span>
              </p>
              {jobType === 'agent_task' && prompt.trim() && (
                <p><span className="text-muted-foreground">Prompt:</span> <span className="text-foreground/90">{prompt.trim().slice(0, 160)}{prompt.trim().length > 160 ? '…' : ''}</span></p>
              )}
              {(!editMode || configLoaded) && (
                <p><span className="text-muted-foreground">Result goes to:</span> <span className="text-foreground/90">{outputChannel === 'telegram' ? 'Telegram' : 'Notification + cockpit log'}</span></p>
              )}
              <p><span className="text-muted-foreground">Condition:</span> <span className="text-foreground/90">{condition.trim() || 'None'}</span></p>
              <p><span className="text-muted-foreground">Workspace:</span> <span className="text-foreground/90">{editMode ? wsLabel(initial?.workspaceId) : wsLabel(workspaceId || '*')}</span></p>
            </div>

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
          </div>
        )}
      </BuilderStepper>

      <ApprovalModal
        request={approval}
        approveLabel={editMode ? 'Approve & save' : 'Approve & activate'}
        busy={busy}
        onApprove={() => { setApproval(null); onSubmit(buildDraft()); }}
        onCancel={() => setApproval(null)}
      />
    </>
  );
};

export default AutomationBuilder;
