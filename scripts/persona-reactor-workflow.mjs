/**
 * 5-persona HUMAN E2E — reaction phase. Run via the Workflow tool:
 *   Workflow({ scriptPath: "scripts/persona-reactor-workflow.mjs", args: { personas: [...] } })
 *
 * For each persona captured by tests/vision/personas.spec.ts, one reactor agent
 * READS that persona's real screenshots + the real transcript (what they typed,
 * what the live agent actually replied, what Memory showed afterward) and reacts
 * strictly IN CHARACTER — real feeling, emotional bonding, honest friction. A
 * synthesis agent then aggregates the five lived experiences into a report.
 *
 * Grounded in reality: reactors react to what the app ACTUALLY did, not an
 * imagined session — so the feelings are about real responses, not fiction.
 *
 * args.personas: [{ id, who, goal, transcript, conversationRendered,
 *                   memoryAfter, screenshots[], consoleErrors[] }]
 */

export const meta = {
  name: 'persona-experience-e2e',
  description: 'Five human personas react in-character to their REAL live-app sessions; synthesize the collective emotional + UX verdict',
  phases: [
    { title: 'React', detail: 'one in-character reactor per persona (reads real screens + transcript)' },
    { title: 'Synthesize', detail: 'aggregate the five lived experiences into one report' },
  ],
}

let parsed = args
if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed) } catch { parsed = {} } }
const personas = Array.isArray(parsed?.personas) ? parsed.personas : []
if (personas.length === 0) {
  log('No personas supplied. Pass args.personas = [the artifacts/personas/*.json objects].')
  return { error: 'no-personas' }
}

log(`Living through ${personas.length} real persona session(s)...`)

const REACT_SCHEMA = {
  type: 'object',
  required: ['feeling', 'gotMe', 'bondingMoment', 'worstFriction', 'scores', 'wouldReturn', 'verdictOneLine'],
  additionalProperties: false,
  properties: {
    feeling: { type: 'string', description: 'first-person, visceral, specific to what ACTUALLY happened on screen — not generic' },
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
  personas.map((p) => () =>
    agent(
      `You ARE this person — react in first person, in their voice, with their actual emotional disposition. Do NOT be a polite reviewer; be the human.

WHO YOU ARE:
${p.who}

WHY YOU OPENED WAGGLE TODAY:
${p.goal}

WHAT ACTUALLY HAPPENED — use the Read tool to LOOK at your real screenshots before reacting:
${(p.screenshots || []).map((s) => `  ${s}`).join('\n')}

THE REAL TRANSCRIPT (what you typed → what the agent actually replied is in the rendered conversation below):
You said:
${(p.transcript || []).map((m) => `  • ${m.text}`).join('\n')}

The conversation as it rendered on your screen (this is the agent's REAL reply — judge IT, the actual words):
"""
${(p.conversationRendered || '').slice(0, 5000)}
"""

What Memory showed AFTER your chat (did your conversation leave a trace — the thing they promise makes this different?):
"""
${(p.memoryAfter || '').slice(0, 1500)}
"""

${(p.consoleErrors || []).length ? `(Under the hood there were console errors: ${JSON.stringify(p.consoleErrors)} — you wouldn't see these, but they may have caused glitches you DID feel.)` : ''}

Now react HONESTLY as yourself. Be specific to the real words the agent said — quote a phrase that landed or fell flat. If it was generic or missed you, say so and let it sting. If it genuinely got you, let yourself feel that. Did you BOND? Would you come back tomorrow? What's the one moment that connected and the one that broke it?

Return ONLY the structured reaction.`,
      { label: `react:${p.id}`, phase: 'React', schema: REACT_SCHEMA },
    ).then((r) => ({ id: p.id, who: p.who, goal: p.goal, ...r })),
  ),
)

const ok = reactions.filter(Boolean)
const avg = (k) => ok.length ? (ok.reduce((s, r) => s + (r.scores?.[k] ?? 0), 0) / ok.length).toFixed(1) : '0'
const returners = ok.filter((r) => r.wouldReturn).length
log(`Avg bonding ${avg('bonding')}/10 · trust ${avg('trust')}/10 · delight ${avg('delight')}/10 · ${returners}/${ok.length} would return`)

phase('Synthesize')

const report = await agent(
  `You are a head of product synthesizing FIVE real, in-character human reactions to live first sessions with Waggle OS (each grounded in the user's actual screens + the agent's actual replies). Write an honest UX + emotional report to the repo-relative path:
tests/vision/artifacts/persona-experience-report.md  (use the Write tool)

Reactions (JSON):
${JSON.stringify(ok, null, 2)}

The report must contain:
1. "# Waggle — 5-Persona Human E2E" + a one-line emotional verdict (averages: bonding ${avg('bonding')}/10, trust ${avg('trust')}/10, delight ${avg('delight')}/10; ${returners}/${ok.length} would return).
2. A per-persona section: who they are, their one-line verdict, bonding/trust/delight scores, the bonding moment, the worst friction, and a representative quote of how they FELT.
3. "## What made them bond" — the cross-persona triggers of genuine connection (cite which personas).
4. "## What broke the spell" — the cross-persona friction themes, ordered by how much they hurt.
5. "## The memory moat — did they feel it?" — did the post-chat Memory state make anyone feel the persistence promise was real? Be honest if it didn't land.
6. "## Verdict: would real humans bond with this?" — your unsentimental call + the top 3 changes that would most raise bonding/return rate.

Be specific and honest — if the sessions were mediocre or the agent was generic, SAY so; do not inflate. Then return { reportPath, avgBonding, avgTrust, avgDelight, wouldReturn: ${returners}, total: ${ok.length} }.`,
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
