/**
 * KVARK TypeScript types — verified from GitHub KVARK Pydantic DTOs.
 *
 * Source: github.com/UkisAI-Egzakta/KVARK backend/src/models/dto/
 * These types are the contract between Waggle and KVARK.
 * All KVARK interaction flows through KvarkClient using these types.
 */

// ── Auth ─────────────────────────────────────────────────────────────────

export interface KvarkLoginRequest {
  identifier: string;
  password: string;
}

export interface KvarkUser {
  id: number;
  identifier: string;
  first_name: string | null;
  last_name: string | null;
  admin: boolean;
  developer: boolean;
  status: string | null;
  created_at: string | null;
}

export interface KvarkLoginResponse {
  success: boolean;
  access_token: string | null;
  token_type: string;
  user: KvarkUser | null;
  error: string | null;
}

// ── Search ───────────────────────────────────────────────────────────────

export interface KvarkSearchResult {
  document_id: number;
  title: string;
  snippet: string;
  score: number;
  document_type: string | null;
  // Future enrichment (KVARK-side):
  // connector?: string;
  // source_path?: string;
  // page?: number;
  // citation_label?: string;
}

export interface KvarkSearchResponse {
  results: KvarkSearchResult[];
  total: number;
  query: string;
}

// ── Document Ask ─────────────────────────────────────────────────────────

export interface KvarkAskRequest {
  document_id: string;
  question: string;
}

export interface KvarkAskResponse {
  answer: string;
  sources: string[];
}

// ── Feedback ─────────────────────────────────────────────────────────────

export interface KvarkFeedbackRequest {
  feedbackType: 'search_result';
  target: {
    documentId: number;
  };
  signal: {
    rating: 'positive' | 'negative';
    label: 'useful' | 'not_useful';
    comment?: string;
  };
  context: {
    query: string;
  };
}

export interface KvarkFeedbackResponse {
  ok: boolean;
  data: {
    stored: boolean;
    feedbackId?: string;
  };
  error: string | null;
}

// ── Governed Actions ─────────────────────────────────────────────────────

export interface KvarkActionRequest {
  actionType: string;
  target: {
    entityType: string;
    entityId: string;
  };
  payload: Record<string, unknown>;
  governance: {
    userApproved: boolean;
    approvalReference?: string;
  };
  context: {
    workspaceId?: string;
    reason: string;
  };
}

export interface KvarkActionResponse {
  ok: boolean;
  data: {
    status: 'executed' | 'denied' | 'queued';
    actionId?: string;
    auditRef?: string;
    result?: Record<string, unknown>;
  } | null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null;
}

// ── Chat SSE Events ──────────────────────────────────────────────────────

export interface KvarkTokenUsage {
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

export type KvarkChatEvent =
  | { type: 'status'; msg: string }
  | { type: 'token'; chunk: string }
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; summary: string; duration_ms: number }
  | { type: 'thought'; text: string }
  | { type: 'done'; session_id: number; answer: string; usage?: KvarkTokenUsage }
  | { type: 'error'; msg: string };

// ── Errors ───────────────────────────────────────────────────────────────

/** Standard FastAPI HTTPException shape */
export interface KvarkErrorResponse {
  detail: string;
}

// ── Client Config ────────────────────────────────────────────────────────

export interface KvarkClientConfig {
  /** KVARK API base URL, e.g. "http://localhost:8000" */
  baseUrl: string;
  /** Login identifier (username or email) */
  identifier: string;
  /** Login password */
  password: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
  /** Retry once on 5xx errors (default: true) */
  retryOnServerError?: boolean;
}

// ── Typed Errors ─────────────────────────────────────────────────────────

export class KvarkAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KvarkAuthError';
  }
}

export class KvarkNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KvarkNotFoundError';
  }
}

export class KvarkNotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KvarkNotImplementedError';
  }
}

export class KvarkServerError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'KvarkServerError';
  }
}

export class KvarkUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KvarkUnavailableError';
  }
}
