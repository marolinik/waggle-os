/**
 * Coverage compass card — Settings → Billing.
 *
 * F4 polish from the 2026-05-28 addictiveness audit. Answers the
 * "what am I getting for what I pay?" question that personas P3 (Sarah,
 * marketing), P4 (Imran, consultant), and P7 (Anya, writer) all hit
 * when comparing Waggle to their current ChatGPT Plus / Notion AI /
 * Gamma stack.
 *
 * Items split into three groups: COVERED (Waggle does this), PARTIAL
 * (Waggle has the substrate but the UX isn't first-class yet), and
 * NOT YET (out of scope for now). Honest categorisation matters — if
 * we mark something COVERED that the user opens another tool for,
 * trust evaporates fast.
 */

import { Check, CircleDashed, X } from 'lucide-react';

type Coverage = 'covered' | 'partial' | 'not-yet';

interface CompetingTool {
  name: string;
  category: string;
  coverage: Coverage;
  via?: string;  // how Waggle covers it (short noun phrase)
}

const TOOLS: CompetingTool[] = [
  { name: 'ChatGPT / Claude.ai', category: 'general AI chat', coverage: 'covered', via: 'Chat app + persona switcher' },
  { name: 'Mem.ai / Heyday', category: 'personal memory', coverage: 'covered', via: 'FrameStore + Knowledge Graph + Harvest' },
  { name: 'Browser AI extensions', category: 'save-to-memory from web', coverage: 'partial', via: 'Companion popup + capture flow; native toolbar/context menu pending' },
  { name: 'Notion AI', category: 'notes + AI in notes', coverage: 'covered', via: 'Memory app + Wiki compiler' },
  { name: 'Granola / Otter.ai', category: 'meeting transcripts', coverage: 'partial', via: 'Voice app + transcript ingest (no native recording yet)' },
  { name: 'Gamma / Beautiful.ai', category: 'AI-generated decks', coverage: 'partial', via: 'pptx / presentation-design skills (no native deck editor)' },
  { name: 'Telegram bot for cron updates', category: 'outbound digests', coverage: 'covered', via: 'Scheduled Jobs → Telegram channel' },
  { name: 'Zapier / n8n', category: 'workflow automation', coverage: 'partial', via: 'Scheduled Jobs + Skills marketplace (limited triggers)' },
  { name: 'Excel Copilot', category: 'spreadsheet AI', coverage: 'not-yet', via: 'xlsx skill exists; native editor planned' },
  { name: 'GitHub Copilot / Cursor', category: 'in-editor coding', coverage: 'not-yet', via: 'intentional — use Claude Code for coding, Waggle for everything else' },
];

const ICONS: Record<Coverage, { Icon: typeof Check; className: string; label: string }> = {
  'covered': { Icon: Check, className: 'text-emerald-400', label: 'Covered' },
  'partial': { Icon: CircleDashed, className: 'text-amber-400', label: 'Partial' },
  'not-yet': { Icon: X, className: 'text-muted-foreground/60', label: 'Not yet' },
};

const CoverageCompassCard = () => {
  const counts = TOOLS.reduce<Record<Coverage, number>>(
    (acc, t) => ({ ...acc, [t.coverage]: (acc[t.coverage] ?? 0) + 1 }),
    { 'covered': 0, 'partial': 0, 'not-yet': 0 },
  );

  return (
    <div
      className="p-4 rounded-xl bg-secondary/30 border border-border/30 space-y-3"
      data-testid="coverage-compass-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-display font-medium text-foreground">What Waggle replaces</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Honest scoring — only items that genuinely don't need another tool open are marked covered.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-[10px] font-display">
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <Check className="w-2.5 h-2.5" />{counts['covered']}
          </span>
          <span className="inline-flex items-center gap-1 text-amber-400">
            <CircleDashed className="w-2.5 h-2.5" />{counts['partial']}
          </span>
          <span className="inline-flex items-center gap-1 text-muted-foreground/60">
            <X className="w-2.5 h-2.5" />{counts['not-yet']}
          </span>
        </div>
      </div>

      <ul className="space-y-1.5" role="list">
        {TOOLS.map(tool => {
          const { Icon, className, label } = ICONS[tool.coverage];
          return (
            <li
              key={tool.name}
              className="flex items-start gap-2.5 text-[11px]"
              data-testid={`coverage-compass-row-${tool.coverage}`}
            >
              <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${className}`} aria-label={label} />
              <div className="min-w-0 flex-1">
                <p className="text-foreground">
                  {tool.name}
                  <span className="text-muted-foreground"> · {tool.category}</span>
                </p>
                {tool.via && (
                  <p className="text-[10px] text-muted-foreground/80 mt-0.5">via {tool.via}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default CoverageCompassCard;
