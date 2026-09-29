# Phase A — revalidacija audit grupe `ux-model`

**Revizija pod pregledom:** `main = 2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git status` čist osim dva untracked `.docx` u `docs/`; radno stablo == HEAD, svaki `path:line` ispod je na toj reviziji).
**Metod:** read-only; `git show/log`, `rg`, čitanje fajlova. Nijedan test nije pokrenut (repo je READ-ONLY za ovaj prolaz); tamo gde tvrdnja zavisi od izvršenja, to je označeno kao granica provere.
**Obim:** S1 C16, C19, A20–A24, W5, W6 + spot-check „Installer version is 0.2.0”; fokus lista iz zadatka (HomeCockpit, Sidebar/Dock/⌘K, Developer Mode vs experience tier, MemoryCenterApp, ChatWorkCanvas/SSE `step`, OnboardingWizard+ModelGate, `useHasWorkingModel`, managed Ollama, hardware-detect, cookbook catalog/model-fit, pull stream, i18n, aria-live, verzija instalera).
**Legenda statusa:** POTVRĐENO NA REVIZIJI · DELIMIČNO/NEPOVEZANO · NIJE POTVRĐENO · VEĆ ZATVORENO · NEPOZNATO. „Modul postoji” nigde nije korišćen kao dokaz E2E funkcije.

---

## 1. Nalazi (po S1 tvrdnji)

### F-UXM-01 — S1 spot-check: „Installer version is `0.2.0`” (veza: C1, AT-30)
- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** `2af0904d`; poslednja izmena `app/src-tauri/tauri.conf.json` = `72d85e58` (2026-08-17).
- **Path/symbol:** `app/src-tauri/tauri.conf.json:4` `"version": "0.2.0"`; `app/src-tauri/Cargo.toml:3` `version = "0.2.0"`; **drift:** `app/package.json:4` `"version": "0.1.0"`, root `package.json:3` `"0.1.0"`, `apps/web/package.json:4` `"0.1.0"`.
- **Ulaz → izlaz:** `grep -n version` nad tri fajla → 0.2.0 / 0.2.0 / 0.1.0.
- **Granica provere:** statička; nije pokrenut build.
- **Očekivano:** jedan izvor istine za verziju proizvoda (C1: verzija spec dokumenta ≠ verzija aplikacije).
- **Najmanja promena:** planski — ne dirati broj; u C1 razrešenju zabeležiti da je installer 0.2.0 i da `app/package.json` nije sinhronizovan (opciono jedan `chore` PR za poravnanje kad se odluči javni broj).

### F-UXM-02 — A20: `useHasWorkingModel.ts:174,:244` su false positives (veza: DIR-17, AT-20)
- **Status:** POTVRĐENO NA REVIZIJI (linije se poklapaju sa S1; postoji i treći put)
- **Commit:** poslednja izmena `5e2de2b8` (2026-09-04, „fix(models): distinguish unavailable from unconfigured”) — dakle ponašanje je *namerno* i regresiono zaključano.
- **Path/symbol:** `apps/web/src/hooks/useHasWorkingModel.ts`
  - `:171-174` — `transient = outcomes.some(rejected) || probes.some(configured && valid !== false)`; `ready: verified || (!rejected && transient)`. Ako je sidecar offline (`probeProvider` odbijen) ili probe vrati `verified:false` bez odbijanja → `cloudReady = true`.
  - `:129-136` — default-model probe `configured && !verified && !rejected` za ne-`openai-compatible/` model → `ready: true` (treći false positive, S1 ga ne navodi).
  - `:244-245` — `localReady = localModelCount > 0; hasWorkingModel = cloudReady || localReady` (count-based; `adapter.getLocalInferenceStatus().totalLocalModels`, tj. `/api/tags` inventar, ne generacija).
