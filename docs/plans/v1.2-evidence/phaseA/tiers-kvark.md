# Faza A — revalidacija grupe `tiers-kvark`

**Revizija pod pregledom:** `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (HEAD potvrđen `git rev-parse HEAD`; `git status --porcelain` prikazuje samo dva untracked `.docx` fajla u `docs/`, dakle working tree == HEAD za sve navedene fajlove).
**Datum:** 2026-09-27. **Način rada:** read-only (git show/grep/sed, jedan ciljani `vitest run` u temp direktorijumu; posle testa `git status` nepromenjen). **Nije pozvan Stripe, GitHub API ni bilo koji eksterni servis.**
**Obrađene S1 tvrdnje:** C2, C5, C20, A2 (tier deo), A27, WB (+ A12 tier-deo i A15 Approvals-gate deo jer direktno zavise od iste inventure). Povezani AT: AT-26, AT-27, AT-18.

Legenda statusa: **POTVRĐENO NA REVIZIJI** · **DELIMIČNO/NEPOVEZANO** · **NIJE POTVRĐENO** · **VEĆ ZATVORENO** · **NEPOZNATO** · **NALAZ AUDITA — ZA PROVERU**.

---

## 0. Šta je provereno testom (limit provere)

Pokrenuto pod Node `v22.23.2` (fnm), `node node_modules/vitest/vitest.mjs run --maxWorkers=2`:

| Fajl | Rezultat |
|---|---|
| `packages/server/tests/tier-enforcement-matrix.test.ts` | pass |
| `packages/server/tests/kvark/kvark-wiring.test.ts` | pass |
| `packages/server/tests/kvark/kvark-config.test.ts` | pass |
| `packages/server/tests/stripe/webhook.test.ts` | pass |
| `packages/server/tests/stripe/checkout.test.ts` | pass |
| `packages/core/tests/team-sync.test.ts` | pass |
| `packages/server/tests/routes/connectors-tier.test.ts` | pass |
| `packages/agent/tests/kvark-tools.test.ts` | pass |

**8 fajlova / 144 testa, svi zeleni, 48 s.** Ovo dokazuje da su tier gate-ovi, Stripe mapiranje i KVARK factory *regresiono zaključani u trenutnom obliku* — ne dokazuje E2E funkciju KVARK konekcije (videti F-TK-11). Nije pokretan `packages/server/tests/stripe/smoke-e2e.test.ts` (zahteva pravi `STRIPE_SECRET_KEY`), ni bilo šta iz `vitest.infra-suites.ts` (Postgres/Redis).

---

## 1. Zapisi nalaza

### F-TK-01 — C2 (jezgro): 4-tier sistem TRIAL/FREE/TEAMS/ENTERPRISE sa plaćenim TEAMS i dalje je živ u kodu
- **S1 tvrdnja:** „Code and business still run TEAMS $49, TRIAL (15-day Team preview) and ENTERPRISE, with Stripe live products, www pricing, a Teams server (Postgres+Clerk), team-sync and TEAMS-gated Approvals, costs and audit.”
- **Status:** **POTVRĐENO NA REVIZIJI** za kod. **NEPOZNATO** za „Stripe live products” i aktivne pretplatnike (nije dozvoljen eksterni poziv; brief §12.2 traži ovlašćen inventar pre migracije).
- **Commit:** `2af0904d`.
- **Putanja/simbol:**
  - `packages/shared/src/tiers.ts:20` `TIERS = ['TRIAL','FREE','TEAMS','ENTERPRISE']`; `:8-12` cena TEAMS $49/mo per seat; `:103-123` TEAMS capabilities (`stripePriceId: readEnv('STRIPE_PRICE_TEAMS')`); `:149-151` `TIER_ORDER { FREE:0, TEAMS:2, ENTERPRISE:3, TRIAL:3 }`; `:164-169` `TIER_LABELS` (FREE → „Solo”, TEAMS → „Team”).
  - `packages/server/src/middleware/assert-tier.ts:45-63` `requireTier()` → 403 `TIER_INSUFFICIENT` + `upgradeUrl: 'https://waggle-os.ai/upgrade'` (`:57`).
  - `packages/server/src/local/tier-session-cap.ts:3-7` `maxWorkspaceSessionsForTier`: FREE=10, TEAMS=25, ostalo 100 — stvarni Solo limit; primenjuje ga `settings.ts:91-94 applyRuntimeTier`.
- **Ulaz:** `config.json` bez `tier` (ili `tier:'FREE'`) → `GET /api/cost/by-workspace`.
- **Trenutni izlaz:** 403 `{ error:'TIER_INSUFFICIENT', required:'TEAMS', actual:'FREE', upgradeUrl }`.
- **Repro test:** `packages/server/tests/tier-enforcement-matrix.test.ts` (matrica endpoint × tier; komentar `:14-17` kaže da je test namerno „tripwire” koji pada kad se gate ukloni ili doda).
- **Očekivano (D-01/D-02, brief §12.2, §9.2):** individualna zaštita, approvals i razumna kontrola rada nisu iza TEAMS paywall-a; Team dolazi kroz KVARK, ne kroz lokalnu tier zastavicu.
- **Najmanja promena (za writers, ne dizajn):** za svaki red iz F-TK-19 doneti odluku *sačuvati kao KVARK adapter / izdvojiti / legacy compat / ukloniti uz test*; `tier-enforcement-matrix.test.ts` već ima obrazac za de-gating (redovi `minTier:'FREE'` posle PRO uklanjanja, `:43-49`) — nova de-gating odluka se izražava promenom `minTier` u istoj matrici.
- **Povezani AT:** AT-26, AT-27, AT-18.

### F-TK-02 — C2/A15: Approvals „TEAMS-gated” je samo navigaciono sakrivanje; ruta i API nisu gate-ovani
- **S1 tvrdnja:** „TEAMS-gated Approvals” (C2), „remove the TEAMS gate” (A15).
- **Status:** **DELIMIČNO/NEPOVEZANO** — gate postoji **samo u UI navigaciji**; `/approvals` ruta i server API su otvoreni svim tier-ovima.
- **Putanja/simbol:** `apps/web/src/lib/dock-tiers.ts:82` `minBillingTier: 'TEAMS'` na `approvals` (komentar `:81` „Approvals: TEAMS-tier trust/audit surface (Pro gets inline chat approvals)”); `apps/web/src/components/os/AppShell.tsx:727-728` `if (billingRank >= BILLING_TIER_ORDER.TEAMS) items.push({ key:'approvals' … })`; `apps/web/src/routes/ApprovalsRoute.tsx:1-6` eksplicitno: „route registered for everyone; the NAV entry carries minBillingTier 'TEAMS' … tier-hidden, not stripped”; `apps/web/src/components/os/apps/ApprovalsApp.tsx` — nula tier referenci (grep `TEAMS|tierSatisfies|billingTier` prazan); `packages/server/src/local/routes/approval.ts` i `chat-approval-hook.ts` — nula `requireTier` (grep prazan).
- **Ulaz:** FREE korisnik otvori `/approvals` direktno (URL ili ⌘K).
- **Trenutni izlaz:** aplikacija se renderuje i API radi; samo nema stavke u navigaciji.
- **Repro/limit:** provereno grep-om; nema e2e testa koji pokriva URL-direktan pristup na FREE (limit).
- **Očekivano (A15, brief §9.2):** approvals su core za pojedinca i vidljivi bez paywall-a.
- **Najmanja promena:** ukloniti `minBillingTier:'TEAMS'` na `dock-tiers.ts:82` i uslov `billingRank >= …TEAMS` na `AppShell.tsx:728`; ažurirati komentar u `ApprovalsRoute.tsx`. Nema serverske promene.
- **Povezani AT:** AT-18, AT-12.

### F-TK-03 — C2: cost rute su serverski TEAMS-gated (tačne linije iz S1 potvrđene)
- **Status:** **POTVRĐENO NA REVIZIJI** (S1 cite `cost.ts:210,272` tačan na ovoj reviziji).
- **Putanja/simbol:** `packages/server/src/local/routes/cost.ts:210` `GET /api/cost/by-workspace` `{ preHandler:[requireTier('TEAMS')] }`; `:272` `GET /api/costs` alias, isti gate (komentar `:271` „Cost visibility is a Team feature”). UI tolerira 403: `apps/web/src/components/os/apps/TelemetryApp.tsx:53,60,270`.
- **Ulaz/izlaz:** FREE → 403 `TIER_INSUFFICIENT`. Solo korisnik ne vidi trošak po workspace-u.
- **Repro test:** `tier-enforcement-matrix.test.ts` red `/api/cost/by-workspace minTier:'TEAMS'`.
- **Očekivano:** brief §12.2 „razumna kontrola rada ne sme ostati iza TEAMS paywall-a”; S1 §5 naveo „per-workspace cost view” kao jeftin individualni unblocker.
- **Najmanja promena:** ukloniti dva `preHandler`-a; prebaciti redove matrice na `minTier:'FREE'`.
- **Povezani AT:** AT-03 (budžet vidljivost), AT-18.

### F-TK-04 — C2: audit export i admin overview TEAMS-gated; overview vraća placeholder podatke
- **Status:** **POTVRĐENO NA REVIZIJI** + **NALAZ AUDITA — ZA PROVERU** (stub sadržaj).
- **Putanja/simbol:** `packages/server/src/local/routes/settings.ts:1170` `GET /api/admin/overview` `requireTier('TEAMS')` — telo `:1171-1189` vraća `usage:{ totalInputTokens:0, totalOutputTokens:0 }`, `connectors: []` (hardkodirano); `:1192` `GET /api/admin/audit-export` `requireTier('TEAMS')` — telo čita `server.auditStore.getAll()` i vraća JSON/CSV (`:1196-1215`), tj. **stvaran** audit export lokalnog `install_audit` traga.
- **Ulaz/izlaz:** FREE → 403 na oba. TEAMS → overview sa nulama; audit-export sa stvarnim redovima.
- **Repro test:** `tier-enforcement-matrix.test.ts` redovi `/api/admin/overview`, `/api/admin/audit-export`.
- **Očekivano:** osnovni audit je u `TIER_CAPABILITIES.FREE.auditLog:'basic'` (`tiers.ts:96`) i CLAUDE.md §1 kaže „basic audit — free forever”; export sopstvenog lokalnog traga je individualna kontrola (GDPR/export smer, brief §12.4).
- **Najmanja promena:** de-gate `audit-export` (`:1192`); `overview` je kandidat za uklanjanje ili izdvajanje jer nema stvarne podatke (placeholder).
- **Povezani AT:** AT-27 (export/erasure), AT-18.

### F-TK-05 — C2: www pricing copy i dalje prodaje Team $49/seat i vodi na privatni GitHub repo
- **Status:** **POTVRĐENO NA REVIZIJI** (copy). Link na `github.com/marolinik/waggle-os`: **NALAZ AUDITA — ZA PROVERU** (vidljivost repoa nije proverena eksterno; CLAUDE.md §1 kaže da je privatan).
- **Putanja/simbol:** `apps/www/messages/en.json:196-250` — `"headline": "Memory is free forever. Pay when you scale."`, `"subhead": "Every install starts with 15 days of everything unlocked…"`, `tiers.teams.price_monthly: "$49/seat/month"`, `price_annual: "$490/seat/year"`, `cta: "Get Team"`, `enterprise.note: "Consultative — KVARK"`, `cta: "Talk to KVARK"`; `apps/www/app/_components/Pricing.tsx:10` `type TierId = 'SOLO' | 'TEAMS'`, `:42-53` TEAMS `ctaType:'stripe'`, `:56-58` `STRIPE_ENDPOINT = NEXT_PUBLIC_API_URL + '/api/stripe/checkout'`; `apps/www/app/_components/FinalCTA.tsx:5,33,38` „View on GitHub” → `https://github.com/marolinik/waggle-os`; `apps/www/app/download/page.tsx:18` `SOURCE_URL` isti repo; `Footer.tsx:30-53` i `OpenSource.tsx:5` → `marolinik/hive-mind` (javni mirror).
- **Ulaz/izlaz:** posetilac klikne „Get Team” → Stripe checkout za TEAMS; klikne „View on GitHub” → privatni repo (404 za nepovezanog posetioca, ako je repo privatan).
- **Repro/limit:** `apps/www/__tests__/Pricing.test.tsx:11` pinuje checkout URL; nema testa za copy. Vidljivost repoa nije proverena.
- **Očekivano (D-01/D-02):** nema zasebnog Waggle Team SKU-a; „Team” = KVARK.
- **Najmanja promena:** copy u `en.json` + `TIER_DEFS` u `Pricing.tsx` (uklanjanje TEAMS kartice ili preusmerenje na KVARK CTA); `FinalCTA.tsx:5` uskladiti sa stvarnom vidljivošću repoa u trenutku objave.
- **Povezani AT:** —.

