# KVARK HTTP API — Functional Requirements for Waggle Integration

**Date**: 2026-03-20
**Status**: Requirements specification for KVARK team
**Consumer**: Waggle desktop app (KvarkClient at `packages/server/src/kvark/`)
**Protocol**: REST/JSON over HTTPS, Bearer token auth, SSE for streaming

---

## Overview

Waggle integrates with KVARK as a **black-box retrieval and action engine** for Business/Enterprise tiers. Waggle never duplicates KVARK's search, ranking, or permission logic. All interaction flows through 6 HTTP endpoints.

**Waggle's client is already built and tested** — see `packages/server/src/kvark/kvark-client.ts` (30 mocked tests passing). This document specifies exactly what KVARK must serve for the integration to go live.

---

## Base URL

Configured via `KVARK_URL` environment variable (e.g., `https://kvark.example.com`).

---

## 1. Authentication

### POST /api/auth/login

Authenticate a user and receive a Bearer token.

**Request:**
```json
{
  "identifier": "marko@example.com",
  "password": "user-password"
}
```

**Response (200):**
```json
{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "identifier": "marko@example.com",
    "first_name": "Marko",
    "last_name": "Markovic",
    "admin": false,
    "developer": false,
    "status": "active",
    "created_at": "2026-01-15T10:00:00Z"
  },
  "error": null
}
```

**Response (401 — bad credentials):**
```json
{
  "success": false,
  "access_token": null,
  "token_type": "bearer",
  "user": null,
  "error": "Invalid credentials"
}
```

**Token lifecycle:**
- Waggle caches the token in memory (no disk persistence)
- On any 401 response from other endpoints, Waggle re-authenticates automatically
- Token expiry is managed by KVARK — Waggle has no hardcoded TTL
- All subsequent requests include: `Authorization: Bearer <access_token>`

---

## 2. User Identity

### GET /api/auth/me

Verify token validity and get current user info. Used by Waggle as a health/ping check.

**Headers:** `Authorization: Bearer <token>`

**Response (200):**
```json
{
  "id": 1,
  "identifier": "marko@example.com",
  "first_name": "Marko",
  "last_name": "Markovic",
  "admin": false,
  "developer": false,
  "status": "active",
  "created_at": "2026-01-15T10:00:00Z"
}
```

**Response (401):** Token expired or invalid — Waggle re-authenticates.

---

## 3. Search

### GET /api/search

Search KVARK's document index across all connected sources (SharePoint, Jira, Slack, Confluence, email, etc.). KVARK handles hybrid search (semantic + keyword), reranking, and permission filtering internally.

**Headers:** `Authorization: Bearer <token>`

**Query parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `q` | string | Yes | — | Search query (natural language) |
| `limit` | integer | No | 10 | Maximum results to return (1-100) |
| `offset` | integer | No | 0 | Pagination offset |

**Response (200):**
```json
{
  "results": [
    {
      "document_id": 42,
      "title": "Q4 Project Status Report",
      "snippet": "The migration to the new infrastructure was completed ahead of schedule, with all 12 microservices deployed...",
      "score": 0.92,
      "document_type": "pdf"
    },
    {
      "document_id": 187,
      "title": "Sprint Planning Notes — Week 11",
      "snippet": "Team agreed to prioritize the authentication refactor. Marko will lead the backend changes...",
      "score": 0.85,
      "document_type": "confluence"
    }
  ],
  "total": 23,
  "query": "project status migration"
}
```

**Result fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `document_id` | integer | Yes | Unique document identifier |
| `title` | string | Yes | Document title |
| `snippet` | string | Yes | Relevant text excerpt (recommended: 100-300 chars) |
| `score` | float | Yes | Relevance score (0.0-1.0, higher = more relevant) |
| `document_type` | string/null | No | Source type: `"pdf"`, `"confluence"`, `"slack"`, `"jira"`, `"sharepoint"`, `"email"`, `"notion"`, etc. |

