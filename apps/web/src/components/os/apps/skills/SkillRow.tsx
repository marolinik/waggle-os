import { FlaskConical, Pencil, Loader2, FileCode2, ShieldCheck } from 'lucide-react';
import type { Skill } from '@/lib/types';
import { StatusBadge } from '@/components/ui/status-badge';
import type { StatusTone } from '@/components/ui/status-badge';

/**
 * Per-skill table row (UX-Refactor Phase 3B, S06 — the "SkillCard" DS variant;
 * blueprint density rule says rows, not cards, for the My Skills surface).
 * Shows what GET /api/skills exposes today: name + body preview + status.
 * Actions: Test (C37 preview-only) and Edit (PATCH markdown body).
 */
const STATUS_TONE: Record<Skill['status'], StatusTone> = {
  installed: 'healthy',
  draft: 'neutral',
  custom: 'info',
  workspace: 'info',
  marketplace: 'neutral',
  'update-available': 'attention',
};

interface SkillRowProps {
  skill: Skill;
  testing?: boolean;
  verifying?: boolean;
  onTest: (skill: Skill) => void;
  onEdit: (skill: Skill) => void;
  /** §D2: run the run-and-grade audit to mint the "verified" badge (PRO). */
  onVerify?: (skill: Skill) => void;
}

const SkillRow = ({ skill, testing, verifying, onTest, onEdit, onVerify }: SkillRowProps) => (
  <li className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/40 px-2.5 py-2">
    <FileCode2 className="w-4 h-4 text-muted-foreground shrink-0" />
    <span className="flex-1 min-w-0">
      <span className="block text-xs font-medium text-foreground truncate">{skill.name}</span>
      {skill.preview && (
        <span className="block text-[10px] text-muted-foreground truncate">{skill.preview}</span>
      )}
    </span>
    {skill.initiator === 'agent' && (
      <StatusBadge tone="attention" label="agent · review" />
    )}
    {skill.verified && (
      <StatusBadge
        tone="healthy"
        label={`verified${skill.confidence != null ? ` · ${Math.round(skill.confidence * 100)}%` : ''}`}
      />
    )}
    <StatusBadge tone={STATUS_TONE[skill.status]} label={skill.status === 'update-available' ? 'Update available' : skill.status} />
    {onVerify && (
      <button
        onClick={() => onVerify(skill)}
        disabled={verifying}
        aria-label={`Verify skill ${skill.name} (run-and-grade)`}
        title="Run the skill against a synthesized test and grade it — mints the verified badge (PRO)"
        className="p-1.5 rounded-lg text-emerald-500 hover:bg-emerald-500/10 transition-colors disabled:opacity-50 shrink-0"
      >
        {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
      </button>
    )}
    <button
      onClick={() => onTest(skill)}
      disabled={testing}
      aria-label={`Test skill ${skill.name} (preview only)`}
      title="Preview what this skill injects — nothing executes"
      className="p-1.5 rounded-lg text-honey hover:bg-primary/10 transition-colors disabled:opacity-50 shrink-0"
    >
      {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5" />}
    </button>
    <button
      onClick={() => onEdit(skill)}
      aria-label={`Edit skill ${skill.name}`}
      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
    >
      <Pencil className="w-3.5 h-3.5" />
    </button>
  </li>
);

export default SkillRow;
