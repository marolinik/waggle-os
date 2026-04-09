import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, Play, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { adapter } from '@/lib/adapter';
import { useToast } from '@/hooks/use-toast';
import type { CronJob } from '@/lib/types';

const ScheduledJobsApp = () => {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSchedule, setNewSchedule] = useState('0 8 * * *');
  const [triggering, setTriggering] = useState<string | null>(null);

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
    try {
      const job = await adapter.createCronJob({ name: newName, schedule: newSchedule, workspaceId: '', enabled: true });
      setJobs(prev => [...prev, job]);
      setNewName('');
      setCreating(false);
      toast({ title: 'Job created', description: newName });
    } catch {
      toast({ title: 'Failed to create job', variant: 'destructive' });
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
      await adapter.triggerCronJob(id);
      toast({ title: 'Job triggered', description: 'Running now' });
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

        {/* Create form */}
        {creating && (
          <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Job name"
              className="w-full bg-muted/30 h-auto py-1.5"
              autoFocus
            />
            <Input
              value={newSchedule}
              onChange={e => setNewSchedule(e.target.value)}
              placeholder="Cron expression (0 8 * * *)"
              className="w-full bg-muted/30 text-xs font-mono h-auto py-1.5"
            />
            <div className="flex gap-2">
              <button onClick={handleCreate} className="px-3 py-1 text-[11px] font-display rounded-lg bg-primary text-primary-foreground">Create</button>
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
