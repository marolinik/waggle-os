# Goal Integration Checkpoint - 2026-07-12

## Scope

Clean integration branch: `codex/goal-integration-2026-07-12`

Base: `origin/main` at `89329f99`

This checkpoint combines the current mainline with:

- hardened Channels from `015e20e4`
- durable Rooms and external-tool collaboration from `39511843`
- provider-native model discovery and managed LiteLLM runtime routing
- recoverable API-key setup in onboarding and Settings
- mobile onboarding, CSP, and dependency fixes found during combined validation

The original dirty UX checkout was not merged wholesale. Its unrelated working
files remain untouched.

## Functional Result

- Provider model identities come from provider APIs, not a maintained model list.
- Anthropic cursor and Google page-token pagination are exhausted.
- Provider models use stable `provider/model` IDs through UI, Settings, Chat,
  explicit model selection, fleet execution, and LiteLLM runtime configuration.
- Saving a key hydrates provider environment aliases, stores the key in Vault,
  scrubs legacy plaintext config, refreshes catalogs, and restarts the managed
  router when needed.
- A model released while Waggle is open is pulled again on focus and becomes
  executable without a Waggle code change.
- API-key success and router readiness are separate states. Router failure keeps
  an inline retry and does not claim that the model is ready.
- Channels and durable Rooms coexist with the current MCP retrieval, marketplace,
  evolution, embedding-routing, and security changes on main.

## Verification

- `npm ci --legacy-peer-deps`: pass
- `npm run build:packages`: pass
- root `npm run build`: pass
- server TypeScript project: pass
- web TypeScript project: pass
- app TypeScript project: pass
- combined backend slice: 21 files, 221 tests passed
- combined web slice: 14 files, 94 tests passed
- agent, hook, shim, and worker slice: 14 files, 200 tests passed
- hive-mind MCP server build and focused scope tests: 13 tests passed
- fresh-port Playwright: 5/5 for app load, navigation, Settings/Models, Room,
  and zero console errors
- 390 x 844 rendered inspection: onboarding/API-key, Settings/Models, and Channels
  fit without horizontal overflow; selected tabs remain visible; console errors 0
- diff check: pass
- added-line credential scan outside tests/docs: 0 candidates
- production dependency audit: 0 high, 0 critical; 19 moderate remain
- full workspace dependency audit: 0 high, 0 critical; 24 moderate remain

## Corrections Found During Integration

1. The root production build caught a stale frontend `Settings` type that omitted
   `defaultModel`; the contract now matches the model-save path.
2. The production CSP blocked the inline pre-hydration theme script. It now runs
   as a same-origin classic script without weakening `script-src 'self'`.
3. Tall onboarding steps were vertically centered on mobile, clipping content
   above the scroll origin. Mobile steps now align to the top and remain centered
   on larger viewports.
4. `hono` 4.12.29, `vite` 6.4.3, `vitest` 3.2.7, and `form-data` 4.0.6 now
   resolve across the workspace, clearing every high- and critical-severity
   dependency advisory without a breaking application-code change.

## Open Build Hygiene

- Tailwind reports ambiguous arbitrary motion utility classes.
- Vite reports mixed dynamic and static imports for shape selection.
- The production build reports chunks larger than 500 kB.
- Focused tests still emit known image-source and expected error-path stderr;
  the fresh browser run remains free of console errors.

## Remaining Goal Gates

- paid external-provider credential smoke against at least one live provider
- live Telegram, Discord, and Slack credentials; WhatsApp scan/restart/unlink
- one real held-tool approval arriving through a Channel
- packaged Tauri desktop and signed installer evidence
- remaining T13-T19 launch, utility, hook, Browser Companion, CI, and deployment
  evidence, or explicit scope deferrals
- reconcile the broader dirty UX correction checkout in deliberate slices
- run the final five-persona scorecards; no persona is yet formally confirmed at
  9/10

This branch is local and has not been pushed.
