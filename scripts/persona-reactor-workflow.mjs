/**
 * 5-persona HUMAN E2E — reaction phase. Run via the Workflow tool:
 *   Workflow({ scriptPath: "scripts/persona-reactor-workflow.mjs",
 *              args: { personaFiles: ["tests/vision/artifacts/personas/maya-founder.json", ...] } })
 *
 * Each captured persona session (a JSON written by the journey: who, goal,
 * transcript, conversationRendered = the agent's REAL reply, optional
 * screenshots) is handed to one reactor agent that READS the file and reacts
 * strictly IN CHARACTER — real feeling, emotional bonding, honest friction.
 * A synthesis agent aggregates the five lived experiences into a report.
 *
 * Grounded in reality: reactors react to what the live app ACTUALLY replied.
 */

export const meta = {
  name: 'persona-experience-e2e',
  description: 'Five human personas react in-character to their REAL live-app sessions; synthesize the collective emotional + UX verdict',
  phases: [
    { title: 'React', detail: 'one in-character reactor per persona (reads its real session JSON)' },
    { title: 'Synthesize', detail: 'aggregate the five lived experiences into one report' },
  ],
}

let parsed = args
if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed) } catch { parsed = {} } }
const files = Array.isArray(parsed?.personaFiles) ? parsed.personaFiles : []
if (files.length === 0) {
  log('No personaFiles supplied. Pass args.personaFiles = [paths to artifacts/personas/*.json].')
  return { error: 'no-persona-files' }
}

log(`Living through ${files.length} real persona session(s)...`)

const REACT_SCHEMA = {
  type: 'object',
  required: ['persona', 'feeling', 'gotMe', 'bondingMoment', 'worstFriction', 'scores', 'wouldReturn', 'verdictOneLine'],
  additionalProperties: false,
  properties: {
    persona: { type: 'string', description: 'the persona id from the file' },
    feeling: { type: 'string', description: 'first-person, visceral, specific to what the agent ACTUALLY said — not generic' },
    gotMe: { type: 'boolean', description: 'did the agent genuinely understand who I am and what I needed?' },
    bondingMoment: { type: 'string', description: 'the single moment I felt a connection — or "none" with why' },
    worstFriction: { type: 'string', description: 'the single thing that most broke the spell or frustrated me' },
    scores: {
      type: 'object',
      required: ['bonding', 'trust', 'delight'],
      additionalProperties: false,
      properties: {
        bonding: { type: 'number', description: '1-10 emotional connection' },
        trust: { type: 'number', description: '1-10 would I rely on it' },
        delight: { type: 'number', description: '1-10 was it a pleasure' },
      },
    },
    wouldReturn: { type: 'boolean' },
    verdictOneLine: { type: 'string' },
  },
}

phase('React')

const reactions = await parallel(
  files.map((f) => () =>
    agent(
      `Use the Read tool to open this persona session file:
${f}

It is JSON with: id (your persona), who (exactly who you are — your disposition), goal (why you opened Waggle), transcript (what YOU typed), conversationRendered (the agent's REAL reply, verbatim, as it appeared on your screen), and screenshots (Read any that are listed).

Now BECOME that person and react in first person, in their voice, with their actual emotional disposition. You are NOT a polite reviewer — you are the human who just had this exact exchange.

React to the AGENT'S ACTUAL WORDS in conversationRendered — quote a phrase that landed or fell flat. Be honest:
- If it nailed you, let yourself feel that.
- If it was generic, hedging, or missed you, let it sting and say so.
- Watch for anything that felt OFF — e.g. it assuming facts about you that you never said (did it confuse you with someone else?). That breaks trust; react to it as a real person would.
- Did its "memory" (recalling/saving) make the persistence promise feel real to you, or was it noise?

Did you BOND? Would you come back tomorrow? What's the one moment that connected and the one that broke it? Set scores honestly (1-10). Put the persona id in "persona".

Return ONLY the structured reaction.`,
      { label: `react:${f.split(/[\\/]/).pop()}`, phase: 'React', schema: REACT_SCHEMA },
    ),
  ),
)

const ok = reactions.filter(Boolean)
const avg = (k) => ok.length ? (ok.reduce((s, r) => s + (r.scores?.[k] ?? 0), 0) / ok.length).toFixed(1) : '0'
const returners = ok.filter((r) => r.wouldReturn).length
log(`Avg bonding ${avg('bonding')}/10 · trust ${avg('trust')}/10 · delight ${avg('delight')}/10 · ${returners}/${ok.length} would return`)

phase('Synthesize')

const report = await agent(
  `You are a head of product synthesizing FIVE real, in-character human reactions to live first sessions with Waggle OS (each grounded in the agent's actual replies). Write an honest UX + emotional report to the repo-relative path:
tests/vision/artifacts/persona-experience-report.md  (use the Write tool)

Reactions (JSON):
${JSON.stringify(ok, null, 2)}

The report must contain:
1. "# Waggle — 5-Persona Human E2E" + a one-line emotional verdict (averages: bonding ${avg('bonding')}/10, trust ${avg('trust')}/10, delight ${avg('delight')}/10; ${returners}/${ok.length} would return).
2. A per-persona section: who they are, their one-line verdict, bonding/trust/delight scores, the bonding moment, the worst friction, and a representative quote of how they FELT.
3. "## What made them bond" — the cross-persona triggers of genuine connection (cite which personas).
4. "## What broke the spell" — the cross-persona friction themes, ordered by how much they hurt. (If any persona felt the agent confused them with someone else / asserted unfamiliar facts, surface that prominently — it's an identity/workspace-bleed risk.)
5. "## The memory moat — did they feel it?" — did the recall/save behavior make anyone feel the persistence promise was real? Be honest if it didn't land.
6. "## Verdict: would real humans bond with this?" — your unsentimental call + the top 3 changes that would most raise bonding/return rate.

Be specific and honest — if a session was mediocre or generic, SAY so; do not inflate. Then return { reportPath, avgBonding, avgTrust, avgDelight, wouldReturn: ${returners}, total: ${ok.length} }.`,
  {
    label: 'synthesize',
    phase: 'Synthesize',
    schema: {
      type: 'object',
      required: ['reportPath', 'avgBonding', 'avgTrust', 'avgDelight', 'wouldReturn', 'total'],
      additionalProperties: true,
      properties: {
        reportPath: { type: 'string' },
        avgBonding: { type: 'number' },
        avgTrust: { type: 'number' },
        avgDelight: { type: 'number' },
        wouldReturn: { type: 'number' },
        total: { type: 'number' },
      },
    },
  },
)

return { reactions: ok, report }