### F-TK-06 — C2/A2: Stripe integracija je TEAMS-only; `tierFromPriceId` već ima PRO→FREE precedent za migraciju
- **Status:** **POTVRĐENO NA REVIZIJI** (kod). Live proizvodi/pretplatnici: **NEPOZNATO**.
- **Putanja/simbol:** `packages/server/src/stripe/index.ts:68-84` `tierFromPriceId`: PRO/BASIC price env-ovi → `'FREE'`, TEAMS env-ovi → `'TEAMS'`, ostalo `null` (komentar `:64-66` objašnjava Solo/Team collapse); `:88-107` `priceIdForTier` samo TEAMS ima cenu; `checkout.ts:34-37` `if (tier !== 'TEAMS') 400 INVALID_TIER`; `webhook.ts:69-79` `updateUserTier` piše `config.json { tier, stripe_customer_id }` atomskim rename-om (`:25-46`) i serijalizovano (`:57-63`); `webhook.ts:152-163` `customer.subscription.updated` → `tierFromPriceId`; `:166-169` `subscription.deleted` → `'FREE'`; `sync.ts:19-21,64,80` poll-put za desktop (NAT). Frontend: `apps/web/src/hooks/useBilling.ts:1-7`, `PaymentSuccessApp.tsx:28` `isPaid = PRO||TEAMS||ENTERPRISE`.
- **Ulaz/izlaz:** webhook sa TEAMS price → `config.json tier:'TEAMS'`; sa legacy PRO price → `tier:'FREE'`.
- **Repro test:** `packages/server/tests/stripe/webhook.test.ts:105-215` (`tierFromPriceId` slučajevi), `checkout.test.ts` — svi prošli.
- **Očekivano (brief §12.2):** nema ovlašćenja za otkaz/refund; prvo inventar stvarnih kupaca; migracija samo ako postoje obaveze.
- **Najmanja promena:** ako se TEAMS SKU ukida, isti obrazac kao PRO (`teamsPrices → 'FREE'` ili poseban `'LEGACY_TEAMS'` odluka writers-a) + `checkout.ts` 400 za sve tier-ove; migracioni test analogan `webhook.test.ts:137-147`.
- **Povezani AT:** AT-27.

