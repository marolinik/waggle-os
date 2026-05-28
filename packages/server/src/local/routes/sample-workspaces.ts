/**
 * Sample Workspaces (FR-5) — /api/sample-workspaces
 *
 * Pre-seeded workspaces that give day-0 users an immediate "this
 * remembers me" hook (rubric dim 3 — first-session hook in <60s).
 * Three curated bundles: writer / analyst / marketer. Each ships:
 *   - identity frames (so recall queries return useful results)
 *   - decision frames (so "what did we decide about X" works)
 *   - pending-task frames (so the briefing has something to nudge on)
 *
 * Bundles are inline TS literals — no JSON files to bundle, no FS reads
 * across the dist boundary. Adding a 4th bundle = add another entry to
 * SAMPLE_BUNDLES below.
 *
 * Endpoints
 *   GET  /api/sample-workspaces        → [{id, name, icon, description, frameCount}]
 *   POST /api/sample-workspaces/load   { sampleId } → { workspaceId }
 */

import type { FastifyInstance } from 'fastify';
import { FrameStore, SessionStore } from '@waggle/core';

type Importance = 'critical' | 'important' | 'normal' | 'low';
type FrameSource = 'user_stated' | 'tool_verified' | 'agent_inferred' | 'import' | 'system';

interface SampleFrame {
  content: string;
  importance?: Importance;
  source?: FrameSource;
}

interface SampleBundle {
  id: string;
  name: string;
  icon: string;
  personaId: string;
  description: string;
  frames: SampleFrame[];
}

// ── Bundles ────────────────────────────────────────────────────────
// Frame content is written so a researcher persona's recall query
// ("what do I know about <topic>") returns something useful within
// the first session. Keep frames short — long blobs degrade search.

