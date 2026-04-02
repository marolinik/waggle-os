/**
 * HooksSection — manage pre:tool deny rules for agent safety.
 */

import { useState, useEffect, useCallback } from 'react';

interface DenyRule { type: 'deny'; tools: string[]; pattern: string }

interface HooksSectionProps { baseUrl?: string }

const COMMON_TOOLS = ['bash', 'write_file', 'edit_file', 'git_commit', 'git_push'];

export function HooksSection({ baseUrl = 'http://localhost:3000' }: HooksSectionProps) {
  const [rules, setRules] = useState<DenyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTools, setNewTools] = useState<string[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/hooks`);
      if (res.ok) { const data = await res.json(); setRules(data.rules ?? []); }
    } catch { /* silent */ }
    setLoading(false);
  }, [baseUrl]);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleAdd = async () => {
    if (!newTools.length || !newPattern.trim()) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/hooks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'deny', tools: newTools, pattern: newPattern.trim() }),
      });
      if (res.ok) { setNewTools([]); setNewPattern(''); await fetchRules(); }
      else { const d = await res.json(); setError(d.error ?? 'Failed'); }
    } catch { setError('Could not reach server'); }
    setSaving(false);
  };

  const handleDelete = async (idx: number) => {
    try { const res = await fetch(`${baseUrl}/api/hooks/${idx}`, { method: 'DELETE' }); if (res.ok) await fetchRules(); } catch { /* */ }
  };

  const toggleTool = (tool: string) => {
    setNewTools(prev => prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Automation Rules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Block specific tool calls matching a text pattern. Rules run before every agent tool use.
        </p>
      </div>
      <div className="space-y-2">
        {loading ? <div className="text-xs text-muted-foreground">Loading rules...</div>
        : rules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No rules configured. Add one below to block dangerous patterns.
          </div>
        ) : rules.map((rule, idx) => (
          <div key={idx} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">DENY</span>
                {rule.tools.map(t => <span key={t} className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded text-foreground">{t}</span>)}
                <span className="text-xs text-muted-foreground">when args contain</span>
                <span className="text-[11px] font-mono bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded">{rule.pattern}</span>
              </div>
            </div>
            <button onClick={() => handleDelete(idx)} className="text-xs text-muted-foreground hover:text-destructive transition-colors shrink-0" title="Delete rule">✕</button>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <p className="text-xs font-medium text-foreground">Add Deny Rule</p>
        <div>
          <p className="text-[11px] text-muted-foreground mb-1.5">Apply to tools:</p>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_TOOLS.map(tool => (
              <button key={tool} onClick={() => toggleTool(tool)}
                className={`text-[11px] font-mono px-2 py-0.5 rounded border transition-colors ${newTools.includes(tool) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
                {tool}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <p className="text-[11px] text-muted-foreground mb-1">Block when args contain:</p>
            <input type="text" placeholder='e.g. "rm -rf" or "DROP TABLE"' value={newPattern} onChange={e => setNewPattern(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono" />
          </div>
          <div className="flex items-end">
            <button onClick={handleAdd} disabled={saving || !newTools.length || !newPattern.trim()}
              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">
              {saving ? 'Adding...' : 'Add Rule'}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