- **Potrošači:** `onboarding/ModelGateStep.tsx:19,:63` (Continue gate), `model-gate/NoModelBanner.tsx:17-25`, `HomeRoute.tsx`, `LoginBriefing.tsx`, `AppShell.tsx`.
- **Repro test (postojeći, zaključava pogrešno ponašanje):** `useHasWorkingModel.test.ts:271-281` („a transient default result remains usable after probing settles” → `hasWorkingModel:true`), `:301-307` („valid but unverified fallback provider remains usable”), `:486-495` („treats unavailable fallback probes as transient usable readiness” — `probeProvider` mockRejected('sidecar offline') → `hasWorkingModel:true`). Ovi testovi postaju RED kad se popravi.
- **Ista logika inline:** `model-gate/ModelGate.tsx:257-261` `cloudReady = activeProviders.length > 0; localReady = totalLocalModels > 0; ready = ...` i fallback banner `:859-879` „You have a working model — you’re ready to go.” (dostižan kad nema cloud providera → oslanja se na count-based local).
- **Očekivano (DIR-17/AT-20):** ready samo posle stvarne generacije; `transient`/timeout/offline → `availability:'checking'|'unknown'`, ne `ready`.
- **Najmanja promena:** `:174` → `ready: verified`; `:129-136` → `ready:false` + `availability:'unavailable'`; `:244` → local readiness iz live probe (`probeConfiguredModel` već podržava `ollama/` prefiks, `settings.ts:116-122`, ili reuse post-pull `/api/generate` probe iz `local-inference.ts:355-377`); preraditi tri testa gore na suprotna očekivanja.

### F-UXM-03 — A20/DIR-17: readiness probe je 1-token content check, bez tool round-trip-a i bez razlikovanja uzroka (veza: AT-20)
- **Status:** POTVRĐENO NA REVIZIJI
- **Path/symbol:** `packages/server/src/local/routes/settings.ts`
  - `:103-164` `probeConfiguredModel`: `max_tokens: isQwen ? 32 : 1` (`:141`), prompt „Reply with exactly WAGGLE_OK.” (`:142`); `verified = typeof content === 'string' && content.trim().length > 0` (`:150-153`) — **ne proverava sadržaj tokena**.
  - `:126` timeout 15 s (Qwen) / 5 s; `:155-158` `rejected` samo za `401|403|authentication|model_not_found`; **svaki drugi HTTP status, timeout, cold start, mrežna greška → identičan `{configured:true, verified:false}`** (`:158-160`).
  - `:864-889` `POST /api/settings/probe-model`; `:844-862` `probe-provider` (samo ključ).
  - Router readiness `anthropic-proxy.ts:848-917` `probeReadyOllamaModel`: `/api/tags` + `/api/show` `capabilities` sadrži `'completion'` — format-only, bez generacije (limiti `:649-652`: 2 s/2.75 s).
- **UI:** `ModelGate.tsx:843-858` sve ne-verifikovane ishode prikazuje istom neutralnom porukom „Couldn’t confirm model access just now.”; `:32` `MODEL_READINESS_UI_TIMEOUT_MS = 16_000`.
- **Tool/structured-output round-trip:** `rg` po `packages/server/src` i `apps/web/src` za tool-call readiness probe → **nije nađen** (provereno preko `probe`, `tool_choice`, `WAGGLE_OK` pretraga; ne po imenu FRD-a).
- **Očekivano:** za work profil probe sa tool/structured-output pozivom; posebni razlozi (`timeout|unreachable|cold_start|http_error|empty_content`) i posebne poruke.
- **Najmanja promena:** dodati `reason` u `ModelProbeResult` (`settings.ts:95-101`) i UI mapu; opcioni drugi probe sa jednim trivijalnim tool pozivom za `work` profil; ne menjati chat putanju.

### F-UXM-04 — A21: pull `stream:false`, 45-min timeout, bez progresa/resume-a; runtime download JESTE resumable (veza: AT-20, AT-30)
- **Status:** POTVRĐENO NA REVIZIJI (S1 tačan za model pull; S1 ne pominje da je runtime download već resumable)
- **Path/symbol:**
  - `packages/server/src/local/routes/local-inference.ts:313-332` `POST /api/local-inference/pull` → `fetch(${OLLAMA_URL}/api/pull, { body: { name, stream:false }, signal: AbortSignal.timeout(45*60_000) })`; nema progres događaja; prekid = 502 `LOCAL_MODEL_SETUP_FAILED` (`:386-389`).
  - Posle pull-a: digest check (`:338-353`) **i live generation probe** `/api/generate` „Reply with the single word OK.” (`:355-377`, `verifiedGeneration:true`) — postojeći kvalitetan deo.
  - UI `ModelGate.tsx:1279-1291`: dugme „Downloading and verifying…” (spinner), bez procenta/ETA — u skladu sa brief-om da se ne izmišlja procenat, ali korisnik nema nikakvu informaciju tokom višegigabajtnog preuzimanja.
  - **Kontrast:** `managed-ollama-runtime.ts:1109-1204` `downloadArtifact` — Range resume (`:1127`, `:1138-1151`), size + sha256 verifikacija (`:1180-1193`), retry sa backoff-om, pinovani artefakti sa sha256 (`:158-237`), `DOWNLOAD_TIMEOUT_MS = 45 min` (`:32`).
