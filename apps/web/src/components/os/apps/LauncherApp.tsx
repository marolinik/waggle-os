/**
 * AI-OS Phase 2B — LauncherApp.
 *
 * Dock surface for the AI-OS tool launcher. Lists every supported
 * AI tool — all 7 are launchable; 6 (all but claude-desktop) also
 * support hook install/verify/uninstall — with detection status,
 * hook-install status, and per-tool actions:
 *
 *   Launch in workspace X / Install hooks / Verify hooks / Uninstall hooks
 *
 * Adapter contract:
 *   adapter.detectTools()  → /api/tools/detect
 *   adapter.launchTool()   → /api/tools/launch
 *   adapter.manageHooks()  → /api/tools/hooks
 *
 * Warm-Hive PR6b (B1): two views behind a segmented toggle —
 *   Variation A · Launch — the live detect/launch/hooks/processes UI (below).
 *   Variation B · How memory is shared — a pure-UI explainer (flow diagram +
 *     three cards + a provenance example). Static, no backend, mirrors
 *     docs/design_handoff_waggle_app/design-files/screens/launcher.html.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Rocket, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Play, Download, ShieldCheck, Trash2, Loader2, MessageSquare, Square,
  Workflow, ArrowDownToLine, ArrowRight, ShieldCheck as ShieldCheckIcon, Hexagon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { adapter } from '@/lib/adapter';
import {
  promptArgsForTool,
  toolAcceptsInlinePrompt,
} from '@/lib/launcher-prompt-args';
import { ToolOutputPane } from './launcher/ToolOutputPane';
import {
  BUILTIN_TOOL_MANIFESTS,
  type ExternalToolAccess,
  type ToolCapabilities,
} from '@waggle/shared';

// #5 — derived from the shared manifest registry (single source of truth),
// replacing the hand-maintained local copies. LAUNCH_COHORT = launchable tools;
// HOOKS_COHORT = tools whose hive-mind hook package ships a bin (hookCapable —
// claude-desktop is the only one excluded). Mirrors the backend cohorts, which
// derive from the same BUILTIN_TOOL_MANIFESTS.
const LAUNCH_COHORT = BUILTIN_TOOL_MANIFESTS.filter((m) => m.launchable).map((m) => m.id);
const HOOKS_COHORT = BUILTIN_TOOL_MANIFESTS.filter((m) => m.hookCapable).map((m) => m.id);

interface DetectedTool {
  id: string;
  displayName: string;
  capabilities?: ToolCapabilities;
  permissionModes?: readonly ExternalToolAccess[];
  installed: boolean;
  installedPath: string | null;
  version: string | null;
  hooksInstalled: boolean;
  hookPointerPath: string | null;
  diagnostic?: string;
}

interface DetectionResult {
  platform: string;
  detectedAt: string;
  tools: DetectedTool[];
}

type ToolAction = 'launch' | 'run' | 'install' | 'verify' | 'uninstall';

/** Segmented-toggle view: A = the live launch UI; B = the memory-sharing explainer. */
type LauncherView = 'a' | 'b';

interface ActionState {
  toolId: string;
  action: ToolAction;
}

interface ActionResult {
  toolId: string;
  action: ToolAction;
  ok: boolean;
  message: string;
}

interface LauncherAppProps {
  /** Active workspace id — injected into spawned tools as WAGGLE_WORKSPACE_ID. */
  activeWorkspaceId?: string;
  workspaces?: Array<{ id: string; name: string; status?: string }>;
  onOpenRoom?: (roomId: string) => void;
}

const ACCESS_LABELS: Record<ExternalToolAccess, string> = {
  'read-only': 'Read only',
  'workspace-write': 'Workspace write',
  native: 'Native permissions',
};

const defaultAccessForTool = (tool: DetectedTool): ExternalToolAccess | null => {
  const modes = tool.permissionModes ?? [];
  return modes.includes('read-only') ? 'read-only' : (modes[0] ?? null);
};

