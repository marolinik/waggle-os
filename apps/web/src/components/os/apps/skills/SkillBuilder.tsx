import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { BuilderStepper, type BuilderStep } from '@/components/ui/stepper';
import { adapter } from '@/lib/adapter';

/**
 * Skill Builder (UX-Refactor Phase 3C, S19 — PRD §12.6). Replaces the 3B
 * compact CreateSkillDialog with the 4-step stepper: Identity → Content →
 * Scope → Review & create.
 *
 * Contracts honoured:
 *  - C13: create-to-local only (POST /api/skills/create — marketplace publish
 *    lives in the Hub). Create == installed: the file lands in
 *    ~/.waggle/skills and appears under My Skills immediately.
 *  - C14: inputs/outputs serialize into the markdown BODY ("## Inputs" /
 *    "## Outputs") — no frontmatter extension. The create route only accepts
 *    name/description/steps/category, so the sections are appended with a
 *    follow-up PUT through adapter.updateSkill (redaction + hash + hot-reload
 *    all apply — the builder never writes files directly).
 *  - C36: scope vocabulary is personal/workspace/organization. The backend
 *    exposes no skill-scope metadata yet, so only "personal" is selectable —
 *    rendered honestly, not silently dropped.
 *  - C37: testing stays preview-only and runs from the Hub once the skill
 *    exists (POST /api/skills/:id/test reads the installed file).
 */
interface SkillBuilderProps {
  onCreated: (name: string) => void;
  onCancel: () => void;
  /** Shared 403→UpgradeModal routing (server gate may land later). */
  onTierError: (err: unknown, name: string) => boolean;
}

/** Backend SKILL_FAMILIES 7-set (skills.ts) — NOT the narrower SkillPack union. */
const CATEGORIES = [
  { id: 'writing', label: 'Writing & Docs' },
  { id: 'research', label: 'Research & Analysis' },
  { id: 'decision', label: 'Decision Support' },
  { id: 'planning', label: 'Planning & Organization' },
  { id: 'communication', label: 'Communication' },
  { id: 'code', label: 'Code & Engineering' },
  { id: 'creative', label: 'Creative & Ideation' },
] as const;

// Mirrors the server's normalization (lowercase, non-[a-z0-9] runs → '-'):
// accept only names that survive it unchanged, so the created skill is
// exactly the name the user typed (and the traversal guard is satisfied).
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const splitLines = (text: string): string[] => text.split('\n').map((s) => s.trim()).filter(Boolean);

/** C14: append the Inputs/Outputs sections to the generated markdown body. */
export function appendIoSections(content: string, inputs: string[], outputs: string[]): string {
  const section = (title: string, items: string[]) =>
    items.length > 0 ? `\n## ${title}\n\n${items.map((i) => `- ${i}`).join('\n')}\n` : '';
  return `${content.trimEnd()}\n${section('Inputs', inputs)}${section('Outputs', outputs)}`;
}