- **Granica provere:** nije izvršen prekinuti pull; Ollama sam nastavlja delimično preuzete blob-ove pri ponovnom `pull`, ali Waggle to ne oglašava niti proverava.
- **Očekivano (AT-20):** „prekinut pull je oporavljiv” vidljivo korisniku; progres stream.
- **Najmanja promena:** `stream:true` + relay NDJSON statusa kao SSE/polling; posle prekida ponovni `pull` istog ref-a + zadržati digest+generation probe; ne dirati managed runtime download.

### F-UXM-05 — A21/C19: hardware-detect je NVIDIA (+Apple Silicon) only; AMD/Intel/WMI na Windows-u padaju na CPU floor (veza: AT-20, AT-30)
- **Status:** POTVRĐENO NA REVIZIJI
- **Commit:** poslednja izmena `ea798998` (2026-08-10).
- **Path/symbol:** `packages/server/src/local/hardware-detect.ts:7-19` (staged: NVIDIA, Apple, Basic; „AMD sysfs, Windows WMI … intentionally NOT built”), `:95-109` nvidia-smi kandidati, `:174-198` `detectNvidia`, `:315-333` orkestrator; `:330` komentar „STAGED TAIL would slot here: detectAmd(run) → detectWindowsWmi(run)”. Rezultat na AMD/Intel Windows laptopu: `hasGpu:false`, `backend: CPU (x64)` → `model-fit.ts:296-301` bira `cpu_only`.
- **Testovi:** `packages/server/tests/hardware-detect.test.ts:31-201` pokrivaju parse/NVIDIA/Apple/CPU fallback; nema AMD/Intel slučaja.
- **Repo-wide:** `rg detectAmd|rocm-smi|Win32_VideoController|DXGI|xpu-smi` → samo komentar `:330` i negativan test u `tauri-config.test.ts:4897`.
- **Očekivano (A21/§11.3):** hardware ladder mora znati VRAM na AMD/Intel; inače „24 GB GPU” klase nikad nisu prepoznate na ne-NVIDIA mašini.
- **Najmanja promena:** `detectWindowsWmi(run)` preko `Get-CimInstance Win32_VideoController` (poznat 4 GB cap na `AdapterRAM` — koristiti registry `HardwareInformation.qwMemorySize`) u istom injectable `CommandRunner` obrascu; test sa lažnim izlazom.

### F-UXM-06 — C19/W6: katalog nema Qwen 3.5/3.6/3.8; target model nije ni na jednoj proizvodnoj putanji; sertifikovani managed model je `qwen2.5:0.5b` (veza: AT-20, AT-28, D-15)
- **Status:** POTVRĐENO NA REVIZIJI (za „nije re-baselinovano”); NEPOZNATO za `qwen3_5` arch podršku u pinovanom Ollami
- **Path/symbol:**
  - `packages/agent/src/cookbook/catalog.ts:44-51` — najnoviji Qwen redovi: `qwen3:*` (2025-04-28) uključujući MoE `qwen3:30b-a3b`; nema `qwen3.5/3.6/3.8` ni 27B dense Qwen-a (27B postoji samo kao `gemma2:27b`/`gemma3:27b`, `:59,:62`). Poslednja izmena `e46ff6b0` (2026-06-28).
  - `packages/agent/src/cookbook/model-fit.ts:207-214` — arch bonus po *stringu* (`qwen3.6`/`qwen3_5`…), nema efekta jer katalog nema te redove.
  - `rg qwen3\.[568]|qwen3_5` u `packages/server/src` → 0; u `apps/web/src` samo test fixture `openai-compatible/qwen3.8-flash-next` (cloud alias u testovima, ne lokalni model).
  - Evidencijski model `qwen3.6-35b-a3b` postoji samo kao cloud alias: `packages/agent/config/model-prompt-shapes.json:16-24` (DashScope/OpenRouter) i `scripts/run-pilot-2026-04-26.ts:102-103`.
  - Pinovan runtime: `managed-ollama-runtime.ts:28-29` `OLLAMA_TARGET_VERSION='0.32.3'`, rollback `0.32.0`.
  - Certifikat: `scripts/certify-windows-installer.ps1:2099` `$managedCertificateModel = 'qwen2.5:0.5b'`; `:2951-2961` pull + `verifiedGeneration`; `:2979-3005` SSE chat check. Dakle „managed model receipt” dokazuje 0.5B smoke model, ne referentni cilj.
