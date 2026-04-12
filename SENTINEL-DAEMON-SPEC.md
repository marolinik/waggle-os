# Waggle OS — Sentinel Daemon: Self-Improving Agent Observer
## Implementation Specification for Claude Code

**Date:** March 30, 2026
**Classification:** Engineering Spec — Ready for Implementation
**Priority:** P1 — Strategic Differentiator
**Inspired by:** rebelytics/one-skill-to-rule-them-all (CC BY 4.0) — adapted for Waggle's native architecture

---

## 1. OVERVIEW

Sentinel is a background daemon agent in Waggle OS that passively observes all agent sessions, captures corrections, gaps, and recurring patterns, and promotes validated observations into skill improvements. Unlike the open-source "task-observer" skill (which is a prompt injection hack on flat markdown files), Sentinel is a first-class system agent wired into Waggle's Events stream and Memory graph.

### Why This Matters

Every AI system today is static — it executes skills as written and never learns from its mistakes. Sentinel closes that loop. When a user corrects an agent, edits an output, or manually performs a task the system should have automated, Sentinel captures that signal, accumulates evidence, and surfaces actionable improvements. The system gets smarter with every session.

### Design Principles

- **Passive by default** — never interrupts user work, never consumes prompt context
- **Human-in-the-loop** — observations surface as recommendations, never auto-applied
- **Graph-native** — all observations stored in Memory graph, not flat files
- **Cross-agent** — observes ALL agents, not just the active chat session
- **Privacy-first** — strict separation between open-source and internal observations
---

## 2. ARCHITECTURE

### 2.1 System Position

```
┌─────────────────────────────────────────────────────┐
│                    WAGGLE OS                         │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Chat     │  │  Agents  │  │  Mission Control │  │
│  │  (user)   │  │  (13+)   │  │  (fleet mgmt)   │  │
│  └────┬──────┘  └────┬─────┘  └────┬─────────────┘  │
│       │              │              │                │
│       ▼              ▼              ▼                │
│  ┌──────────────────────────────────────────────┐   │
│  │            EVENTS STREAM (100+ types)         │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │                           │
│                         ▼                           │
│  ┌──────────────────────────────────────────────┐   │
│  │          SENTINEL DAEMON (background)         │   │
│  │                                               │   │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────────┐  │   │
│  │  │Observer │ │Analyzer  │ │Promoter       │  │   │
│  │  │(capture)│ │(patterns)│ │(skill updates)│  │   │
│  │  └────┬────┘ └────┬─────┘ └───────┬───────┘  │   │
│  │       │           │               │           │   │
│  └───────┼───────────┼───────────────┼───────────┘   │
│          ▼           ▼               ▼               │
│  ┌──────────────────────────────────────────────┐   │
│  │          MEMORY GRAPH (persistent)            │   │
│  └──────────────────────────────────────────────┘   │
│                         │                           │
│                         ▼                           │
│  ┌──────────────────────────────────────────────┐   │
│  │  Dashboard / Mission Control (surface cards)  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```
### 2.2 Three Internal Components

**Observer** — Subscribes to the Events stream. Captures specific signal types (see Section 3). Writes raw observations to Memory graph as `sentinel_observation` frames.

**Analyzer** — Runs on a configurable schedule (default: every 24 hours, or when observation count exceeds threshold). Groups observations by affected skill/agent. Identifies recurring patterns. Scores observations by recurrence × impact. Detects cross-cutting principles that span multiple skills.

**Promoter** — Takes analyzed observations above confidence threshold and drafts concrete skill improvement proposals. Surfaces these as actionable cards in Dashboard/Mission Control. Waits for admin approval before any modification.

---

## 3. OBSERVATION SIGNALS

### 3.1 What Sentinel Watches For

The daemon subscribes to these event categories from the Events stream:

