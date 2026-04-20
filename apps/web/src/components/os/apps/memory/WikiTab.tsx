/**
 * WikiTab — Browse and compile personal wiki pages.
 *
 * Shows compiled pages in a list, renders selected page markdown,
 * triggers compilation, and displays health report.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, RefreshCw, Loader2, Search, FileText,
  Heart, ChevronRight, Zap, Network, Lightbulb, Download, Upload,
} from 'lucide-react';
import { adapter } from '@/lib/adapter';
import { renderSimpleMarkdown } from '@/lib/render-markdown';
import { HintTooltip } from '@/components/ui/hint-tooltip';

interface WikiPage {
  slug: string;
  pageType: string;
  name: string;
  contentHash: string;
  markdown: string;
  frameIds: string;
  compiledAt: string;
  sourceCount: number;
}

interface HealthReport {
  dataQualityScore: number;
  totalEntities: number;
  totalFrames: number;
  totalPages: number;
  /** M-14: 0..1 — entity pages / compilable entities. */
  coverage?: number;
  /** M-14: count of stale-page issues. */
  stalePageCount?: number;
  issues: { type: string; severity: string; description: string; suggestion?: string }[];
  compiledAt: string;
}

function formatRelativeHealth(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'unknown';
  const delta = Date.now() - ms;
  if (delta < 60_000) return 'just now';
  const min = Math.round(delta / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

const typeIcons: Record<string, React.ReactNode> = {
  entity: <FileText className="w-3.5 h-3.5" />,
  concept: <Lightbulb className="w-3.5 h-3.5" />,
  synthesis: <Network className="w-3.5 h-3.5" />,
  index: <BookOpen className="w-3.5 h-3.5" />,
  health: <Heart className="w-3.5 h-3.5" />,
};

const typeColors: Record<string, string> = {
  entity: 'text-blue-400',
  concept: 'text-amber-400',
  synthesis: 'text-purple-400',
  index: 'text-muted-foreground',
  health: 'text-green-400',
};

export default function WikiTab() {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState<string>('');
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);

  const loadPages = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adapter.getWikiPages();
      setPages(data);
    } catch {
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPages(); }, [loadPages]);

  const handleSelectPage = useCallback(async (slug: string) => {
    setSelectedSlug(slug);
    setHealth(null);
    // Use markdown from page list if available, otherwise fetch
    const page = pages.find(p => p.slug === slug);
    if (page?.markdown) {
      setPageContent(page.markdown);
    } else {
      try {
        const data = await adapter.getWikiPageContent(slug);
        setPageContent(data.markdown);
      } catch {
        setPageContent('*Failed to load page content.*');
      }
    }
  }, [pages]);

  const handleCompile = useCallback(async () => {
    setCompiling(true);
    try {
      const result = await adapter.compileWiki('full');
      await loadPages();
      setPageContent(
        `# Compilation Complete\n\n` +
        `- **Pages created:** ${result.pagesCreated}\n` +
        `- **Pages updated:** ${result.pagesUpdated}\n` +
        `- **Pages unchanged:** ${result.pagesUnchanged}\n` +
        `- **LLM provider:** ${result.llmProvider} (${result.llmModel})\n` +
        `- **Duration:** ${result.durationMs}ms\n` +
        `- **Health issues:** ${result.healthIssues}\n`,
      );
      setSelectedSlug(null);
      setHealth(null);
    } catch (err) {
      setPageContent(`# Compilation Failed\n\n${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setCompiling(false);
    }
  }, [loadPages]);

  const handleLoadHealth = useCallback(async () => {
    try {
      const report = await adapter.getWikiHealth();
      setHealth(report);
      setSelectedSlug(null);
      setPageContent('');
    } catch {
      setHealth(null);
    }
  }, []);

  // M-12: Obsidian export. Uses a prompt() for the absolute path since the
  // web layer can't open a native folder picker without Tauri APIs; power
  // users pasting a path is fine for the v1 of this button.
  const handleExportObsidian = useCallback(async () => {
    const outDir = window.prompt(
      'Absolute path to your Obsidian vault directory (will be created if missing):',
      '',
    );
    if (!outDir?.trim()) return;
    try {
      const result = await adapter.exportWikiToObsidian(outDir.trim());
      setPageContent(
        `# Obsidian Export Complete\n\n` +
        `- **Output dir:** \`${result.outDir}\`\n` +
        `- **Files written:** ${result.filesWritten}\n` +
        `- **Index:** \`${result.indexPath}\`\n` +
        `- **By type:** ${Object.entries(result.byType).map(([k, v]) => `${k}=${v}`).join(', ')}\n\n` +
        `Open the directory in Obsidian as a vault to browse the pages.`,
      );
      setSelectedSlug(null);
      setHealth(null);
    } catch (err) {
      setPageContent(`# Export Failed\n\n${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  // M-13: Notion export. Prompt for the root page URL; the token lives in
  // Vault as `notion-wiki-token` and is set up separately via Settings →
  // Vault. The 503 response carries a hint if the token is missing.
  const handleExportNotion = useCallback(async () => {
    const rootPageUrl = window.prompt(
      'Notion page URL to export under (share this page with your Waggle integration first):',
      '',
    );
    if (!rootPageUrl?.trim()) return;
    try {
      const result = await adapter.exportWikiToNotion(rootPageUrl.trim());
      setPageContent(
        `# Notion Export Complete\n\n` +
        `- **Pages created:** ${result.pagesCreated}\n` +
        `- **Pages updated:** ${result.pagesUpdated}\n` +
        `- **Pages unchanged:** ${result.pagesUnchanged}\n` +
        `- **Pages failed:** ${result.pagesFailed}\n` +
        (Object.keys(result.byType).length > 0
          ? `- **By type:** ${Object.entries(result.byType).map(([k, v]) => `${k}=${v}`).join(', ')}\n`
          : '') +
        (result.errors.length > 0
          ? `\n## Errors\n\n${result.errors.map(e => `- **${e.slug}**: ${e.message}`).join('\n')}\n`
          : ''),
      );
      setSelectedSlug(null);
      setHealth(null);
    } catch (err) {
      setPageContent(`# Notion Export Failed\n\n${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, []);

  // Filter pages
  const filtered = pages.filter(p => {
    if (filterType && p.pageType !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.slug.includes(q);
    }
    return true;
  });

  const entityCount = pages.filter(p => p.pageType === 'entity').length;
  const conceptCount = pages.filter(p => p.pageType === 'concept').length;
  const synthesisCount = pages.filter(p => p.pageType === 'synthesis').length;

  return (
    <div className="flex h-full">
      {/* Page list sidebar */}
      <div className="w-64 border-r border-border/50 flex flex-col shrink-0">
        {/* Header */}
        <div className="p-3 border-b border-border/30 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-primary" />
              <span className="text-xs font-display font-semibold">Wiki</span>
              <span className="text-[11px] text-muted-foreground">({pages.length})</span>
            </div>
            <div className="flex gap-1">
              <HintTooltip content="Health Report">
                <button
                  onClick={handleLoadHealth}
                  className="p-1 rounded text-muted-foreground hover:text-green-400 transition-colors"
                >
                  <Heart className="w-3.5 h-3.5" />
                </button>
              </HintTooltip>
              <HintTooltip content="Compile Wiki">
                <button
                  onClick={handleCompile}
                  disabled={compiling}
                  className="p-1 rounded text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                >
                  {compiling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                </button>
              </HintTooltip>
              <HintTooltip content="Export to Obsidian vault">
                <button
                  onClick={handleExportObsidian}
                  disabled={pages.length === 0}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </HintTooltip>
              <HintTooltip content="Export to Notion workspace">
                <button
                  onClick={handleExportNotion}
                  disabled={pages.length === 0}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </HintTooltip>
              <HintTooltip content="Refresh">
                <button
                  onClick={loadPages}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </HintTooltip>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1">
            <Search className="w-3 h-3 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search pages..."
              className="flex-1 bg-transparent text-xs border-0 outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Type filters */}
          <div className="flex gap-1 text-[11px]">
            <button
              onClick={() => setFilterType(null)}
              className={`px-1.5 py-0.5 rounded transition-colors ${!filterType ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType(filterType === 'entity' ? null : 'entity')}
              className={`px-1.5 py-0.5 rounded transition-colors ${filterType === 'entity' ? 'bg-blue-500/20 text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Entity ({entityCount})
            </button>
            <button
              onClick={() => setFilterType(filterType === 'concept' ? null : 'concept')}
              className={`px-1.5 py-0.5 rounded transition-colors ${filterType === 'concept' ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Concept ({conceptCount})
            </button>
            <button
              onClick={() => setFilterType(filterType === 'synthesis' ? null : 'synthesis')}
              className={`px-1.5 py-0.5 rounded transition-colors ${filterType === 'synthesis' ? 'bg-purple-500/20 text-purple-400' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Synthesis ({synthesisCount})
            </button>
          </div>
        </div>

        {/* Page list */}
        <div className="flex-1 overflow-auto p-1.5 space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-muted-foreground/40 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8">
              <BookOpen className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">
                {pages.length === 0 ? 'No wiki pages yet. Click compile.' : 'No matching pages.'}
              </p>
            </div>
          ) : (
            filtered.map(p => (
              <button
                key={p.slug}
                onClick={() => handleSelectPage(p.slug)}
                className={`w-full text-left p-2 rounded-lg text-xs transition-colors ${
                  selectedSlug === p.slug ? 'bg-primary/20 border border-primary/30' : 'hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={typeColors[p.pageType] ?? 'text-muted-foreground'}>
                    {typeIcons[p.pageType] ?? <FileText className="w-3.5 h-3.5" />}
                  </span>
                  <span className="font-display font-medium text-foreground truncate flex-1">{p.name}</span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground ml-5">
                  <span>{p.sourceCount} sources</span>
                  <span>{p.compiledAt?.slice(0, 10)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-auto">
        {health && !selectedSlug && !pageContent ? (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-green-400" />
              <h3 className="text-sm font-display font-semibold">Wiki Health Report</h3>
              <span className="ml-auto flex items-center gap-2">
                {/* M-14: "Last compile Nm ago" prominent chip */}
                <span className="text-[11px] text-muted-foreground font-mono">
                  Last compile {formatRelativeHealth(health.compiledAt)}
                </span>
                <span className={`text-lg font-bold ${
                  health.dataQualityScore >= 80 ? 'text-green-400' :
                  health.dataQualityScore >= 50 ? 'text-amber-400' : 'text-destructive'
                }`}>
                  {health.dataQualityScore}/100
                </span>
              </span>
            </div>

            {/* M-14: stats row — 5 cards (Frames, Entities, Pages, Coverage %, Stale) */}
            <div className="grid grid-cols-5 gap-2">
              {[
                { label: 'Frames', value: health.totalFrames, color: 'text-foreground' },
                { label: 'Entities', value: health.totalEntities, color: 'text-foreground' },
                { label: 'Pages', value: health.totalPages, color: 'text-foreground' },
                {
                  label: 'Coverage',
                  value: health.coverage != null ? `${Math.round(health.coverage * 100)}%` : '—',
                  color: health.coverage != null && health.coverage >= 0.75 ? 'text-green-400'
                    : health.coverage != null && health.coverage >= 0.4 ? 'text-amber-400'
                    : 'text-muted-foreground',
                },
                {
                  label: 'Stale',
                  value: health.stalePageCount ?? 0,
                  color: (health.stalePageCount ?? 0) === 0 ? 'text-green-400'
                    : (health.stalePageCount ?? 0) < 5 ? 'text-amber-400' : 'text-destructive',
                },
              ].map(stat => (
                <div key={stat.label} className="p-3 rounded-lg bg-secondary/30 border border-border/30 text-center">
                  <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>

            {health.issues.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-display font-medium text-muted-foreground">Issues ({health.issues.length})</p>
                {health.issues.slice(0, 20).map((issue, i) => (
                  <div key={i} className={`p-2 rounded text-xs border ${
                    issue.severity === 'high' ? 'border-destructive/30 bg-destructive/5' :
                    issue.severity === 'medium' ? 'border-amber-500/30 bg-amber-500/5' :
                    'border-border/30 bg-secondary/20'
                  }`}>
                    <span className="font-medium">{issue.type}:</span> {issue.description}
                    {issue.suggestion && <p className="text-muted-foreground mt-0.5">{issue.suggestion}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : pageContent ? (
          <div className="p-4">
            {/* Safe: renderSimpleMarkdown escapes HTML entities before applying formatting */}
            <div
              className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed
                prose-headings:font-display prose-headings:text-foreground
                prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
                prose-p:text-foreground/90 prose-li:text-foreground/90
                prose-strong:text-foreground prose-code:text-primary
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                prose-table:text-xs prose-th:text-left prose-th:p-2 prose-td:p-2
                prose-blockquote:border-primary/30 prose-blockquote:text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: renderSimpleMarkdown(pageContent) }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">Select a page to read</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              or click <Zap className="w-3 h-3 inline" /> to compile your wiki
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