**Future enrichment** (not required for v1, Waggle types are ready):
- `connector`: string — which connector sourced this document
- `source_path`: string — file path or URL in the source system
- `page`: number — page number for PDFs
- `citation_label`: string — KVARK-generated citation reference

**Response (401):** Re-auth.
**Response (500):** Waggle falls back to workspace memory only, shows "KVARK unavailable" to the agent.

---

## 4. Document Q&A

### POST /api/chat/ask

Ask a focused question about a specific document. KVARK retrieves the document content, runs it through the LLM, and returns a synthesized answer with source references.

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Request:**
```json
{
  "document_id": "42",
  "question": "What was the timeline for the infrastructure migration?"
}
```

**Response (200):**
```json
{
  "answer": "The infrastructure migration was completed in 3 phases over 6 weeks. Phase 1 (weeks 1-2) covered database migration, Phase 2 (weeks 3-4) handled microservice deployment, and Phase 3 (weeks 5-6) was testing and cutover.",
  "sources": ["Q4 Project Status Report, page 4", "Migration Plan v2, section 3.1"]
}
```

**Response (404):** Document not found.
**Response (501):** Endpoint not yet implemented — Waggle handles gracefully ("Document Q&A not yet available, use kvark_search instead").

**Note:** This endpoint may return 501 in early KVARK versions. Waggle's agent will fall back to using search snippets instead of document-level Q&A.

---

## 5. Feedback

### POST /api/feedback

Send retrieval quality feedback to KVARK's reinforcement learning system. Waggle sends this when the agent determines a search result materially influenced (or didn't influence) its response.

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Request:**
```json
{
  "feedbackType": "search_result",
  "target": {
    "documentId": 42
  },
  "signal": {
    "rating": "positive",
    "label": "useful",
    "comment": "Directly answered the user's question about migration timeline"
  },
  "context": {
    "query": "project status migration"
  }
}
```

**Signal values:**
| Field | Values | Description |
|-------|--------|-------------|
| `rating` | `"positive"` / `"negative"` | Overall signal |
| `label` | `"useful"` / `"not_useful"` | Human-readable label |
| `comment` | string (optional) | Why the result was/wasn't useful |

**Response (200):**
```json
{
  "ok": true,
  "data": {
    "stored": true,
    "feedbackId": "fb_abc123"
  },
  "error": null
}
```

**Response (501):** Not yet implemented — Waggle ignores silently (feedback is fire-and-forget).

**Design note:** Waggle treats this as fire-and-ack. Feedback failures never block the user or the agent. KVARK should process feedback asynchronously.

---

## 6. Governed Actions

### POST /api/actions

Execute an enterprise action through KVARK's governance layer. Examples: create a Jira comment, post a Slack message, update a SharePoint file. KVARK enforces its own governance policy (role-based access, approval workflows, audit logging).

**Headers:** `Authorization: Bearer <token>`, `Content-Type: application/json`

**Request:**
```json
{
  "actionType": "jira.create_comment",
  "target": {
    "entityType": "issue",
    "entityId": "PROJ-142"
  },
  "payload": {
    "comment": "Analysis complete. The root cause was identified as a race condition in the auth middleware. Fix deployed in PR #847."
  },
  "governance": {
    "userApproved": true,
    "approvalReference": "approval_abc123"
  },
  "context": {
    "workspaceId": "ws_research_project",
    "reason": "User requested posting analysis results to the Jira ticket"
  }
}
```

**Response (200 — executed):**
```json
{
  "ok": true,
  "data": {
    "status": "executed",
    "actionId": "act_xyz789",
    "auditRef": "audit_20260320_001",
    "result": {
      "commentId": "12345",
      "url": "https://jira.example.com/browse/PROJ-142#comment-12345"
    }
  },
  "error": null
}
```

**Response (200 — denied by governance):**
```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "GOVERNANCE_DENIED",
    "message": "User does not have permission to comment on issues in the PROJ project",
    "details": {
      "requiredRole": "project_contributor",
      "userRole": "viewer"
    }
  }
}
```