- **Granica provere:** offline ne mogu potvrditi da li Ollama 0.32.3 servira Qwen 3.8 27B arhitekturu; to je NEPOZNATO i traži online proveru (zvanični Ollama library/tag).
- **Očekivano (C19 RE-BASELINE):** tačan ID/revizija/quant/licenca u katalogu + runtime arch provera + odvojen smoke model od preporučenog modela u receipt-u.
- **Najmanja promena:** dodati katalog red(ove) za potvrđeni target (uz `releaseDate`, `contextLength`, `quant`); `/api/show` arch check protiv pinovanog Ollame u `local-inference.ts`; u receipt polju eksplicitno `certificateModel` vs `recommendedModel`.

### F-UXM-07 — A22: Failure UX (FAILED/BLOCKED/interrupted, „View work”) (veza: AT-03, AT-07, AT-10)
- **Status:** DELIMIČNO/NEPOVEZANO
- **Path/symbol (postoji, rasuto):** `HomeCockpit.tsx:962-993` failure redovi overnight automatizacija → Automation Center; `AutomationCenterApp.tsx:515` „Attention required — last run failed”; `RoomApp.tsx:52,:66` boje za `failed|interrupted`; `memory/HarvestTab.tsx:331-343` M-08 „Last harvest interrupted … Resume”; `AgentsApp.tsx:134` toast „Run failed”; chat `useChat.ts:41-45` `GENERATION_FAILED_PREFIX`.
- **Nedostaje:** `rg "View work"` → 0; nema jedinstvene mape status→label/ton za agent run-ove; `interrupted` (koje `agent-run-registry` upisuje na restart — S1 spot-check, van ove grupe) prikazan samo u RoomApp; `agents/*` redovi znaju samo `running|archived` (`AgentCenterRow.tsx:87,:99`).
- **Očekivano (A22):** isti „View work” za partial/blocked/cancelled/failed; bez procenta.
- **Najmanja promena:** zavisi od W1 status mape; sada — deljeni `run-status-labels.ts` (po uzoru na `lib/activity-labels.ts`) koji koriste Home/Agents/Room.

### F-UXM-08 — A23: dva prekidača (experience tier + Developer Mode) i žargon na Essential putu (veza: D-09, AT-17 posredno)
- **Status:** POTVRĐENO NA REVIZIJI (dva nezavisna prekidača; žargon prisutan; nema copy lint testa)
- **Path/symbol:**
  - Experience tier: `dock-tiers.ts:20` `UserTier = 'simple'|'professional'|'power'|'admin'`; `SettingsApp.tsx:605-629` „Essential / Standard / Everything” → `updateOnboarding({tier})`; `providers/ShellContext.tsx:157` `currentTier = onboardingState.tier || 'simple'`; potrošači `settings-tier-filter.ts`, `onboarding-tier-filter.ts`, `dock-tiers.ts:168-171`, `AppShell.tsx:700,:721-730` (pinned samo `power|admin`), `command-catalog.ts:108-115` (Pinned grupa). Spec: `docs/ux-disclosure-levels.md` (postoji).
  - Developer Mode: `hooks/useDeveloperMode.ts:12` localStorage `waggle:developer-mode`; `SettingsApp.tsx:1404-1419` toggle „Show token counts and per-call cost in the status bar”; `StatusBar.tsx:41,:194-200`.
  - Žargon na default (Essential) putu: `dock-tiers.ts:123` „Talk to your AI agents”; `Sidebar.tsx:180-191` dugme **„New Agent”** vidljivo na svakom tier-u (nema gating-a; `AppShell.tsx:803` uvek prosleđuje `onSpawnAgent`); `AppShell.tsx:718` spine stavka „Agents”; `command-catalog.ts:117-119` — grupa **„Power tools”** (`:83-101`: „Run a team of agents · waggle-dance · swarm”, „Connect a tool · MCP servers”, Room, Benchmarks `/benchmarks`, Platform & roadmap `/platform`) prikazuje se **svim tier-ovima** — `gate()` (`:103-104`) filtrira samo po billing rangu, `isPro` kontroliše samo Pinned; `FirstTaskStep.tsx:17,:29` „Give your agent its first task” / „Ask your agent to do something…”; `TemplateStep.tsx:28` „with a matching specialist”; `MemoryCenterApp.tsx:67` „Self-evolving prompts and agents”.
  - `command-catalog.ts:80` „Upgrade to Team” u Do grupi — konflikt sa D-01/D-02 (pripada WB grupi; cross-ref).
  - Copy lint: `rg jargon|copy.?lint|banned` po testovima → nema; `command-catalog.test.ts:1-35` ne proverava vidljivost power grupe na Essential-u.
