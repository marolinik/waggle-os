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
  personas: Array<{ id: string; name: string; description: string; icon: string; tagline?: string; bestFor?: string[]; wontDo?: string }>;
  serverBaseUrl: string;
  onPersonaCreated?: () => void;
  /** Which workspace template is active (drives specialist section) */
  currentTemplateId?: string;
  /** Override universal persona IDs (defaults to built-in list) */
  universalPersonaIds?: string[];
}

export function PersonaSwitcher({
  open,
  onClose,
  onSelect,
  currentPersonaId,
  personas,
  serverBaseUrl,
  onPersonaCreated,
  currentTemplateId,
}: PersonaSwitcherProps) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', systemPrompt: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // ── Two-tier persona classification ──────────────────────────────
  const UNIVERSAL_IDS = [
    'general-purpose', 'planner', 'researcher', 'analyst',
    'writer', 'verifier', 'coordinator', 'coder',
  ];

  // Template → domain specialist persona IDs
  const TEMPLATE_SPECIALISTS: Record<string, string[]> = {
    'strategy-consulting':    ['consultant'],
    'legal-compliance':       ['legal-professional'],
    'finance-investment':     ['finance-owner'],
    'sales-bizdev':           ['sales-rep'],
    'marketing-brand':        ['marketer'],
    'product-management':     ['product-manager-senior'],
    'hr-people':              ['hr-manager'],
    'research-intelligence':  ['researcher'],
    'executive-leadership':   ['executive-assistant'],
    'technology-engineering': ['coder'],
    'startup-founder':        ['product-manager-senior'],
    'independent-consultant': ['consultant'],
    'operations-process':     ['consultant'],
    'government-policy':      ['analyst'],
    'personal-productivity':  [],
  };

  const universalPersonas = personas.filter(p => UNIVERSAL_IDS.includes(p.id));
  const specialistPersonas = currentTemplateId
    ? personas.filter(p =>
        (TEMPLATE_SPECIALISTS[currentTemplateId] ?? []).includes(p.id) &&
        !UNIVERSAL_IDS.includes(p.id)
      )
    : [];

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
          <div className="mt-2">
            {/* "None" option to reset to default */}
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`w-full rounded-lg border p-3 text-left transition-colors cursor-pointer hover:border-primary/50 ${
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

            {/* SECTION 1: Universal Modes */}
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                Universal Modes
              </p>
              <div className="grid grid-cols-2 gap-2">
                {universalPersonas.map((persona) => (
                  <PersonaCard
                    key={persona.id}
                    persona={persona}
                    isActive={currentPersonaId === persona.id}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </div>

            {/* SECTION 2: Workspace Specialists (only shown when template active and has specialists) */}
            {specialistPersonas.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  Your Workspace Specialists
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {specialistPersonas.map((persona) => (
                    <PersonaCard
                      key={persona.id}
                      persona={persona}
                      isActive={currentPersonaId === persona.id}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* "See all" link — shows remaining domain personas not already visible */}
            {personas.length > universalPersonas.length + specialistPersonas.length && (
              <button
                type="button"
                onClick={() => setShowAll(s => !s)}
                className="text-xs text-muted-foreground hover:text-foreground mt-2 px-1"
              >
                {showAll ? 'Show less ↑' : `See all ${personas.length} specialists →`}
              </button>
            )}
            {showAll && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {personas
                  .filter(p => !UNIVERSAL_IDS.includes(p.id) && !specialistPersonas.find(s => s.id === p.id))
                  .map(persona => (
                    <PersonaCard key={persona.id} persona={persona} isActive={currentPersonaId === persona.id} onSelect={handleSelect} />
                  ))}
              </div>
            )}

            {/* Create New Persona */}
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full mt-3 rounded-lg border border-dashed border-border p-3 text-left transition-colors cursor-pointer hover:border-primary/50"
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

// ── PersonaCard — reusable card with hover tooltip ──────────────────

function PersonaCard({
  persona,
  isActive,
  onSelect,
}: {
  persona: { id: string; name: string; description: string; icon: string; tagline?: string; bestFor?: string[]; wontDo?: string };
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={() => onSelect(persona.id)}
        className={`w-full rounded-lg border p-3 text-left transition-colors cursor-pointer hover:border-primary/50 ${
          isActive ? 'border-primary bg-primary/5' : 'border-border bg-card'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{persona.icon}</span>
          <span className="text-sm font-medium text-foreground">{persona.name}</span>
          {isActive && (
            <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-primary">Active</span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{persona.description}</p>
      </button>
      {/* Hover tooltip — only shown when tagline/bestFor exist */}
      {(persona.tagline || persona.bestFor) && (
        <div className="absolute left-full top-0 ml-2 w-56 z-50 hidden group-hover:block">
          <div className="rounded-lg border border-border bg-popover p-3 shadow-lg text-xs">
            {persona.tagline && (
              <p className="font-medium text-foreground mb-2">{persona.tagline}</p>
            )}
            {persona.bestFor && persona.bestFor.length > 0 && (
              <div>
                <p className="text-muted-foreground mb-1">Best for:</p>
                <ul className="space-y-1">
                  {persona.bestFor.slice(0, 2).map((use, i) => (
                    <li key={i} className="text-foreground">&mdash; {use}</li>
                  ))}
                </ul>
              </div>
            )}
            {persona.wontDo && (
              <p className="mt-2 text-muted-foreground border-t border-border pt-2">
                Won&apos;t: {persona.wontDo}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
