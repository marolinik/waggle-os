import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Pencil, Copy, Play, Loader2, Crown, Cog,
  CheckCircle2, XCircle, Clock,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PERSONAS } from '@/lib/personas';
import { adapter } from '@/lib/adapter';
import GroupExecutionPanel from './GroupExecutionPanel';
import type { AgentGroup, BackendPersona, GroupExecState, MemberExecStatus } from './types';
import { STRATEGY_CONFIG } from './types';

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

interface GroupDetailProps {
  group: AgentGroup;
  agents: BackendPersona[];
  onRun: (task: string) => Promise<GroupExecState | null>;
  onEdit: () => void;
  onDuplicate: () => void;
}

const GroupDetail = ({ group, agents, onRun, onEdit, onDuplicate }: GroupDetailProps) => {
  const [task, setTask] = useState('');
  const [execState, setExecState] = useState<GroupExecState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const strat = STRATEGY_CONFIG[group.strategy];
  const sortedMembers = [...group.members].sort((a, b) => a.executionOrder - b.executionOrder);

  // Poll job status when running
  useEffect(() => {
    if (!execState || execState.status === 'completed' || execState.status === 'failed' || execState.status === 'cancelled') {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    const poll = async () => {
      try {
        const res = await adapter.getJobStatus(execState.jobId);
        if (!res) return;
        setExecState(prev => {
          if (!prev) return prev;
          const updated = { ...prev };
          if (res.status) updated.status = res.status;
          if (res.completedAt) updated.completedAt = new Date(res.completedAt).getTime();
          if (res.output) updated.output = res.output as Record<string, unknown>;
          if (res.status === 'running') {
            const now = Date.now();
            updated.members = updated.members.map((m, i) => {
              if (m.status === 'done' || m.status === 'failed') return m;
              if (group.strategy === 'sequential') {
                const doneCount = updated.members.filter(mm => mm.status === 'done').length;
                if (i === doneCount) return { ...m, status: 'running' as const, startedAt: m.startedAt ?? now };
                return m;
              }
              return { ...m, status: 'running' as const, startedAt: m.startedAt ?? now };
            });
          }
          if (res.status === 'completed') {
            updated.members = updated.members.map(m => ({
              ...m, status: 'done' as const, completedAt: m.completedAt ?? Date.now(), result: m.result ?? 'Completed',
            }));
          }
          if (res.status === 'failed') {
            updated.members = updated.members.map(m =>
              m.status === 'running' ? { ...m, status: 'failed' as const, completedAt: Date.now(), error: 'Job failed' } : m,
            );
          }
          return updated;
        });
      } catch { /* ignore poll errors */ }
    };

    pollRef.current = setInterval(poll, 1500);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [execState?.jobId, execState?.status, group.strategy]);

  const handleRun = async () => {
    if (!task.trim()) return;
    const exec = await onRun(task);
    if (exec) { setExecState(exec); setTask(''); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex-1 flex flex-col gap-4 overflow-y-auto scrollbar-thin"
    >
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-display font-bold text-foreground flex-1">{group.name}</h3>
          <button onClick={onDuplicate} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-secondary/50 hover:bg-secondary/70 text-foreground transition-colors">
            <Copy className="w-3 h-3" /> Duplicate
          </button>
          <button onClick={onEdit} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-secondary/50 hover:bg-secondary/70 text-foreground transition-colors">
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
        {group.description && <p className="text-xs text-muted-foreground">{group.description}</p>}
        <div className="mt-2 flex items-center gap-2">
          <span className={`text-[10px] px-2 py-1 rounded-full ${strat.color}`}>{strat.label}</span>
          <span className="text-[10px] text-muted-foreground">{strat.description}</span>
        </div>
      </div>

      {/* Execution status panel */}
      <AnimatePresence>
        {execState && (
          <GroupExecutionPanel
            exec={execState}
            agents={agents}
            strategy={group.strategy}
            onDismiss={() => setExecState(null)}
            onCancel={async () => {
              try { await adapter.cancelJob(execState.jobId); } catch { /* best-effort */ }
              setExecState(prev => prev ? {
                ...prev, status: 'cancelled', completedAt: Date.now(),
                members: prev.members.map(m =>
                  m.status === 'running' || m.status === 'pending'
                    ? { ...m, status: 'failed' as const, completedAt: Date.now(), error: 'Cancelled' } : m
                ),
              } : null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Members */}
      <div>
        <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">Members ({sortedMembers.length})</h4>
        <div className="space-y-2">
          {sortedMembers.map((member, idx) => {
            const agent = agents.find(a => a.id === member.agentId);
            const persona = agent ? PERSONAS.find(p => p.id === agent.id) : undefined;
            const memberExec = execState?.members.find(m => m.agentId === member.agentId);
            return (
              <div
                key={member.agentId}
                className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                  memberExec?.status === 'running' ? 'border-primary/30 bg-primary/5'
                    : memberExec?.status === 'done' ? 'border-emerald-500/20 bg-emerald-500/5'
                    : memberExec?.status === 'failed' ? 'border-destructive/20 bg-destructive/5'
                    : 'bg-secondary/20 border-border/20'
                }`}
              >
                {group.strategy === 'sequential' && (
                  <span className="text-[10px] font-mono text-muted-foreground w-4 text-center">{idx + 1}</span>
                )}
                <Avatar className="w-7 h-7 shrink-0">
                  {persona?.avatar ? <AvatarImage src={persona.avatar} /> : (
                    <AvatarFallback className="text-[10px] bg-primary/20">{agent?.icon || agent?.name?.[0] || '?'}</AvatarFallback>
                  )}
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-medium text-foreground truncate">{agent?.name ?? member.agentId}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{agent?.description ?? ''}</p>
                </div>
                {memberExec ? (
                  <div className="flex items-center gap-1">
                    {STATUS_ICON[memberExec.status]}
                    <span className="text-[9px] text-muted-foreground">{STATUS_LABEL[memberExec.status]}</span>
                  </div>
                ) : member.roleInGroup === 'lead' ? (
                  <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                    <Crown className="w-2.5 h-2.5" /> Lead
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">
                    <Cog className="w-2.5 h-2.5" /> Worker
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Run task */}
      <div className="mt-auto pt-3 border-t border-border/20">
        <h4 className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">Run a Task</h4>
        <div className="flex gap-2">
          <input
            value={task}
            onChange={e => setTask(e.target.value)}
            placeholder="Describe the task for this group..."
            className="flex-1 text-xs bg-secondary/30 border border-border/30 rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            onKeyDown={e => e.key === 'Enter' && handleRun()}
            disabled={execState?.status === 'running' || execState?.status === 'queued'}
          />
          <button
            onClick={handleRun}
            disabled={!task.trim() || execState?.status === 'running' || execState?.status === 'queued'}
            className="px-3 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1"
          >
            {execState?.status === 'running' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            {execState?.status === 'running' ? 'Running' : 'Run'}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default GroupDetail;