- **Očekivano (A23 PRIHVATITI SA IZUZECIMA):** jedan razumljiv advanced prekidač; svakodnevni put bez tehničke instrukcije, ali bez skrivanja bezbednosno bitnog imenovanja (Claude Code/konektor).
- **Najmanja promena:** `buildCommandCatalog` → `power` grupa samo za `isPro` (ili posebna `showPowerTools` zastavica); „New Agent” ispod power tier-a sakriti/preimenovati; vitest copy-lint nad `TIER_DOCK_CONFIG.simple`, spine labelama i onboarding koracima uz allowlist; odluka o spajanju Developer Mode u tier je ODLUKA za founder-a (ne menjati tiho).

### F-UXM-09 — A24: i18n odsutan; `aria-live` u 29 fajlova; axe e2e postoji ali ne pokriva onboarding (veza: §11.1)
- **Status:** POTVRĐENO NA REVIZIJI
- **Path/symbol:**
  - i18n: `package.json`, `apps/web/package.json`, `app/package.json` → nema `i18next|react-intl|lingui|formatjs`; u `apps/web/src` samo komentari: `onboarding/WelcomeStep.tsx:70-71` „no i18n exists yet”, statični badge „English (US)” `:72-78`; `overlays/EraseDataDialog.tsx:14`. Landing `apps/www` ima `apps/www/messages/en.json` + `apps/www/i18n/request.ts` (samo www). Centralizovani stringovi u app-u: samo `lib/notification-copy.ts` i `lib/activity-labels.ts:9-37`.
  - aria-live: `rg -l aria-live apps/web/src` → **29** fajlova (poklapa se sa S1). Work-progress površina `components/os/warm/ActivityStream.tsx:58` `aria-busy`, `:71` `role="status" aria-live="polite" aria-atomic`, `:86` `role="region"`; `OnboardingWizard.tsx:639` `aria-live="polite"`; `ModelGate.tsx` 13 `role="status|alert"` mesta; `NoModelBanner.tsx:34-36`.
  - axe: `tests/e2e/runtime-a11y.spec.ts:10-60` — 43 rute × 2 viewporta (desktop/mobile) sa `skipOnboarding=true&…&tier=power`; **OnboardingWizard i ModelGate korak nisu u listi ruta**.
- **Očekivano (A24 PRIHVATITI CILJ, OZNAČITI ODLUKU):** English-only je odluka za potvrdu; novi stringovi centralizovani; testovi za nove površine.
- **Najmanja promena:** dodati `?forceWizard=true` rutu (koraci 2–6) u axe listu; nove Work Progress labele u centralni modul (proširiti `activity-labels.ts`); bez i18n frameworka dok nema odluke.

### F-UXM-10 — C16: personas u onboarding-u i switcher-u (veza: D-09)
- **Status:** POTVRĐENO NA REVIZIJI (sa preciziranjem: onboarding NE traži izbor persone)
- **Path/symbol:**
  - `OnboardingWizard.tsx:97` 6 koraka bez persona koraka; `:408` `persona = TEMPLATE_PERSONA[templateId] ?? 'general-purpose'` (automatski), `:461,:504-505`. `TemplateStep.tsx:6-11,:28` — template bira „matching specialist”.
  - `onboarding/constants.ts:102` `ALL_ONBOARDING_PERSONAS` (19), `:125` `getPersonasForTemplate` → jedini pozivaoci su testovi (`lib/onboarding-tier-filter.test.ts:14`); u wizard-u se ne koristi → **exists-but-unwired**.
  - `overlays/PersonaSwitcher.tsx:67-83` UNIVERSAL MODES (8) + specijalisti po template-u, `:176-179` fallback na `PERSONAS` (22); otvara se Ctrl+Shift+P (`AppShell.tsx:436,:589,:849-850`) — opciono, nije obavezan korak.
  - Copy koristi „agent/specialist” (F-UXM-08).
- **Očekivano (C16 PRECIZIRATI):** opciona razumljiva rola ostaje; bez obaveznog izbora pre prvog posla → **već tako radi**; ostaje samo copy.
- **Najmanja promena:** preimenovati u „role/modes” u copy-ju; ukloniti ili povezati mrtvi `ALL_ONBOARDING_PERSONAS`/`getPersonasForTemplate`.