const toolCanRunCapturedTask = (tool: DetectedTool): boolean =>
  tool.installed &&
  tool.capabilities?.headlessTask === true &&
  (tool.permissionModes?.length ?? 0) > 0;

const LauncherApp = ({
  activeWorkspaceId,
  workspaces = [],
  onOpenRoom,
}: LauncherAppProps = {}) => {
  const [view, setView] = useState<LauncherView>('a');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActionState | null>(null);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [prompt, setPrompt] = useState('');
  const [taskToolId, setTaskToolId] = useState<string | null>(null);
  const [taskPrompt, setTaskPrompt] = useState('');
  const [taskWorkspaceIds, setTaskWorkspaceIds] = useState<string[]>([]);
  const [taskParticipants, setTaskParticipants] = useState<Record<string, ExternalToolAccess>>({});
  /**
   * AI-OS Phase 4 polish — set of tool ids currently running (at
   * least one tracked + alive pid). Used to render the 'Running'
   * badge. Polled every 5s while LauncherApp is mounted.
   */
  const [runningTools, setRunningTools] = useState<Set<string>>(new Set());
  /**
   * E-1 — map of tool id → list of PIDs currently running. The Stop
   * button uses this to know which pid to kill. Populated alongside
   * runningTools by the same 5s poll.
   */
  const [pidsByTool, setPidsByTool] = useState<Map<string, number[]>>(new Map());
  /**
   * AI-OS #4 — pids launched in OBSERVED mode (live output available) and the
   * tool whose output pane is currently expanded. The pane is progressive
   * disclosure: hidden until the user clicks a Running badge.
   */
  const [observedPids, setObservedPids] = useState<Set<number>>(new Set());
  const [openPaneToolId, setOpenPaneToolId] = useState<string | null>(null);
  /**
   * Watch mode (entered via the ⌘K "Watch a coding agent live" deep-link,
   * /launcher?watch=1): the per-tool Launch sends observe:true and auto-opens
   * the output pane. Keeps the dock's default Launch detached/basic.
   */
  const watchMode = useMemo(
    () => new URLSearchParams(window.location.search).get('watch') === '1',
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adapter.detectTools();
      if (!result) {
        setError('Detection failed — sidecar may be offline.');
        setDetection(null);
      } else {
        setDetection(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed');
      setDetection(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Phase 4 polish — poll the process tracker so the 'Running' badge
  // reflects live state. 5s cadence balances freshness against load.
  // E-1 — also build the per-tool pid map so the Stop button knows
  // which pid to kill on click.
  useEffect(() => {
    let cancelled = false;
    const pollOnce = async () => {
      const result = await adapter.getToolProcesses();
      if (cancelled) return;
      setRunningTools(new Set(result.processes.map((p) => p.toolId)));
      setObservedPids(new Set(result.processes.filter((p) => p.observed).map((p) => p.pid)));
      const next = new Map<string, number[]>();
      for (const p of result.processes) {
        const arr = next.get(p.toolId) ?? [];
        arr.push(p.pid);
        next.set(p.toolId, arr);
      }
      setPidsByTool(next);
    };
    pollOnce();
    const interval = setInterval(pollOnce, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  /**
   * E-1 — Stop the first running pid for a given tool. The pid list
   * for the tool is taken from the latest poll; if multiple pids are
   * running for the same tool the user can click Stop multiple times.
   */
  const stopTool = useCallback(
    async (tool: DetectedTool) => {
      const pids = pidsByTool.get(tool.id) ?? [];
      const pid = pids[0];
      if (!pid) return;
      setActiveAction({ toolId: tool.id, action: 'launch' }); // reuse launch spinner slot
      setLastResult(null);
      try {
        const r = await adapter.killTool(pid);
        setLastResult({
          toolId: tool.id,
          action: 'launch',
          ok: r.ok,
          message: r.ok
            ? `Stopped ${tool.displayName} (pid ${r.pid}, ${r.reason})`
            : `Stop failed (${r.reason}${r.error ? `: ${r.error}` : ''})`,
        });
        // Re-poll immediately so the badge clears without waiting
        // for the 5-second timer.
        const result = await adapter.getToolProcesses();
        setRunningTools(new Set(result.processes.map((p) => p.toolId)));
        setObservedPids(new Set(result.processes.filter((p) => p.observed).map((p) => p.pid)));
        const next = new Map<string, number[]>();
        for (const p of result.processes) {
          const arr = next.get(p.toolId) ?? [];
          arr.push(p.pid);
          next.set(p.toolId, arr);
        }
        setPidsByTool(next);
      } catch (err) {
        setLastResult({
          toolId: tool.id,
          action: 'launch',
          ok: false,
          message: err instanceof Error ? err.message : 'Stop failed',
        });
      } finally {
        setActiveAction(null);
      }
    },
    [pidsByTool],
  );

  const doAction = useCallback(
    async (tool: DetectedTool, action: Exclude<ToolAction, 'run'>) => {
      setActiveAction({ toolId: tool.id, action });
      setLastResult(null);
      try {
        if (action === 'launch') {
          if (!tool.installedPath) {
            setLastResult({
              toolId: tool.id,
              action,
              ok: false,
              message: 'Tool not installed — cannot launch.',
            });
            return;
          }
          // If a prompt is set AND the tool has a known prompt-arg
          // shape, pass it through as CLI args. Otherwise launch
          // bare and the prompt textarea is silently ignored for
          // that tool.
          const args = promptArgsForTool(tool.id, prompt) ?? undefined;
          const r = await adapter.launchTool({
            id: tool.id,
            installedPath: tool.installedPath,
            workspaceId: activeWorkspaceId,
            // Built-in tools send pre-computed args; a third-party adapter gets
            // the raw prompt so the server can apply its promptArgTemplate (#5).
            ...(args ? { args } : (prompt.trim() ? { prompt } : {})),
            ...(watchMode ? { observe: true } : {}),
          });
          const promptNote = args ? ' with prompt' : '';
          setLastResult({
            toolId: tool.id,
            action,
            ok: r.ok,
            message: r.ok
              ? `Launched ${tool.displayName}${promptNote} (pid ${r.pid})`
              : (r.error ?? 'Launch failed'),
          });
          // Clear the prompt after a successful launch — avoid sending
          // the same text twice by accident.
          if (r.ok && args) setPrompt('');
          // Watch mode (⌘K deep-link): auto-open the live output pane.
          if (r.ok && watchMode) setOpenPaneToolId(tool.id);
        } else {
          const r = await adapter.manageHooks({ id: tool.id, action });
          setLastResult({
            toolId: tool.id,
            action,
            ok: r.ok,
            message: r.ok
              ? `${tool.displayName}: ${action} OK`
              : (r.error || r.stderr || `${action} failed (exit ${r.code})`),
          });
          // Refresh detection after install/uninstall so hook status
          // updates on screen without waiting for user click.
          if (action === 'install' || action === 'uninstall') {
            await refresh();
          }
        }
      } catch (err) {
        setLastResult({
          toolId: tool.id,
          action,
          ok: false,
          message: err instanceof Error ? err.message : 'Action failed',
        });
      } finally {
        setActiveAction(null);
      }
    },
    [activeWorkspaceId, refresh, watchMode],
  );

  const tools = useMemo<DetectedTool[]>(() => detection?.tools ?? [], [detection]);
  const availableWorkspaces = useMemo(
    () => workspaces.filter((workspace) => workspace.status !== 'archived'),
    [workspaces],
  );
  const taskCapableTools = useMemo(
    () => tools.filter(toolCanRunCapturedTask),
    [tools],
  );

  const openTaskComposer = useCallback((tool: DetectedTool) => {
    const defaultAccess = defaultAccessForTool(tool);
    if (!defaultAccess) return;
    const defaultWorkspace = availableWorkspaces.find((workspace) => workspace.id === activeWorkspaceId)
      ?? availableWorkspaces[0];
    setTaskToolId(tool.id);
    setTaskPrompt('');
    setTaskWorkspaceIds(defaultWorkspace ? [defaultWorkspace.id] : []);
    setTaskParticipants({ [tool.id]: defaultAccess });
    setLastResult(null);
  }, [activeWorkspaceId, availableWorkspaces]);

  const toggleTaskParticipant = useCallback((tool: DetectedTool) => {
    const defaultAccess = defaultAccessForTool(tool);
    if (!defaultAccess) return;
    setTaskParticipants((current) => {
      if (current[tool.id]) {
        const next = { ...current };
        delete next[tool.id];
        return next;
      }
      return { ...current, [tool.id]: defaultAccess };
    });
  }, []);

  const toggleTaskWorkspace = useCallback((workspaceId: string) => {
    setTaskWorkspaceIds((current) => current.includes(workspaceId)
      ? current.filter((id) => id !== workspaceId)
      : [...current, workspaceId]);
  }, []);

  const runCapturedTask = useCallback(async (tool: DetectedTool) => {
    const task = taskPrompt.trim();
    const participants = taskCapableTools.flatMap((candidate) => {
      const access = taskParticipants[candidate.id];
      return access ? [{ toolId: candidate.id, access }] : [];
    });
    if (!task || participants.length === 0 || taskWorkspaceIds.length === 0) return;
    setActiveAction({ toolId: tool.id, action: 'run' });
    setLastResult(null);
    try {
      const result = await adapter.runExternalToolTask({
        participants,
        workspaceIds: taskWorkspaceIds,
        prompt: task,
      });
      setLastResult({
        toolId: tool.id,
        action: 'run',
        ok: true,
        message: `Started ${participants.length} agent${participants.length === 1 ? '' : 's'} across ${taskWorkspaceIds.length} workspace${taskWorkspaceIds.length === 1 ? '' : 's'} (${result.runs.length} worker run${result.runs.length === 1 ? '' : 's'}) — opening Room.`,
      });
      setTaskPrompt('');
      setTaskToolId(null);
      setTaskParticipants({});
      onOpenRoom?.(result.roomId);
    } catch (err) {
      setLastResult({
        toolId: tool.id,
        action: 'run',
        ok: false,
        message: err instanceof Error ? err.message : 'Captured task failed to start',
      });
    } finally {
      setActiveAction(null);
    }
  }, [onOpenRoom, taskCapableTools, taskParticipants, taskPrompt, taskWorkspaceIds]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header — title + A/B segmented toggle + (Variation A only) refresh */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4" style={{ color: 'var(--honey)' }} />
          <span className="text-sm font-display font-semibold">Tool Launcher</span>
          {view === 'a' && detection && (
            <Badge variant="secondary" className="text-[11px] px-1.5 py-0 h-4">
              {detection.platform}
            </Badge>
          )}
        </div>
        <div
          role="tablist"
          aria-label="Launcher view"
          className="inline-flex gap-1 p-[3px] rounded-[10px]"
          style={{ background: 'var(--secondary, hsl(var(--secondary)))', border: '1px solid var(--line-soft)' }}
        >
          {(['a', 'b'] as LauncherView[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`text-[11.5px] font-display font-semibold px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                view === v ? '' : 'text-muted-foreground hover:text-foreground'
              }`}
              style={view === v ? { background: 'var(--honey)', color: '#1a1407' } : undefined}
            >
              {v === 'a' ? 'Launch' : 'How memory is shared'}
            </button>
          ))}
        </div>
        {view === 'a' && (
          <Button variant="ghost" size="sm" onClick={refresh} className="h-7 w-7 p-0 ml-auto">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {view === 'b' ? (
        <MemorySharingView />
      ) : (
        <>
      {/* Status bar */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 border-b border-destructive/30 text-[12px] text-destructive">
          <AlertTriangle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
      {lastResult && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-b border-border/30 text-[12px]"
          style={
            lastResult.ok
              ? { background: 'var(--healthy-wash)', color: 'var(--healthy)' }
              : { background: 'var(--risk-wash)', color: 'var(--risk)' }
          }
        >
          {lastResult.ok ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <XCircle className="w-3.5 h-3.5" />
          )}
          {lastResult.message}
        </div>
      )}

      {/* Phase 4 + E-2 — optional prompt to launch with. Only tools
          whose promptArgsForTool() returns non-null actually use it;
          others launch bare and silently ignore the prompt. The
          footer surfaces the per-tool acceptance state so users know
          which tools will receive the prompt. */}
      <div className="px-3 pt-3">
        <div className="rounded-lg border border-border/40 bg-card/30 p-2.5">
          <div className="flex items-center gap-1.5 mb-1.5 text-[11px] text-muted-foreground">
            <MessageSquare className="w-3 h-3" />
            <span>Optional prompt — passed to tools that accept inline prompts</span>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Paste a task or question. Leave blank to launch the tool bare."
            rows={2}
            className="w-full text-xs bg-background border border-border/40 rounded p-2 resize-y min-h-[44px] max-h-[200px]"
          />
          {prompt.trim().length > 0 && (
            <div className="mt-1.5 text-[10px] text-muted-foreground/80 leading-snug">
              {(() => {
                const accepting = tools
                  .filter((t) => toolAcceptsInlinePrompt(t.id))
                  .map((t) => t.displayName);
                const ignoring = tools
                  .filter((t) => !toolAcceptsInlinePrompt(t.id))
                  .map((t) => t.displayName);
                return (
                  <>
                    <span style={{ color: 'var(--healthy)' }}>Sent to:</span>{' '}
                    {accepting.join(', ') || 'none'}
                    {ignoring.length > 0 && (
                      <>
                        {' · '}
                        <span className="text-muted-foreground/60">Ignored by:</span>{' '}
                        {ignoring.join(', ')}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Tools list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {loading && tools.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Detecting installed tools…
            </div>
          )}
          {tools.map((tool) => {
            const inCohort = LAUNCH_COHORT.includes(tool.id);
            const hooksSupported = HOOKS_COHORT.includes(tool.id);
            const isActive = activeAction?.toolId === tool.id;
            return (
              <div
                key={tool.id}
                data-testid={`launcher-tool-${tool.id}`}
                className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-2"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{tool.displayName}</span>
                      {tool.installed ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4" style={{ background: 'var(--healthy-wash)', color: 'var(--healthy)' }}>
                          Installed
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                          Not installed
                        </Badge>
                      )}
                      {tool.hooksInstalled && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4" style={{ background: 'var(--honey-wash)', color: 'var(--honey)' }}>
                          Hooks active
                        </Badge>
                      )}
                      {runningTools.has(tool.id) && (
                        <button
                          type="button"
                          onClick={() => setOpenPaneToolId((cur) => (cur === tool.id ? null : tool.id))}
                          aria-expanded={openPaneToolId === tool.id}
                          title="Show live output"
                          className="text-[10px] px-1.5 py-0 h-4 inline-flex items-center rounded transition-opacity hover:opacity-80"
                          style={{ background: 'var(--work-wash)', color: 'var(--work)' }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full inline-block mr-1 animate-pulse" style={{ background: 'var(--work)' }} />
                          Running
                        </button>
                      )}
                      {!inCohort && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                          Phase 4
                        </Badge>
                      )}
                    </div>
                    {tool.installedPath && (
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5" title={tool.installedPath}>
                        {tool.installedPath}
                      </div>
                    )}
                    {tool.version && (
                      <div className="text-[11px] text-muted-foreground">v{tool.version}</div>
                    )}
                    {tool.diagnostic && (
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--attention)' }}>{tool.diagnostic}</div>
                    )}
                  </div>
                </div>

                {/* Actions row */}
                {inCohort && tool.installed && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-[11px]"
                      onClick={() => doAction(tool, 'launch')}
                      disabled={isActive}
                    >
                      {isActive && activeAction?.action === 'launch' ? (
                        <Loader2 className="w-3 h-3 animate-spin mr-1" />
                      ) : (
                        <Play className="w-3 h-3 mr-1" />
                      )}
                      Launch
                    </Button>
                    {toolCanRunCapturedTask(tool) && (
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-[11px]"
                        onClick={() => openTaskComposer(tool)}
                        disabled={isActive}
                      >
                        {isActive && activeAction?.action === 'run' ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Workflow className="w-3 h-3 mr-1" />
                        )}
                        Run task
                      </Button>
                    )}
                    {runningTools.has(tool.id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        style={{ color: 'var(--risk)' }}
                        onClick={() => stopTool(tool)}
                        disabled={isActive}
                        title="Send SIGTERM (escalates to SIGKILL after 3s if needed)"
                      >
                        <Square className="w-3 h-3 mr-1" />
                        Stop
                      </Button>
                    )}
                    {hooksSupported && !tool.hooksInstalled && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-[11px]"
                        onClick={() => doAction(tool, 'install')}
                        disabled={isActive}
                      >
                        {isActive && activeAction?.action === 'install' ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Download className="w-3 h-3 mr-1" />
                        )}
                        Install hooks
                      </Button>
                    )}
                    {hooksSupported && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        onClick={() => doAction(tool, 'verify')}
                        disabled={isActive}
                      >
                        {isActive && activeAction?.action === 'verify' ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <ShieldCheck className="w-3 h-3 mr-1" />
                        )}
                        Verify
                      </Button>
                    )}
                    {hooksSupported && tool.hooksInstalled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        style={{ color: 'var(--risk)' }}
                        onClick={() => doAction(tool, 'uninstall')}
                        disabled={isActive}
                      >
                        {isActive && activeAction?.action === 'uninstall' ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Trash2 className="w-3 h-3 mr-1" />
                        )}
                        Uninstall hooks
                      </Button>
                    )}
                  </div>
                )}
                {taskToolId === tool.id && toolCanRunCapturedTask(tool) && (
                  <div
                    className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3"
                    data-testid={`captured-task-${tool.id}`}
                  >
                    <div>
                      <p className="text-xs font-display font-semibold text-foreground">
                        Captured agent team · started from {tool.displayName}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Each selected agent runs once per workspace. Progress, results, and memory return to one Room.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor={`captured-task-prompt-${tool.id}`} className="text-[11px] font-medium text-foreground">
                        Task
                      </label>
                      <textarea
                        id={`captured-task-prompt-${tool.id}`}
                        aria-label={`Task for ${tool.displayName}`}
                        value={taskPrompt}
                        onChange={(event) => setTaskPrompt(event.target.value)}
                        rows={3}
                        placeholder="Describe the result this agent should deliver…"
                        className="w-full text-xs bg-background border border-border/50 rounded p-2 resize-y min-h-[64px] max-h-[220px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <fieldset className="space-y-1.5">
                      <legend className="text-[11px] font-medium text-foreground">Agents</legend>
                      <div className="space-y-1.5">
                        {taskCapableTools.map((candidate) => {
                          const access = taskParticipants[candidate.id];
                          return (
                            <div
                              key={candidate.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/40 bg-background/60 px-2 py-1.5"
                            >
                              <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
                                <input
                                  type="checkbox"
                                  aria-label={candidate.displayName}
                                  checked={access !== undefined}
                                  onChange={() => toggleTaskParticipant(candidate)}
                                />
                                <span>{candidate.displayName}</span>
                              </label>
                              {access && (
                                <select
                                  aria-label={`Access for ${candidate.displayName}`}
                                  value={access}
                                  onChange={(event) => setTaskParticipants((current) => ({
                                    ...current,
                                    [candidate.id]: event.target.value as ExternalToolAccess,
                                  }))}
                                  className="h-7 rounded border border-border/50 bg-background px-2 text-[11px] text-foreground"
                                >
                                  {(candidate.permissionModes ?? []).map((mode) => (
                                    <option key={mode} value={mode}>{ACCESS_LABELS[mode]}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                    <fieldset className="space-y-1.5">
                      <legend className="text-[11px] font-medium text-foreground">Workspaces</legend>
                      {availableWorkspaces.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {availableWorkspaces.map((workspace) => (
                            <label
                              key={workspace.id}
                              className="flex items-center gap-2 rounded border border-border/40 bg-background/60 px-2 py-1.5 text-[11px] text-foreground cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={taskWorkspaceIds.includes(workspace.id)}
                                onChange={() => toggleTaskWorkspace(workspace.id)}
                              />
                              <span className="truncate">{workspace.name}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">Create a workspace before running a captured task.</p>
                      )}
                    </fieldset>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px]"
                        onClick={() => setTaskToolId(null)}
                        disabled={isActive}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => void runCapturedTask(tool)}
                        disabled={isActive || !taskPrompt.trim() || Object.keys(taskParticipants).length === 0 || taskWorkspaceIds.length === 0}
                      >
                        {isActive && activeAction?.action === 'run' ? (
                          <Loader2 className="w-3 h-3 animate-spin mr-1" />
                        ) : (
                          <Workflow className="w-3 h-3 mr-1" />
                        )}
                        Start in Room
                      </Button>
                    </div>
                  </div>
                )}
                {inCohort && !tool.installed && (
                  <div className="text-[11px] text-muted-foreground">
                    Install the tool first, then refresh.
                  </div>
                )}
                {!inCohort && (
                  <div className="text-[11px] text-muted-foreground">
                    Detection ready · launch and hook management arrive in Phase 4.
                  </div>
                )}

                {/* AI-OS #4 — progressive-disclosure live output pane. */}
                {openPaneToolId === tool.id && (() => {
                  const pid = (pidsByTool.get(tool.id) ?? [])[0];
                  if (pid == null) return null;
                  return (
                    <ToolOutputPane pid={pid} toolId={tool.id} observed={observedPids.has(pid)} />
                  );
                })()}
              </div>
            );
          })}
        </div>
      </ScrollArea>
        </>
      )}
    </div>
  );
};

/**
 * Variation B · How memory is shared — a pure-UI explainer. No backend, no
 * adapter calls, no live data: a fixed flow diagram + three cards + one
 * provenance example, mirroring launcher.html lines 147-181. The provenance
 * example string is illustrative (a documentation example, not a real recall),
 * so it carries an explicit "example" label — no fabricated live data.
 */

interface FlowNode {
  tag: string;
  title: string;
  detail: React.ReactNode;
  hive?: boolean;
}

const FLOW_NODES: readonly FlowNode[] = [
  {
    tag: 'You launch',
    title: 'Claude Code',
    detail: (
      <>
        opened from Waggle with
        <br />
        <span className="font-mono text-[10.5px]" style={{ color: 'var(--honey)' }}>
          WAGGLE_WORKSPACE_ID
        </span>
      </>
    ),
  },
  {
    tag: '5 lifecycle hooks',
    title: 'hive-mind',
    detail: <>session · prompt · stop · compact · tool</>,
  },
  {
    tag: 'Your workspace',
    title: 'The hive',
    detail: (
      <>
        local SQLite memory
        <br />
        shared with Waggle
      </>
    ),
    hive: true,
  },
];

interface ExplainerCard {
  icon: typeof ArrowDownToLine;
  title: string;
  body: string;
}

const EXPLAINER_CARDS: readonly ExplainerCard[] = [
  {
    icon: ArrowDownToLine,
    title: 'It recalls on start',
    body: 'The agent opens already knowing this workspace — decisions, constraints, and context, pulled from the hive.',
  },
  {
    icon: ArrowRight,
    title: 'It commits as it works',
    body: 'Every meaningful step is captured back into the hive, so Waggle and your next session see it too.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Reversible & local',
    body: 'Hooks install and uninstall cleanly. Nothing leaves your machine; you can verify or remove them anytime.',
  },
];

const MemorySharingView = () => {
  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="max-w-[940px] mx-auto px-8 py-8 pb-16">
        {/* Heading */}
        <header className="mb-6">
          <div
            className="font-mono text-[11px] uppercase tracking-[0.14em] mb-3 flex items-center gap-2.5"
            style={{ color: 'var(--honey)' }}
          >
            <span className="inline-block w-5 h-px" style={{ background: 'var(--honey-line)' }} aria-hidden="true" />
            How memory is shared
          </div>
          <h1 className="text-[26px] font-display font-semibold tracking-tight leading-tight m-0 mb-2.5 text-foreground">
            How a launched agent shares the hive
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed m-0 max-w-[64ch]">
            When you launch from Waggle, the workspace&apos;s memory is wired into the external tool — no copy-paste, no
            re-explaining. Its work comes back <b className="text-foreground font-medium">attributed</b>.
          </p>
        </header>

        {/* Flow diagram + cards + provenance example */}
        <div
          className="rounded-2xl px-8 py-9 text-center"
          style={{
            border: '1px solid var(--line)',
            background: 'radial-gradient(70% 90% at 50% 0%, var(--secondary, hsl(var(--secondary))), var(--bg-2))',
          }}
        >
          {/* Flow row */}
          <div className="flex items-center justify-center flex-wrap gap-y-3">
            {FLOW_NODES.map((node, i) => (
              <div key={node.title} className="flex items-center">
                <div
                  className="rounded-xl px-4 py-4 min-w-[140px] max-w-[184px] text-left"
                  style={
                    node.hive
                      ? {
                          border: '1px solid var(--honey-line)',
                          boxShadow: 'var(--honey-glow)',
                          background: 'linear-gradient(150deg, var(--secondary, hsl(var(--secondary))), var(--card, hsl(var(--card))))',
                        }
                      : { border: '1px solid var(--line-strong)', background: 'var(--card, hsl(var(--card)))' }
                  }
                >
                  <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] mb-1.5 text-muted-foreground/80">
                    {node.tag}
                  </div>
                  <div className="text-sm font-display font-semibold text-foreground">{node.title}</div>
                  <div className="text-[11.5px] text-muted-foreground mt-1 leading-snug">{node.detail}</div>
                </div>
                {i < FLOW_NODES.length - 1 && (
                  <div className="px-3 text-center shrink-0" style={{ color: 'var(--honey)' }} aria-hidden="true">
                    <ArrowRight className="w-5 h-5 mx-auto" />
                    <span className="block font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">
                      {i === 0 ? 'hooks' : 'recall + commit'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Three explainer cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-7 text-left">
            {EXPLAINER_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className="rounded-xl p-4"
                  style={{ background: 'var(--card, hsl(var(--card)))', border: '1px solid var(--line-soft)' }}
                >
                  <Icon className="w-[17px] h-[17px] mb-2.5" style={{ color: 'var(--honey)' }} aria-hidden="true" />
                  <b className="text-[13.5px] font-display font-semibold block mb-1.5 text-foreground">{card.title}</b>
                  <p className="m-0 text-[12.5px] text-muted-foreground leading-relaxed">{card.body}</p>
                </div>
              );
            })}
          </div>

          {/* Provenance example — illustrative, explicitly labelled */}
          <div
            className="mt-5 inline-flex items-center gap-2 font-mono text-[11.5px] px-3 py-1.5 rounded-lg"
            style={{
              color: 'var(--intel)',
              background: 'var(--intel-wash)',
              border: '1px solid color-mix(in srgb, var(--intel) 28%, transparent)',
            }}
            title="Illustrative example of how a recall is attributed"
          >
            <Hexagon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>example · remembered from Claude Code · 14:22 · session a1f9</span>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Workflow className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>This is how the wiring works — switch to <b className="text-foreground/90 font-medium">Launch</b> to open an agent into this workspace.</span>
        </div>
      </div>
    </ScrollArea>
  );
};

export default LauncherApp;