**Response (200 — queued):**
```json
{
  "ok": true,
  "data": {
    "status": "queued",
    "actionId": "act_xyz790",
    "auditRef": "audit_20260320_002"
  },
  "error": null
}
```

**Status values:**
| Status | Description |
|--------|-------------|
| `executed` | Action completed immediately |
| `denied` | Governance policy rejected the action |
| `queued` | Action accepted but will execute asynchronously |

**Response (501):** Governed actions not yet implemented.

---

## Error Responses

All endpoints use standard HTTP status codes with a consistent error body:

```json
{
  "detail": "Human-readable error description"
}
```

| Status | Meaning | Waggle Behavior |
|--------|---------|-----------------|
| 200 | Success | Process response |
| 401 | Token expired/invalid | Re-authenticate, retry once |
| 404 | Resource not found | Show "not found" to agent |
| 501 | Not implemented | Graceful degradation (feature-specific fallback) |
| 500+ | Server error | Fall back to workspace memory, log warning |

---

## CORS

KVARK must accept requests from Waggle's server (localhost:3333 or the deployed server URL). Since Waggle calls KVARK server-to-server (not from the browser), CORS headers are optional. If KVARK is accessed from a browser context, configure:

```
Access-Control-Allow-Origin: <waggle-server-origin>
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Allow-Methods: GET, POST, OPTIONS
```

---

## Timeouts

Waggle enforces a **30-second timeout** on all KVARK requests (configurable via `KvarkClientConfig.timeoutMs`). KVARK endpoints should respond within this window.

**Recommended response time targets:**
| Endpoint | Target | Maximum |
|----------|--------|---------|
| `/api/auth/login` | <1s | 5s |
| `/api/auth/me` | <500ms | 3s |
| `/api/search` | <3s | 15s |
| `/api/chat/ask` | <10s | 25s |
| `/api/feedback` | <1s | 5s |
| `/api/actions` | <5s | 25s |

---

## Implementation Priority

KVARK can deliver these endpoints incrementally. Waggle handles 501 gracefully on all endpoints.

| Priority | Endpoint | Why |
|----------|----------|-----|
| **P0** | `POST /api/auth/login` | Required — no auth = no integration |
| **P0** | `GET /api/auth/me` | Required — Waggle uses this as health check |
| **P0** | `GET /api/search` | Core value — this is why KVARK exists |
| **P1** | `POST /api/feedback` | Improves search quality over time |
| **P2** | `POST /api/chat/ask` | Enhanced UX but search alone works fine |
| **P2** | `POST /api/actions` | Enterprise tier differentiator |

**Minimum viable integration: P0 only (3 endpoints).** Waggle will show KVARK search results alongside workspace memory with source attribution.

---

## Testing

Waggle's client has **30 mocked tests** covering:
- Auth flow (login, token caching, 401 re-auth)
- Search (query, pagination, empty results)
- Document Q&A (success, 404, 501 fallback)
- Feedback (positive, negative, 501 graceful)
- Actions (executed, denied, queued, 501 fallback)
- Network errors (timeout, unreachable)
- Error classification (auth, not-found, server, unavailable)

Once KVARK serves these endpoints, Waggle wiring is a one-liner: add `KVARK_URL`, `KVARK_USER`, `KVARK_PASSWORD` to `.env` and the client auto-connects.

---

## Environment Variables (Waggle-side)

```env
KVARK_URL=https://kvark.example.com
KVARK_USER=waggle-agent@company.com
KVARK_PASSWORD=service-account-password
KVARK_TIMEOUT_MS=30000  # optional, default 30s
```

---

## Architecture Principle

> **KVARK = Retrieval Intelligence. Waggle = Agent Intelligence.**
>
> KVARK owns: hybrid search, reranker, reinforcement learning, document permissions, connectors, ingestion pipeline.
> Waggle owns: agent loop, .mind memory, workspace context, tools, sub-agents, task board, UX.
> Waggle DELEGATES retrieval to KVARK — it does NOT duplicate search, ranking, or permission logic.