### F-UXM-11 — W5 + A11: SSE `step` kanal, Work Progress, ChatWorkCanvas, `harnessEvents` (veza: AT-06, AT-10)
- **Status:** POTVRĐENO NA REVIZIJI (sredstva postoje) / DELIMIČNO (Work Progress ugovor)
- **Path/symbol:**
  - Server `step`: `routes/chat-agent-run.ts:155-199` (`{content, phase?}`; `phase` samo `model_active`/`model_streaming`), `chat-turn-preparation.ts:984-995` (`workspace_queue`/`workspace_acquired`), `chat-approval-hook.ts`, `chat-attempt-chain.ts`; tipovi događaja `local/index.ts:3189`.
  - Klijent: `lib/types.ts:575-586` `StepContentBlock {description, status:'running'|'done', provenance?}`; `:786` SSE tipovi; `hooks/useChat.ts:925-948` (prethodni running step → done); `chat-blocks/BlockRenderer.tsx:231-367` `renderActivityGroup` → `ActivityStream` sa sažetkom „Working · N tools”.
  - **Nema** `runId/phaseId/status/evidenceRefs` u `step` payload-u (A11 potvrđen); harness faze emituju na **globalnom** `harnessEvents` `EventEmitter`-u (`packages/agent/src/workflow-harness.ts:132,:144,:243-250,:300,:323-331,:353,:369`), most `harness-trace-bridge.ts:8,:33,:82`; nema run-scoped bus-a.
  - `chat-blocks/ChatWorkCanvas.tsx:2-11` — bočni panel poslednjeg file-write artefakta; komentar „There is no document-body stream channel today”; `:18` `ARTIFACT_TOOLS`, `:30-49` `selectCanvasArtifact`; pozivaoci `ChatApp.tsx:801,:2485`. **Nije** Work Progress površina.
- **Očekivano (§11.1 Work Progress):** namera faze, stvarni status, blokada, trošak, rezultat, View work; bez procenata.
- **Najmanja promena:** aditivno proširiti `step` payload i `StepContentBlock` (`runId`, `phaseId`, `status: running|done|failed|blocked`, `evidenceRefs`); most `harnessEvents` → per-run `step` po uzoru na `HarnessTraceBridge`; zadržati `ActivityStream` (već ima `aria-live`).

### F-UXM-12 — W6: OnboardingWizard 6 koraka (resumable) + ModelGate hard gate; prvi zadatak je „Hello” (veza: AT-20, AT-21, §11.2)
- **Status:** POTVRĐENO NA REVIZIJI (sredstva); DELIMIČNO (prvi zadatak ne proizvodi artefakt)
- **Path/symbol:** `OnboardingWizard.tsx:97` `STEP_NAMES = ['first-launch','who-are-you','model-gate','memory-import','template','first-task']`; resume clamp `:112-116`; persist `hooks/useOnboarding.ts:27` `waggle:onboarding` (localStorage); render `:664-720`; `ModelGateStep.tsx:63-65` Continue `disabled={!hasWorkingModel}`, `:55-60` „I’ll do this later” → `NoModelBanner`; `:107` `DEFAULT_FIRST_MESSAGE = 'Hello! What can you help me with?'`; `FirstTaskStep.tsx:5-11` predlozi po template-u.
- **Razlika prema §11.2 predlogu toka:** nema koraka „prvi Workspace + izabrani izvori” (memory-import = uvoz AI eksporta/Claude Code), nema opcione mail/calendar veze; wizard je već deterministički pre modela (nema LLM-vođenja) — u redu.
- **Najmanja promena:** default prvi zadatak → template-specifičan zadatak koji proizvodi artefakt (predlozi već postoje); preuređenje koraka tek uz W6.

