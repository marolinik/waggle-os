import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { DetailDrawer } from '@/components/ui/detail-drawer';
import { Textarea } from '@/components/ui/textarea';

/**
 * Skill markdown editor (UX-Refactor Phase 3B, S06). Loads the full body via
 * GET /api/skills/:name and saves through adapter.updateSkill (PATCH alias →
 * the existing PUT path, so redaction + traversal guard + hash + hot-reload
 * all apply). The skill NAME is its id. Full builder (S19) is Phase 3C.
 */
interface SkillEditorDrawerProps {
  skillName: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (name: string) => void;
}

const SkillEditorDrawer = ({ skillName, onOpenChange, onSaved }: SkillEditorDrawerProps) => {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!skillName) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent('');
    adapter.fetch(`/api/skills/${encodeURIComponent(skillName)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load skill (${r.status})`);
        return r.json();
      })
      .then((data: { content?: string }) => { if (!cancelled) setContent(data.content ?? ''); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load skill'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [skillName]);

  const save = async () => {
    if (!skillName || !content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await adapter.updateSkill(skillName, content);
      onSaved(skillName);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save skill');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open={!!skillName}
      onOpenChange={onOpenChange}
      title={skillName ?? 'Skill'}
      subtitle="Markdown body — secrets and local paths are redacted on save"
      footer={
        <div className="flex items-center gap-2 w-full">
          <button
            onClick={() => void save()}
            disabled={saving || loading || !content.trim()}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
          </button>
          {error && <span role="alert" className="text-[11px] text-destructive truncate">{error}</span>}
        </div>
      }
    >
      {loading ? (
        <p role="status" className="text-[11px] text-muted-foreground">Loading skill…</p>
      ) : (
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-label="Skill markdown content"
          name="skillMarkdownContent"
          autoComplete="off"
          className="min-h-[320px] font-mono text-[11px] leading-relaxed"
          spellCheck={false}
        />
      )}
    </DetailDrawer>
  );
};

export default SkillEditorDrawer;
