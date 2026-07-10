# Tier 2 Steal Arc — #6 #7 #9 #10 #11 (2026-07-10)

**Branch:** `feat/steals-tier2` (worktree `.claude/worktrees/steals-t2`, off main `0d78d2a0`).
**Source:** CowAgent teardown §2 Tier 2 (`docs/analysis/cowagent-vs-waggle-2026-07-09.md`). Founder approved #6/#7/#9/#10/#11; **#8 REJECTED** (hive-mind IdentityLayer/AwarenessLayer + 86.49% retrieval already cover it; second store = dual-write drift + GDPR erasure surface — do not re-raise).
**Orchestration:** Fable plans/gates/verifies; Opus executes; adversarial Opus verifier before merge. Commit per steal.
**Recon basis (2026-07-10, 4 Opus agents):** agent-loop/MCP · routing/settings · skills/governance · CowAgent source (code-verified; teardown path corrections: #6 selection lives in `tool_retrieval.py`, #9 in `agent/protocol/agent_stream.py`).

---

## Load-bearing recon facts

- **MCP tools are NOT in the model tool pool today.** `buildToolsForWorkspace` (`packages/server/src/local/index.ts:1043-1119`) never calls `mcpRuntime.getAllTools()` (zero non-test callers). #6 = first-ever wiring, born relevance-gated — no regression surface, but must include the execution path (`mcp-runtime.ts:441-452` already emits executable `mcp_<server>_<tool>` ToolDefinitions).
- Chat tool chain: `effectiveTools` → `applyPersonaToolFilter` → `filterAvailableTools` (`tool-filter.ts:56`) → conversational narrowing (`chat.ts:1296-1334`) → agent loop (`chat.ts:1449`).
- Embedder is threaded to agent layer already (`Orchestrator({embedder})`, `local/index.ts:1141`); `embedBatch()` exists (`embedding-provider.ts:144-145`); must tolerate mock provider.
- LoopGuard (`loop-guard.ts`): identical-args hash only, no failure signal; block surfaces as tool-result nudge (`tool-executor.ts:206-216`), NOT a hard stop. User-facing copy path = `sendEvent('step')` (`chat.ts:1697`).
- MCP config: `<dataDir>/.mcp.json`, `populateMcpRuntimeFromConfig` registers **without starting**; primitives `addServer/removeServer/refreshTools/stop/start` all exist (`mcp-runtime.ts`).
- #10 honest scope: only **chat** (ModelPilotCard 3-lane chain, done) and **embedding** (full provider chain `embedding-provider.ts`, `setEmbeddingProvider` exists at `config.ts:226` but NO route calls it, NO UI) exist end-to-end. Vision/image-gen/ASR/TTS do NOT — build no dead lanes. `capability-router.ts` is a tool-resolver, unrelated.
- Skill writes have ONE sanctioned seam: `writeSkill` (`skill-write-service.ts`) — name regex `/^[a-zA-Z0-9_-]+$/`, secret redaction, authoritative provenance, `.backups/` undo, install_audit. Approval = held proposal + SkillPreview exact bytes (`ApprovalsApp.tsx:83`).
- **Pre-existing SSRF gap (fix in this arc):** `safeFetch`/`assertUrlAllowed` (`packages/agent/src/url-egress-guard.ts:209,286`) exist but `marketplace/src/installer.ts:674 fetchContent` + `marketplace/src/sync.ts` (11 raw fetch sites) + `POST /api/marketplace/sources` (`routes/marketplace.ts:548`, arbitrary user URL, `new URL()` only) bypass it.
- CowAgent bugs to NOT port: tar zip-slip guard lacks `+ os.sep` boundary (sibling-dir bypass); checksums optional/skippable; tar symlink members unfiltered; Chinese-only non-critical copy.
- ⚠ marketplace.db: tests must copy the seed to temp, never mutate checked-in file.

---

## Design decisions (locked)

### #9 — Tiered loop breaker (extend `loop-guard.ts`, do NOT create a new file)
| D9.1 | Extend `LoopGuard` with `record(toolName, argsHash, success)` + graduated `checkTiered()`; history list capped 50. tool-executor feeds pass/fail from its try/catch (`tool-executor.ts:210-216`). |
| D9.2 | Tiers in check order: (T3-critical) 8 same-tool consecutive failures → HARD ABORT run with user-facing give-up copy ("couldn't complete… try rephrasing / smaller steps / different approach") via `sendEvent('step')` + terminate loop; (T1) 5 identical tool+args calls any outcome → block w/ "result already returned" nudge; (T2) 3 identical consecutive failures → block; (T4) 6 same-tool any-args consecutive failures → block. Reversed-scan, break on success (T2-4) / different call (T1) = implicit reset. |
| D9.3 | Existing identical-args + window heuristics stay; new tiers layered on. All copy English. Backward-compatible constructor defaults. |

### #7 — MCP hot-reload (`mcp-config.ts` + one route)
| D7.1 | `refreshMcpIfChanged(runtime, dataDir)`: `(mtime, sha256)` signature fast-path; 3-way diff added/removed/changed on per-server config equality. Parse failure → warn + keep running servers (never teardown on bad file). |
| D7.2 | State preservation over CowAgent semantics: removed → `removeServer` (stops if running); changed → re-register; **restart only if it was running**; added → register stopped (matches our stopped-until-started model). Register tools before publishing (their ordering insight). |
| D7.3 | Triggers: explicit `POST /api/mcps/reload` + cheap signature check piggybacked on `GET /api/mcps` list. NO fs-watcher daemon in v1. |

### #6 — On-demand MCP tool retrieval (new `packages/agent/src/mcp/mcp-tool-retrieval.ts`)
| D6.1 | Only MCP tools are relevance-gated; built-ins always injected in full (CowAgent invariant). Applies to tools of RUNNING servers via `mcpRuntime.getAllTools()`. |
| D6.2 | Thresholds: retrieve only when MCP tool count > 20; top_k 10; query = trailing ≤5 user/assistant text messages (skip tool blocks). Config via existing config.json surface (`mcpToolRetrieval: {enabled?, threshold?, topK?}`), **default ON** (differs from CowAgent's OFF — our count>threshold gate makes it safe). |
| D6.3 | Cosine over `embedBatch("name: description")`, lazy index, dim-mismatch vectors skipped, index rebuilt on `refreshTools`. Mock/no embedder → keyword-overlap scoring fallback (mirror `connector-search.ts` pattern), never full-dump above threshold. Any exception → inject none new, keep accumulated (never break the turn). |
| D6.4 | **Union-only accumulator per conversation** (only-grows set keyed by conversationId, LRU ≤200 conversations): a tool that ever entered the run never vanishes mid-run. |
| D6.5 | Injection point: `chat.ts` after `filterAvailableTools`, before conversational narrowing; persona `disallowedTools` filter applies to MCP tools too. |

### #10 — Routing panel (embedding picker; chat lanes stay put)
| D10.1 | New `GET /api/embedding/status` (provider getStatus: activeProvider/dimensions/modelName/lastError) + `POST /api/embedding/provider` `{provider}` → validate against `EmbeddingProviderType` minus `mock`, tier-gate via `TIER_CAPABILITIES.embeddingProviders`, call `setEmbeddingProvider` + recreate/reprobe, return new status. |
| D10.2 | UI: `EmbeddingRoutingCard` in SettingsApp Models tab under ModelPilotCard — picker (auto + tiered providers), live active-provider/model/dims badge, reprobe button, key-gated options (voyage/openai need vault key — reuse useProviders hasKey pattern where applicable). No vision/image/audio lanes. |
| D10.3 | Persisted in config.json `embedding.provider` (existing `setEmbeddingProvider`); env `EMBEDDING_PROVIDER` still wins (documented in UI hint when env override active). |

### #11 — Multi-source skill installer (SKILLS ONLY — never plugins/MCP; those install paths execSync npm/git)
| D11.1 | New resolver `packages/marketplace/src/multi-source.ts` + route `POST /api/marketplace/install-url` `{source, sha256?}`. Ordered grammar (first match wins): direct SKILL.md URL → GitHub URL → `owner/repo[#subpath]` shorthand → zip URL. NO local-path, NO git-SSH, NO tar, NO hub prefixes in v1 (scope-cut; tar deferred with its symlink pitfalls). |
| D11.2 | **Every fetch through `safeFetch`** (url-egress-guard), redirects re-validated (guard does this). GitHub shorthand resolves to raw.githubusercontent.com SKILL.md candidates (main→master). |
| D11.3 | Zip path: adm-zip (existing dep); zip-slip guard with resolved-path `dest + sep` boundary (CowAgent's ZIP impl, NOT their tar impl); reject entries with absolute paths/`..`; junk-file skip; only extract the SKILL.md (+ referenced same-dir assets NOT needed v1 — SKILL.md only). |
| D11.4 | `sha256` param: optional; **enforced when provided** (mismatch = hard fail); UI encourages it for zip sources. |
| D11.5 | Content pipeline (do-not-bypass): SecurityGate content scan → `scanForInjection` on SKILL.md body (CLAUDE.md §7.2) → frontmatter parse w/ Claude-Code compat (require name+description; sanitize name to `/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/`; map unknown fields advisory) → **held approval proposal** (review-before-apply, SkillPreview exact bytes — steal #3 pattern) → on approve, `writeSkill` seam with trust source `third_party_unverified`. NEVER direct fs write. |
| D11.6 | **SSRF remediation (separate commit, same wave):** route `installer.ts fetchContent`, all 11 `sync.ts` fetch sites, and `POST /api/marketplace/sources` URL validation through `safeFetch`/`assertUrlAllowed`. |
| D11.7 | UI: minimal "Install from URL" affordance in MarketplaceApp (input + optional sha256 + submit → lands as pending approval). |

---

## Waves

**Wave A (Opus):** #9 + #7. Files: `agent/src/loop-guard.ts`, `agent/src/tool-executor.ts` (feed signal), `chat.ts` (abort copy path), `agent/src/mcp/mcp-config.ts`, `server routes/mcps.ts`. Gates: agent+server tsc 0; loop-guard/mcp test suites extended + green; full `packages/agent` suite green.
**Wave B (Opus, after A — shares chat.ts/tool path):** #6. Files: new `mcp-tool-retrieval.ts`, `chat.ts`/`index.ts` wiring, config surface. Gates: agent+server tsc 0; new retrieval tests (threshold, top-k, union-only, mock-degrade, dim-mismatch); mcp-runtime suite green.
**Wave C (Opus, parallel with A):** #10. Files: new server route, SettingsApp + new card, tests. Gates: server+web tsc 0; route tests (tier-gate, invalid provider, env-override signal); web tests green.
**Wave D (Opus, after C or parallel with B):** #11 incl. D11.6 SSRF fix. Gates: marketplace+server tsc 0; resolver grammar tests, zip-slip tests (traversal entries rejected), SSRF tests (private-IP URL rejected), approval-flow test; marketplace tests on TEMP db copy only.
**Verify (Opus adversarial):** full-arc; REJECT on any CRITICAL/HIGH. Verdict → `docs/plans/VERIFIER-VERDICT-TIER2-2026-07-10.md`.

**Global gates every wave:** `npx tsc --noEmit` on touched packages (server tsc mandatory — tsx hides route type errors), targeted vitest suites green, no unrelated-file edits, commit per steal (`feat(agent): …` / `feat(mcp): …` / `feat(routing): …` / `feat(marketplace): …` + `fix(security): SSRF …`), NO --no-verify.

## Out of scope (do not build)
#8 pinned digest (founder-rejected) · vision/image/ASR/TTS routing lanes · tar/git-SSH/local-path/hub-prefix skill sources · fs-watcher for mcp.json · plugin/MCP multi-source install · CLI channel enablement.
