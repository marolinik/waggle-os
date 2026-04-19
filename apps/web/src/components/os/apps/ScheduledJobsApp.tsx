import { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, Plus, Trash2, Play, Loader2, ToggleLeft, ToggleRight, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { adapter } from '@/lib/adapter';
import { useToast } from '@/hooks/use-toast';
import type { CronJob } from '@/lib/types';
import {
  CRON_SCHEDULE_PRESETS,
  CRON_JOB_TYPES,
  DEFAULT_CRON_PRESET_ID,
  DEFAULT_CRON_JOB_TYPE,
  getCronPreset,
  describeCronExpr,
  isPlausibleCronExpr,
  type CronJobType,
} from '@/lib/cron-presets';

const ScheduledJobsApp = () => {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [presetId, setPresetId] = useState<string>(DEFAULT_CRON_PRESET_ID);
  const [customCronExpr, setCustomCronExpr] = useState('');
  const [newJobType, setNewJobType] = useState<CronJobType>(DEFAULT_CRON_JOB_TYPE);
  const [triggering, setTriggering] = useState<string | null>(null);

  // Resolve the effective cron expression — preset unless user picked
  // 'custom' from the dropdown.
  const newCronExpr = useMemo(() => {
    if (presetId === 'custom') return customCronExpr.trim();
    return getCronPreset(presetId)?.cronExpr ?? '';
  }, [presetId, customCronExpr]);
  const scheduleSummary = useMemo(() => describeCronExpr(newCronExpr), [newCronExpr]);
  const selectedJobType = useMemo(() => CRON_JOB_TYPES.find(j => j.id === newJobType), [newJobType]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adapter.getCronJobs();
      setJobs(data);
    } catch { setJobs([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (!isPlausibleCronExpr(newCronExpr)) {
      toast({
        title: 'Pick a schedule',
        description: 'Choose a preset or enter a 5-field cron expression.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const job = await adapter.createCronJob({
        name: newName.trim(),
        cronExpr: newCronExpr,
        jobType: newJobType,
        enabled: true,
      });
      setJobs(prev => [...prev, job]);
      setNewName('');
      setPresetId(DEFAULT_CRON_PRESET_ID);
      setCustomCronExpr('');
      setNewJobType(DEFAULT_CRON_JOB_TYPE);
      setCreating(false);
      toast({ title: 'Job created', description: newName });
    } catch (err) {
      toast({
        title: 'Failed to create job',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    }
  };

  const handleToggle = async (job: CronJob) => {
    try {
      const updated = await adapter.updateCronJob(job.id, { enabled: !job.enabled });
      setJobs(prev => prev.map(j => j.id === job.id ? updated : j));
    } catch {
      toast({ title: 'Failed to update job', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adapter.deleteCronJob(id);
      setJobs(prev => prev.filter(j => j.id !== id));
      toast({ title: 'Job deleted' });
    } catch {
      toast({ title: 'Failed to delete job', variant: 'destructive' });
    }
  };

  const handleTrigger = async (id: string) => {
    setTriggering(id);
    try {
      const result = await adapter.triggerCronJob(id);
      // M-43 / P25: server auto-enables a disabled job on trigger.
      // Sync local state from the response so the toggle flips to
      // enabled immediately without an extra refetch round-trip.
      if (result.schedule) {
        setJobs(prev => prev.map(j => j.id === result.schedule!.id ? result.schedule! : j));
      }
      toast({
        title: 'Job triggered',
        description: result.autoEnabled ? 'Running now — job re-enabled' : 'Running now',
      });
    } catch {
      toast({ title: 'Failed to trigger job', variant: 'destructive' });
    }
    finally { setTriggering(null); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5" style={{ color: 'var(--honey-500)' }} />
          <h2 className="text-sm font-display font-semibold text-foreground">Scheduled Jobs</h2>
          <span className="text-[11px] text-muted-foreground">{jobs.length} jobs</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-display rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
        >
          <Plus className="w-3 h-3" /> New
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {loading && jobs.length === 0 && (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2 animate-spin" />
          </div>
        )}

        {!loading && jobs.length === 0 && (
          <div className="text-center py-8">
            <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No scheduled jobs yet</p>
          </div>
        )}

        {/* Create form — M-44 / P26 clarity pass */}
        {creating && (
          <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2" data-testid="scheduled-job-create-form">
            <div className="space-y-1">
              <label className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Job name</label>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Nightly memory consolidation"
                className="w-full bg-muted/30 h-auto py-1.5"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">What it does</label>
              <select
                value={newJobType}
                onChange={e => setNewJobType(e.target.value as CronJobType)}
                data-testid="scheduled-job-type"
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
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">When it runs</label>
              <select
                value={presetId}
                onChange={e => setPresetId(e.target.value)}
                data-testid="scheduled-job-preset"
                className="w-full bg-muted/30 text-xs py-1.5 px-2 rounded-md border border-border/40 text-foreground"
              >
                {CRON_SCHEDULE_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
                <option value="custom">Custom cron expression…</option>
              </select>
              {presetId === 'custom' && (
                <Input
                  value={customCronExpr}
                  onChange={e => setCustomCronExpr(e.target.value)}
                  placeholder="e.g. 0 8 * * *"
                  className="w-full bg-muted/30 text-xs font-mono h-auto py-1.5"
                  data-testid="scheduled-job-custom-cron"
                />
              )}
              <p
                className="text-[10px] text-muted-foreground mt-0.5"
                data-testid="scheduled-job-schedule-summary"
              >
                {scheduleSummary}
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !isPlausibleCronExpr(newCronExpr)}
                className="px-3 py-1 text-[11px] font-display rounded-lg bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
              <button onClick={() => setCreating(false)} className="px-3 py-1 text-[11px] font-display rounded-lg text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        {/* Job list */}
        {jobs.map(job => (
          <div key={job.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-secondary/20">
            <button onClick={() => handleToggle(job)} className="shrink-0" title={job.enabled ? 'Disable' : 'Enable'}>
              {job.enabled
                ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                : <ToggleLeft className="w-5 h-5 text-muted-foreground" />
              }
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-display ${job.enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{job.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-mono text-muted-foreground">{job.schedule}</span>
                {job.lastRun && <span className="text-[11px] text-muted-foreground/60">Last: {new Date(job.lastRun).toLocaleDateString()}</span>}
              </div>
            </div>
            <button
              onClick={() => handleTrigger(job.id)}
              disabled={triggering === job.id}
              className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
              title="Run now"
            >
              {triggering === job.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => handleDelete(job.id)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScheduledJobsApp;