### F-TK-07 — C2/A2: `config.json` `tier`/`trialStartedAt` — pet čitača, tri pisca; `parseTier` je postojeći migracioni mehanizam
- **Status:** **POTVRĐENO NA REVIZIJI** (inventura). Sitna nekonzistentnost: **NALAZ AUDITA — ZA PROVERU**.
- **Čitači:** `assert-tier.ts:21-32 readTierFromDataDir` (koristi `getEffectiveTier`); `settings.ts:1008-1018 readTierConfig` (+`getEffectiveTier` `:1023`); `embedding.ts:45` (`getEffectiveTier`); `connectors.ts:181-183` (čita sirovi `tier`, **bez** `getEffectiveTier` → istekao TRIAL bi prošao kao TRIAL; bez efekta jer je `connectorLimit:-1` za sve tier-ove, `tiers.ts:62,83,104,125`); `workspaces.ts:339-341` (isto, `workspaceLimit:-1` svuda).
- **Pisci:** `webhook.ts:69-79 updateUserTier` (i preko `sync.ts:80`); `settings.ts:1060-1090 PATCH /api/tier` — **isključen** osim `WAGGLE_ALLOW_TIER_OVERRIDE=1` (`:1068-1070`, AV-3 fail-closed); `settings.ts:1092-1137 POST /api/tier/start-trial` (atomski `tier:'TRIAL' + trialStartedAt`, 409 ako već postoji). Klijent: `apps/web/src/lib/adapter.ts:3901-3930 startTrial`.
- **Legacy mapiranje:** `tiers.ts:154-161 LEGACY_TIER_MAP { solo, basic, pro → FREE; business → TEAMS; enterprise; trial }`; `:177-181 parseTier` — read-compatible migracija bez pisanja. Klijent: `ShellContext.tsx:181-186` PRO→FREE; `PlanCards.tsx:59` `RANK` još sadrži PRO; `SettingsApp.tsx:1029,1041` još poredi `billing.tier === 'PRO'`.
- **Ulaz/izlaz:** `config.json { tier:'pro' }` → svi čitači → `'FREE'`.
- **Repro test:** `apps/web/src/lib/tiers.test.ts` (trial helpers), `packages/server/tests/d11-datadir-tier.test.ts` (`readTierFromDataDir` fail-closed), `webhook.test.ts`.
- **Očekivano (AT-27, brief §12.4):** read-compatible config migracija, ponovljiva, bez finansijskih side-effect-a.
- **Najmanja promena:** buduće ukidanje TEAMS/ENTERPRISE/TRIAL kao *lokalnih* zastavica ide kroz `LEGACY_TIER_MAP` (isti mehanizam kao PRO), a `connectors.ts:183` i `workspaces.ts:341` treba da koriste `readTierFromDataDir` umesto sopstvenog čitanja (dedup, tri implementacije istog čitanja).
- **Povezani AT:** AT-27.

### F-TK-08 — C2: Teams server (Postgres + Clerk + Redis) postoji i startuje iz lokalnog sidecar-a samo uz `DATABASE_URL` + `CLERK_SECRET_KEY`
- **Status:** **POTVRĐENO NA REVIZIJI**.
- **Putanja/simbol:** `packages/server/src/index.ts:41-60 buildServer` (drizzle/postgres `db/connection.ts:1-7`, `plugins/auth.ts`, `routes/teams.ts`, `ws/gateway.ts`); `config.ts:21` default `postgres://localhost:5434/waggle`, `:26-27` Clerk ključevi; footprint 49 fajlova van `local/`, `kvark/`, `stripe/` (`git ls-files packages/server/src` filtrirano). Start: `packages/server/src/local/index.ts:3585-3614` — `if (process.env.DATABASE_URL && !VITEST && NODE_ENV!=='test')`, bez `CLERK_SECRET_KEY` loguje grešku i preskače (`:3593-3598`), inače dinamički `import('../index.js')` i `listen 127.0.0.1:TEAMS_SERVER_PORT||3101`. `GET /api/tier` prijavljuje `teamsServerAvailable: !!process.env.DATABASE_URL` (`settings.ts:1035-1038`).
- **Ulaz/izlaz:** Windows Solo install bez env varijabli → Teams server se ne pokreće; tier `teamsServerAvailable:false`.
- **Repro/limit:** testovi Teams servera su u `vitest.infra-suites.ts:16-36` (Postgres 5434 + Redis 6381) i **isključeni iz default gate-a**; nisu pokretani.
- **Očekivano (brief §12.2):** ne brisati ceo team backend da bi se promenio slogan; sačuvati kao KVARK adapter / izdvojiti / legacy / ukloniti uz test — odluka writers-a.
- **Najmanja promena:** nema koda pre odluke; inventar je ovde.
- **Povezani AT:** AT-26.

