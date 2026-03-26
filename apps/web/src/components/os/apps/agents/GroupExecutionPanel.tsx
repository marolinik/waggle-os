import { motion } from 'framer-motion';
import {
  Activity, X, StopCircle, Clock, Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PERSONAS } from '@/lib/personas';
import type { BackendPersona, GroupExecState, MemberExecStatus, AgentGroup } from './types';

const STATUS_ICON: Record<MemberExecStatus, React.ReactNode> = {
  pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  running: <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />,
  done: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
  failed: <XCircle className="w-3.5 h-3.5 text-destructive" />,
};

const STATUS_LABEL: Record<MemberExecStatus, string> = {
  pending: 'Pending',
  running: 'Running…',
  done: 'Complete',
  failed: 'Failed',
};

interface GroupExecutionPanelProps {
  exec: GroupExecState;
  agents: BackendPersona[];
  strategy: AgentGroup['strategy'];
  onDismiss: () => void;
  onCancel: () => void;
}

const GroupExecutionPanel = ({ exec, agents, strategy, onDismiss, onCancel }: GroupExecutionPanelProps) => {
  const elapsed = ((exec.completedAt ?? Date.now()) - exec.startedAt) / 1000;
  const doneCount = exec.members.filter(m => m.status === 'done').length;
  const failCount = exec.members.filter(m => m.status === 'failed').length;
  const total = exec.members.length;
  const progress = total > 0 ? ((doneCount + failCount) / total) * 100 : 0;
  const isFinished = exec.status === 'completed' || exec.status === 'failed' || exec.status === 'cancelled';
  const isRunning = exec.status === 'running' || exec.status === 'queued';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-card/80 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/20 flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <span className="text-[11px] font-display font-bold text-foreground flex-1">
          {exec.status === 'cancelled' ? 'Cancelled' : isFinished ? 'Execution Complete' : 'Running…'}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">{elapsed.toFixed(1)}s</span>
        {isRunning && (
          <button
            onClick={onCancel}
            className="ml-1 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
          >
            <StopCircle className="w-3 h-3" /> Cancel
          </button>
        )}
        {isFinished && (
          <button onClick={onDismiss} className="ml-1 text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-secondary/30">
        <motion.div
          className={`h-full ${exec.status === 'failed' ? 'bg-destructive' : 'bg-primary'}`}
          initial={{ width: 0 }}
          animate={{ width: `${isFinished ? 100 : progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>

      {/* Task */}
      <div className="px-3 py-2 border-b border-border/10">
        <p className="text-[10px] text-muted-foreground truncate">
          <span className="font-medium text-foreground">Task:</span> {exec.task}
        </p>
      </div>

      {/* Per-member status */}
      <div className="px-3 py-2 space-y-1.5">
        {exec.members.map((memberExec, idx) => {
          const agent = agents.find(a => a.id === memberExec.agentId);
          const persona = agent ? PERSONAS.find(p => p.id === agent.id) : undefined;
          const memberElapsed = memberExec.startedAt
            ? (((memberExec.completedAt ?? Date.now()) - memberExec.startedAt) / 1000).toFixed(1)
            : null;

          return (
            <motion.div
              key={memberExec.agentId}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`flex items-center gap-2.5 p-2 rounded-lg border transition-colors ${
                memberExec.status === 'running'
                  ? 'border-primary/30 bg-primary/5'
                  : memberExec.status === 'done'
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : memberExec.status === 'failed'
                  ? 'border-destructive/20 bg-destructive/5'
                  : 'border-border/10 bg-secondary/10'
              }`}
            >
              {strategy === 'sequential' && (
                <span className="text-[9px] font-mono text-muted-foreground w-3 text-center">{idx + 1}</span>
              )}
              <Avatar className="w-6 h-6 shrink-0">
                {persona?.avatar ? (
                  <AvatarImage src={persona.avatar} />
                ) : (
                  <AvatarFallback className="text-[9px] bg-primary/20">{agent?.icon || agent?.name?.[0] || '?'}</AvatarFallback>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-foreground truncate">{agent?.name ?? memberExec.agentId}</p>
                {memberExec.status === 'done' && memberExec.result && (
                  <p className="text-[9px] text-muted-foreground truncate mt-0.5">{memberExec.result.slice(0, 120)}</p>
                )}
                {memberExec.status === 'failed' && memberExec.error && (
                  <p className="text-[9px] text-destructive truncate mt-0.5">{memberExec.error}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {memberElapsed && <span className="text-[9px] font-mono text-muted-foreground">{memberElapsed}s</span>}
                {STATUS_ICON[memberExec.status]}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Summary when done */}
      {isFinished && (
        <div className="px-3 py-2 border-t border-border/20 flex items-center gap-2">
          {exec.status === 'completed' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : exec.status === 'cancelled' ? (
            <StopCircle className="w-4 h-4 text-amber-400" />
          ) : (
            <XCircle className="w-4 h-4 text-destructive" />
          )}
          <span className="text-[10px] text-foreground font-medium">
            {doneCount}/{total} succeeded{failCount > 0 ? `, ${failCount} failed` : ''}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">{elapsed.toFixed(1)}s total</span>
        </div>
      )}

      {/* Output preview */}
      {isFinished && exec.output && (
        <div className="px-3 py-2 border-t border-border/10">
          <details className="group">
            <summary className="text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground">
              View output
            </summary>
            <pre className="mt-1.5 text-[9px] text-muted-foreground bg-secondary/20 rounded-lg p-2 max-h-32 overflow-auto whitespace-pre-wrap font-mono">
              {JSON.stringify(exec.output, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </motion.div>
  );
};

export default GroupExecutionPanel;
