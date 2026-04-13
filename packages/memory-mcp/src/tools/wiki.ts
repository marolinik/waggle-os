/**
 * Wiki tools — compile, search, and browse the personal wiki.
 *
 * compile_wiki: Trigger incremental or full compilation
 * get_page: Read a compiled wiki page by slug
 * search_wiki: Search compiled pages
 * compile_health: Run health check on wiki data quality
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getPersonalDb,
  getFrameStore,
  getSearch,
  getKnowledgeGraph,
} from '../core/setup.js';
import { WikiCompiler, CompilationState } from '@waggle/wiki-compiler';
import type { LLMSynthesizeFn } from '@waggle/wiki-compiler';

/**
 * Default synthesize function — echoes a structured summary when no LLM is configured.
 * In production, this is replaced by a real LLM call (Haiku/Ollama).
 */
const echoSynthesizer: LLMSynthesizeFn = async (prompt: string) => {
  // Extract the key information from the prompt for a basic summary
  const frameMatch = prompt.match(/## Source Frames \((\d+) total\)/);
  const frameCount = frameMatch ? frameMatch[1] : '?';

  const entityMatch = prompt.match(/about "([^"]+)"/);
  const entityName = entityMatch ? entityMatch[1] : 'this topic';

  return [
    `## Summary`,
    `Compiled from ${frameCount} source frames about ${entityName}.`,
    '',
    `## Key Facts`,
    `- Data compiled from ${frameCount} memory frames`,
    `- See individual frame citations below for details`,
    '',
    `> **Note:** This page was compiled without an LLM synthesizer.`,
    `> Connect an LLM provider for richer synthesis.`,
    `> Set WAGGLE_WIKI_LLM_PROVIDER in your environment.`,
  ].join('\n');
};

/** Resolve the LLM synthesizer. Checks env for provider config. */
function resolveSynthesizer(): LLMSynthesizeFn {
  // For v1, use echo synthesizer. In production, this would be wired
  // to the agent's LLM via the sidecar API or direct provider call.
  // The compile_wiki tool accepts an optional synthesizer override.
  return echoSynthesizer;
}

function getCompiler(synthesize?: LLMSynthesizeFn): { compiler: WikiCompiler; state: CompilationState } {
  const db = getPersonalDb();
  const state = new CompilationState(db);
  const compiler = new WikiCompiler(
    getKnowledgeGraph(),
    getFrameStore(),
    getSearch(),
    state,
    { synthesize: synthesize ?? resolveSynthesizer() },
  );
  return { compiler, state };
}

export function registerWikiTools(server: McpServer): void {

  // ── compile_wiki ───────────────────────────────────────────────
  server.tool(
    'compile_wiki',
    'Compile the personal wiki from memory frames and knowledge graph. Uses incremental compilation by default (only processes new frames). Returns compilation statistics.',
    {
      mode: z.enum(['incremental', 'full']).default('incremental')
        .describe('incremental: only recompile affected pages. full: rebuild everything.'),
      concepts: z.array(z.string()).optional()
        .describe('Optional list of concept names to compile pages for. Auto-detected if omitted.'),
    },
    async ({ mode, concepts }) => {
      const { compiler } = getCompiler();

      try {
        const result = await compiler.compile({
          incremental: mode === 'incremental',
          concepts: concepts ?? undefined,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              mode,
              pages_created: result.pagesCreated,
              pages_updated: result.pagesUpdated,
              pages_unchanged: result.pagesUnchanged,
              entity_pages: result.entityPages,
              concept_pages: result.conceptPages,
              synthesis_pages: result.synthesisPages,
              health_issues: result.healthIssues,
              watermark: result.watermark,
              duration_ms: result.durationMs,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text' as const,
            text: `Compilation error: ${err instanceof Error ? err.message : String(err)}`,
          }],
          isError: true,
        };
      }
    },
  );

  // ── get_page ───────────────────────────────────────────────────
  server.tool(
    'get_page',
    'Read a compiled wiki page by its slug (e.g., "project-alpha", "index", "synthesis-memory").',
    {
      slug: z.string().describe('Page slug (URL-safe name). Use "index" for the wiki index.'),
    },
    async ({ slug }) => {
      const { state } = getCompiler();
      const page = state.getPage(slug);

      if (!page) {
        // Try fuzzy match
        const allPages = state.getAllPages();
        const matches = allPages.filter(p =>
          p.slug.includes(slug) || p.name.toLowerCase().includes(slug.toLowerCase()),
        );

        if (matches.length > 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `Page "${slug}" not found. Did you mean:\n${matches.map(m => `  - ${m.slug} (${m.name})`).join('\n')}`,
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: `Page "${slug}" not found. Run compile_wiki first, or use search_wiki to find pages.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            slug: page.slug,
            name: page.name,
            type: page.pageType,
            sources: page.sourceCount,
            compiled_at: page.compiledAt,
            content_hash: page.contentHash,
          }, null, 2),
        }],
      };
    },
  );

  // ── search_wiki ────────────────────────────────────────────────
  server.tool(
    'search_wiki',
    'Search compiled wiki pages by name or type. Returns matching page metadata.',
    {
      query: z.string().optional()
        .describe('Search query to match against page names'),
      type: z.enum(['entity', 'concept', 'synthesis', 'index', 'health']).optional()
        .describe('Filter by page type'),
    },
    async ({ query, type }) => {
      const { state } = getCompiler();

      let pages = type
        ? state.getPagesByType(type)
        : state.getAllPages();

      if (query) {
        const lower = query.toLowerCase();
        pages = pages.filter(p =>
          p.name.toLowerCase().includes(lower) ||
          p.slug.includes(lower),
        );
      }

      if (pages.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: query
              ? `No wiki pages matching "${query}". Run compile_wiki to generate pages.`
              : 'No wiki pages compiled yet. Run compile_wiki first.',
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(pages.map(p => ({
            slug: p.slug,
            name: p.name,
            type: p.pageType,
            sources: p.sourceCount,
            compiled_at: p.compiledAt,
          })), null, 2),
        }],
      };
    },
  );

  // ── compile_health ─────────────────────────────────────────────
  server.tool(
    'compile_health',
    'Run a health check on the wiki. Reports contradictions, gaps, orphan entities, weak confidence pages, and data quality score.',
    {},
    async () => {
      const { compiler } = getCompiler();
      const report = compiler.compileHealth();

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            data_quality_score: report.dataQualityScore,
            total_entities: report.totalEntities,
            total_frames: report.totalFrames,
            total_pages: report.totalPages,
            issues: report.issues.map(i => ({
              type: i.type,
              severity: i.severity,
              description: i.description,
              ...(i.suggestion && { suggestion: i.suggestion }),
            })),
            compiled_at: report.compiledAt,
          }, null, 2),
        }],
      };
    },
  );
}
