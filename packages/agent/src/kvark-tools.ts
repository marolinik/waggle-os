/**
 * KVARK Agent Tools — kvark_search + kvark_ask_document.
 *
 * These tools are the agent-facing interface to KVARK's retrieval pipeline.
 * All KVARK calls go through KvarkClient (from @waggle/server/kvark).
 * Tools are only registered when KVARK is configured (Business/Enterprise tiers).
 * Solo/Team users never see these tools.
 *
 * Design rules:
 * - Tools use KvarkClient only — no direct fetch
 * - Output is formatted text for the agent, not raw DTOs
 * - Attribution structure preserved for Milestone B combined retrieval
 * - Graceful degradation on all error paths
 */

import type { ToolDefinition } from './tools.js';

// ── Types from KVARK client (imported by interface, not package dep) ─────

/** Minimal KvarkClient interface — matches KvarkClient from @waggle/server/kvark */
export interface KvarkClientLike {
  search(query: string, opts?: { limit?: number; offset?: number }): Promise<KvarkSearchResponseLike>;
  askDocument(documentId: string, question: string): Promise<KvarkAskResponseLike>;
  feedback?(documentId: number, query: string, useful: boolean, reason?: string): Promise<KvarkFeedbackResponseLike>;
  action?(actionType: string, target: { entityType: string; entityId: string }, payload: Record<string, unknown>, reason: string, approvalReference?: string, workspaceId?: string): Promise<KvarkActionResponseLike>;
}

export interface KvarkFeedbackResponseLike {
  ok: boolean;
}

export interface KvarkActionResponseLike {
  ok: boolean;
  data: {
    status: 'executed' | 'denied' | 'queued';
    actionId?: string;
    auditRef?: string;
    result?: Record<string, unknown>;
  } | null;
  error: { code: string; message: string } | null;
}

export interface KvarkSearchResponseLike {
  results: KvarkSearchResultLike[];
  total: number;
  query: string;
}

export interface KvarkSearchResultLike {
  document_id: number;
  title: string;
  snippet: string;
  score: number;
  document_type: string | null;
}

export interface KvarkAskResponseLike {
  answer: string;
  sources: string[];
}

// ── Structured result for Milestone B consumption ────────────────────────

/** Structured KVARK search result — used by combined retrieval (Milestone B) */
export interface KvarkStructuredResult {
  content: string;
  documentId: number;
  title: string;
  score: number;
  documentType: string | null;
  /** Attribution label for agent responses, e.g. "[KVARK: pdf / Project Status]" */
  attribution: string;
}

/** Parses KvarkClient search response into structured results */
export function parseSearchResults(response: KvarkSearchResponseLike): KvarkStructuredResult[] {
  return response.results.map(r => ({
    content: r.snippet,
    documentId: r.document_id,
    title: r.title,
    score: r.score,
    documentType: r.document_type,
    attribution: formatKvarkAttribution(r),
  }));
}

/** Format a KVARK result into an attribution label */
function formatKvarkAttribution(result: KvarkSearchResultLike): string {
  const parts = ['KVARK'];
  if (result.document_type) parts.push(result.document_type);
  parts.push(result.title);
  return `[${parts.join(': ')}]`;
  // Future: add connector, page when KVARK exposes them
  // e.g. [KVARK: SharePoint / Project Status.pdf p.3]
}

// ── Tool output formatting ───────────────────────────────────────────────

function formatSearchOutput(response: KvarkSearchResponseLike, query: string): string {
  if (response.results.length === 0) {
    return `KVARK Search: "${query}" — no results found.`;
  }

  const header = `KVARK Search: "${query}" (${response.results.length} of ${response.total} results)\n`;
  const items = response.results.map((r, i) => {
    const typeLabel = r.document_type ? `[${r.document_type}]` : '[document]';
    const snippet = r.snippet.length > 200 ? r.snippet.slice(0, 197) + '...' : r.snippet;
    return `${i + 1}. ${typeLabel} ${r.title} (score: ${r.score.toFixed(2)})\n   "${snippet}"\n   ID: ${r.document_id}`;
  });

  return header + items.join('\n\n');
}

function formatAskOutput(response: KvarkAskResponseLike, documentId: string): string {
  const sources = response.sources.length > 0
    ? `\n\nSources: ${response.sources.join(', ')}`
    : '';
  return `KVARK Document Answer (doc #${documentId}):\n\n${response.answer}${sources}`;
}

// ── Tool factory ─────────────────────────────────────────────────────────

export interface KvarkToolsDeps {
  client: KvarkClientLike;
}

