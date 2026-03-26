/**
 * TaskBoard — simple task list grouped by status.
 *
 * Three columns: Open, In Progress, Done.
 * Compact view suitable for the context panel.
 */

import { useState } from 'react';

export interface TeamTask {
  id: string;
  title: string;
  status: 'open' | 'in_progress' | 'done';
  assigneeId?: string;
  assigneeName?: string;
  creatorName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskBoardProps {
  tasks: TeamTask[];
  onCreateTask?: (title: string) => void;
  onUpdateStatus?: (taskId: string, status: TeamTask['status']) => void;
  onDeleteTask?: (taskId: string) => void;
  onClaimTask?: (taskId: string) => void;
  loading?: boolean;
}

const STATUS_LABELS: Record<TeamTask['status'], string> = {
  open: 'Open',
  in_progress: 'In Progress',
  done: 'Done',
};

const STATUS_BG_CLASS: Record<TeamTask['status'], string> = {
  open: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  done: 'bg-green-500',
};

const STATUS_TEXT_CLASS: Record<TeamTask['status'], string> = {
  open: 'text-primary',
  in_progress: 'text-amber-500',
  done: 'text-green-500',
};

export function getTaskStatusColor(status: TeamTask['status']): string {
  return STATUS_BG_CLASS[status] ?? 'bg-gray-500';
}

export function groupTasksByStatus(tasks: TeamTask[]): Record<TeamTask['status'], TeamTask[]> {
  const result: Record<TeamTask['status'], TeamTask[]> = {
    open: [],
    in_progress: [],
    done: [],
  };
  for (const task of tasks) {
    if (result[task.status]) {
      result[task.status].push(task);
    }
  }
  return result;
}

export function TaskBoard({
  tasks,
  onCreateTask,
  onUpdateStatus,
  onDeleteTask: _onDeleteTask,
  onClaimTask: _onClaimTask,
  loading,
}: TaskBoardProps) {
  const [newTitle, setNewTitle] = useState('');
  const grouped = groupTasksByStatus(tasks);

  const handleCreate = () => {
    if (!newTitle.trim() || !onCreateTask) return;
    onCreateTask(newTitle.trim());
    setNewTitle('');
  };

  if (loading) {
    return (
      <div className="task-board p-3 text-muted-foreground/70 text-[11px]">
        Loading tasks...
      </div>
    );
  }

  return (
    <div className="task-board text-[11px]">
      {/* Quick add */}
      {onCreateTask && (
        <div className="flex gap-1 px-3 py-2 border-b border-border/20">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New task..."
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="flex-1 px-2 py-1 bg-muted/40 border border-border rounded text-foreground text-[11px]"
          />
          <button
            onClick={handleCreate}
            disabled={!newTitle.trim()}
            className="px-2 py-1 bg-primary text-primary-foreground border-none rounded cursor-pointer text-[10px] disabled:opacity-50"
          >
            Add
          </button>
        </div>
      )}

      {/* Status groups */}
      {(['open', 'in_progress', 'done'] as const).map((status) => {
        const statusTasks = grouped[status];
        if (statusTasks.length === 0 && status === 'done') return null; // hide empty done

        return (
          <div key={status}>
            <div className={`flex justify-between px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_TEXT_CLASS[status]}`}>
              <span>{STATUS_LABELS[status]}</span>
              <span className="text-muted-foreground/70">{statusTasks.length}</span>
            </div>
            {statusTasks.length === 0 ? (
              <div className="px-3 py-1 text-muted-foreground/70 text-[10px]">
                No tasks
              </div>
            ) : (
              statusTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/10"
                >
                  {/* Status cycle button */}
                  {onUpdateStatus && (
                    <button
                      onClick={() => {
                        const next: Record<string, TeamTask['status']> = {
                          open: 'in_progress',
                          in_progress: 'done',
                          done: 'open',
                        };
                        onUpdateStatus(task.id, next[task.status]);
                      }}
                      title={`Move to ${STATUS_LABELS[task.status === 'open' ? 'in_progress' : task.status === 'in_progress' ? 'done' : 'open']}`}
                      className={`w-3 h-3 rounded-full shrink-0 p-0 cursor-pointer border-2 ${
                        task.status === 'open' ? 'border-primary bg-transparent' :
                        task.status === 'in_progress' ? 'border-amber-500 bg-transparent' :
                        'border-green-500 bg-green-500'
                      }`}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`overflow-hidden text-ellipsis whitespace-nowrap ${
                      task.status === 'done' ? 'text-muted-foreground/70 line-through' : 'text-muted-foreground'
                    }`}>
                      {task.title}
                    </div>
                    {task.assigneeName && (
                      <div className="text-[9px] text-muted-foreground/70">
                        {task.assigneeName}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