### F-TK-09 — C2: team-sync je stvarno povezan (push-on-write + pull-on-activate), ali samo za workspace sa `teamId` i tokenom iz TEAMS-gated `/api/team/connect`
- **Status:** **POTVRĐENO NA REVIZIJI** (postoji i radi po testovima; uslovljen TEAMS tier-om).
- **Putanja/simbol:** `packages/core/src/team-sync.ts:1-26` `TeamSync` (entities API, `entityType='memory_frame'`); `packages/server/src/local/index.ts:1440-1503 getTeamSync` (zahteva `wsConfig.teamId && teamServerUrl` i `waggleConfig.getTeamServer().token`), `:1661-1704` na aktivaciji workspace-a: `orchestrator.setTeamSync(sync)` + `sync.pullFrames(...)` → `wsFrameStore.createIFrame('team-sync', '[Team:author] …', importance, 'import')`; push: `packages/agent/src/pattern-write-back.ts:222-223`; token dolazi iz `packages/server/src/local/routes/team.ts:143 POST /api/team/connect` `requireTier('TEAMS')` (HTTPS obavezan `:149-153`, health check `:157-175`); `WaggleConfig.teamServer` `packages/core/src/config.ts:28,381-393`.
- **Ulaz/izlaz:** FREE tier → `/api/team/connect` 403 → `getTeamServer()` null → `getTeamSync` vraća null → `setTeamSync(null)`.
- **Repro test:** `packages/core/tests/team-sync.test.ts` (pass), `packages/server/tests/local/chat-teamsync-push-characterization.test.ts` (karakterizacija push-a; nije pokretan ovde).
- **Očekivano (D-02, brief §12.1):** organizaciona sinhronizacija ide kroz KVARK konekciju, ne kroz lokalni tier; personal mind se ne kopira automatski.
- **Najmanja promena:** nema pre odluke „KVARK adapter vs legacy”; napomena: pull upisuje tuđe frame-ove u **workspace** mind (ne personal), što je u skladu sa izolacijom.
- **Povezani AT:** AT-26, AT-13.

### F-TK-10 — C20: `packages/worker` ima sopstvene chat/task/group/cron/waggle handler-e sa drugačijom semantikom izvršavanja od lokalnog `chat.ts`
- **Status:** **POTVRĐENO NA REVIZIJI**.
- **Putanja/simbol:** `packages/worker/src/index.ts:24-46 createWorker` (BullMQ `Worker`, `ioredis`, drizzle Postgres preko `../../server/src/db/*`), registruje `chat`, `task`, `waggle`, `group`, `cron` (`:32-45`); `handlers/chat-handler.ts:11-24` poziva `runAgentLoop({ litellmUrl: LITELLM_URL, model: DEFAULT_MODEL ?? 'claude-sonnet', systemPrompt, tools })` direktno; `execution-policy.ts:11-17` `READ_ONLY_WORKER_SYSTEM_PROMPT` + read-only alati; **nula** referenci na `recallMemory|buildSystemPrompt|Orchestrator|PERSONAS|MultiMind|FrameStore` u `packages/worker/src` (grep prazan). Lokalni put: `packages/server/src/local/routes/chat.ts:7,1717` isti `runAgentLoop`, ali sa 36 `chat-*.ts` modula (recall, persona, governance, approval hook, model routing…). Worker je u build lancu (`package.json:25 build:packages … && cd ../worker && npm run build`) i u produkcionom compose-u (`docker-compose.production.yml:76-78`). Testovi: `packages/worker/tests/job-processor.test.ts` u INFRA listi (`vitest.infra-suites.ts:34`); ostali worker testovi u default gate-u.
- **Ulaz/izlaz:** isti korisnički zahtev kroz worker `chat` job → odgovor bez memorije/persone/harness-a i sa LiteLLM default modelom; kroz lokalni `/api/chat` → puni put.
- **Repro/limit:** grep i čitanje; nije pokretan (zahteva Redis/Postgres).
- **Očekivano (brief C20 „EXPLICIT BOUNDARY”):** local core ima jedinstvene ugovore; legacy team worker se izoluje ili vezuje za KVARK, bez novog Solo dupliranja.
- **Najmanja promena:** nema koda pre ADR-a (brief §20.2 tačka 9 „secondary worker parity”); inventar handler-a je ovde.
- **Povezani AT:** AT-06, AT-16.