```typescript
enum SentinelSignalType {
  // User corrections — highest signal value
  USER_EDIT_AGENT_OUTPUT    = 'user_edit',        // User modifies agent response
  USER_REDIRECT             = 'user_redirect',     // User says "no, not that" or redirects
  USER_RETRY                = 'user_retry',        // User re-asks same question differently
  
  // Coverage gaps — medium signal value
  MANUAL_WORKAROUND         = 'manual_workaround', // User does manually what agent should do
  SKILL_NOT_FOUND           = 'skill_not_found',   // Agent lacks skill for requested task
  CONNECTOR_MISSING         = 'connector_gap',     // User references tool not connected
  
  // Quality signals — low but cumulative
  LOW_CONFIDENCE_OUTPUT     = 'low_confidence',    // Agent output below confidence threshold
  AGENT_FAILURE             = 'agent_failure',     // Agent errors or times out
  REPEATED_INSTRUCTIONS     = 'repeated_inst',     // User gives same instruction across sessions
  
  // Positive signals — validate what works
  USER_APPROVAL             = 'user_approval',     // Thumbs up or explicit praise
  FIRST_ATTEMPT_SUCCESS     = 'first_success',     // Task completed without corrections
  SKILL_REUSE               = 'skill_reuse',       // Same skill used successfully 3+ times
}
```
### 3.2 Observation Schema (Memory Graph Frame)

Each observation is stored as a Memory frame with this structure:

```typescript
interface SentinelObservation {
  id: string;                          // unique observation ID
  timestamp: string;                   // ISO 8601
  signalType: SentinelSignalType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  // Context
  agentId: string;                     // which agent was involved
  skillId?: string;                    // which skill was active (if any)
  workspaceId: string;                 // which workspace
  sessionId: string;                   // which session
  
  // The observation itself
  issue: string;                       // what happened (factual)
  suggestedImprovement: string;        // what should change
  principle: string;                   // generalizable lesson
  
  // Tracking
  recurrenceCount: number;             // how many times this pattern seen
  relatedObservationIds: string[];     // linked observations (graph edges)
  status: 'open' | 'analyzed' | 'proposed' | 'approved' | 'applied' | 'dismissed';
  
  // Classification
  classification: 'internal' | 'open_source';  // privacy boundary
  confidenceScore: number;             // 0.0 - 1.0, increases with recurrence
}
```

### 3.3 Detection Heuristics

**User correction detection:**
- Message follows agent response AND contains negation language ("no", "not what I", "wrong", "actually", "instead")
- User edits agent output (if edit tracking is available)
- User re-sends semantically similar request within same session (cosine similarity > 0.85)

**Coverage gap detection:**
- User describes a multi-step workflow manually that could be a skill
- User references external tool/service not in connector list
- User performs copy-paste operations between views (indicates missing integration)

**Quality signal detection:**
- Agent response flagged with confidence < 0.6 (when confidence scoring is implemented)
- Agent falls back to generic response when domain-specific was expected
- Response time exceeds 2x median for that task type
---

## 4. ANALYSIS ENGINE

### 4.1 Scheduled Review Cycle

```typescript
interface SentinelSchedule {
  // Micro-review: group and deduplicate new observations
  microReviewInterval: '4h';           // every 4 hours if new observations exist
  
  // Daily review: pattern detection across all open observations  
  dailyReviewTime: '02:00';            // run during low-activity hours
  
  // Weekly review: cross-skill principle extraction
  weeklyReviewDay: 'monday';
  weeklyReviewTime: '06:00';
  
  // Threshold trigger: immediate review if observation count spikes
  immediateReviewThreshold: 10;        // 10+ observations in single session
}
```

### 4.2 Pattern Detection Algorithm

The Analyzer groups observations using this priority:

1. **Same skill, same issue** — merge into single observation, increment recurrenceCount
2. **Same skill, different issues** — group as skill-level review candidate
3. **Different skills, same principle** — promote to cross-cutting principle
4. **New skill candidate** — coverage gaps that recur 3+ times become new skill proposals

### 4.3 Confidence Scoring

```
confidenceScore = (
  recurrenceCount * 0.4 +              // seen multiple times
  severityWeight * 0.3 +               // higher severity = more confident
  crossAgentConfirmation * 0.2 +       // same issue across different agents
  recencyWeight * 0.1                  // recent observations weighted higher
) / normalizer

Promotion threshold: confidenceScore >= 0.7
```

### 4.4 Cross-Cutting Principles

