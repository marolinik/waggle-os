# Solo-vs-Team Migration — Ratified Spec (2026-07-05)

Founder call: **collapse the funnel to Solo (free) vs Team (paid).** Kill PRO. Full clean.
Scout change-list: session tool-result `bhgz24e6c.txt` (6 areas, ~170 changes). This doc is
the ratified decision layer on top of it.

## Model

- **FREE tier value stays `FREE`** (no stored-value migration), **displays as "Solo"** via a
  new `TIER_LABELS` map. `TIERS = ['TRIAL','FREE','TEAMS','ENTERPRISE']` (PRO removed).
- **PRO removed** from `TIERS` + `TIER_CAPABILITIES`. `parseTier('PRO')`/`'basic'` → `'FREE'`
  (LEGACY_TIER_MAP: `basic:'FREE'`, add `pro:'FREE'`). Never null, never lock out a legacy sub.
- **FREE raised to old-PRO capability** (6 fields): `connectorLimit 5→-1`, `workspaceLimit 5→-1`,
  `embeddingProviders +voyage,+openai` (NOT litellm), `customSkills false→true`,
  `exportFormats +pdf,+json`, `auditLog none→basic`. **All TEAMS-only deltas stay off FREE**
  (teamSkillLibrary, cloudSync, sharedWorkspaces, adminPanel, selfHosted, managedModelPool,
  priorityModels, teamMembersLimit:1, auditLog stays `basic` not `full`, stripePriceId:null).
- **TEAMS unchanged** (paid $49/seat, keeps all collaboration/governance). **ENTERPRISE/KVARK**
  unchanged. **TRIAL** = 15-day Team preview → falls back to Solo.
- New in `tiers.ts`: `TIER_LABELS: Record<Tier,string> = {TRIAL:'Trial', FREE:'Solo', TEAMS:'Team',
  ENTERPRISE:'Enterprise'}` + `tierLabel(t)` helper (single source of truth for display names).

## Ratified sub-decisions (all "clean" defaults)

| # | Decision | Ruling |
|---|---|---|
| 1 | Personal-feature server gates: marketplace install **and** publish, mcps install + custom, personas create/generate, install_mcp cmd, connector_fetch cron, skill-audit | **All → free (Solo).** Remove the `requireTier('PRO')` gate (keep `validateBody` on personas). |
| 2 | Stripe **portal** gate | **Ungate to any authenticated user** (`requireTier('FREE')`); rely on the route's own NO_STRIPE_CUSTOMER 400. A legacy PRO sub (now FREE) must still reach the portal to self-cancel. |
| 3 | Solo session cap | **10** (old PRO cap). TEAMS stays 25. Set `tier-session-cap.ts` + `settings.ts:395` identically. |
| 4 | `settings.ts` /api/tier flags | `marketplace: true`, `customModels: true` (Solo gets BYO cloud models/embeddings). Keep kvark/governance at ENTERPRISE, cloud-sync/admin/audit-export at TEAMS. |
| 5 | Legacy PRO Stripe price → tier | `tierFromPriceId` maps legacy PRO/BASIC price IDs → **`'FREE'`** (keep reading the envs; only the return flips). Keep STRIPE_PRICE_PRO* envs (annotate legacy). |
| 6 | New checkout | **TEAMS only.** `checkout.ts` rejects anything but TEAMS. www checkout narrows to `teams`; www **webhook** keeps accepting `pro` for legacy events. |
| 7 | `feature-gates.ts` + `useFeatureGate.ts` | **DELETE both** (F31 root — kills the 'solo'/'business' vocabulary; the mapping reads the onboarding-complexity axis, not billing, so it's unfixable in place). Rewire the 2 consumers: PersonaSwitcher → personas always unlocked (remove lock scaffolding, clean); SettingsApp → canonical `parseTier(billing.tier)` + `tierSatisfies`. |
| 8 | web-only `BillingTier` union PRO slot | **Remove it fully** (clean). Renumber `BILLING_TIER_ORDER`; replace the magic `billingRank >= 3` TEAMS gate in AppShell with a named `>= BILLING_TIER_ORDER.TEAMS`. Coerce inbound `'PRO'` → `'FREE'` in ShellContext so it never reaches the dock. |
| 9 | Cost visibility (`/api/costs`, `/api/cost/by-workspace`) | **TEAMS** (reconcile both to one tier). |
| 10 | Settings 'enterprise' tab | Stays gated at **ENTERPRISE**. |
| 11 | UpgradeModal comparison | Trim FEATURE_ROWS to **Team-differentiating** caps (honest "what Team adds"). "Most popular" highlight → **Team** card. Enterprise stays a separate CTA block (no 3rd PlanCards column). |
| 12 | Marketplace **publish** | **Free (Solo)** — personal marketplace publishing. (The team *skill library* is the TEAMS feature; that's a different mechanism, stays TEAMS.) |

## Execution partition (file-disjoint → parallel-safe)

1. **Foundation** (`packages/shared/src/tiers.ts` only): the model change above + `TIER_LABELS`/
   `tierLabel`. Then **`tsc --build packages/shared`** so `dist` carries the new exports (web +
   server tsc read shared's `dist/index.d.ts`). MUST land before everything else.
2. **Consumers** (parallel, disjoint dirs): **(a) `packages/server`** — all gates/caps/settings-flags/
   stripe/command-registry/cron per decisions 1-6,9. **(b) `apps/web` source** — delete feature-gates+
   useFeatureGate, rewire PersonaSwitcher/SettingsApp, reframe all billing UI (PlanCards/UpgradeModal/
   TrialExpiredModal/PaymentSuccess/Capabilities/MCPHub/useBilling/adapter/ShellContext/dock-tiers/
   AppShell) to Solo/Team + `TIER_LABELS`, decisions 7,8,11,12. **(c) `apps/www`** — Pricing (2-tier),
   css grid, messages/en.json, terms, www stripe routes (decision 6).
3. **Tests + docs** (after consumers): update every PRO test assertion (shared/core/server/web/e2e)
   to the new contract; CLAUDE.md §1 tier table (drop PRO, Free→Solo, TRIAL→Team-preview, "4-tier"),
   §10 M7/E-10 stripe note; `.env.example` legacy annotation.
4. **Verify**: `tsc --noEmit` on **shared + server + apps/web** (all three — build only checks web);
   `npm run build:packages`; full `vitest run`; `git status`. Then browser QA.

## Critical gotchas
- **Blast-radius asymmetry**: `npm run build` typechecks only `apps/web`, whose PRO refs are all
  loose-string (won't break). The real tsc tripwires are in `packages/shared` (Tier union) and the
  tsx-transpiled `packages/server`. **Always run `npx tsc --noEmit -p packages/{shared,server}`.**
- **A missed `requireTier('PRO')` is worse than a wrong one**: with PRO gone from `TIER_ORDER`,
  `TIER_ORDER['PRO']` is `undefined` → `n >= undefined` is `false` → **403s every user** (feature
  permanently locked). Removing PRO from the union is the deliberate tripwire that surfaces them all.
- **Two semantic reversals** (`FREE.workspaceLimit` and `connectorLimit` 5→-1): their tests encode
  the finite value "as the whole point"; rewrite them, and drop the now-wrong 5-workspace nag UI.