### F-TK-11 — A27: `createKvarkTools` ima nula produkcijskih pozivalaca; `KvarkClient` se nigde ne instancira; `kvark:connection` se samo čita; UI polja za KVARK nemaju handler
- **S1 tvrdnja:** „a UI and route that write `kvark:connection`, and wiring of `createKvarkTools`, which has zero callers today. Gate KVARK features on a live connection, not on the ENTERPRISE tier.”
- **Status:** **POTVRĐENO NA REVIZIJI** (modul postoji, nije povezan; „module exists” nije E2E funkcija).
- **Putanja/simbol:**
  - `packages/agent/src/kvark-tools.ts:123-129 createKvarkTools(deps: { client: KvarkClientLike })` — 4 alata (`kvark_search`, `kvark_feedback`, `kvark_action`, `kvark_ask_document`); jedini ne-test referent je barrel `packages/agent/src/index.ts:403-406`. Grep `createKvarkTools` po `packages/*/src/**` i `apps/**`: samo definicija + barrel; svi ostali pogoci su `*.test.ts`.
  - `packages/server/src/kvark/kvark-client.ts:35-52 class KvarkClient` — grep `new KvarkClient` po src: **0**. `kvark/index.ts:1-23` izvozi klasu, `KvarkAuth`, `getKvarkConfig`.
  - `kvark:connection`: čitaju `packages/server/src/kvark/kvark-config.ts:19 vault.get('kvark:connection')` i `packages/server/src/local/routes/marketplace.ts:192 getKvarkConfig(vault)`; **nema** `vault.set('kvark:connection'…)` nigde u src. Jedini put upisa je generički `POST /api/vault` (`packages/server/src/local/routes/vault.ts:153-171`, prihvata proizvoljno `name`), tj. korisnik bi ručno morao da ukuca JSON `{baseUrl, identifier, password}` u Vault UI.
  - `apps/web/src/components/os/apps/SettingsApp.tsx:207-208` state `kvarkUrl/kvarkToken`; `:1332-1343` inputi `settings-kvark-url`, `settings-kvark-token`; dugme „Test Connection” je `disabled` (`:1341-1343`); **nema** `onSubmit`/`adapter` poziva (grep `kvarkUrl|kvarkToken|/api/kvark` daje samo ova 4 mesta); tab je zaključan ispod ENTERPRISE (`:178-186 LOCKED_TABS`, `isEnterpriseLocked = !tierSatisfies(tier,'ENTERPRISE')`).
  - Tier umesto konekcije: `settings.ts:1051` `features.kvark: tier === 'ENTERPRISE'`; `marketplace.ts:190` `/api/marketplace/enterprise-packs` `requireTier('ENTERPRISE')` **i** `getKvarkConfig` (dvostruki gate, `:192-208`); `packages/marketplace/src/enterprise-packs.ts:8-9` komentar: „The skills referenced may not all exist yet — packs are metadata”.
  - `packages/agent/src/combined-retrieval.ts` (KVARK + workspace + personal merge) — produkcijski pozivaoci: samo type-import u `result-formatter.ts:1`; **nema** izvršnog pozivaoca; `kvarkClient` u `packages/server/src` grep prazan.
  - `packages/server/tests/kvark/kvark-wiring.test.ts:46-52` sam kaže „simulates the if(kvarkConfig) guard” — testira factory, ne registraciju u serveru.
  - CLAUDE.md §8 tvrdi da su `kvark_search`/`kvark_ask_document` „tier-gated” — u `kvark-tools.ts` nema tier provere (samo komentar `:6`); gate bi bio u pozivaocu koji ne postoji.
- **Ulaz:** vault sadrži validan `kvark:connection`; korisnik pokrene chat.
- **Trenutni izlaz:** agent nema KVARK alate (ništa ih ne registruje); `enterprise-packs` vraća pakete samo ako je uz to i `tier:'ENTERPRISE'` u `config.json`.
- **Repro test/limit:** nema testa koji podiže lokalni server sa KVARK vault entry-jem i proverava da tool lista sadrži `kvark_search` — to je nedostajući RED test za AT-26.
- **Očekivano (DIR-20, A27, AT-26):** flow validacije konekcije/identiteta, dozvoljene organizational capabilities, token storage i opoziv; gate na živu konekciju, ne na `ENTERPRISE=true` u lokalnom config-u.
- **Najmanja promena:** (1) RED test: server + vault `kvark:connection` → tool registry sadrži 4 KVARK alata; bez entry-ja → 0; (2) registracija `createKvarkTools({ client: new KvarkClient(getKvarkConfig(vault)) })` na mestu gde se sastavljaju alati; (3) `settings.ts:1051` i `marketplace.ts:190` gate na `getKvarkConfig(vault) !== null` umesto tier-a; (4) SettingsApp polja povezati na rutu koja piše vault (ili ukloniti mrtva polja). Dizajn connect/disconnect/revoke toka je posao writers-a.
- **Povezani AT:** AT-26, AT-13, AT-15.

### F-TK-12 — AT-26 preduslovi: KVARK putanja nema cloud fallback u kodu, ali se ne može testirati jer nije povezana; tier-deps za skill promotion nemaju provajdere
- **Status:** **DELIMIČNO/NEPOVEZANO**.
- **Putanja/simbol:** `packages/agent/src/kvark-tools.ts:275-296 handleKvarkError` — `KvarkUnavailableError` → tekst „KVARK is not reachable. Using workspace memory only…”; nema prebacivanja na provider/cloud (dobro za D-03), ali se ne izvršava jer alati nisu registrovani (F-TK-11). `packages/agent/src/skill-tools.ts:67-68` deps `hasTeamSkillLibrary?/isEnterprise?`; `:755-765` promocija u `team`/`enterprise` scope; grep provajdera u `packages/server/src`: **0** → `deps.isEnterprise?.()` je `undefined` → promocija uvek odbijena porukom „requires ENTERPRISE tier. Contact sales for KVARK.”
- **Ulaz/izlaz:** `promote_skill target:'enterprise'` → uvek odbijeno, nezavisno od tier-a ili KVARK konekcije.
- **Očekivano (AT-26, brief §12.1):** organizacione sposobnosti prate KVARK konekciju; personal→org promocija sa eksplicitnom politikom (R14 „minimal: no-sharing default + connect flow”).
- **Najmanja promena:** pri povezivanju KVARK-a (F-TK-11) obezbediti `isEnterprise`/`hasTeamSkillLibrary` iz stanja konekcije ili ukloniti mrtve grane; RED test da nedostupan KVARK **ne** menja provider rutu.
- **Povezani AT:** AT-26, AT-14.