When the same principle appears in 3+ skills, Sentinel extracts it as a system-level principle:

```typescript
interface CrossCuttingPrinciple {
  id: string;
  principle: string;                   // the generalized rule
  affectedSkills: string[];            // which skills it applies to
  evidenceObservationIds: string[];    // supporting observations
  confidenceScore: number;
  status: 'candidate' | 'approved' | 'active';
}
```

These principles are injected into ALL agent contexts at workspace level — equivalent to workspace-level ground rules that improve every agent simultaneously.
---

## 5. PROMOTION PIPELINE

### 5.1 From Observation to Skill Improvement

```
Observation (raw signal)
    │
    ▼
Pattern (grouped, deduplicated, scored)
    │
    ▼  confidence >= 0.7
Proposal (drafted improvement with before/after)
    │
    ▼  admin approval
Applied (skill updated, observation closed)
    │
    ▼
Verified (next session confirms improvement worked)
```

### 5.2 Proposal Card Schema (Dashboard/Mission Control)

```typescript
interface SentinelProposal {
  id: string;
  title: string;                       // e.g. "Research Agent misses source citations"
  type: 'skill_improvement' | 'new_skill' | 'cross_cutting_principle' | 'agent_config';
  
  // Evidence
  observationCount: number;
  firstSeen: string;
  lastSeen: string;
  confidenceScore: number;
  
  // The proposal
  affectedSkill: string;
  currentBehavior: string;             // what happens now
  proposedBehavior: string;            // what should happen
  diffPreview: string;                 // before/after comparison
  
  // Impact estimate
  estimatedImpact: 'low' | 'medium' | 'high';
  affectedAgents: string[];
  
  // Admin actions
  status: 'pending_review' | 'approved' | 'dismissed' | 'deferred';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}
```
### 5.3 Privacy Firewall

Before any observation is classified as `open_source` or promoted to a shareable skill:

1. **Observation-level stripping** — remove all user names, company names, client references, file paths, credential fragments
2. **Pre-creation review** — scan proposed skill text for PII patterns (email, phone, domain names, API keys)
3. **Post-draft sweep** — regex + semantic scan for leaked proprietary information
4. **Structural principle** — if in doubt, classify as `internal`

This mirrors the task-observer's four-layer confidentiality model but enforced programmatically rather than via prompt instructions.

---

## 6. INTEGRATION POINTS

### 6.1 Events Stream (Input)

Sentinel registers as a subscriber to the existing Events module:

```typescript
// In Sentinel daemon startup
eventBus.subscribe({
  agentId: 'sentinel',
  eventTypes: [
    'agent.response',
    'agent.error',
    'user.message',
    'user.feedback',
    'skill.invocation',
    'skill.failure',
    'connector.request',
    'session.start',
    'session.end'
  ],
  handler: sentinelObserver.processEvent
});
```
### 6.2 Memory Graph (Storage)

Sentinel writes to dedicated memory frame types:

```typescript
// Frame types owned by Sentinel
const SENTINEL_FRAME_TYPES = {
  OBSERVATION: 'sentinel_observation',
  PATTERN: 'sentinel_pattern', 
  PRINCIPLE: 'sentinel_principle',
  PROPOSAL: 'sentinel_proposal',
  AUDIT_LOG: 'sentinel_audit'
};
```

All Sentinel frames are queryable via the existing Memory search/filter API. The Memory Explorer view should include a "Sentinel" filter to show only observation and principle frames.

### 6.3 Dashboard (Output)

New Dashboard widget: **"System Intelligence"**

```
┌─────────────────────────────────────────┐
│  🔍 System Intelligence                │
│                                         │
│  Open observations:      12             │
│  Pending proposals:       3             │
│  Skills improved (30d):   7             │
│  Cross-cutting rules:     2             │
│                                         │
│  Latest:                                │
│  ⚡ "Research agent missing citations"  │
│     Confidence: 0.82 | Seen 5x         │
│     [Review] [Dismiss]                  │
│                                         │
│  ⚡ "New skill candidate: Meeting Prep" │
│     Confidence: 0.71 | Seen 3x         │
│     [Review] [Dismiss]                  │
│                                         │
└─────────────────────────────────────────┘
```
### 6.4 Mission Control (Admin Interface)

