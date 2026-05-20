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
  Play, Download, ShieldCheck, Trash2, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { adapter } from '@/lib/adapter';

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
          const r = await adapter.launchTool({
            id: tool.id,
            installedPath: tool.installedPath,
            workspaceId: activeWorkspaceId,
          });
          setLastResult({
            toolId: tool.id,
            action,
            ok: r.ok,
            message: r.ok
              ? `Launched ${tool.displayName} (pid ${r.pid})`
              : (r.error ?? 'Launch failed'),
          });
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
