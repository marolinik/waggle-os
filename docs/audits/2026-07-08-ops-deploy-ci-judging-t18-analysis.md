# T18 Ops, Deployment, CI, Benchmark, and Judging UX Analysis

Date: 2026-07-08
Scope: GitHub Actions, Docker, Compose, Render, LiteLLM config, infra test lane, benchmark harness, and judging artifacts.
Mode: analysis plus focused public-site deployment workflow fix.

## Bottom Line

T18 is not a product screen, but it is still part of UX: it is the experience of shipping, operating, validating, and proving the product.

The current state is mixed. Config syntax is healthy, secrets are not tracked in the checked env files, the benchmark harness now passes from its package-local command (29 files / 325 tests), production Compose now fails closed for Postgres and MinIO credentials, Render is explicitly aligned to the hosted local-sidecar mode, and the public-site workflow targets Vercel prebuilt deployment instead of a nonexistent GitHub Pages static artifact. The remaining blockers are release-confidence issues: deployed Vercel/DNS proof is still missing, CI browser E2E is advisory, the 19-suite live infra lane is not in CI and could not run here because Docker Desktop's engine is unavailable, and current `judging/` files are historical rather than the July five-persona scoring evidence.

## User Jobs

- Release reviewers can trust CI as an honest gate.
- Operators can validate Compose, Docker, Render, and LiteLLM config without leaking local secrets into logs.
- Hosted deployment mode is explicit: local sidecar demo or team Postgres server.
- Infra-dependent tests have a known runnable lane.
- Benchmark and judge harness commands work from documented entrypoints.
- Historical judge screenshots and reports are not mistaken for current 9/10 evidence.

## Command Evidence

| Check | Result | Notes |
|---|---:|---|
| YAML parse for `docker-compose.yml`, `docker-compose.production.yml`, `render.yaml`, `litellm-config.yaml`, and all 7 `.github/workflows/*.yml` | Pass | Syntax is valid for the checked deployment, workflow, and model-router files. |
| `docker --version`; `docker compose version` | Pass | Docker CLI 28.4.0 and Compose v2.39.2 are installed. |
| `docker compose ps --format json` | Fail | Docker Desktop Linux engine pipe was not reachable, so live Compose services could not be inspected or started here. |
| 127.0.0.1 port preflight for 5434 and 6381 | Closed | The Postgres/Redis ports required by `vitest.infra.config.ts` were not reachable locally. |
| `docker compose ... config --no-interpolate` targeted scan | Pass | Safer shareable evidence path because variable references stay literal instead of printing local secret values. |
| Secret tracking check for `.env`, `.env.local`, `AI API KEYS.txt`, and `apps/www/.env.local` | Pass for tracked files | Only checked `.env.example` files are tracked; local secret-bearing files are ignored. |
| `Test-Path apps/www/dist`; `Test-Path apps/www/.next`; deploy workflow scan | `False`; `True`; Improved | `apps/www` is a dynamic Next app producing `.next`; `.github/workflows/deploy-www.yml` now uses Vercel `pull`, `build`, and `deploy --prebuilt --prod` and no longer uploads `apps/www/dist` to GitHub Pages. |
| `npx tsc --noEmit --project benchmarks/harness/tsconfig.json` | Pass | Benchmark harness TypeScript compiles. |
| `npm run test --prefix benchmarks/harness -- --reporter=dot` | Pass, 29 files / 325 tests | Package-local command now delegates to the root Vitest aliases/setup. |
| `npx vitest run benchmarks/harness/tests --config vitest.config.ts --reporter=dot` | Pass, 29 files / 325 tests | Root-run benchmark tests pass, but output is noisy with turn and benchmark logs. |
| `judging/FINAL-REPORT.md` and `judging/round3/*` inspection | Historical only | These are June 2026 judge rounds, not current post-fix July scorecards. |

## Source Findings

