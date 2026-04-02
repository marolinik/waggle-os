/**
 * PluginToolsEditor — inline editor for plugin tool implementations.
 * Uses plain textarea (no Monaco) for zero bundle impact.
 */

import { useState, useEffect, useCallback } from 'react';

interface ToolDef {
  name: string;
  description: string;
  hasImplementation: boolean;
  content: string | null;
}

interface PluginToolsEditorProps {
  pluginName: string;
  baseUrl: string;
  onClose: () => void;
}

export function PluginToolsEditor({ pluginName, baseUrl, onClose }: PluginToolsEditorProps) {
  const [tools, setTools] = useState<ToolDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showNewTool, setShowNewTool] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const fetchTools = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/plugins/${pluginName}/tools`);
      if (res.ok) { const d = await res.json(); setTools(d.tools ?? []); }
    } catch { /* */ }
    setLoading(false);
  }, [pluginName, baseUrl]);

  useEffect(() => { fetchTools(); }, [fetchTools]);

  const handleSelect = async (tool: ToolDef) => {
    setActiveTool(tool.name);
    setSaveResult(null);
    if (tool.content) { setEditContent(tool.content); return; }
    try {
      const res = await fetch(`${baseUrl}/api/plugins/${pluginName}/tools/${tool.name}`);
      if (res.ok) { const d = await res.json(); setEditContent(d.content ?? ''); }
    } catch { /* */ }
  };

  const handleSave = async () => {
    if (!activeTool) return;
    setSaving(true); setSaveResult(null);
    try {
      const res = await fetch(`${baseUrl}/api/plugins/${pluginName}/tools/${activeTool}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      });
      const d = await res.json();
      setSaveResult(res.ok ? { ok: true, msg: 'Saved. Plugin reloaded.' } : { ok: false, msg: d.error ?? 'Failed' });
      if (res.ok) await fetchTools();
    } catch (e) { setSaveResult({ ok: false, msg: (e as Error).message }); }
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newDesc.trim()) return;
    setAdding(true); setAddError(null);
    try {
      const res = await fetch(`${baseUrl}/api/plugins/${pluginName}/tools`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      });
      const d = await res.json();
      if (res.ok) {
        setNewName(''); setNewDesc(''); setShowNewTool(false);
        await fetchTools();
        setActiveTool(newName.trim());
        const tpl = await fetch(`${baseUrl}/api/plugins/${pluginName}/tools/${newName.trim()}`);
        if (tpl.ok) { const t = await tpl.json(); setEditContent(t.content ?? ''); }
      } else { setAddError(d.error ?? 'Failed'); }
    } catch (e) { setAddError((e as Error).message); }
    setAdding(false);
  };

  return (
    <div className="mt-2 rounded-lg border border-primary/20 bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Tools Editor</span>
          <span className="text-xs text-muted-foreground">{pluginName}</span>
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Close</button>
      </div>
      <div className="flex" style={{ minHeight: 300 }}>
        {/* Tool list */}
        <div className="w-44 shrink-0 border-r border-border flex flex-col">
          <div className="p-2 border-b border-border">
            <button onClick={() => setShowNewTool(v => !v)} className="w-full text-[11px] text-primary hover:text-primary/80 text-left px-2 py-1 rounded hover:bg-primary/5">+ Add Tool</button>
          </div>
          {showNewTool && (
            <div className="p-2 border-b border-border space-y-1.5 bg-muted/20">
              <input type="text" placeholder="tool-name" value={newName} onChange={e => setNewName(e.target.value.replace(/\s/g, '-'))}
                className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              <input type="text" placeholder="What it does" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              {addError && <p className="text-[10px] text-destructive">{addError}</p>}
              <button onClick={handleAdd} disabled={adding || !newName.trim() || !newDesc.trim()}
                className="w-full text-[11px] rounded bg-primary text-primary-foreground px-2 py-1 disabled:opacity-50">
                {adding ? 'Adding...' : 'Add'}
              </button>
            </div>
          )}
          {loading ? <div className="p-3 text-[11px] text-muted-foreground">Loading...</div>
          : tools.length === 0 ? <div className="p-3 text-[11px] text-muted-foreground">No tools. Add one above.</div>
          : <div className="flex-1 overflow-y-auto">
              {tools.map(t => (
                <button key={t.name} onClick={() => handleSelect(t)}
                  className={`w-full text-left px-3 py-2 text-[11px] transition-colors border-b border-border/50 ${activeTool === t.name ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.hasImplementation ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                    <span className="font-mono truncate">{t.name}</span>
                  </div>
                </button>
              ))}
            </div>}
        </div>
        {/* Editor */}
        <div className="flex-1 flex flex-col">
          {!activeTool ? (
            <div className="flex-1 flex items-center justify-center text-[11px] text-muted-foreground">Select a tool to edit</div>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20">
                <span className="text-[11px] font-mono text-foreground">{activeTool}.js</span>
                <div className="flex items-center gap-2">
                  {saveResult && <span className={`text-[10px] ${saveResult.ok ? 'text-green-500' : 'text-destructive'}`}>{saveResult.msg}</span>}
                  <button onClick={handleSave} disabled={saving}
                    className="text-[11px] px-2.5 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors">
                    {saving ? 'Saving...' : 'Save & Reload'}
                  </button>
                </div>
              </div>
              <textarea value={editContent} onChange={e => setEditContent(e.target.value)} spellCheck={false}
                className="flex-1 resize-none bg-background text-foreground font-mono text-[11px] leading-5 p-3 focus:outline-none border-none"
                style={{ tabSize: 2 }} placeholder="// Tool implementation..." />
            </>
          )}
        </div>
      </div>
      <div className="px-4 py-2 border-t border-border bg-muted/10 text-[10px] text-muted-foreground">
        Green dot = has implementation. Grey = stub. Save & Reload to apply changes.
      </div>
    </div>
  );
}