New tab in Mission Control: **"Sentinel"**

Displays:
- All pending proposals with approve/dismiss/defer actions
- Observation timeline (filterable by agent, skill, severity)
- Cross-cutting principles registry
- Sentinel daemon health status (last run, next scheduled, observation queue depth)

### 6.5 Cockpit (Health Monitoring)

Sentinel reports its own health metrics to Cockpit:
- Daemon uptime and last heartbeat
- Observation queue depth
- Analysis cycle duration
- Proposal approval rate (approved / total surfaced — measures signal quality)

---

## 7. IMPLEMENTATION PLAN

### Phase 1 — Observer Only (1-2 sprints)

**Goal:** Capture observations, prove signal quality before building automation.

Tasks:
- [ ] Register Sentinel as a system agent in the agent registry
- [ ] Subscribe to Events stream for the signal types in Section 3.1
- [ ] Implement observation detection heuristics (start with user corrections only)
- [ ] Write observations to Memory graph as `sentinel_observation` frames
- [ ] Add "Sentinel" filter to Memory view
- [ ] Add basic observation count widget to Dashboard
- [ ] Manual review via Memory view (no dedicated UI yet)
**Acceptance criteria:**
- Sentinel runs as background process, does not affect agent response latency
- Observations appear in Memory view within 5 seconds of triggering event
- Zero false positives on user correction detection (conservative heuristics)
- Observation frames include full context (agent, skill, session, workspace)

### Phase 2 — Analyzer + Dashboard (2-3 sprints)

**Goal:** Automated pattern detection and visual surfacing of recommendations.

Tasks:
- [ ] Implement scheduled analysis cycles (micro/daily/weekly per Section 4.1)
- [ ] Build pattern grouping algorithm (same skill + same issue = merge)
- [ ] Implement confidence scoring formula from Section 4.3
- [ ] Detect cross-cutting principles (same principle across 3+ skills)
- [ ] Build "System Intelligence" Dashboard widget with proposal cards
- [ ] Add approve/dismiss/defer actions to proposal cards
- [ ] Build Sentinel tab in Mission Control with observation timeline
- [ ] Report Sentinel health metrics to Cockpit

**Acceptance criteria:**
- Daily analysis completes in < 30 seconds for up to 500 open observations
- Proposals surface only when confidence >= 0.7
- Admin can approve/dismiss with one click
- Cross-cutting principles auto-detected and listed in Mission Control
### Phase 3 — Promoter + Self-Improvement (2 sprints)

**Goal:** Approved proposals auto-apply to skills. Sentinel observes its own effectiveness.