| ID | Severity | Finding | Evidence | Correction Needed |
|---|---:|---|---|---|
| T18-1 | P1 | Public-site deploy target needed to match the dynamic Next app. | Historical Pages workflow uploaded nonexistent `apps/www/dist`; current workflow now uses Vercel production pull/build/deploy and `deployment-workflow.test.ts` guards against reintroducing `upload-pages-artifact`, `deploy-pages`, or `apps/www/dist`. | Local workflow mismatch is fixed. Remaining T13/T18 work is external: Vercel secrets/project linkage, production env, DNS, and deployed smoke evidence. |
| T18-2 | Resolved | Render deploy mode was ambiguous. | `render.yaml` now explicitly documents and tests the hosted local-sidecar mode, keeps `/data` persistence and Stripe sidecar routes, and removes unused Postgres/Redis provisions. The Postgres/Redis-backed team server remains the Dockerfile/Compose path. | Keep the two deployment modes documented separately. |
| T18-3 | Resolved locally | The broad CI browser E2E job is advisory, leaving no merge-blocking rendered UX gate. | `.github/workflows/ci.yml` now adds a separate blocking `e2e-smoke` job; `npm run test:e2e:smoke` passed 5/5 locally on a fresh build and sidecar. The broad exploratory E2E job remains advisory. | Keep the smoke slice small and stable; the broad suite remains evidence-producing rather than merge-blocking. |
| T18-4 | P1 | Live infra suites are not represented in CI and were not runnable in this audit environment. | `vitest.infra-suites.ts` lists 19 Postgres/Redis suites. Docker engine was unavailable and ports 5434/6381 were closed. | Add a Docker-provisioned CI lane or a documented local lane with migration/start/stop commands and current evidence; otherwise defer infra evidence explicitly. |
| T18-5 | Resolved | Production Compose kept default credentials. | Postgres and MinIO credentials now use required `${VAR:?set VAR}` interpolation; the deployment test asserts the fail-closed contract, and `docker compose -f docker-compose.production.yml config --no-interpolate` preserves the required placeholders for secret-safe review. | Keep production secrets in the deployment environment and never add convenience fallbacks back to this file. |
| T18-6 | P1 | Shareable ops evidence can leak secrets if reviewers use the obvious command. | `docker compose config` interpolates ignored local env values. `--no-interpolate` is safer for evidence logs; sanitized env validation also passes locally. | Keep the secret-safe command pair in the release runbook and attach sanitized output for the deployment packet. |
| T18-7 | Resolved | Benchmark package-local test command failed even though root-run tests passed. | `npm run test --prefix benchmarks/harness -- --reporter=dot` passes 29 files / 325 tests through the root config. | Keep the package-local delegation script as the canonical harness entrypoint. |
| T18-8 | P1 | Judging artifacts are stale for the current goal. | `judging/FINAL-REPORT.md` is a June 2026 mission report; the July scorecards/runbook still require a current human-scored pass against the post-fix source. | Generate and review new five-persona artifacts only after external release scope is decided; keep historical reports clearly labeled as historical. |
| T18-9 | P2 external evidence | Provider freshness and runtime routing are hermetically proven; a paid external-provider request is not yet attached. | The desktop runtime builds secret-free LiteLLM config from complete live provider catalogs rather than a model inventory. It covers provider pagination, refreshes UI catalogs on app focus, restarts on key save/retry, and hot-loads an exact model id released after startup when that id is selected for default, Chat, or fleet execution. Key-save -> unseen model -> generated config -> exact-id completion is deterministic. | Add one credentialed provider smoke in the release lane and retain the hermetic proof as the deterministic CI gate. |

## Persona Impact

| Persona | Current T18 cap | Why |
|---|---:|---|
| Engineer / power user | 7/10 | CI, benchmark, infra, and command-shape gaps reduce trust that green means shippable. |
| Team admin / security reviewer | 7/10 | Default production credentials, ambiguous hosted deploy mode, and secret-log risks are trust blockers. |
| Solo founder | 8/10 | Public deploy and checkout recovery can fail before the founder reaches the desktop app. |
| Researcher | 8/10 | Historical judge artifacts cannot be reused as evidence for current memory/UX quality. |
| Mobile executive | 8/10 | Less directly affected, but public deploy and judge evidence still gate the complete-system claim. |

## Acceptance For Closing T18

- `apps/www` deployment target is coherent with the actual Next app output and dynamic routes; production Vercel/DNS smoke is still required under T13 before final scoring.
- Render deploy mode is decided and verified: hosted sidecar demo or team Postgres server.
- Production Compose has fail-closed secrets or a clear sample-vs-production split.
- Secret-safe validation commands are documented and used for shareable ops evidence.
- CI includes a blocking rendered smoke lane, and the broad exploratory E2E job is explicitly advisory before scoring.
- `npm run test:infra` has a Docker/migration lane with current evidence, or the 19 infra suites are explicitly deferred.
- Benchmark package-local command shape is fixed or the root-run command is documented as canonical.
- Current five-persona judging artifacts are generated after approved fixes and replace historical evidence for scoring.
- LiteLLM/provider hermetic routing remains green, and one credentialed external-provider smoke is attached or explicitly outside the current score.

## Packet Decision

Keep T18 as `Phase 2 Pending` / launch-tooling gate. It should not block Phase 1 implementation, but it blocks the final "complete UX, all parts functional, five judges at 9/10" claim unless the user explicitly defers ops/deployment/CI/benchmark/judging from the score.