### F-UXM-13 — D-07/W5: HomeCockpit blokovi (What Needs Me / My Work / Routines / Ask Waggle)
- **Status:** DELIMIČNO/NEPOVEZANO
- **Path/symbol:** `apps/web/src/components/os/apps/HomeCockpit.tsx` (pozivalac `routes/HomeRoute.tsx:32`): `:908-914` GreetingHeader; `:919` RecallStrip (`home-cockpit-recall`, `:170`); `:921-929` StartHereCard (`buildStartHereMove :202-260`); `:931-957` banner „memories from your imports need your review”; `:959-1007` `OvernightHero` + failure redovi automatizacija; `:1011-1013` DreamDiaryCard; `:1015-1024` „Pick up where you left off” (`:459-460`); `:1026-1030` „Waggle suggests” (`:530-531`); `:1034-1038` „Up next” (`:561-562`; `types.ts:352` `UpNextItem.kind: 'event'|'task'|'schedule'`); `:1040-1044` **`AskBar`** (`warm/AskBar.tsx`) = „Ask Waggle” postoji.
- **Mapiranje na D-07:** Ask Waggle ✔; My Work ≈ RecentWorkspaces ✔ (drugo ime); What Needs Me — delimično (StartHere + `pendingCount` + review banner, bez jedinstvene WorkItem liste); Routines — **nema** bloka (reč „Routines” samo `CockpitApp.tsx:196` „Scheduled Routines”; OvernightHero pokazuje ishode automatizacija bez upravljanja).
- **Najmanja promena:** preimenovati/grupisati postojeće panele; Routines blok čita postojeće `CronStore`/`/api/automations` (ne novi engine).

### F-UXM-14 — W5: MemoryCenterApp copy/IA
- **Status:** POTVRĐENO NA REVIZIJI (IA već sažeta; copy uglavnom plain)
- **Path/symbol:** `MemoryCenterApp.tsx:38` 8 view-ova; `:57-60` primarni tabovi Trust/Memories/Timeline/Graph; `:64-67` Advanced: Imports/Maintenance/Wiki/Improvements (`:154-170` „Advanced: <tab>”); `:217-236` personal/workspace mind prekidač; `:67` tooltip „Self-evolving prompts and agents” (jedini žargon). Pozivalac `routes/MemoryRoute.tsx:85`.
- **Najmanja promena:** jedan tooltip; ostalo zadržati (S1 W5 „Memory IA copy” je precenjen kao net-new).

### F-UXM-15 — Fokus: Sidebar/Dock/⌘K stavke (New Agent, Waggle Dance, Room, MCP, Platform, Benchmarks) (veza: D-09)
- **Status:** POTVRĐENO NA REVIZIJI
- **Path/symbol:** Sidebar spine `AppShell.tsx:702-720` Home/Chat/Memory/Agents/Library; pinned (power) `:721-730` „Agent swarm” `/waggle-dance`, Connectors, Approvals (TEAMS); `Sidebar.tsx:180-191` „New Agent” (uvek); ⌘K `command-catalog.ts:83-101` swarm/MCP/Room/Benchmarks/Platform/Team; `dock-tiers.ts:66-118` POWER_CONFIG (`:79` Room, `:80` Waggle Dance, `:82` Approvals `minBillingTier:'TEAMS'` — S1 spot-check, WB grupa, `:91` MCP Hub); `:121-131` simple dock = Home/Chat/Memory/Files/Vault/Settings (već „de-agented” osim opisa `:123`).
- **Zaključak:** nav je već dvoslojan; preostali D-09 problemi su „New Agent” na svim tier-ovima i ⌘K Power tools bez tier gating-a (F-UXM-08).

---

## 2. Postojeća sredstva koja treba očuvati (pozivaoci provereni `rg`-om)