const SAMPLE_BUNDLES: SampleBundle[] = [
  {
    id: 'writer',
    name: 'Writer demo — Anya',
    icon: '✍',
    personaId: 'writer',
    description: 'Anya, a content strategist drafting a weekly newsletter. See memory recall + brand voice + draft history come alive.',
    frames: [
      {
        content: 'I am Anya, content strategist at a 50-person SaaS startup. I write a weekly newsletter on Wednesdays. My voice: punchy, contrarian, second-person, short sentences. I avoid hype words like "revolutionary" or "game-changing".',
        importance: 'critical',
        source: 'user_stated',
      },
      {
        content: 'Brand voice rules: write in second person, target sentences ≤ 18 words, lead with the surprise not the setup, end with a question or a dare.',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'Last week\'s newsletter "Why AI memos beat AI agents" reached 4,200 reads (up 38% on the 4-week average). Top quote pulled: "An agent that forgets is just autocomplete with delusions of grandeur."',
        importance: 'important',
        source: 'tool_verified',
      },
      {
        content: 'Q3 editorial direction: lean into skepticism, less hype. Approved by Marko (founder) on 2026-04-12. Apply to all newsletter, blog, and pitch copy.',
        importance: 'critical',
        source: 'user_stated',
      },
      {
        content: 'Wednesday newsletter draft is pending. Topic TBD — candidates: "the memory premium", "agents vs. memos", "why every PM should write essays".',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'Reusable opener I keep coming back to: "Here\'s what nobody is saying about <topic>:". Works for 70% of newsletters; rest need a different shape.',
        importance: 'normal',
        source: 'user_stated',
      },
      {
        content: 'Reader feedback aggregated from 2026-04: subscribers love the framework essays (avg 9.2/10) but bounce on the round-up posts (6.1/10). Cut round-ups.',
        importance: 'important',
        source: 'tool_verified',
      },
      {
        content: 'I always work with a draft → critique → rewrite loop. The critique pass is the most important — without it the piece reads as a first thought.',
        importance: 'normal',
        source: 'user_stated',
      },
    ],
  },
  {
    id: 'analyst',
    name: 'Analyst demo — Daniel',
    icon: '📊',
    personaId: 'analyst',
    description: 'Daniel, a BI analyst preparing the monthly board pack. See structured recall + variance commentary patterns + decision history.',
    frames: [
      {
        content: 'I am Daniel, BI/finance ops analyst. I live in Looker + Excel + Outlook. I prepare the monthly board pack (variance commentary, KPI tile, regional breakdown) by the 5th of each month.',
        importance: 'critical',
        source: 'user_stated',
      },
      {
        content: 'Board-pack structure: 1 page exec summary, 2 pages KPI tiles, 1 page regional breakdown, 1 page risks. Always cite the source Looker dashboard ID inline.',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'Q2 variance commentary highlighted Asia-Pac headwinds — particularly Japan SMB segment down 18% QoQ vs. plan. Root cause: longer enterprise sales cycles, not pricing.',
        importance: 'critical',
        source: 'tool_verified',
      },
      {
        content: 'Decision 2026-05: pivoted from monthly variance review to weekly after Q2 missed targets. Friday 9am cadence with FP&A + CRO. Cuts response time from 4w to 1w.',
        importance: 'critical',
        source: 'user_stated',
      },
      {
        content: 'October variance commentary is pending. Need: NA + EMEA + APAC splits, churn cohort delta, and the new pipeline conversion metric Sarah (CRO) requested last week.',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'Commentary tone preference: lead with the number, then the why, then the so-what. Three sentences max per bullet. Board doesn\'t read prose.',
        importance: 'normal',
        source: 'user_stated',
      },
      {
        content: 'Reusable variance-commentary template: "<KPI> came in at <actual> vs. <plan> (<delta>%). Driver: <cause>. Action: <decision or proposal>."',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'Asia-Pac SMB cohort: opened a deeper dive in 2026-04. Found that the longer cycle is concentrated in 5 specific accounts — not a segment-wide trend. Updated forecast accordingly.',
        importance: 'normal',
        source: 'tool_verified',
      },
    ],
  },
  {
    id: 'consultant',
    name: 'Consultant demo — Imran',
    icon: '🧭',
    personaId: 'consultant',
    description: 'Imran, an independent strategy consultant running 4 client engagements. See framework recall + client decision history + deck patterns.',
    frames: [
      {
        content: 'I am Imran, independent strategy consultant. I work in Apple Notes + Calendly + Gmail + Keynote. Currently 4 active engagements: Acme Co, Beta Corp, Gamma Inc, Delta LLC.',
        importance: 'critical',
        source: 'user_stated',
      },
      {
        content: 'My default framework toolkit: 2x2 matrix for stakeholder mapping (80% of problems), Porter\'s Five Forces for market analysis, SWOT for opportunity sizing, value-stream maps for ops.',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'Acme Co Q3 engagement: applied Porter\'s Five Forces and identified buyer power as the structural weakness. Recommended supplier diversification + downstream integration. Slide deck delivered 2026-04-22.',
        importance: 'critical',
        source: 'tool_verified',
      },
      {
        content: 'Decision 2026-03: standardised on 2x2 matrix as the default first-pass framework for new engagements. Faster than full Porter\'s — gets to a shareable artefact in 90 minutes.',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'Beta Corp deck is pending — synthesise last 3 calls (2026-05-08, 05-15, 05-22) into a 1-page exec summary plus 6 slides. Need to land before their board meeting on 2026-06-04.',
        importance: 'critical',
        source: 'user_stated',
      },
      {
        content: 'Slide-titling rule: titles are full sentences carrying the insight ("Margin compression is structural, not cyclical"); body bullets are evidence. Never use category labels like "Strategy Overview".',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'Framework selection rubric I keep refining: stakeholder problem → 2x2; market problem → Porter or SWOT; operations problem → value-stream map; org-design → RACI or org chart.',
        importance: 'normal',
        source: 'user_stated',
      },
      {
        content: 'Gamma Inc paused engagement on 2026-04-30 pending their CEO transition. Resume estimated August. All deliverables archived; relationship intact.',
        importance: 'normal',
        source: 'user_stated',
      },
    ],
  },
  {
    id: 'engineer',
    name: 'Engineer demo — Priya',
    icon: '🛠',
    personaId: 'project-manager',
    description: 'Priya, a senior product engineer using Claude Code for coding. See the non-coding half of her week — ADRs, RFCs, meeting synthesis — come alive.',
    frames: [
      {
        content: 'I am Priya, senior product engineer. I use Claude Code daily for the actual code. I want Waggle for the OTHER half of my week — architecture decisions, RFCs, planning, team comms — everything that isn\'t typing into an editor.',
        importance: 'critical',
        source: 'user_stated',
      },
      {
        content: 'Source of truth: code in GitHub, tickets in Linear, docs in /docs/. ADRs live at /docs/adr/<number>-<slug>.md. Numbering is sequential, never reused. Status field is REQUIRED (proposed / accepted / superseded).',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'ADR-0042 (2026-04-18): chose Postgres over SQLite for the audit log table. Reason: needed JSONB queries + concurrent writes from multiple workers. SQLite WAL didn\'t scale past 200 writes/sec in the load test.',
        importance: 'critical',
        source: 'tool_verified',
      },
      {
        content: 'Wednesday architecture meeting cadence — 90 minutes, 4 engineers, 1 PM. I synthesise into a Linear-friendly summary + post to #eng-leads channel by Thursday EOD. Template lives in /docs/templates/arch-sync.md.',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'RFC for the multi-tenant migration is pending. Kickoff Monday 2026-06-02. Scope: schema isolation strategy, billing-row attribution, soft-delete semantics, and the cutover plan.',
        importance: 'critical',
        source: 'user_stated',
      },
      {
        content: 'ADR template I always reuse: Context (the constraint) → Decision (what we chose) → Consequences (positive + negative + neutral) → Alternatives Considered (with rejection rationale). No more than 1 page.',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'RFC writing rule: lead with the problem statement, not the proposed solution. The reader should feel the pain before the cure — otherwise they push back on the cure without understanding what they\'re defending.',
        importance: 'normal',
        source: 'user_stated',
      },
      {
        content: 'Tooling preference: I read Linear in the morning, Slack on demand, GitHub all day. Email goes to a folder I check Friday afternoons. Don\'t @ me in email for anything urgent.',
        importance: 'normal',
        source: 'user_stated',
      },
    ],
  },
  {
    id: 'marketer',
    name: 'Marketer demo — Sarah',
    icon: '🎯',
    personaId: 'marketer',
    description: 'Sarah, marketing manager at a SaaS startup running a product launch. See synthesis from interviews + launch decisions + brand positioning.',
    frames: [
      {
        content: 'I am Sarah, marketing manager at a 50-person SaaS startup. I live in Notion, Slack, Google Docs, Figma, and Linear. I own product launches, campaign messaging, and customer-marketing comms.',
        importance: 'critical',
        source: 'user_stated',
      },
      {
        content: 'Q3 launch positioning: "memory that compounds" beat "AI agents that remember" in user tests (4 of 5 interviews preferred the compound framing). Approved by founder + CRO 2026-05-15.',
        importance: 'critical',
        source: 'tool_verified',
      },
      {
        content: 'Customer interview transcripts live in /research/interviews/2026-05/. Five interviews so far: two PMs, two engineers, one founder. Most-quoted pain point: "I keep re-explaining context".',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'Launch sequence approved: blog post (week 1) → email to existing customers (week 2) → Product Hunt + Twitter (week 3) → conference talk at OpsAI Summit (week 5).',
        importance: 'critical',
        source: 'user_stated',
      },
      {
        content: 'Launch brief for Q4 is pending. Need: target persona refresh, three message variations, asset checklist, and the lifecycle email sequence.',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'Brand pillars (locked 2026-03): compounding memory · sovereign data · workspace-native · enterprise-grade. Every campaign asset has to hit at least two.',
        importance: 'important',
        source: 'user_stated',
      },
      {
        content: 'PM team consistently says they hate vague launch briefs. Always include: specific user pain, the before/after, the metric that moves, and the kill criteria.',
        importance: 'normal',
        source: 'user_stated',
      },
      {
        content: 'Reusable launch-message template: "<Audience> spends <X> doing <Y>. <Product feature> turns that into <Z minutes / new outcome>. Available <when>."',
        importance: 'normal',
        source: 'user_stated',
      },
    ],
  },
];

