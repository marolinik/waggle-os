/**
 * PersonaSwitcher — Dialog for switching agent persona mid-conversation.
 *
 * Uses shadcn Dialog. Persona grid follows the same card pattern as
 * CreateWorkspaceDialog's persona picker. Messages are preserved when
 * switching — only the system prompt changes via composePersonaPrompt().
 *
 * GAP-026: "Create Custom Persona" inline form POSTs to /api/personas.
 */

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export interface PersonaSwitcherProps {
  open: boolean;
  onClose: () => void;
  onSelect: (personaId: string | null) => void;
  currentPersonaId: string | null;
  personas: Array<{ id: string; name: string; description: string; icon: string }>;
  serverBaseUrl: string;
  onPersonaCreated?: () => void;
}

export function PersonaSwitcher({
  open,
  onClose,
  onSelect,
  currentPersonaId,
  personas,
  serverBaseUrl,
  onPersonaCreated,
}: PersonaSwitcherProps) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', systemPrompt: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (personaId: string | null) => {
    onSelect(personaId);
    onClose();
  };

  const resetForm = () => {
    setCreating(false);
    setForm({ name: '', description: '', systemPrompt: '' });
    setError(null);
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.systemPrompt.trim()) {
      setError('Name and system prompt are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${serverBaseUrl}/api/personas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          systemPrompt: form.systemPrompt.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? `Failed (${res.status})`);
        setSaving(false);
        return;
      }
      resetForm();
      onPersonaCreated?.();
    } catch {
      setError('Could not reach server');
      setSaving(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}
    >
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{creating ? 'Create Custom Persona' : 'Switch Persona'}</DialogTitle>
          <DialogDescription>
            {creating
              ? 'Define how your custom persona behaves.'
              : 'Change how Waggle behaves in this workspace. Messages are preserved.'}
          </DialogDescription>
        </DialogHeader>

        {creating ? (
          <div className="flex flex-col gap-3 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
              <input
                type="text"
                placeholder="e.g. Legal Reviewer"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
              <input
                type="text"
                placeholder="Short description of what this persona does"
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">System Prompt</label>
              <textarea
                placeholder="Instructions that define this persona's behavior, tone, and focus areas..."
                value={form.systemPrompt}
                onChange={(e) => setForm(f => ({ ...f, systemPrompt: e.target.value }))}
                rows={4}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Persona'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {/* "None" option to reset to default */}
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`rounded-lg border p-3 text-left transition-colors cursor-pointer hover:border-primary/50 ${
                currentPersonaId === null
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">--</span>
                <span className="text-sm font-medium text-foreground">None (Default)</span>
                {currentPersonaId === null && (
                  <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-primary">Current</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Core assistant, no persona overlay</p>
            </button>

            {personas.map((persona) => (
              <button
                key={persona.id}
                type="button"
                onClick={() => handleSelect(persona.id)}
                className={`rounded-lg border p-3 text-left transition-colors cursor-pointer hover:border-primary/50 ${
                  currentPersonaId === persona.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{persona.icon}</span>
                  <span className="text-sm font-medium text-foreground">{persona.name}</span>
                  {currentPersonaId === persona.id && (
                    <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-primary">Current</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{persona.description}</p>
              </button>
            ))}

            {/* Create New Persona */}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="rounded-lg border border-dashed border-border p-3 text-left transition-colors cursor-pointer hover:border-primary/50 col-span-2"
            >
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <span className="text-lg">+</span>
                <span className="text-sm">Create Custom Persona</span>
              </div>
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
