/**
 * ComplianceTemplateModal — list/create/edit compliance report templates (M-03).
 *
 * Lives next to ComplianceDashboard so it can be opened via the dashboard's
 * "Edit templates" action. Templates are stored on the personal mind via the
 * CRUD routes at /api/compliance/templates.
 *
 * Keeps UI state local (useState) rather than pulling in TanStack Query to
 * match the rest of CockpitApp's patterns.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Loader2, Trash2, Pencil } from 'lucide-react';
import { adapter } from '@/lib/adapter';

export interface ComplianceTemplateSections {
  interactions: boolean;
  oversight: boolean;
  models: boolean;
  provenance: boolean;
  riskAssessment: boolean;
  fria: boolean;
}

export interface ComplianceTemplate {
  id: number;
  name: string;
  description: string | null;
  sections: ComplianceTemplateSections;
  riskClassification: 'minimal' | 'limited' | 'high-risk' | 'unacceptable' | null;
  orgName: string | null;
  footerText: string | null;
  createdAt: string;
  updatedAt: string;
}

const ALL_ON: ComplianceTemplateSections = {
  interactions: true,
  oversight: true,
  models: true,
  provenance: true,
  riskAssessment: true,
  fria: false,
};

const SECTION_LABELS: { key: keyof ComplianceTemplateSections; label: string }[] = [
  { key: 'interactions', label: 'Interactions' },
  { key: 'oversight', label: 'Oversight' },
  { key: 'models', label: 'Models' },
  { key: 'provenance', label: 'Provenance' },
  { key: 'riskAssessment', label: 'Risk' },
  { key: 'fria', label: 'FRIA' },
];

interface ComplianceTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onChange?: () => void;
}

export function ComplianceTemplateModal({ open, onClose, onChange }: ComplianceTemplateModalProps) {
  const [templates, setTemplates] = useState<ComplianceTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ComplianceTemplate | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSections, setFormSections] = useState<ComplianceTemplateSections>(ALL_ON);
  const [formRisk, setFormRisk] = useState<ComplianceTemplate['riskClassification']>(null);
  const [formOrgName, setFormOrgName] = useState('');
  const [formFooter, setFormFooter] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { templates: list } = await adapter.listComplianceTemplates();
      setTemplates(list as ComplianceTemplate[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const startCreate = () => {
    setEditing(null);
    setIsCreating(true);
    setFormName('');
    setFormDescription('');
    setFormSections({ ...ALL_ON });
    setFormRisk(null);
    setFormOrgName('');
    setFormFooter('');
  };

  const startEdit = (t: ComplianceTemplate) => {
    setIsCreating(false);
    setEditing(t);
    setFormName(t.name);
    setFormDescription(t.description ?? '');
    setFormSections({ ...t.sections });
    setFormRisk(t.riskClassification);
    setFormOrgName(t.orgName ?? '');
    setFormFooter(t.footerText ?? '');
  };

  const cancelForm = () => {
    setIsCreating(false);
    setEditing(null);
  };

  const save = async () => {
    if (!formName.trim()) {
      setError('Template name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        sections: formSections,
        riskClassification: formRisk,
        orgName: formOrgName.trim() || null,
        footerText: formFooter.trim() || null,
      };
      if (editing) {
        await adapter.updateComplianceTemplate(editing.id, payload);
      } else {
        await adapter.createComplianceTemplate(payload);
      }
      await refresh();
      cancelForm();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: ComplianceTemplate) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    setError(null);
    try {
      await adapter.deleteComplianceTemplate(t.id);
      if (editing?.id === t.id) cancelForm();
      await refresh();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  if (!open) return null;

  const showForm = isCreating || editing !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl bg-secondary border border-border/40 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
          <h3 className="text-sm font-display font-semibold text-foreground">Compliance report templates</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-4 mt-3 px-2 py-1 rounded text-[11px] bg-destructive/10 text-destructive">
            {error}
          </div>
        )}

        {/* Template list */}
        <div className="px-4 py-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <p className="text-[12px] text-muted-foreground text-center py-4">
              No templates yet. Create one to save a preferred report shape.
            </p>
          ) : (
            templates.map(t => (
              <div
                key={t.id}
                className={`p-2.5 rounded-lg border transition-colors ${
                  editing?.id === t.id
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-background/40 border-border/20 hover:border-border/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-display font-semibold text-foreground truncate">
                        {t.name}
                      </span>
                      {t.riskClassification && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {t.riskClassification}
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">{t.description}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1">
                      {SECTION_LABELS.filter(s => t.sections[s.key]).map(s => s.label).join(' · ') || 'no sections'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(t)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      aria-label={`Edit ${t.name}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => remove(t)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={`Delete ${t.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}

          {!showForm && (
            <button
              onClick={startCreate}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] text-muted-foreground hover:text-foreground border border-dashed border-border/40 hover:border-border/60 transition-colors"
            >
              <Plus className="w-3 h-3" />
              New template
            </button>
          )}
        </div>

        {/* Create/Edit form */}
        {showForm && (
          <div className="px-4 pb-4 space-y-2 border-t border-border/30 pt-3">
            <h4 className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">
              {editing ? `Edit "${editing.name}"` : 'New template'}
            </h4>

            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Name</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g. KVARK enterprise audit"
                className="w-full px-2 py-1 mt-0.5 bg-background/60 border border-border/40 rounded text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Description</label>
              <input
                type="text"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="optional"
                className="w-full px-2 py-1 mt-0.5 bg-background/60 border border-border/40 rounded text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Sections</label>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {SECTION_LABELS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFormSections(s => ({ ...s, [key]: !s[key] }))}
                    type="button"
                    className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                      formSections[key]
                        ? 'bg-primary/20 text-primary border-primary/30'
                        : 'bg-background/30 text-muted-foreground border-border/30 hover:text-foreground'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Risk class</label>
                <select
                  value={formRisk ?? ''}
                  onChange={e => setFormRisk((e.target.value || null) as ComplianceTemplate['riskClassification'])}
                  className="w-full px-2 py-1 mt-0.5 bg-background/60 border border-border/40 rounded text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                >
                  <option value="">inherit from workspace</option>
                  <option value="minimal">minimal</option>
                  <option value="limited">limited</option>
                  <option value="high-risk">high-risk</option>
                  <option value="unacceptable">unacceptable</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Org name</label>
                <input
                  type="text"
                  value={formOrgName}
                  onChange={e => setFormOrgName(e.target.value)}
                  placeholder="optional"
                  className="w-full px-2 py-1 mt-0.5 bg-background/60 border border-border/40 rounded text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Footer text</label>
              <input
                type="text"
                value={formFooter}
                onChange={e => setFormFooter(e.target.value)}
                placeholder="e.g. Confidential — internal only"
                className="w-full px-2 py-1 mt-0.5 bg-background/60 border border-border/40 rounded text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={cancelForm}
                disabled={saving}
                className="px-3 py-1 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !formName.trim()}
                className="px-3 py-1 rounded-lg text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