| Šta | Putanja | Pozivaoci |
|---|---|---|
| Onboarding wizard, 6 koraka, resumable | `apps/web/src/components/os/overlays/OnboardingWizard.tsx:97,:112-116`; `hooks/useOnboarding.ts:27` | `AppShell.tsx:759` |
| Deljeni ModelGate (Settings ↔ onboarding) | `apps/web/src/components/os/model-gate/ModelGate.tsx` | `onboarding/ModelGateStep.tsx:47`; `SettingsApp.tsx:792` |
| `useHasWorkingModel` signal (popraviti, ne zameniti) | `apps/web/src/hooks/useHasWorkingModel.ts` | `ModelGateStep.tsx:19`; `NoModelBanner.tsx:24`; `HomeRoute.tsx`; `LoginBriefing.tsx`; `AppShell.tsx` |
| Live probe ruta + `probeConfiguredModel` | `packages/server/src/local/routes/settings.ts:103-164,:844-889` | `adapter.ts:2674,:2693`; `ModelGate.tsx:298,:341,:343`; `useHasWorkingModel.ts:88,:159,:161` |
| Managed Ollama: pin 0.32.3/0.32.0 + sha256 + Range resume + rollback | `packages/server/src/local/managed-ollama-runtime.ts:28-29,:158-237,:1109-1204` | `routes/local-inference.ts:20-25,:202,:277` |
| Post-pull digest + live generation probe | `packages/server/src/local/routes/local-inference.ts:338-377` | `ModelGate.tsx` pull UI; `scripts/certify-windows-installer.ps1:2951-2961` |
| Hardware scan (NVIDIA/Apple/CPU) + fit engine + katalog | `packages/server/src/local/hardware-detect.ts`; `packages/agent/src/cookbook/model-fit.ts:380-401`; `cookbook/catalog.ts` | `local-inference.ts:18-19,:40,:227`; `ModelGate.tsx:235` (`getLocalInferenceModels('general')`) |
| SSE `step` kanal + `StepContentBlock` + `ActivityStream` (aria-live) | `routes/chat-agent-run.ts:155-199`; `lib/types.ts:575-586`; `hooks/useChat.ts:925-948`; `warm/ActivityStream.tsx:58,:71` | `BlockRenderer.tsx:231-367` |
| `harnessEvents` + `HarnessTraceBridge` (kandidat za per-run most) | `packages/agent/src/workflow-harness.ts:132`; `harness-trace-bridge.ts:33,:82` | `packages/agent/src/index.ts:316`; `server/src/local/index.ts:595` |
| HomeCockpit paneli + AskBar + OvernightHero | `apps/HomeCockpit.tsx:902-1046`; `warm/AskBar.tsx`; `warm/OvernightHero.tsx` | `routes/HomeRoute.tsx:32` |
| Sidebar spine/pinned, ⌘K katalog, dock tiers | `os/Sidebar.tsx`; `lib/command-catalog.ts`; `lib/dock-tiers.ts` | `AppShell.tsx:41,:43,:648,:702-744,:799-803` |
| Experience tier + spec | `providers/ShellContext.tsx:157`; `lib/settings-tier-filter.ts`; `lib/onboarding-tier-filter.ts`; `docs/ux-disclosure-levels.md` | `SettingsApp.tsx:605-629`; `AppShell.tsx:700` |
| Developer Mode | `hooks/useDeveloperMode.ts` | `SettingsApp.tsx:19,:218,:1404-1419`; `StatusBar.tsx:8,:41,:194-200` |
| MemoryCenterApp (4 + Advanced) | `apps/MemoryCenterApp.tsx:57-67` | `routes/MemoryRoute.tsx:85` |
| CronStore + LocalScheduler + AutomationCenterApp (Routines reuse) | `packages/core/src/cron-store.ts`; `server/src/local/cron.ts:90`; `apps/AutomationCenterApp.tsx` | `server/src/local/index.ts:192,:585,:1919`; `routes/automations.ts:11`; `routes/AutomationsRoute.tsx:12,:31` |
| axe e2e (43 ruta × 2 viewporta) | `tests/e2e/runtime-a11y.spec.ts:10-60` | Playwright e2e config |
| Centralizovani copy moduli (seme za A24) | `lib/activity-labels.ts:9-37`; `lib/notification-copy.ts` | `activity-labels.test.ts`; UI rail |
| ChatWorkCanvas (artefakt panel, ne Work Progress) | `chat-blocks/ChatWorkCanvas.tsx` | `ChatApp.tsx:801,:2485` |
| **Exists-but-unwired:** `ALL_ONBOARDING_PERSONAS`, `getPersonasForTemplate` | `onboarding/constants.ts:102,:125` | samo `lib/onboarding-tier-filter.test.ts:14` |
| **Exists-but-unwired:** `WorkspaceCreateStep`, `ReadyStep` (superseded) | `onboarding/WorkspaceCreateStep.tsx`, `ReadyStep.tsx`, `index.ts:7-8` | nisu u `OnboardingWizard.tsx:10-15` |

---

## 3. Napomene i granice
- Nijedna S1 tvrdnja iz ove grupe nije VEĆ ZATVORENO; sve navedene linije (`useHasWorkingModel.ts:174,:244`, `0.2.0`, 29 aria-live fajlova, `stream:false` + 45 min) su identične na `2af0904d`.
- NEPOZNATO: da li pinovan Ollama 0.32.3 servira Qwen 3.8 27B arhitekturu (`qwen3_5` tag) — offline se ne može utvrditi; zahteva online proveru pre re-baseline-a (C19).
- Cross-ref za druge grupe: `dock-tiers.ts:82` Approvals TEAMS gate i `command-catalog.ts:80` „Upgrade to Team” → WB; `agent-run-registry` `interrupted` na restart → W1.
- Nije predlagana arhitektura; „najmanja promena” su lokalne izmene na postojećim fajlovima. Odluke koje ostaju founder-u: English-only prvi release (A24), spajanje Developer Mode u tier (A23), tačan target model ID/quant (C19/D-15).
