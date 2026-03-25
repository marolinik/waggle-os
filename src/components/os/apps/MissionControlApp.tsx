import { useState, useEffect } from 'react';
import { Play, Pause, Square, Radio, Clock, Zap, RefreshCw, Users, Plus, Rocket } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { PERSONAS } from '@/lib/personas';
import type { FleetSession } from '@/lib/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

const MODELS = ['gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-20250514', 'claude-3-haiku', 'gemini-pro'];

const MissionControlApp = () => {
  const [sessions, setSessions] = useState<FleetSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; status: string }[]>([]);
  const [activity, setActivity] = useState<{ id: string; user: string; action: string; timestamp: string }[]>([]);
  const [tab, setTab] = useState<'fleet' | 'team' | 'activity'>('fleet');
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [spawnForm, setSpawnForm] = useState({ task: '', persona: '', model: MODELS[0] });

  const refresh = async () => {
    try {
      const [fleet, members, act] = await Promise.allSettled([
        adapter.getFleet(),
        adapter.getTeamMembers(),
        adapter.getTeamActivity(),
      ]);
      if (fleet.status === 'fulfilled') setSessions(fleet.value);
      if (members.status === 'fulfilled') setTeamMembers(members.value);
      if (act.status === 'fulfilled') setActivity(act.value);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (workspaceId: string, action: 'pause' | 'resume' | 'stop') => {
    await adapter.fleetAction(workspaceId, action);
    refresh();
  };

  const handleSpawn = async () => {
    if (!spawnForm.task.trim()) return;
    setSpawning(true);
    try {
      await adapter.spawnAgent({
        task: spawnForm.task,
        persona: spawnForm.persona || undefined,
        model: spawnForm.model,
      });
      setSpawnOpen(false);
      setSpawnForm({ task: '', persona: '', model: MODELS[0] });
      refresh();
    } catch { /* ignore */ }
    finally { setSpawning(false); }
  };

  const statusColors: Record<string, string> = {
    active: 'text-emerald-400',
    paused: 'text-amber-400',
    idle: 'text-muted-foreground',
  };

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display font-semibold text-foreground flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" /> Mission Control
        </h2>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="default"
            className="gap-1.5 text-xs h-8"
            onClick={() => setSpawnOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Spawn Agent
          </Button>
          <button onClick={refresh} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-0.5 rounded-lg bg-muted/50 w-fit">
        {(['fleet', 'team', 'activity'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs rounded-md font-display transition-colors capitalize ${
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'fleet' && (
        <>
          {sessions.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Radio className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No active fleet sessions</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 gap-1.5 text-xs"
                onClick={() => setSpawnOpen(true)}
              >
                <Rocket className="w-3.5 h-3.5" /> Spawn your first agent
              </Button>
            </div>
          )}
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.workspaceId} className="p-3 rounded-xl bg-secondary/30 border border-border/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${s.status === 'active' ? 'bg-emerald-400 animate-pulse' : s.status === 'paused' ? 'bg-amber-400' : 'bg-muted-foreground'}`} />
                    <span className="text-sm font-display font-medium text-foreground">{s.workspaceName}</span>
                    <span className={`text-[10px] capitalize ${statusColors[s.status]}`}>{s.status}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {s.status === 'active' && (
                      <button onClick={() => handleAction(s.workspaceId, 'pause')} className="p-1 rounded text-muted-foreground hover:text-amber-400 transition-colors">
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {s.status === 'paused' && (
                      <button onClick={() => handleAction(s.workspaceId, 'resume')} className="p-1 rounded text-muted-foreground hover:text-emerald-400 transition-colors">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => handleAction(s.workspaceId, 'stop')} className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors">
                      <Square className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{Math.round(s.duration / 60)}m</span>
                  <span className="flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" />{s.toolCount} tools</span>
                  <span>{s.model}</span>
                  <span>{s.tokenUsage.toLocaleString()} tokens</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'team' && (
        <div className="space-y-2">
          {teamMembers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-10 h-10 text-muted-foreground/20 mb-3" />
              <p className="text-sm text-muted-foreground">No team members</p>
              <p className="text-xs text-muted-foreground/60">Connect to a team server in Settings</p>
            </div>
          )}
          {teamMembers.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/30">
              <div className={`w-2 h-2 rounded-full ${m.status === 'online' ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
              <span className="text-sm text-foreground flex-1">{m.name}</span>
              <span className="text-[10px] text-muted-foreground capitalize">{m.status}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-1.5">
          {activity.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">No activity</p>
            </div>
          )}
          {activity.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg bg-secondary/20 border border-border/20">
              <span className="text-xs text-foreground font-display">{a.user}</span>
              <span className="text-xs text-muted-foreground flex-1">{a.action}</span>
              <span className="text-[10px] text-muted-foreground">{new Date(a.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Spawn Agent Dialog */}
      <Dialog open={spawnOpen} onOpenChange={setSpawnOpen}>
        <DialogContent className="sm:max-w-md bg-background border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Rocket className="w-5 h-5 text-primary" /> Spawn Agent
            </DialogTitle>
            <DialogDescription>
              Configure and launch a sub-agent to handle a specific task autonomously.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Task */}
            <div className="space-y-2">
              <Label htmlFor="spawn-task" className="text-foreground">Task</Label>
              <Textarea
                id="spawn-task"
                placeholder="Describe what this agent should do..."
                value={spawnForm.task}
                onChange={e => setSpawnForm(f => ({ ...f, task: e.target.value }))}
                className="min-h-[80px] bg-secondary/30 border-border/50 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            {/* Persona */}
            <div className="space-y-2">
              <Label className="text-foreground">Persona</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {PERSONAS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSpawnForm(f => ({ ...f, persona: f.persona === p.id ? '' : p.id }))}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center transition-all ${
                      spawnForm.persona === p.id
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                        : 'border-border/30 bg-secondary/20 hover:bg-secondary/40'
                    }`}
                  >
                    <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full object-cover" />
                    <span className="text-[10px] text-foreground font-medium leading-tight truncate w-full">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Model */}
            <div className="space-y-2">
              <Label htmlFor="spawn-model" className="text-foreground">Model</Label>
              <div className="flex flex-wrap gap-1.5">
                {MODELS.map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSpawnForm(f => ({ ...f, model: m }))}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                      spawnForm.model === m
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/30 bg-secondary/20 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setSpawnOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!spawnForm.task.trim() || spawning}
              onClick={handleSpawn}
              className="gap-1.5"
            >
              {spawning ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Rocket className="w-3.5 h-3.5" />
              )}
              {spawning ? 'Spawning…' : 'Launch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MissionControlApp;