Tasks:
- [ ] Implement skill modification engine (apply approved proposals to skill definitions)
- [ ] Add before/after diff preview to proposal cards
- [ ] Implement post-application verification (track if improvement actually reduced corrections)
- [ ] Add Sentinel self-observation (does Sentinel's own signal quality improve over time?)
- [ ] Implement privacy firewall (Section 5.3) for open_source classification
- [ ] Build "Skills improved this month" metric for Dashboard
- [ ] Add approval rate tracking (measures Sentinel's signal-to-noise ratio)

**Acceptance criteria:**
- Approved proposals apply to skill definitions without manual file editing
- Post-application verification confirms improvement within 2 weeks
- Privacy firewall catches 100% of PII in test suite
- Sentinel's own approval rate improves over first 30 days (self-improvement loop validated)

---

## 8. COMPARISON: WHY NATIVE DAEMON vs. PROMPT SKILL

| Dimension | task-observer (SKILL.md) | Waggle Sentinel (daemon) |
|---|---|---|
| **Activation** | Prompt injection every session | Background process, always on |
| **Context cost** | Burns ~2000 tokens per session | Zero prompt overhead |
| **Storage** | Flat markdown log file | Graph database with relations |
| **Review cycle** | Manual — user must remember | Automated schedule + threshold triggers |
| **Surfacing** | Text output in chat | Visual cards in Dashboard + Mission Control |
| **Scope** | Single session, single agent | Cross-agent, cross-workspace, cross-session |
| **Confidence** | None — all observations equal | Scored by recurrence × severity × cross-agent confirmation |
| **Privacy** | Prompt-based "don't leak" instruction | Programmatic PII stripping + classification |
| **Self-improvement** | Observes own methodology via prompt | Tracks own approval rate as objective metric |
| **Offline** | Requires active session | Runs analysis during idle time |
| **Three-tier model** | Power users only | Simple users see results, power users review, admins configure |
---

## 9. CONFIGURATION (Settings View)

New section in Settings: **"Sentinel"**

```typescript
interface SentinelConfig {
  enabled: boolean;                    // default: true
  
  // Observation sensitivity
  observationSensitivity: 'conservative' | 'balanced' | 'aggressive';
  // conservative: only explicit corrections (lowest false positive rate)
  // balanced: corrections + coverage gaps
  // aggressive: all signal types including quality signals
  
  // Review schedule  
  microReviewInterval: number;         // hours, default: 4
  dailyReviewEnabled: boolean;         // default: true
  weeklyReviewEnabled: boolean;        // default: true
  
  // Promotion
  confidenceThreshold: number;         // 0.0-1.0, default: 0.7
  autoApplyApproved: boolean;          // default: false (require manual approval)
  
  // Notifications
  notifyOnNewProposal: boolean;        // default: true
  notifyOnWeeklyReport: boolean;       // default: true
  
  // Privacy
  allowOpenSourceClassification: boolean;  // default: false
  piiStrictMode: boolean;              // default: true
}
```

### User Tier Access

| Setting | Simple User | Power User | Admin |
|---|---|---|---|
| Enable/disable | ✓ | ✓ | ✓ |
| View proposals | — | ✓ | ✓ |
| Approve/dismiss | — | — | ✓ |
| Configure schedule | — | — | ✓ |
| Adjust sensitivity | — | — | ✓ |
| Export observations | — | ✓ | ✓ |

Simple users benefit passively — their agents improve without them needing to understand why.
---

## 10. API ENDPOINTS

### Backend (Fastify) Routes

```
GET    /api/sentinel/status              → daemon health, queue depth, last run
GET    /api/sentinel/observations        → list observations (filterable)
GET    /api/sentinel/observations/:id    → single observation detail
GET    /api/sentinel/proposals           → list pending proposals
GET    /api/sentinel/proposals/:id       → single proposal with diff preview
POST   /api/sentinel/proposals/:id/approve   → approve proposal
POST   /api/sentinel/proposals/:id/dismiss   → dismiss proposal  
POST   /api/sentinel/proposals/:id/defer     → defer for later review
GET    /api/sentinel/principles          → list cross-cutting principles
GET    /api/sentinel/metrics             → approval rate, improvement trends
POST   /api/sentinel/config              → update Sentinel configuration
POST   /api/sentinel/trigger-review      → manually trigger analysis cycle
```

---

## 11. ATTRIBUTION AND LICENSING

The Sentinel daemon concept is inspired by [rebelytics/one-skill-to-rule-them-all](https://github.com/rebelytics/one-skill-to-rule-them-all) by Eoghan Henn, licensed under CC BY 4.0. The observation schema (Issue → Suggested Improvement → Principle), the open-source/internal classification boundary, the pre-flight verification pattern, and the self-observation loop are conceptual adaptations from that work.

Waggle's implementation is architecturally distinct — native daemon vs. prompt skill, graph database vs. flat files, visual UI vs. text output — but the intellectual lineage should be acknowledged in documentation and any public-facing materials.

---

## 12. SUCCESS METRICS

After 30 days of Sentinel operation:

| Metric | Target | Measurement |
|---|---|---|
| Observations captured per week | 20-50 | Memory graph query |
| Proposal approval rate | > 60% | Approved / (approved + dismissed) |
| Skills improved | 5+ | Proposal status = applied |
| User correction rate reduction | -15% | Compare correction events pre/post Sentinel |
| Cross-cutting principles identified | 2+ | Principle frames in graph |
| Sentinel self-improvement | Approval rate trending up | Weekly metric comparison |
| False positive rate | < 10% | Dismissed / total surfaced |

---

*End of specification. Ready for Claude Code implementation.*