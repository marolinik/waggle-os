/**
 * AI-OS Phase 2B — LauncherApp.
 *
 * Dock surface for the AI-OS tool launcher. Lists every supported
 * AI tool (claude-code / cursor / claude-desktop in the launch
 * cohort; codex / hermes / openclaw stubbed as "Phase 4") with
 * detection status, hook-install status, and per-tool actions:
 *
 *   Launch in workspace X / Install hooks / Verify hooks / Uninstall hooks
 *
 * Adapter contract:
 *   adapter.detectTools()  → /api/tools/detect
 *   adapter.launchTool()   → /api/tools/launch
 *   adapter.manageHooks()  → /api/tools/hooks
 *
 * Minimal-viable UI. Polish (provenance details, version timeline,
 * advanced flags) is Phase 4.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Rocket, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Play, Download, ShieldCheck, Trash2, Loader2, MessageSquare, Square,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { adapter } from '@/lib/adapter';
import {
  promptArgsForTool,
  toolAcceptsInlinePrompt,
} from '@/lib/launcher-prompt-args';

// Phase 4 — full 7-tool cohort. Mirrors @waggle/shared LAUNCH_COHORT.
// Kept local (rather than imported) to avoid a runtime dependency on
// the shared module's named export for one constant.
const LAUNCH_COHORT = [
  'claude-code',
  'cursor',
  'claude-desktop',
  'codex',
  'codex-desktop',
  'hermes',
  'openclaw',
];

interface DetectedTool {
  id: string;
  displayName: string;
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

type ToolAction = 'launch' | 'install' | 'verify' | 'uninstall';

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
}

const LauncherApp = ({ activeWorkspaceId }: LauncherAppProps = {}) => {
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActionState | null>(null);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [prompt, setPrompt] = useState('');
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
    async (tool: DetectedTool, action: ToolAction) => {
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
            ...(args ? { args } : {}),
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
    [activeWorkspaceId, refresh],
  );

  const tools = useMemo<DetectedTool[]>(() => detection?.tools ?? [], [detection]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-display font-semibold">Tool Launcher</span>
          {detection && (
            <Badge variant="secondary" className="text-[11px] px-1.5 py-0 h-4">
              {detection.platform}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} className="h-7 w-7 p-0">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Status bar */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-rose-950/40 border-b border-rose-900/30 text-[12px] text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}
      {lastResult && (
        <div
          className={`flex items-center gap-2 px-3 py-2 border-b border-border/30 text-[12px] ${
            lastResult.ok ? 'bg-emerald-950/30 text-emerald-300' : 'bg-rose-950/30 text-rose-300'
          }`}
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
                    <span className="text-emerald-400/80">Sent to:</span>{' '}
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
            const isActive = activeAction?.toolId === tool.id;
            return (
              <div
                key={tool.id}
                className="rounded-lg border border-border/40 bg-card/40 p-3 space-y-2"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{tool.displayName}</span>
                      {tool.installed ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-950/40 text-emerald-300">
                          Installed
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                          Not installed
                        </Badge>
                      )}
                      {tool.hooksInstalled && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-950/40 text-amber-300">
                          Hooks active
                        </Badge>
                      )}
                      {runningTools.has(tool.id) && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-sky-950/40 text-sky-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block mr-1 animate-pulse" />
                          Running
                        </Badge>
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
                      <div className="text-[11px] text-amber-400 mt-0.5">{tool.diagnostic}</div>
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
                    {runningTools.has(tool.id) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-rose-400"
                        onClick={() => stopTool(tool)}
                        disabled={isActive}
                        title="Send SIGTERM (escalates to SIGKILL after 3s if needed)"
                      >
                        <Square className="w-3 h-3 mr-1" />
                        Stop
                      </Button>
                    )}
                    {!tool.hooksInstalled && (
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
                    {tool.hooksInstalled && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11px] text-rose-400"
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
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default LauncherApp;