### F-TK-13 — C5: licencne oznake su međusobno protivrečne; NOTICE referencira nepostojeći `EXTRACTION.md`; nema THIRD_PARTY_NOTICES/SBOM u stablu
- **S1 tvrdnja:** „`hive-mind-cli/NOTICE` declaring the agent runtime, evolution and traces proprietary … private repo … until an explicit licensing decision.”
- **Status:** **POTVRĐENO NA REVIZIJI** (NOTICE) + **NALAZ AUDITA — ZA PROVERU** (tri protivrečnosti ispod).
- **Putanja/simbol:**
  - `packages/hive-mind-cli/NOTICE:12-23` (identičan `hive-mind-mcp-server/NOTICE` i `hive-mind-wiki-compiler/NOTICE`, `diff` prazan): kao proprietary navodi compliance, `packages/agent/*`, GEPA/EvolveSchema/execution traces/evolution runs/improvement signals, `mind/vault.ts`, tier/billing, Tauri shell/web UI, WaggleDance; `:24` „See EXTRACTION.md in the repository root” — `git ls-files EXTRACTION.md` → **ne postoji** (samo `docs/decisions/2026-04-18-*extraction*.md`).
  - Protivrečnost 1: `packages/agent/package.json` `"license": "MIT"` dok ga NOTICE proglašava proprietary. Isto `packages/marketplace`, `core`, `cli`, `launcher`, `sdk`, `memory-mcp`, `wiki-compiler` → MIT.
  - Protivrečnost 2: `packages/optimizer/LICENSE:1-5` i `packages/weaver/LICENSE:1-5` „proprietary and confidential… strictly prohibited” dok `packages/optimizer/package.json` i `packages/weaver/package.json` kažu `"license": "MIT"`.
  - Protivrečnost 3: root `LICENSE:1-3` MIT (Marko Markovic / Egzakta Group) uz root `package.json` `"private": true`; `packages/server`, `shared`, `waggle-dance`, `worker`, `admin-web` **nemaju** `license` polje; `packages/hive-mind-core/package.json` Apache-2.0 **i** `"private": true` (ostali `hive-mind-*` nisu private).
  - `git ls-files | grep -i "THIRD_PARTY|sbom|NOTICES"` → nema agregiranog notices/SBOM fajla (A28 susedno; `.github/workflows/ci.yml:109-110` `npm audit … continue-on-error: true`).
- **Ulaz/izlaz:** n/a (metapodaci).
- **Repro/limit:** čitanje fajlova; nema testa koji proverava konzistentnost `license` polja ↔ LICENSE/NOTICE.
- **Očekivano (D-01, brief §12.3):** utvrditi ownership i odobrene licence, root/per-package NOTICE, stare proprietary oznake; ne držati ključni besplatni feature zatvoren suprotno dogovoru.
- **Najmanja promena:** inventar-tabela paket → `license` polje → LICENSE fajl → NOTICE pomen → odluka; ukloniti/ispraviti dangling `EXTRACTION.md` referencu; dodati lint/test za konzistentnost. Sam izbor licence je otvorena stavka (brief §20.3 „Licencna realizacija”), ne posao ove revalidacije.
- **Povezani AT:** AT-30 (notices u isporučenom paketu).

### F-TK-14 — C5: OSS-excluded fajlovi su nosioci PRD §9 (learning/evolution) — zabrana izvoza je stvarna i testirana
- **Status:** **POTVRĐENO NA REVIZIJI**.
- **Putanja/simbol:** `scripts/oss-subtree-split.sh:117-123 FORBIDDEN_FILES` = `src/mind/evolution-runs.ts`, `execution-traces.ts`, `improvement-signals.ts`, `src/vault.ts`, `src/compliance`; `scripts/oss-drift-check.mjs:22-28 FORBIDDEN_EXPORTS` (+ `governance/`); fajlovi postoje (`packages/hive-mind-core/src/mind/{evolution-runs,execution-traces,improvement-signals}.ts`, `packages/core/src/vault.ts`, `packages/core/src/compliance/*`, `packages/core/src/governance/*`) i barrel-izvezeni (`packages/hive-mind-core/src/index.ts:71,77,82`). Potrošači u produkciji: `packages/agent/src/{evolution-orchestrator,eval-dataset,trace-recorder,correction-detector,memory-layers-default}.ts`, `packages/server/src/local/{index,monthly-assessment}.ts`, `routes/{chat,evolution}.ts`, `services/evolution-service.ts`. PRD §9 („Preserve EvolveSchema and iterative GEPA…”, „Promotion requires holdout… versioning and rollback”) ne može bez ova tri store-a.
- **Ulaz/izlaz:** OSS export pokušaj sa tim fajlovima → abort exit 3 (`oss-subtree-split.sh:126-133`); drift-check → `FORBIDDEN-OSS-CONTENT`.
- **Repro test:** `tests/oss-subtree-split.test.ts` (postoji; nije pokretan).
- **Očekivano:** D-01 free/OSS namena; konkretna prava po fajlu — otvorena stavka. Ovo **nije** code defect; to je granica koju licencna odluka mora eksplicitno pomeriti ili potvrditi.
- **Najmanja promena:** nema koda; ako odluka kaže „evolution je OSS”, `FORBIDDEN_*` liste + `.parity` baseline se re-baseline-uju kroz maintainer review (CLAUDE.md §7.5 pravilo 3).
- **Povezani AT:** AT-05, AT-29 (evolution dokaz), AT-30.

### F-TK-15 — C5: attestation i `publish-windows` su u workflow-u vezani za `repository.private == false`
- **Status:** **POTVRĐENO NA REVIZIJI** (mehanizam). Stvarna vidljivost repoa: **NEPOZNATO** (nije proverena eksterno; CLAUDE.md §1 i `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md:109-123` tretiraju je kao privatnu).
- **Putanja/simbol:** `.github/workflows/release.yml:2056-2058` `attest-windows: if: github.event.repository.private == false`; `:2208-2212` `publish-windows: needs [certify-windows, attest-windows]; if: vars.WINDOWS_PUBLIC_RELEASE_AUTHORIZED == 'true' && github.event.repository.private == false && …`.
- **Očekivano:** licencna/publication odluka otključava mehaniku (brief §12.3).
- **Najmanja promena:** nema koda; odluka.
- **Povezani AT:** AT-30.

### F-TK-16 — A2 (tier deo): migracija tier stanja ima gotov obrazac (PRO→FREE, 2026-07-05); pretplatnici NEPOZNATO
- **Status:** **DELIMIČNO** — kod-obrazac **VEĆ POSTOJI**; poslovni deo **NEPOZNATO**.
- **Putanja/simbol:** commit `09b199aa` (2026-07-05, `feat(billing): collapse to Solo (free) vs Team (paid) — kill the PRO tier`) uveo: `tiers.ts:154-161 LEGACY_TIER_MAP`, `stripe/index.ts:64-66,81`, `ShellContext.tsx:181-184`, `tier-enforcement-matrix.test.ts:43-49` (de-gated redovi ostaju kao tripwire). To je precedent za AT-27 „ponovljiva migracija”.
- **Očekivano (brief §12.2/§12.4):** stvarni inventar pre promene; read-compatible config migration; nema finansijskih side effect-a bez odobrenja.
- **Najmanja promena:** ponoviti obrazac za TEAMS/ENTERPRISE/TRIAL tek posle odluke o SKU i inventara pretplatnika.
- **Povezani AT:** AT-27.

