/**
 * AddCustomMcpForm — the S08 Custom tab (UX-Refactor Phase 4B). Registers an
 * arbitrary stdio MCP server via POST /api/mcps (tier-gated server-side, B5):
 * `{ name, command, args[], env{}, workspaceId? }`. 400 (validation /
 * injection-scan) and 409 (duplicate) render inline; the tier 403 routes
 * through the global UpgradeModal handler.
 */
import { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { adapter } from '@/lib/adapter';

/** Parse `KEY=VALUE` lines into an env record (blank lines skipped). */
export function parseEnvLines(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

interface AddCustomMcpFormProps {
  onAdded: (id: string) => void;
}

const CONTROL_FOCUS_CLASS = 'focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-background';

const AddCustomMcpForm = ({ onAdded }: AddCustomMcpFormProps) => {
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [envText, setEnvText] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adapter.getWorkspaces()
      .then(ws => setWorkspaces(ws.map(w => ({ id: w.id, name: w.name }))))
      .catch(() => setWorkspaces([]));
  }, []);

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const args = argsText.split('\n').map(a => a.trim()).filter(Boolean);
      const env = parseEnvLines(envText);
      const res = await adapter.addCustomMcp({
        name: name.trim(),
        command: command.trim(),
        ...(args.length > 0 ? { args } : {}),
        ...(Object.keys(env).length > 0 ? { env } : {}),
        ...(workspaceId ? { workspaceId } : {}),
      }) as { id?: string; registered?: boolean; error?: string };
      if (res.id) {
        setName(''); setCommand(''); setArgsText(''); setEnvText(''); setWorkspaceId('');
        onAdded(res.id);
      } else if (res.error && res.error !== 'TIER_INSUFFICIENT') {
        // 400 validation / injection-scan rejection or 409 duplicate.
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Server unreachable');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 max-w-lg" data-testid="add-custom-mcp-form">
      <div>
        <h3 className="text-sm font-display font-semibold text-foreground">Add a custom MCP server</h3>
        <p className="text-[11px] text-muted-foreground">
          Registers a local stdio server (command + args). Teams governance can manage shared use;
          Solo can run local servers on this device.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2 py-1.5">{error}</p>
      )}

      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">Name</span>
        <Input
          name="mcpServerName"
          autoComplete="off"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="my-mcp-server"
          className={`bg-muted/50 text-xs h-auto py-1.5 ${CONTROL_FOCUS_CLASS}`}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">Command</span>
        <Input
          name="mcpServerCommand"
          autoComplete="off"
          value={command}
          onChange={e => setCommand(e.target.value)}
          placeholder="npx"
          className={`bg-muted/50 text-xs h-auto py-1.5 font-mono ${CONTROL_FOCUS_CLASS}`}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">Arguments (one per line)</span>
        <Textarea
          name="mcpServerArgs"
          autoComplete="off"
          value={argsText}
          onChange={e => setArgsText(e.target.value)}
          placeholder={'-y\n@modelcontextprotocol/server-filesystem'}
          rows={3}
          className={`bg-muted/50 text-xs font-mono ${CONTROL_FOCUS_CLASS}`}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">Environment (KEY=VALUE, one per line)</span>
        <Textarea
          name="mcpServerEnv"
          autoComplete="off"
          value={envText}
          onChange={e => setEnvText(e.target.value)}
          placeholder="API_KEY=..."
          rows={2}
          className={`bg-muted/50 text-xs font-mono ${CONTROL_FOCUS_CLASS}`}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] text-muted-foreground">Workspace scope (optional — C19 single workspace)</span>
        <select
          name="mcpWorkspaceScope"
          autoComplete="off"
          value={workspaceId}
          onChange={e => setWorkspaceId(e.target.value)}
          className={`w-full text-xs bg-muted/50 border border-border/40 rounded-md px-2 py-1.5 text-foreground focus-visible:outline-none ${CONTROL_FOCUS_CLASS}`}
        >
          <option value="">Personal — all workspaces</option>
          {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </label>

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={!name.trim() || !command.trim() || busy}
        data-testid="add-custom-mcp-submit"
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors font-display focus-visible:outline-none ${CONTROL_FOCUS_CLASS}`}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add server
      </button>
    </div>
  );
};

export default AddCustomMcpForm;
