/**
 * Workspace Desktop — Tasks tab (UX-Northstar 2026-06-13 G8).
 *
 * Replaces the read-only TasksTabBody: the server task board
 * (routes/tasks.ts, tasks.jsonl) had full CRUD but no adapter methods and no
 * UI — users could not add or complete a task anywhere. This tab now renders:
 *   1. The real task board — add (Enter), cycle status (open → in progress →
 *      done), delete.
 *   2. The memory-derived signals (WorkspaceStateView pending/blocked/
 *      completed) below, read-only, as before (C7).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  ListTodo, Circle, CircleDot, CheckCircle2, AlertTriangle, Plus, X, Loader2,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { useToast } from '@/hooks/use-toast';
import type { WorkspaceStateView, WorkspaceTask } from '@/lib/types';

const STATUS_CYCLE: Record<WorkspaceTask['status'], WorkspaceTask['status']> = {
  open: 'in_progress',
  in_progress: 'done',
  done: 'open',
};

function StatusIcon({ status }: { status: WorkspaceTask['status'] }) {
  if (status === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === 'in_progress') return <CircleDot className="w-4 h-4 text-amber-400" />;
  return <Circle className="w-4 h-4 text-muted-foreground" />;
}

function TaskRow({ task, onCycle, onDelete }: {
  task: WorkspaceTask;
  onCycle: (task: WorkspaceTask) => void;
  onDelete: (task: WorkspaceTask) => void;
}) {
  return (
    <li
      className="group flex items-center gap-2 text-xs p-2 rounded-lg bg-secondary/30 border border-border/30 hover:border-border transition-colors"
      data-testid={`ws-task-${task.id}`}
    >
      <button
        type="button"
        onClick={() => onCycle(task)}
        aria-label={`Mark "${task.title}" as ${STATUS_CYCLE[task.status].replace('_', ' ')}`}
        className="shrink-0 hover:scale-110 transition-transform"
      >
        <StatusIcon status={task.status} />
      </button>
      <span className={`flex-1 min-w-0 truncate ${task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
        {task.title}
      </span>
      {task.assigneeName && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{task.assigneeName}</span>
      )}
      <button
        type="button"
        onClick={() => onDelete(task)}
        aria-label={`Delete task "${task.title}"`}
        className="shrink-0 p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-destructive transition-all"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

/** Read-only memory-derived signals (C7) — unchanged rendering, new home. */
function MemorySignals({ state }: { state: WorkspaceStateView | null }) {
  const pending = state?.pending ?? [];
  const blocked = state?.blocked ?? [];
  const completed = state?.completed ?? [];
  if (pending.length + blocked.length + completed.length === 0) return null;

  return (
    <div className="space-y-4 pt-4 border-t border-border/30">
      <p className="text-[11px] text-muted-foreground">
        From this workspace&rsquo;s memory — things Waggle noticed are pending or blocked.
      </p>
      {blocked.length > 0 && (
        <section>
          <h3 className="text-xs font-display font-semibold text-destructive mb-2">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />Blocked ({blocked.length})
          </h3>
          <ul className="space-y-1.5">
            {blocked.map(t => (
              <li key={t.id} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-destructive/5 border border-destructive/20">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-destructive" />
                <span className="text-foreground">{t.content}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {pending.length > 0 && (
        <section>
          <h3 className="text-xs font-display font-semibold text-amber-400 mb-2">
            <Circle className="w-3.5 h-3.5 inline mr-1" />Pending ({pending.length})
          </h3>
          <ul className="space-y-1.5">
            {pending.map(t => (
              <li key={t.id} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-secondary/30 border border-border/30">
                <Circle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                <span className="text-foreground">{t.content}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {completed.length > 0 && (
        <section>
          <h3 className="text-xs font-display font-semibold text-emerald-400 mb-2">
            <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Completed ({completed.length})
          </h3>
          <ul className="space-y-1.5 opacity-70">
            {completed.slice(0, 10).map(t => (
              <li key={t.id} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400" />
                <span className="text-muted-foreground line-through">{t.content}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const TasksTab = ({ workspaceId, state }: { workspaceId: string; state: WorkspaceStateView | null }) => {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await adapter.getWorkspaceTasks(workspaceId);
        if (!cancelled) setTasks(list);
      } catch { /* board degrades to empty; memory signals still render */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const addTask = useCallback(async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const created = await adapter.createWorkspaceTask(workspaceId, t);
      setTasks(prev => [...prev, created]);
      setTitle('');
    } catch {
      toast({ title: 'Couldn’t add task', description: 'Check your connection and try again.', variant: 'destructive' });
    }
    setBusy(false);
  }, [title, busy, workspaceId, toast]);

  const cycleStatus = useCallback(async (task: WorkspaceTask) => {
    const next = STATUS_CYCLE[task.status];
    try {
      const updated = await adapter.patchWorkspaceTask(workspaceId, task.id, { status: next });
      setTasks(prev => prev.map(t => t.id === task.id ? updated : t));
    } catch {
      toast({ title: 'Couldn’t update task', variant: 'destructive' });
    }
  }, [workspaceId, toast]);

  const deleteTask = useCallback(async (task: WorkspaceTask) => {
    try {
      await adapter.deleteWorkspaceTask(workspaceId, task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch {
      toast({ title: 'Couldn’t delete task', variant: 'destructive' });
    }
  }, [workspaceId, toast]);

  const openTasks = tasks.filter(t => t.status !== 'done');
  const doneTasks = tasks.filter(t => t.status === 'done');

  return (
    <div className="p-4 space-y-4 overflow-auto h-full" data-testid="ws-tasks-tab">
      {/* Add task */}
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void addTask(); }}
          placeholder="Add a task…"
          data-testid="ws-task-input"
          className="flex-1 px-3 py-2 rounded-xl bg-secondary/30 border border-border/30 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
        />
        <button
          type="button"
          onClick={() => void addTask()}
          disabled={busy || !title.trim()}
          data-testid="ws-task-add"
          className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-display hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : (
        <>
          {openTasks.length > 0 && (
            <ul className="space-y-1.5" data-testid="ws-task-board">
              {openTasks.map(t => (
                <TaskRow key={t.id} task={t} onCycle={(task) => void cycleStatus(task)} onDelete={(task) => void deleteTask(task)} />
              ))}
            </ul>
          )}
          {doneTasks.length > 0 && (
            <ul className="space-y-1.5 opacity-70">
              {doneTasks.map(t => (
                <TaskRow key={t.id} task={t} onCycle={(task) => void cycleStatus(task)} onDelete={(task) => void deleteTask(task)} />
              ))}
            </ul>
          )}
          {tasks.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              <ListTodo className="w-4 h-4 inline mr-1.5 align-text-bottom" />
              No tasks yet — add one above, or ask the agent to track something for you.
            </p>
          )}
        </>
      )}

      <MemorySignals state={state} />
    </div>
  );
};

export default TasksTab;