### F-TK-17 — A12 (tier kao permission sloj): akcijski tier-gate postoji ali je mrtav; još dva mrtva exporta
- **Status:** **DELIMIČNO/NEPOVEZANO**.
- **Putanja/simbol:** `packages/server/src/local/command-registry.ts:91` `requiredTier?: Tier` u deskriptoru; `:227-236 checkTier()`; `packages/server/src/local/command-interpret.ts:96-108 finalizeAction` vraća `kind:'tier_gated'` — ali grep `requiredTier: '` po src: **0 deskriptora** → gate se nikad ne aktivira. `tiers.ts:233-244 hasCapability` — 0 pozivalaca (src+tests). `packages/server/src/local/routes/fleet.ts:8` `import { requireTier }` — 0 upotreba u fajlu.
- **Očekivano (brief §9.2):** presek ograničenja bez `tier` kao individualne granice; ne graditi novi policy engine.
- **Najmanja promena:** ukloniti `requiredTier` granu i `hasCapability` ili ih ostaviti van A12 ugovora; obrisati nekorišćen import u `fleet.ts:8`.
- **Povezani AT:** AT-18.

### F-TK-18 — WB inventura obima: S1 „~22 files” ≈ tačno; precizna lista
- **Status:** **POTVRĐENO NA REVIZIJI** (red veličine).
- **Fajlovi sa TRIAL/TEAMS/ENTERPRISE literalima (non-test src, 24 bez `tiers.ts`):**
  Server (10): `packages/server/src/middleware/assert-tier.ts`, `local/tier-session-cap.ts`, `local/routes/{connectors,cost,marketplace,settings,team}.ts`, `stripe/{checkout,index}.ts`, `packages/hive-mind-core/src/mind/embedding-provider.ts`.
  Web (14): `apps/web/src/components/os/AppShell.tsx`, `apps/{CapabilitiesApp,MCPHubApp,PaymentSuccessApp,SettingsApp,WorkspaceDesktopApp}.tsx`, `billing/PlanCards.tsx`, `overlays/{TrialExpiredModal,UpgradeModal}.tsx`, `hooks/useBilling.ts`, `lib/{adapter,dock-tiers}.ts`, `providers/ShellContext.tsx`, `routes/ApprovalsRoute.tsx`.
  **Dodatno (bez navodnika / u template stringu, promašeno literalnim grep-om):** `packages/agent/src/skill-tools.ts:679-680,757,764`; `apps/web/src/lib/command-catalog.ts:60` (`TEAMS_RANK`); `apps/web/src/routes/TeamRoute.tsx:3`; `packages/server/src/local/routes/{embedding,workspaces}.ts` (koriste `TIER_CAPABILITIES`/`getCapabilities`); `packages/server/src/local/{command-registry,command-interpret}.ts`; www: `apps/www/messages/en.json`, `apps/www/app/_components/Pricing.tsx`.
- **Test fajlovi koji zaključavaju tier ponašanje (21):** `apps/web/src/test/pr7a-billing.test.tsx`, `apps/web/src/lib/tiers.test.ts`, `packages/agent/tests/{kvark-pipeline-smoke,kvark-tools,model-tier}.test.ts` (model-tier je model-tier, ne billing), `packages/core/tests/team-sync.test.ts`, `packages/server/tests/{d11-datadir-tier,tier-enforcement-matrix}.test.ts`, `packages/server/tests/kvark/*.test.ts` (6), `packages/server/tests/local/{chat-keyless-billing,chat-teamsync-push-characterization}.test.ts`, `packages/server/tests/routes/{connectors-tier,teams}.test.ts`, `packages/server/tests/stripe/{checkout,smoke-e2e,status,sync,webhook}.test.ts`.
- **Očekivano:** brief §12.2 „inventarisati … grane, gateove, www copy, checkout/webhooks, licence, team-sync i sekundarni server/worker” — ispunjeno ovim dokumentom.
- **Povezani AT:** AT-27.

### F-TK-19 — Koje `TierCapabilities` zastavice zaista blokiraju Solo korisnika (vs. dekorativne)
- **Status:** **POTVRĐENO NA REVIZIJI**.
- **Stvarni gate-ovi za FREE:**
  1. `embeddingProviders` — FREE nema `'litellm'` (`tiers.ts:85`); enforce `packages/server/src/local/routes/embedding.ts:106-119` (403 `TIER_REQUIRED`) i `packages/hive-mind-core/src/mind/embedding-provider.ts:302-303,350`.
  2. Sesije po workspace-u: `tier-session-cap.ts:4` FREE=10 (`settings.ts:1045` `maxSessions: tier==='FREE' ? 10 : 25`).
  3. Rute: `/api/cost/by-workspace`, `/api/costs` (TEAMS), `/api/cloud-sync/toggle` (TEAMS; telo `settings.ts:1157-1166` samo upisuje `cloudSyncEnabled` flag), `/api/admin/overview`, `/api/admin/audit-export` (TEAMS), `/api/team/connect` (TEAMS), `/api/marketplace/enterprise-packs` (ENTERPRISE), `/api/team/governance/permissions` (ENTERPRISE).
  4. UI: Approvals i Team zona sakrivene (`dock-tiers.ts:82,98,100`, `AppShell.tsx:728`, `command-catalog.ts:60`); Settings `team`/`enterprise` tabovi zaključani (`SettingsApp.tsx:182-185`); Workspace team panel upsell „Upgrade to Team — $49/seat” (`WorkspaceDesktopApp.tsx:381,939-949`); `UpgradeModal.tsx:159-162`, `TrialExpiredModal.tsx:13-28` (LOSE_FEATURES lista).
  5. Agent alat: `skill-tools.ts:755-765` promocija skill-a u team/enterprise scope (uvek odbijena, F-TK-12).
- **Dekorativne zastavice (0 potrošača u src):** `teamSkillLibrary`, `spawnAgents`, `customSkills`, `exportFormats`, `managedModelPool`, `priorityModels`, `kvarkCta`, `selfHosted`, `auditLog`, `messageHistoryLimit`; `sharedWorkspaces`/`adminPanel`/`teamMembersLimit` samo eho u `GET /api/tier` (`settings.ts:1046-1050`); `workspaceLimit`/`connectorLimit` = -1 za sve → gate kod u `workspaces.ts:342-351` i `connectors.ts:16-26` je no-op.
- **Očekivano (brief §12.2):** planer za svaku komponentu predlaže sudbinu; ova lista je ulaz.
- **Povezani AT:** AT-18, AT-27.

