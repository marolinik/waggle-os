import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CronSchedule } from './types';
import { formatTime } from './helpers';
import { getServerBaseUrl } from '@/lib/ipc';

const BASE_URL = getServerBaseUrl();

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every Monday', value: '0 9 * * 1' },
  { label: 'Custom', value: '' },
] as const;

const JOB_TYPES = [
  { label: 'Agent task', value: 'agent_task' },
  { label: 'Memory cleanup', value: 'memory_consolidation' },
] as const;

interface CronSchedulesCardProps {
  schedules: CronSchedule[];
  schedulesLoading: boolean;
  togglingId: number | null;
  triggeringId: number | null;
  onToggle: (id: number, currentEnabled: boolean) => void;
  onTrigger: (id: number) => void;
  onCreated?: () => void;
}

export function CronSchedulesCard({
  schedules,
  schedulesLoading,
  togglingId,
  triggeringId,
  onToggle,
  onTrigger,
  onCreated,
}: CronSchedulesCardProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [presetIndex, setPresetIndex] = useState(0);
  const [customCron, setCustomCron] = useState('');
  const [jobType, setJobType] = useState(JOB_TYPES[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const cronExpr = CRON_PRESETS[presetIndex].value || customCron;

  const resetForm = () => {
    setName('');
    setPresetIndex(0);
    setCustomCron('');
    setJobType(JOB_TYPES[0].value);
    setError('');
    setShowForm(false);
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }
    if (!cronExpr.trim()) {
      setError('Cron expression is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${BASE_URL}/api/cron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          cronExpr: cronExpr.trim(),
          jobType,
          workspaceId: 'default',
        }),
      });
      if (res.ok) {
        resetForm();
        onCreated?.();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Failed to create schedule');
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-wide">Scheduled Tasks</CardTitle>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Create scheduled task"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
                <path d="M6 2.5V9.5M2.5 6H9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Create
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Inline creation form */}
        {showForm && (
          <div className="rounded-md border border-border bg-muted/20 p-3 mb-3 flex flex-col gap-2">
            <input
              type="text"
              placeholder="Task name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <select
              value={presetIndex}
              onChange={(e) => setPresetIndex(Number(e.target.value))}
              className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {CRON_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}{p.value ? ` (${p.value})` : ''}
                </option>
              ))}
            </select>
            {CRON_PRESETS[presetIndex].label === 'Custom' && (
              <input
                type="text"
                placeholder="Cron expression (e.g. */15 * * * *)"
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
              />
            )}
            <select
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {JOB_TYPES.map((j) => (
                <option key={j.value} value={j.value}>{j.label}</option>
              ))}
            </select>
            {error && (
              <p className="text-[11px] text-red-500">{error}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={cn(
                  'text-[11px] font-medium px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors',
                  submitting && 'opacity-50 cursor-default'
                )}
              >
                {submitting ? 'Creating...' : 'Create'}
              </button>
              <button
                onClick={resetForm}
                disabled={submitting}
                className="text-[11px] font-medium px-3 py-1 rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {schedulesLoading ? (
          <p className="text-xs text-muted-foreground py-2">Loading schedules...</p>
        ) : schedules.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            No scheduled tasks yet. Create one to automate recurring work.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-border bg-muted/30 p-2"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'size-2 rounded-full shrink-0',
                        s.enabled ? 'bg-green-500' : 'bg-muted-foreground'
                      )}
                    />
                    <span className="text-xs font-semibold">{s.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded',
                        s.enabled
                          ? 'bg-green-500/15 text-green-500'
                          : 'bg-red-500/10 text-red-500',
                        togglingId === s.id && 'opacity-50 cursor-default'
                      )}
                      onClick={() => onToggle(s.id, s.enabled)}
                      disabled={togglingId === s.id}
                      aria-label={`${s.enabled ? 'Disable' : 'Enable'} schedule ${s.name}`}
                      aria-pressed={s.enabled}
                    >
                      {s.enabled ? 'ON' : 'OFF'}
                    </button>
                    <button
                      className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded border border-border',
                        triggeringId === s.id
                          ? 'bg-muted text-muted-foreground cursor-default'
                          : 'bg-transparent text-muted-foreground hover:bg-muted'
                      )}
                      onClick={() => onTrigger(s.id)}
                      disabled={triggeringId === s.id}
                      aria-label={`Trigger schedule ${s.name}`}
                    >
                      {triggeringId === s.id ? 'Running...' : 'Trigger'}
                    </button>
                  </div>
                </div>
                <div className="flex gap-4 text-[11px] text-muted-foreground">
                  <span>cron: {s.cronExpr}</span>
                  <span>type: {s.jobType}</span>
                </div>
                <div className="flex gap-4 mt-0.5 text-[11px] text-muted-foreground">
                  <span>last: {formatTime(s.lastRunAt)}</span>
                  <span>next: {formatTime(s.nextRunAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