const SkillBuilder = ({ onCreated, onCancel, onTierError }: SkillBuilderProps) => {
  const [step, setStep] = useState(0);
  // Identity
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('writing');
  // Content
  const [steps, setSteps] = useState<string[]>(['']);
  const [inputsText, setInputsText] = useState('');
  const [outputsText, setOutputsText] = useState('');
  // Submission
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the skill EXISTS but the C14 section append failed. */
  const [warning, setWarning] = useState<string | null>(null);
  /** The name the skill was actually created under — "Done" must hand THIS
   * back, not the live name field (which stays editable pre-warning). */
  const [createdName, setCreatedName] = useState<string | null>(null);
  /** Installed skill names — POST /api/skills/create overwrites an existing
   * file silently, so a collision must be caught here (Phase-3C review). */
  const [existingNames, setExistingNames] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    adapter.getSkills()
      .then((rows) => { if (!cancelled) setExistingNames(new Set(rows.map((s) => s.id || s.name))); })
      .catch(() => { /* guard degrades — the server still accepts the create */ });
    return () => { cancelled = true; };
  }, []);

  const nameOk = KEBAB_RE.test(name.trim());
  const nameTaken = nameOk && existingNames.has(name.trim());
  const cleanedSteps = steps.map((s) => s.trim()).filter(Boolean);
  const inputs = splitLines(inputsText);
  const outputs = splitLines(outputsText);

  const stepDefs: BuilderStep[] = [
    { id: 'identity', label: 'Identity', valid: nameOk && !nameTaken && description.trim().length > 0 },
    { id: 'content', label: 'Content', valid: cleanedSteps.length > 0 },
    { id: 'scope', label: 'Scope', valid: true },
    { id: 'review', label: 'Review & create', valid: true },
  ];

  const setStepAt = (i: number, value: string) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  const removeStepAt = (i: number) =>
    setSteps((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const create = async () => {
    const skillName = name.trim();
    setBusy(true);
    setError(null);
    try {
      await adapter.createSkill({ name: skillName, description: description.trim(), steps: cleanedSteps, category });
      setCreatedName(skillName);
      if (inputs.length > 0 || outputs.length > 0) {
        try {
          const res = await adapter.fetch(`/api/skills/${encodeURIComponent(skillName)}`);
          if (!res.ok) throw new Error(`failed to load the created body (${res.status})`);
          const data = await res.json() as { content?: string };
          await adapter.updateSkill(skillName, appendIoSections(data.content ?? '', inputs, outputs));
        } catch (e) {
          // The skill EXISTS — never pretend the create failed. Surface the
          // partial result and let the user finish via Edit in the Hub.
          setWarning(
            `Skill "${skillName}" was created, but the Inputs/Outputs sections could not be written `
            + `(${e instanceof Error ? e.message : 'server unreachable'}). Add them via Edit in the Hub.`,
          );
          return;
        }
      }
      onCreated(skillName);
    } catch (err) {
      if (!onTierError(err, skillName)) {
        setError(err instanceof Error ? err.message : 'Failed to create skill');
      }
    } finally {
      setBusy(false);
    }
  };

  // Single source for the active panel — derived from the same array that
  // drives the stepper pills (a separate STEP_IDS const could silently desync).
  const stepId = stepDefs[step]?.id;

  return (
    <BuilderStepper
      title="Skill Builder"
      subtitle="Create a local skill — it installs to this machine and appears under My Skills."
      steps={stepDefs}
      current={step}
      // Once the C14 partial-failure warning is set, the skill EXISTS under
      // `createdName` and nothing here can change it — freeze navigation so
      // the wizard can't drift into editable-looking fields whose edits
      // "Done" would silently discard (Phase-3C review).
      onNavigate={warning ? () => undefined : setStep}
      onCancel={onCancel}
      onFinish={warning && createdName ? () => onCreated(createdName) : () => void create()}
      finishLabel={warning ? 'Done' : 'Create skill'}
      busy={busy}
      testId="skill-builder"
    >
      {stepId === 'identity' && (
        <>
          <div className="space-y-1">
            <label htmlFor="sb-name" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">
              Name (lowercase letters, digits, single dashes)
            </label>
            <Input id="sb-name" name="skillName" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. weekly-report" className="text-xs h-8" autoFocus />
            {name.trim().length > 0 && !nameOk && (
              <p role="alert" className="text-[11px] text-destructive" data-testid="skill-builder-name-error">
                Must be kebab-case: lowercase letters and digits separated by single dashes.
              </p>
            )}
            {nameTaken && (
              <p role="alert" className="text-[11px] text-destructive" data-testid="skill-builder-name-taken">
                A skill named “{name.trim()}” already exists — creating would overwrite it. Pick another name,
                or edit the existing skill from the Hub.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <label htmlFor="sb-desc" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Description</label>
            <Input id="sb-desc" name="skillDescription" autoComplete="off" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this skill do?" className="text-xs h-8" />
          </div>
          <div className="space-y-1">
            <label htmlFor="sb-category" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Category</label>
            <select id="sb-category" name="skillCategory" autoComplete="off" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full text-xs h-8 rounded-md border border-border bg-muted/40 px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </>
      )}

      {stepId === 'content' && (
        <>
          <fieldset className="space-y-1">
            <legend className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Steps (ordered)</legend>
            <ul className="space-y-1">
              {steps.map((s, i) => (
                <li key={i} className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground tabular-nums w-4 shrink-0">{i + 1}.</span>
                  <Input aria-label={`Step ${i + 1}`} name="skillStep" autoComplete="off" value={s} onChange={(e) => setStepAt(i, e.target.value)} placeholder="What happens at this step?" className="text-xs h-8 flex-1" />
                  <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`} className="p-1 rounded hover:bg-muted/50 text-muted-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} aria-label={`Move step ${i + 1} down`} className="p-1 rounded hover:bg-muted/50 text-muted-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => removeStepAt(i)} disabled={steps.length === 1} aria-label={`Remove step ${i + 1}`} className="p-1 rounded hover:bg-muted/50 text-muted-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setSteps((prev) => [...prev, ''])} className="inline-flex items-center gap-1 rounded text-[11px] text-honey hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" data-testid="skill-builder-add-step">
              <Plus className="w-3 h-3" /> Add step
            </button>
          </fieldset>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="sb-inputs" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Inputs (optional, one per line)</label>
              <Textarea id="sb-inputs" name="skillInputs" autoComplete="off" value={inputsText} onChange={(e) => setInputsText(e.target.value)} placeholder={'topic — what to research\naudience — who reads it'} className="min-h-[72px] text-xs" />
            </div>
            <div className="space-y-1">
              <label htmlFor="sb-outputs" className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Outputs (optional, one per line)</label>
              <Textarea id="sb-outputs" name="skillOutputs" autoComplete="off" value={outputsText} onChange={(e) => setOutputsText(e.target.value)} placeholder={'a one-page summary\na list of open questions'} className="min-h-[72px] text-xs" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Inputs and outputs are written into the skill body as “## Inputs” / “## Outputs” sections.
          </p>
        </>
      )}

      {stepId === 'scope' && (
        <fieldset className="space-y-1.5">
          <legend className="text-[10px] font-display uppercase tracking-wide text-muted-foreground">Who can use this skill</legend>
          {([
            { id: 'personal', label: 'Personal — this machine', enabled: true },
            { id: 'workspace', label: 'Workspace — everyone in a workspace', enabled: false },
            { id: 'organization', label: 'Organization — your whole org', enabled: false },
          ] as const).map((s) => (
            <label key={s.id} className={`flex items-center gap-2 text-xs px-1 py-0.5 rounded ${s.enabled ? 'text-foreground/90' : 'text-muted-foreground/50'}`}>
              <input type="radio" name="sb-scope" value={s.id} checked={s.id === 'personal'} disabled={!s.enabled} readOnly className="accent-primary" />
              {s.label}
              {!s.enabled && <span className="text-[10px]">(coming soon)</span>}
            </label>
          ))}
          <p className="text-[11px] text-muted-foreground">
            Skills publish to this machine only for now — workspace and organization sharing arrive once the
            backend exposes skill scope metadata.
          </p>
        </fieldset>
      )}

      {stepId === 'review' && (
        <div className="space-y-3" data-testid="skill-builder-review">
          <div>
            <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Skill</p>
            <p className="mt-1 text-xs text-foreground/90 font-mono">{name.trim()}</p>
            <p className="mt-1 text-xs text-foreground/90">{description.trim()}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {CATEGORIES.find((c) => c.id === category)?.label ?? category} · Personal scope (this machine)
            </p>
          </div>
          <div>
            <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Steps</p>
            <ol className="mt-1 space-y-0.5 list-decimal list-inside">
              {cleanedSteps.map((s, i) => <li key={i} className="text-xs text-foreground/90">{s}</li>)}
            </ol>
          </div>
          {(inputs.length > 0 || outputs.length > 0) && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Inputs</p>
                {inputs.length > 0
                  ? <ul className="mt-1 space-y-0.5">{inputs.map((s) => <li key={s} className="text-xs text-foreground/90">• {s}</li>)}</ul>
                  : <p className="mt-1 text-[11px] text-muted-foreground/70">None</p>}
              </div>
              <div>
                <p className="text-[11px] font-display font-semibold uppercase tracking-wide text-muted-foreground">Outputs</p>
                {outputs.length > 0
                  ? <ul className="mt-1 space-y-0.5">{outputs.map((s) => <li key={s} className="text-xs text-foreground/90">• {s}</li>)}</ul>
                  : <p className="mt-1 text-[11px] text-muted-foreground/70">None</p>}
              </div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Create installs the skill immediately. You can preview-test it from the Hub — nothing executes during a test.
          </p>
          {warning && <p role="status" className="text-[11px] text-amber-400" data-testid="skill-builder-warning">{warning}</p>}
          {error && <p role="alert" className="text-[11px] text-destructive">{error}</p>}
        </div>
      )}
    </BuilderStepper>
  );
};

export default SkillBuilder;