export async function sampleWorkspacesRoutes(server: FastifyInstance) {
  // ── List available bundles ──────────────────────────────────────
  server.get('/api/sample-workspaces', async () => {
    return SAMPLE_BUNDLES.map(b => ({
      id: b.id,
      name: b.name,
      icon: b.icon,
      personaId: b.personaId,
      description: b.description,
      frameCount: b.frames.length,
    }));
  });

  // ── Load a bundle (creates workspace + seeds frames) ────────────
  server.post<{ Body: { sampleId?: string } }>(
    '/api/sample-workspaces/load',
    async (request, reply) => {
      const sampleId = request.body?.sampleId;
      const bundle = SAMPLE_BUNDLES.find(b => b.id === sampleId);
      if (!bundle) {
        return reply.status(400).send({
          error: `unknown sampleId "${sampleId}". Valid: ${SAMPLE_BUNDLES.map(b => b.id).join(', ')}`,
        });
      }

      // Idempotency — if a workspace with this exact name already exists,
      // return its id instead of re-seeding (would create duplicate frames).
      const existing = server.workspaceManager.list().find(w => w.name === bundle.name);
      if (existing) {
        return { workspaceId: existing.id, alreadyLoaded: true };
      }

      // Create the workspace via the same path POST /api/workspaces uses.
      const ws = server.workspaceManager.create({
        name: bundle.name,
        group: 'Personal',
        icon: bundle.icon,
        personaId: bundle.personaId,
      });

      // Seed the frames. Each gets its own session so the briefing's
      // "I REMEMBER" surfaces real-looking distinct entries rather than
      // one giant compacted blob. Errors per-frame don't abort the load.
      let seeded = 0;
      try {
        const wsDb = server.agentState.getWorkspaceMindDb(ws.id);
        if (!wsDb) throw new Error('workspace mind db unavailable');
        const frames = new FrameStore(wsDb);
        const sessions = new SessionStore(wsDb);
        for (const f of bundle.frames) {
          try {
            const session = sessions.create();
            frames.createIFrame(
              session.gop_id,
              f.content,
              f.importance ?? 'normal',
              f.source ?? 'import',
            );
            seeded++;
          } catch {
            // skip — log only at warn level upstream if needed
          }
        }
      } catch (err) {
        return reply.status(500).send({
          workspaceId: ws.id,
          seeded,
          error: `created workspace but failed to seed frames: ${err}`,
        });
      }

      return { workspaceId: ws.id, seeded, alreadyLoaded: false };
    },
  );
}