---

## 2. Šta već radi / postoji-ali-nije-povezano (sačuvati)

| Šta | Putanja | Pozivaoci (grep) |
|---|---|---|
| `parseTier` + `LEGACY_TIER_MAP` + `getEffectiveTier` (read-compatible migracija, PRO→FREE precedent) | `packages/shared/src/tiers.ts:154-197` | `assert-tier.ts:27-28`, `settings.ts:1013,1023,1073,1111-1112`, `embedding.ts:45`, `connectors.ts:183`, `workspaces.ts:341`, `webhook.ts:142`, `sync.ts:72`, `SettingsApp.tsx:178`, `ShellContext.tsx:181-186` |
| `requireTier` / `readTierFromDataDir` (fail-closed čitanje `config.json`) | `packages/server/src/middleware/assert-tier.ts:21-63` | `cost.ts:210,272`, `settings.ts:1157,1170,1192`, `team.ts:143,457`, `marketplace.ts:190`, `stripe/portal.ts:18` (FREE no-op), `local/service.ts` (D11 log), `fleet.ts:8` (import bez upotrebe) |
| Tier-enforcement tripwire matrica (već modelira de-gating obrazac) | `packages/server/tests/tier-enforcement-matrix.test.ts` | CI default gate (`vitest.config.ts include packages/*/tests/**`) |
| Stripe webhook: potpis, idempotency, atomski `config.json` write, serijalizacija | `packages/server/src/stripe/webhook.ts:25-79,88-170` | ruta `/api/stripe/webhook`; `sync.ts:80` (`updateUserTier`) |
| `tierFromPriceId` (PRO/BASIC→FREE, TEAMS→TEAMS) + `priceIdForTier` fail-closed za annual | `packages/server/src/stripe/index.ts:68-107` | `webhook.ts:156`, `sync.ts:64`, `checkout.ts:39` |
| `POST /api/tier/start-trial` atomski (409 idempotent) | `packages/server/src/local/routes/settings.ts:1092-1137` | `apps/web/src/lib/adapter.ts:3921 startTrial` |
| `PATCH /api/tier` fail-closed (`WAGGLE_ALLOW_TIER_OVERRIDE`) | `settings.ts:1060-1090` | dev/test only |
| `KvarkClient` / `KvarkAuth` / `getKvarkConfig` (auth, retry, error tipovi) | `packages/server/src/kvark/*` | **0 produkcijskih**; testovi `packages/server/tests/kvark/*` (6 fajlova) |
| `createKvarkTools` (4 alata) + `handleKvarkError` bez cloud fallback-a | `packages/agent/src/kvark-tools.ts:123-296` | **0 produkcijskih** (barrel `agent/src/index.ts:403`); testovi `kvark-tools.test.ts`, `kvark-pipeline-smoke.test.ts`, `kvark-wiring.test.ts` |
| `combined-retrieval.ts` (workspace+personal+KVARK merge, `shouldQueryKvark`) + `result-formatter.ts` KVARK sekcija | `packages/agent/src/combined-retrieval.ts`, `result-formatter.ts:45-60` | **0 izvršnih**; type-import `result-formatter.ts:1`; testovi `combined-retrieval.test.ts`, `conflict-detection.test.ts` |
| Generički vault upsert (može već da primi `kvark:connection`) | `packages/server/src/local/routes/vault.ts:153-171` | Vault UI preko `adapter` |
| `enterprise-packs` ruta već proverava prisustvo KVARK konfiguracije (uz tier) | `packages/server/src/local/routes/marketplace.ts:190-208` | web Marketplace |
| `ENTERPRISE_PACKS` metadata (eksplicitno „skills may not all exist yet”) | `packages/marketplace/src/enterprise-packs.ts` | `marketplace.ts:15,204-205` |
| `TeamSync` + `getTeamSync` binding/cache + pull-on-activate u **workspace** mind | `packages/core/src/team-sync.ts`; `packages/server/src/local/index.ts:1440-1503,1661-1704` | `orchestrator.setTeamSync` (`local/index.ts:1497,1501,1668,1698,1702,1751,1798`), `pattern-write-back.ts:222` |
| `/api/team/{connect,disconnect,status,teams,members}` + HTTPS/health validacija | `packages/server/src/local/routes/team.ts:143-331` | `SettingsApp` team tab |
| Teams cloud server (`buildServer`: Clerk, Postgres, Redis, ws) + BullMQ worker | `packages/server/src/index.ts`; `packages/worker/src/*` | `local/index.ts:3601` (dinamički, uslovno); `docker-compose.production.yml:76-78`; `package.json:25` |
| OSS export guard + drift checker + test | `scripts/oss-subtree-split.sh:117-133`; `scripts/oss-drift-check.mjs:22-28`; `tests/oss-subtree-split.test.ts` | maintainer release procedura (CLAUDE.md §7.5) |
| www Pricing komponenta koja tvrdi da zrcali `tiers.ts` | `apps/www/app/_components/Pricing.tsx:20-54`; `apps/www/messages/en.json:196-250` | `apps/www/__tests__/Pricing.test.tsx` |
| Klijentsko PRO→FREE mapiranje i `RANK` | `ShellContext.tsx:181-186`; `PlanCards.tsx:59` | `AppShell`, `SettingsApp` billing tab |

---

## 3. Napomene i granice

- Ništa nije menjano u repou; `git status` posle vitest run-a nepromenjen (samo ranije untracked `.docx`).
- Nisu pozivani Stripe, GitHub ni bilo koji eksterni API. Zato: broj/postojanje aktivnih pretplatnika, stanje Stripe proizvoda i stvarna vidljivost repoa ostaju **NEPOZNATO** i traže ovlašćen inventar (brief §12.2, §20.3).
- Sve linijske reference su na `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`; S1 cite-ovi `dock-tiers.ts:82,98` i `cost.ts:210,272` su egzaktno tačni na ovoj reviziji.
- Nijedan od nalaza nije **VEĆ ZATVORENO**: nema commit-a posle S1 snapshot-a koji dira `packages/server/src/kvark/` (poslednji `01076b75`, 2026-03-26), `kvark-tools.ts` (isti), ili `tiers.ts` (poslednji `09b199aa`, 2026-07-05).
- Nije predložena arhitektura KVARK connect toka ni sudbina Teams servera — to je posao writers-a (brief §12.1–12.2, §20.2 ADR 8 i 9).