export function createKvarkTools(deps: KvarkToolsDeps): ToolDefinition[] {
  const { client } = deps;

  return [
    // ── kvark_search ─────────────────────────────────────────────
    {
      name: 'kvark_search',
      description:
        'Search enterprise knowledge base via KVARK. Returns documents from connected sources (SharePoint, Jira, Slack, etc.) with relevance scores and source attribution. Use when the user needs information from enterprise systems beyond workspace memory.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results to return (default 10)' },
        },
        required: ['query'],
      },
      execute: async (args) => {
        const query = args.query as string;
        const limit = (args.limit as number) ?? 10;

        try {
          const response = await client.search(query, { limit });
          return formatSearchOutput(response, query);
        } catch (err) {
          return handleKvarkError(err, 'search');
        }
      },
    },

    // ── kvark_feedback ─────────────────────────────────────────────
    {
      name: 'kvark_feedback',
      description:
        'Send feedback to KVARK about whether an enterprise search result was useful. Use this ONLY when a KVARK result materially influenced your answer — not for every search. Helps KVARK improve future retrieval quality.',
      parameters: {
        type: 'object',
        properties: {
          document_id: { type: 'number', description: 'Document ID from kvark_search or search_memory KVARK results' },
          query: { type: 'string', description: 'The original search query that produced this result' },
          useful: { type: 'boolean', description: 'Whether the result was useful for answering the user' },
          reason: { type: 'string', description: 'Brief explanation of why the result was or was not useful (optional)' },
        },
        required: ['document_id', 'query', 'useful'],
      },
      execute: async (args) => {
        const documentId = args.document_id as number;
        const query = args.query as string;
        const useful = args.useful as boolean;
        const reason = args.reason as string | undefined;

        if (!client.feedback) {
          return 'Feedback not supported by this KVARK instance.';
        }

        try {
          const response = await client.feedback(documentId, query, useful, reason);
          return response.ok
            ? `Feedback recorded: ${useful ? 'useful' : 'not useful'} for document #${documentId}.`
            : 'Feedback was sent but KVARK did not confirm storage.';
        } catch (err) {
          return handleKvarkError(err, 'feedback');
        }
      },
    },

    // ── kvark_action ──────────────────────────────────────────────
    {
      name: 'kvark_action',
      description:
        'Execute a governed enterprise action through KVARK (e.g., create a Jira ticket, post a Slack message, update a record). Requires user approval before execution. Use only when the user has explicitly asked for an action that touches enterprise systems.',
      parameters: {
        type: 'object',
        properties: {
          action_type: { type: 'string', description: 'Action identifier (e.g., "jira.create_comment", "slack.post_message", "sharepoint.update_file")' },
          entity_type: { type: 'string', description: 'Target entity type (e.g., "issue", "channel", "document")' },
          entity_id: { type: 'string', description: 'Target entity ID (e.g., "PROJ-142", "#general", "doc_123")' },
          payload: { type: 'object', description: 'Action-specific data (e.g., { "comment": "..." } for a comment action)' },
          reason: { type: 'string', description: 'Why this action is being performed — shown in governance audit trail' },
        },
        required: ['action_type', 'entity_type', 'entity_id', 'payload', 'reason'],
      },
      execute: async (args) => {
        const actionType = args.action_type as string;
        const entityType = args.entity_type as string;
        const entityId = args.entity_id as string;
        const payload = (args.payload as Record<string, unknown>) ?? {};
        const reason = args.reason as string;

        if (!client.action) {
          return 'Governed actions are not supported by this KVARK instance.';
        }

        try {
          const response = await client.action(
            actionType,
            { entityType, entityId },
            payload,
            reason,
          );

          if (!response.ok) {
            const errMsg = response.error?.message ?? 'Action was denied by KVARK governance policy.';
            return `Action denied: ${errMsg}`;
          }

          const data = response.data!;
          const parts = [`Action executed: ${actionType} on ${entityType}/${entityId}`];
          if (data.actionId) parts.push(`Action ID: ${data.actionId}`);
          if (data.auditRef) parts.push(`Audit reference: ${data.auditRef}`);
          if (data.status === 'queued') parts.push('Status: queued for execution');
          return parts.join('\n');
        } catch (err) {
          return handleKvarkError(err, 'action');
        }
      },
    },

    // ── kvark_ask_document ───────────────────────────────────────
    {
      name: 'kvark_ask_document',
      description:
        'Ask a focused question about a specific enterprise document. Returns an answer with source references. Use after kvark_search identifies a relevant document.',
      parameters: {
        type: 'object',
        properties: {
          document_id: { type: 'string', description: 'Document ID from kvark_search results' },
          question: { type: 'string', description: 'Question about the document' },
        },
        required: ['document_id', 'question'],
      },
      execute: async (args) => {
        const documentId = args.document_id as string;
        const question = args.question as string;

        try {
          const response = await client.askDocument(documentId, question);
          return formatAskOutput(response, documentId);
        } catch (err) {
          return handleKvarkError(err, 'ask');
        }
      },
    },
  ];
}

// ── Error handling ───────────────────────────────────────────────────────

function handleKvarkError(err: unknown, operation: 'search' | 'ask' | 'feedback' | 'action'): string {
  if (!(err instanceof Error)) {
    return 'KVARK encountered an unexpected error. Try again or use workspace memory.';
  }

  switch (err.name) {
    case 'KvarkUnavailableError':
      return 'KVARK is not reachable. Using workspace memory only. Configure KVARK connection in Settings.';

    case 'KvarkAuthError':
      return 'KVARK authentication failed. Check KVARK credentials in Settings.';

    case 'KvarkNotImplementedError':
      if (operation === 'ask') {
        return 'Document Q&A is not yet available on this KVARK instance. Use kvark_search to find relevant documents instead.';
      }
      if (operation === 'feedback') {
        return 'Feedback is not yet available on this KVARK instance. This is non-blocking — continue normally.';
      }
      if (operation === 'action') {
        return 'Governed actions are not yet available on this KVARK instance. The action was not executed.';
      }
      return 'This KVARK feature is not yet available.';

    case 'KvarkNotFoundError':
      if (operation === 'ask') {
        return 'Document not found. The document may have been removed or the ID may be incorrect.';
      }
      return 'The requested resource was not found in KVARK.';

    case 'KvarkServerError':
      return `KVARK server error: ${err.message}. Try again in a moment.`;

    default:
      return `KVARK error: ${err.message}`;
  }
}
