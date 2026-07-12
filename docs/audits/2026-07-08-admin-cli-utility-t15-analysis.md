# Admin, CLI, Marketplace, and MCP Utility T15 Analysis - 2026-07-08

Status: analysis supplement plus focused admin, launcher, marketplace, CLI, and MCP runtime hardening.

Purpose: deepen T15 evidence for `packages/admin-web`, `packages/cli`, `packages/launcher`, `packages/marketplace`, `packages/memory-mcp`, `packages/hive-mind-mcp-server`, and `packages/hive-mind-cli`.

Guideline baseline: Vercel Web Interface Guidelines, fetched 2026-07-08 from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.

## Sources Inspected

- `packages/admin-web/package.json`
- `packages/admin-web/src/App.tsx`
- `packages/admin-web/src/api.ts`
- `packages/admin-web/src/pages/*.tsx`
- `packages/admin-web/tests/admin-pages.test.ts`
- `packages/cli/package.json`
- `packages/cli/src/index.ts`
- `packages/cli/src/repl.ts`
- `packages/cli/tests/cli-runtime.test.ts`
- `packages/launcher/package.json`
- `packages/launcher/src/cli.ts`
- `packages/launcher/tests/cli.test.ts`
- `packages/launcher/tsup.config.ts`
- `packages/marketplace/package.json`
- `packages/marketplace/tsconfig.json`
- `packages/marketplace/src/cli.ts`
- `packages/marketplace/src/db.ts`
- `packages/memory-mcp/package.json`
- `packages/memory-mcp/src/index.ts`
- `packages/memory-mcp/src/core/setup.ts`
- `packages/memory-mcp/tests/*.test.ts`
- `packages/memory-mcp/README.md`
- `packages/hive-mind-mcp-server/package.json`
- `packages/hive-mind-mcp-server/src/index.ts`
- `packages/hive-mind-mcp-server/src/core/setup.ts`
- `packages/hive-mind-mcp-server/tests/scope.test.ts`
- `packages/hive-mind-mcp-server/src/integration.test.ts`
- `packages/hive-mind-mcp-server/README.md`
- `packages/hive-mind-cli/package.json`
- `packages/hive-mind-cli/README.md`
- `packages/hive-mind-cli/src/index.ts`
- `packages/hive-mind-cli/src/dispatch.ts`
- `packages/hive-mind-cli/src/setup.ts`
- `packages/hive-mind-cli/src/commands/*.ts`
- `packages/hive-mind-core/package.json`
- `packages/shared/package.json`
- `packages/core/package.json`
- `packages/core/src/index.ts`
- `vitest.config.ts`

## Commands Run

```powershell
npx vitest run packages/admin-web/tests/admin-pages.test.ts --reporter=dot
npm run test --workspace @waggle/admin-web -- --reporter=dot
npx vitest run packages/launcher/tests/cli.test.ts --reporter=dot
npm run test --workspace @waggle/cli -- --reporter=dot
npx vitest run packages/cli/tests/commands.test.ts packages/cli/tests/admin.test.ts packages/cli/tests/renderer.test.ts packages/cli/tests/memory-persistence-hard.test.ts packages/cli/tests/auth.test.ts packages/cli/tests/mode-detector.test.ts packages/cli/tests/comprehensive-e2e.test.ts packages/cli/tests/cli-runtime.test.ts --reporter=dot
npm run test --workspace waggle-memory-mcp -- --reporter=dot
npx vitest run packages/memory-mcp/tests/scope.test.ts packages/memory-mcp/tests/erase.test.ts --reporter=dot
npm run test --workspace waggle-memory-mcp -- --reporter=dot
npx vitest run packages/hive-mind-mcp-server/tests/scope.test.ts packages/hive-mind-mcp-server/src/integration.test.ts --reporter=dot
npm run test --workspace @waggle/hive-mind-mcp-server -- --reporter=dot
npx vitest run 'packages/hive-mind-cli/src/**/*.test.ts' --reporter=dot
npx vitest run 'src/**/*.test.ts' --reporter=dot
npx vitest run packages/hive-mind-cli/tests/cli-help.test.ts --reporter=dot
npm run test --workspace @waggle/hive-mind-cli -- --reporter=dot
npx vitest run packages/marketplace/tests/categories.test.ts packages/marketplace/tests/mcp-registry.test.ts packages/marketplace/tests/cisco-scanner.test.ts --reporter=dot
npx vitest run packages/marketplace/tests/cli-runtime.test.ts packages/marketplace/tests/categories.test.ts packages/marketplace/tests/mcp-registry.test.ts packages/marketplace/tests/cisco-scanner.test.ts --reporter=dot
npx tsc --noEmit --project packages/admin-web/tsconfig.json
npx tsc --noEmit --project packages/cli/tsconfig.json
npx tsc --noEmit --project packages/marketplace/tsconfig.json
npx tsc --noEmit --project packages/server/tsconfig.json
npx tsc --noEmit --project packages/memory-mcp/tsconfig.json
npx tsc --noEmit --project packages/hive-mind-mcp-server/tsconfig.json
npx tsc --noEmit --project packages/hive-mind-cli/tsconfig.json
npm run build --workspace @waggle/admin-web
npm run test:rendered --workspace @waggle/admin-web
In-app Browser smoke of built `packages/admin-web/dist` against a typed mock API on `http://localhost:3100`
In-app Browser focused smoke of built `packages/admin-web/dist` on `http://127.0.0.1:4181` at 390 x 844 and desktop widths
npm run build --workspace @waggle-ai/waggle
npm run test --workspace @waggle-ai/waggle -- --reporter=dot
npm install <packed @waggle-ai/waggle tarball> --no-audit --no-fund --prefer-offline
npx waggle --help
npx waggle --port <occupied-port> --skip-litellm --no-open
npm run build --workspace @waggle/cli
npm pack --workspace @waggle/cli --pack-destination <temp> --json
npm install <local @waggle/* package-closure tarballs> --no-audit --no-fund --ignore-scripts --prefer-offline
npx waggle --help
npm install <local @waggle/* package-closure tarballs> --no-audit --no-fund --prefer-offline
npx waggle --local
$env:LITELLM_API_KEY='sk-test'; npx waggle --local # against local mock LiteLLM-compatible /v1/chat/completions stream
npm run build --workspace @waggle/marketplace
npm pack --workspace @waggle/marketplace --pack-destination <temp> --json
npm install <packed @waggle/marketplace tarball> --no-audit --no-fund --prefer-offline
npx waggle-market --help
npx waggle-market definitely-not-a-command
npm run build --workspace waggle-memory-mcp
npm run build --workspace @waggle/hive-mind-mcp-server
npm install <local @waggle/hive-mind-mcp-server package-closure tarballs> --no-audit --no-fund --prefer-offline
node <installed @waggle/hive-mind-mcp-server>/dist/index.js
npm run build --workspace @waggle/hive-mind-cli
npm install <local @waggle/hive-mind-* package-closure tarballs> --no-audit --no-fund --prefer-offline
npx hive-mind-cli status --help
npx tsx packages/launcher/src/cli.ts --help
node packages/launcher/dist/cli.js --help
npx tsx packages/launcher/src/cli.ts --port abc
node packages/launcher/dist/cli.js --port abc
node packages/launcher/dist/cli.js --port <occupied-port> --skip-litellm --no-open
npm pack --workspace @waggle-ai/waggle --pack-destination <temp> --json
npx tsx packages/cli/src/index.ts --help
node packages/cli/dist/index.js --help
npx tsx packages/hive-mind-cli/src/index.ts --help
node packages/hive-mind-cli/dist/index.js --help
npx tsx packages/hive-mind-cli/src/index.ts init --help
npx tsx packages/hive-mind-cli/src/index.ts status --help
npx tsx packages/marketplace/src/cli.ts --help
npx tsx packages/marketplace/src/cli.ts definitely-not-a-command
node packages/marketplace/dist/cli.js --help
node packages/marketplace/dist/cli.js definitely-not-a-command
npm pack --workspace @waggle/marketplace --dry-run --json
npx tsx packages/marketplace/src/cli.ts definitely-not-a-command
node --input-type=module -e "<MCP Client protocol smoke for built memory MCP and hive-mind MCP entries>"
```

Notes:

- Commands that needed user-home state were redirected to `output/t15-*` data directories where practical.
- Launcher occupied-port runtime evidence used a temporary `WAGGLE_DATA_DIR` and a test-owned `127.0.0.1` port blocker.
- Builds generated package `dist` artifacts; this supplement does not treat generated build output as product code edits.

## Command Results

| Check | Result | UX meaning |
|---|---:|---|
| Admin-web package/root Vitest | Pass, 1 file / 42 tests | Admin pages render in happy-path and auth-failure test cases; the admin shell now has package-local test ownership, hash deep links, active-nav semantics, labelled critical fields, responsive CSS coverage, wrong-token guidance, and no React `act(...)` warning noise in the focused run. The remaining warning is Node's `punycode` dependency deprecation. |
| Launcher targeted Vitest | Pass, 1 file / 22 tests | The real parser/core helpers, package metadata, built-help no-service-side-effect behavior, invalid-port validation before service setup, occupied-port recovery copy, `--no-open` success copy, packed tarball first-command help path, clean installed packed-launcher `npx` help plus occupied-port startup recovery, and clean installed long-running startup through `/health` are covered. |
| `@waggle/cli` package test script | Pass, 8 files / 57 tests | Package-local script now uses the root Vitest runner/config and covers command parsing, admin helper formatting, renderer, auth, mode detection, memory persistence, comprehensive E2E, built-help runtime behavior, packed tarball bin-help behavior, clean local package-closure install followed by `npx waggle --help`, clean local package-closure install followed by `npx waggle --local` REPL startup, slash-command interaction, and exit, and a clean local package-closure installed streamed chat turn through a mock LiteLLM-compatible endpoint. |
| `@waggle/cli` root-directed tests | Pass, 8 files / 57 tests | The same explicit root-directed slice passes, including built-help, packed-bin-help, local package-closure install/`npx` help, installed local REPL startup/slash-command/exit regressions, and installed streamed chat/provider plumbing against a mock LiteLLM-compatible `/v1/chat/completions` endpoint. |
| Memory MCP package test script | Pass, 3 files / 20 tests | Package-local script now uses the root Vitest runner/config and covers scope gating, erase safety, built read-only MCP handshake, built write-scope save/recall roundtrip, and clean local package-closure install followed by MCP tool listing from the installed server. |
| Memory MCP root-directed tests | Pass, 3 files / 20 tests | Scope gating, erase safety, built read/write MCP behavior, and installed package-closure read-only server startup pass from the root command shape. |
| Hive-mind MCP package test script | Pass, 2 files / 15 tests | Package-local script now covers registration/scope, a built write-scope save/recall roundtrip, and clean local package-closure install followed by MCP tool listing from the installed server. |
| Hive-mind MCP root-directed tests | Pass, 2 files / 15 tests | Registration, scope gating, built write-scope behavior, and installed package-closure read-only server startup pass from the root command shape. |
| Hive-mind CLI package-local tests | Pass, 5 files / 46 tests | `npm run test --workspace @waggle/hive-mind-cli -- --reporter=dot` now discovers the colocated `src` tests plus runtime help tests, including local package-closure install followed by `npx hive-mind-cli status --help`. Expected mock-embedding warning banners remain noisy but non-failing. |
| Marketplace targeted tests | Pass, 4 files / 77 tests | Categories, MCP registry, Cisco scanner behavior, source invalid-command behavior, built help behavior, package manifest/packed-file alignment, and clean installed packed-CLI `npx waggle-market` help/invalid-command behavior pass in the targeted slice. |
| No-emit TypeScript | Pass | `admin-web`, `cli`, `marketplace`, `memory-mcp`, `hive-mind-mcp-server`, and `hive-mind-cli` typecheck with no output. |
| Package builds | Pass | Admin web, launcher, CLI, marketplace, memory MCP, hive-mind MCP, and hive-mind CLI build scripts completed. |
| Admin-web rendered package smoke | Pass, 14 tests | `npm run test:rendered --workspace @waggle/admin-web` builds the package and runs Playwright against the built preview. It covers all seven admin pages at 1200 x 800 and 390 x 844 with typed authenticated mock API data, real local bearer-auth middleware wrong-token/valid-token behavior through protected Fastify routes, hash URL state, `aria-current`, document scroll width, overflow outside labelled table scroll regions, labelled controls, console warning/error/pageerror collection, mobile keyboard navigation through the shell, page-level keyboard traversal from connection fields into dashboard, members, capabilities, jobs, audit, and settings controls/table regions, browser back/forward hash traversal, full-page visual snapshots for all seven pages on desktop and mobile, capability governance edit/add/decision forms, malformed analytics data recovery without blanking the shell, all-page initial API-failure recovery with accessible alerts and usable shell navigation, and rendered mutation/destructive-failure recovery for capability policy save, capability override create/remove, capability request decision, member invite, member role change, member removal, and team settings save. Command output has a Node `NO_COLOR` env warning; app console collection is clean. |
| Source help smokes | Pass | `launcher`, `@waggle/cli`, `hive-mind-cli`, and `marketplace` source help paths are readable through `tsx`. |
| Built launcher help/error/package paths | Pass | Source and built help exit 0, print usage, do not create `.waggle`, and no longer print the `[waggle:service] Data dir: ...` banner before help. Source and built invalid-port paths exit 1 before service setup, print focused guidance, and do not create `.waggle`; the built occupied-port path exits 1 and prints `npx waggle --port <next-port>` recovery copy. The packed tarball contains `dist/cli.js`, exposes `bin.waggle`, and the extracted first-command help path runs without service setup or user-home mutation. A clean temp project can install the packed launcher and run `npx waggle --help`, installed occupied-port startup recovery with no `.waggle` home mutation, and installed long-running startup that serves `/health`, prints `--no-open` manual-open copy, and creates the configured data dir. |
| Built `@waggle/cli` help/package path | Pass | `node packages/cli/dist/index.js --help` and `node packages/cli/bin/waggle.js --help` exit 0, print usage, and do not create `.waggle` in a clean temp home. The packed tarball contains `bin/waggle.js`; extracted packed-bin help exits 0, prints usage, and does not create `.waggle`. A clean temp project can install the local `@waggle/shared`, `@waggle/hive-mind-core`, `@waggle/core`, `@waggle/marketplace`, `@waggle/agent`, `@waggle/weaver`, and `@waggle/cli` tarball closure, run `npx waggle --help` without `.waggle` mutation, then run `npx waggle --local`, see the local REPL banner/prompt, run `/help`, `/mode`, `/whoami`, `/models`, `/cost`, and `/clear`, create `~/.waggle/default.mind`, and exit via `/exit`. A second clean temp project can install the same local package closure, configure `~/.waggle/config.json` plus `.waggle/workspace.json`, run `npx waggle --local` against a local mock LiteLLM-compatible streaming endpoint, send a user chat message, receive streamed assistant text plus usage metadata, and verify the outbound `Authorization`, `model`, `stream`, `stream_options`, and message payload. The installed REPL proof caught and fixed `@waggle/agent` package metadata pointing at source, missing `exceljs`/`@waggle/shared`/`@waggle/marketplace` runtime declarations, and a test harness native-install issue for `better-sqlite3`. |
| Built marketplace help | Pass | `node packages/marketplace/dist/cli.js --help` exits 0, prints usage, and does not create `~/.waggle/marketplace.db` in a clean temp home. A clean temp project can install the packed marketplace tarball and run `npx waggle-market --help` without DB side effects. |
| Hive-mind CLI subcommand help | Pass | Source `init --help`, built `status --help`, and local package-closure installed `npx hive-mind-cli status --help` exit 0, print focused command help, and do not create `personal.mind` in a clean temp data dir. The installed proof caught and fixed a missing `@waggle/shared` runtime dependency declaration in `@waggle/hive-mind-core`. |
| Marketplace invalid command | Pass | Source, built, and clean installed packed-CLI invalid-command smokes print `Unknown command`, show help, exit 1, and do not create `~/.waggle/marketplace.db` in a clean temp home. |
| Built legacy memory MCP protocol smoke | Pass, read/write + installed read-only | Official MCP client connects to `packages/memory-mcp/dist/index.js`, verifies read-only tool gating, and in write scope saves then recalls a unique memory from a temp `WAGGLE_DATA_DIR` with mock embeddings. A clean temp project can also install the local `@waggle/shared`, `@waggle/hive-mind-core`, `@waggle/core`, `@waggle/wiki-compiler`, and `waggle-memory-mcp` tarball closure, launch the installed server entry, and list read-only tools. The installed proof caught and fixed a missing `glob` runtime dependency declaration in `@waggle/core`. |
| Built hive-mind MCP protocol smoke | Pass, read/write + installed read-only | Official MCP client connects to `packages/hive-mind-mcp-server/dist/index.js`, verifies the registered surface, and in write scope saves then recalls a unique memory from a temp `HIVE_MIND_DATA_DIR` with mock embeddings. A clean temp project can also install the local `@waggle/shared`, `@waggle/hive-mind-core`, `@waggle/hive-mind-wiki-compiler`, and `@waggle/hive-mind-mcp-server` tarball closure, launch the installed server entry, and list read-only tools. |

## MCP Protocol Smoke Detail

The smoke used `@modelcontextprotocol/sdk/client/index.js` and `@modelcontextprotocol/sdk/client/stdio.js`, not hand-written framing.

Legacy Waggle memory MCP result:

```json
{
  "name": "waggle-memory-mcp",
  "tools": 9,
  "sampleTools": [
    "recall_memory",
    "search_entities",
    "get_identity",
    "get_awareness",
    "list_workspaces"
  ],
  "withheldTools": [
    "save_memory"
  ],
  "writeRoundtrip": "save_memory -> recall_memory returned the unique saved text"
}
```

Hive Mind MCP result:

```json
{
  "name": "hive-mind-mcp-server",
  "server": { "name": "hive-mind-memory", "version": "0.1.0" },
  "tools": 9,
  "resources": 4,
  "sampleTools": [
    "recall_memory",
    "search_entities",
    "get_identity",
    "get_awareness",
    "list_workspaces",
    "harvest_sources"
  ],
  "sampleResources": [
    "memory://personal/stats",
    "memory://identity",
    "memory://awareness",
    "memory://workspace/{id}"
  ],
  "writeRoundtrip": "save_memory -> recall_memory returned the unique saved text"
}
```

Both MCP stderr streams clearly warn when mock embeddings are active. That is acceptable for the audit lane because the commands explicitly set the provider to mock.

## What Is Proven Now

- Admin web compiles, builds, and renders tested happy paths.
- Admin web now has a package-local test command; the focused run passes 42 tests with no React `act(...)` warnings.
- Admin web now has a package-local rendered Playwright gate; the run passes 14 tests across all seven pages at desktop and 390px mobile widths, including visual regression snapshots, page-level keyboard traversal, browser back/forward hash traversal, malformed analytics response recovery, all-page initial API-failure recovery, mutation/destructive-failure recovery for policy save, override create/remove, request decision, member invite, member role change, member removal, and team settings save, plus real local bearer-auth middleware wrong-token/valid-token behavior.
- Admin web now distinguishes rejected auth from server-down failures and renders real server-injected team/member/task data after a valid token in the package-local rendered gate. Live deployed/Clerk/JWT team-server auth remains outside this local utility gate and belongs to launch/deploy evidence.
- Admin web rendered with typed mock API data under the in-app Browser with no current-port console errors; original full-page screenshots and probes are saved under `output/playwright/admin-web-t15-57795/`.
- Admin web rendered package smoke now proves shell-level 390px mobile layout, hash deep-link navigation, `aria-current` active state, all-page table scroll containment, rendered control labels, capability governance form labels, mobile shell keyboard reachability, and page-level keyboard traversal from connection fields into the covered admin pages on the built preview.
- Launcher source and built help are callable.
- Launcher package-local test command now passes 22 tests and guards the real parser/core helpers, built-help no-service-side-effect path, invalid-port validation before service setup, occupied-port recovery copy, `--no-open` success copy, packed tarball first-command help path, clean installed packed-launcher `npx` help plus occupied-port startup recovery, and clean installed long-running startup through `/health`.
- `@waggle/cli` source help, built help, bin-wrapper help, packed tarball bin help, local package-closure install/`npx` help, local package-closure installed REPL startup/slash-command/exit, local package-closure installed streamed chat via mock LiteLLM-compatible endpoint, package-local tests, and direct root tests pass.
- Marketplace source help, source invalid-command, built help, built invalid-command, clean installed packed-CLI help, and clean installed packed-CLI invalid-command paths are callable with no marketplace DB side effects.
- Hive-mind CLI root help, built root help, sampled source subcommand help, sampled built subcommand help, and local package-closure installed `npx` subcommand help are callable with no data-dir mutation.
- Hive-mind CLI package-local tests now run through a documented package command and guard the installed local package closure. The installed proof found and fixed the missing `@waggle/shared` dependency in `@waggle/hive-mind-core`.
- Legacy memory MCP package-local tests now run through a documented package command; the built server completes real read-only and write-scope MCP handshakes; and a clean local package-closure install can launch the installed server and list read-only tools. The installed proof found and fixed the missing `glob` runtime dependency declaration in `@waggle/core`.
- Hive-mind MCP package-local tests now run through a documented package command, and the built server completes real read-only/registration and write-scope MCP handshakes. The package lane also proves clean local package-closure install and read-only MCP startup from the installed server.
- TypeScript no-emit checks pass for every inspected package that has a `tsconfig.json`.
- Package build scripts complete for every inspected package.

## Still Not Proven

- Admin web exhaustive keyboard/focus traversal inside every hidden or future state remains incomplete; current rendered evidence proves shell keyboard reachability, page-level traversal, and form-label/overflow contracts.
- Launcher browser-open fallback as an integration path, and service crash/failure copy beyond occupied-port startup failure. Clean installed packed-launcher help, occupied-port startup recovery, and long-running `/health` startup are now proven.
- `@waggle/cli` registry-only install remains dependent on publishing the internal `@waggle/*` package closure. Installed package-closure non-help startup, common no-provider slash commands, clean exit, and streamed chat/provider plumbing against a mock LiteLLM-compatible endpoint are now proven; live external-provider proof remains launch-environment dependent.
- Marketplace install/search flows against a real populated marketplace database. Clean installed packed-CLI help and invalid-command recovery are now proven.
- Every hive-mind CLI subcommand help variant beyond the sampled `init` and `status` paths, and registry-only install after publishing the local `@waggle/hive-mind-*` package closure.
- Marketplace CLI missing-db and missing-config error semantics beyond the now-guarded invalid-command path.
- Registry-only behavior for legacy `waggle-memory-mcp`, `@waggle/cli`, and hive-mind packages after the internal package closures are published.
- Legacy `waggle-memory-mcp` installed write-scope behavior remains unproven; current installed evidence is read-only list-tools.

## Line-Level Findings

| ID | Finding | Evidence | Correction |
|---|---|---|---|
| T15-1 | Built, packed, and locally installed `@waggle/cli` help is now lazy enough to avoid the REPL dependency graph, and the installed local REPL starts cleanly from a package closure. | `packages/cli/src/index.ts` handles help before dynamically importing `./repl.js`; `cli-runtime.test.ts` proves built help exits 0 without creating `.waggle`; clean-home smokes also pass for `dist/index.js --help`, `bin/waggle.js --help`, extracted packed-tarball `bin/waggle.js --help`, a clean temp project that installs the local `@waggle/*` package-closure tarballs before running `npx waggle --help`, and a real-script install followed by `npx waggle --local` startup, local banner/prompt rendering, `/help`, `/mode`, `/whoami`, `/models`, `/cost`, `/clear`, `/exit`, and `~/.waggle/default.mind` creation. A second real-script install configures a mock LiteLLM-compatible endpoint, sends a chat message through the installed REPL, and asserts streamed assistant text, usage metadata, auth, model, stream flags, and message payload. `packages/agent/package.json` and `packages/weaver/package.json` now expose built `dist` entries; `@waggle/agent` declares the runtime dependencies the installed REPL loads. | Focused fixed locally for built, packed, package-closure-installed help, package-closure-installed local REPL startup/slash-command/exit, and package-closure-installed streamed chat/provider plumbing; full closure still needs registry-only proof after internal packages are published. |
| T15-2 | Built legacy `waggle-memory-mcp` now completes read-only and write-scope MCP handshakes, and both legacy memory MCP and hive-mind MCP now have installed package-closure proof. | `packages/core/package.json` and `packages/wiki-compiler/package.json` now expose their built `dist` entries; `packages/core/package.json` declares the runtime `glob` dependency used by `file-store`; `packages/memory-mcp/tests/runtime.test.ts` builds core/wiki/memory-mcp, launches `packages/memory-mcp/dist/index.js` through the official MCP SDK, sees read-only tools, confirms `save_memory` is withheld in read scope, then saves and recalls a unique memory in write scope. It also installs the local `@waggle/shared`, `@waggle/hive-mind-core`, `@waggle/core`, `@waggle/wiki-compiler`, and `waggle-memory-mcp` package closure, launches the installed server, and lists read-only tools. `packages/hive-mind-mcp-server/tests/runtime.test.ts` additionally installs the local hive-mind package closure and lists tools from the installed server. | Focused fixed locally for built/installed legacy MCP and built/installed hive-mind MCP; registry-only proof still depends on publishing the internal package closures. |
| T15-3 | Built marketplace CLI was not runnable under Node ESM after `tsc`, and the publish manifest pointed at unpublished source files. | Current `packages/marketplace/tsconfig.json` uses NodeNext resolution; marketplace source imports use emitted `.js` specifiers; `node packages/marketplace/dist/cli.js --help` exits 0 with no DB side effect; `packages/marketplace/package.json` now points `main`, `types`, and `exports` at emitted `dist` files; `cli-runtime.test.ts` guards built help, `npm pack --dry-run --json` file/manifest alignment, and clean installed packed-CLI `npx waggle-market` help/invalid-command behavior without DB creation. | Focused fixed locally for help, invalid-command, manifest, and installed-bin first commands; full closure still needs install/search flows against a real populated marketplace database. |
| T15-4 | Package-local test scripts and root discovery do not consistently run the tests that exist. | `@waggle/cli`, launcher, `hive-mind-cli`, and `waggle-memory-mcp` package scripts are now fixed through root-owned or package-local Vitest lanes. Other packages outside T15 still have package-local command-shape gaps tracked under T17. | Keep the T15 package commands in the verification lane and address broader package-local script drift under T17. |
| T15-5 | Admin web now has package-local unit and rendered test ownership, and the focused test lanes are no longer noisy. | `packages/admin-web/package.json` defines `npm run test --workspace @waggle/admin-web` and `npm run test:rendered --workspace @waggle/admin-web`; `packages/admin-web/tests/admin-pages.test.ts` passes 42 tests without React `act(...)` warnings, and `packages/admin-web/tests/admin-rendered.spec.ts` passes 14 built-preview Playwright tests including real local bearer-auth middleware wrong-token/valid-token behavior. Members native confirm was already replaced with in-app confirmation. | Focused fixed locally; remaining T15 closure is registry-only proof after internal package publication. |
| T15-6 | Hive-mind CLI README promises per-command help, and the sampled subcommand help paths are now side-effect free. | `packages/hive-mind-cli/src/index.ts` handles root and subcommand `--help` before dispatch; `cli-help.test.ts` guards source `init --help`, built `status --help`, and local package-closure installed `npx hive-mind-cli status --help` so none creates `personal.mind`. The installed RED test exposed `@waggle/hive-mind-core` importing `@waggle/shared` without declaring it; `packages/hive-mind-core/package.json` now declares the runtime dependency. | Focused fixed locally for sampled help and local package-closure install; broader closure still needs registry-only proof after publishing the internal packages and optional sampling across every subcommand help page. |
| T15-7 | Marketplace invalid command exited successfully and help/default construction opened the DB before validation. | Current `packages/marketplace/src/cli.ts` handles help and unknown commands before `MarketplaceDB` construction; source and built invalid-command smokes exit 1, print help, and leave a clean temp home without `marketplace.db`; `cli-runtime.test.ts` guards this behavior. | Focused fixed locally. |
| T15-8 | Launcher help, common startup-error UX, and packed/installed first-command behavior are now owned by the package test lane. | `packages/launcher/src/cli-core.ts` owns the real parser and startup copy, and `packages/launcher/src/cli.ts` imports the server lazily after help and validation. `packages/launcher/tests/cli.test.ts` passes 22 tests covering built help without service banners or `.waggle` creation, invalid ports exiting 1 before service setup, occupied ports producing `npx waggle --port <next-port>` recovery copy, `--no-open` success copy, `npm pack` tarball extraction followed by packed `dist/cli.js --help`, clean installed packed-launcher `npx` help plus occupied-port startup recovery without `.waggle` home mutation, and clean installed long-running startup that serves `/health`, prints manual-open copy, and creates the configured data dir. Source and built invalid-port smokes also exit 1 with focused guidance. | Focused fixed locally for help, invalid port, occupied port, `--no-open` copy, packed first-command help, installed-bin occupied-port recovery, and installed long-running startup; remaining closure needs browser-open fallback integration and service crash/failure copy beyond occupied-port startup failure. |
| T15-9 | Legacy `waggle-memory-mcp` README is stale relative to startup behavior. | `packages/memory-mcp/README.md` advertises zero-config ONNX auto-download; `packages/memory-mcp/src/core/setup.ts` now falls back to mock unless a provider is configured. | Update README/setup copy so users understand mock vs semantic search behavior, or align implementation with the documented zero-config path. |
| T15-10 | Hive-mind MCP README tool names do not match the current registered surface. | `packages/hive-mind-mcp-server/README.md` lists tools such as `add_relation`, `get_entity`, `switch_workspace`, `harvest_conversations`, `compact_memory`, and `cleanup_deprecated`; integration tests and MCP smoke show registered names such as `create_relation`, `save_entity`, `list_workspaces`, `create_workspace`, `harvest_import`, `cleanup_frames`, and `cleanup_entities`. | Regenerate the README tool table from registration tests or update it manually with a doc test. |
| T15-11 | Admin web shell and dense tables are no longer functionally unusable on 390px mobile viewports. | `packages/admin-web/src/admin.css` collapses the fixed sidebar into a full-width top section at `@media (max-width: 720px)` and adds labelled `.admin-table-scroll` regions. Rendered package smoke at 390 x 844 covers all seven pages, checks document scroll width, and allows overflow only inside labelled table scroll regions. | Focused fixed for shell/mobile chrome and dense table containment. |
| T15-12 | Admin web pages are addressable by hash, active navigation is semantic, and browser history traversal stays aligned. | `packages/admin-web/src/App.tsx` initializes from `window.location.hash`, listens to `hashchange`, writes hashes on nav clicks, and sets `aria-current="page"` on the active nav item. Unit coverage proves `#members` initialization and click-to-`#capabilities`; rendered package smoke proves hash URL and active `aria-current` across all seven pages at desktop/mobile widths, then goes Dashboard -> Members -> Capabilities -> back -> back -> forward -> forward and verifies URL, heading, and active nav at each step. | Focused fixed locally. |
| T15-13 | Rendered admin controls now have accessible labels and browser metadata in the covered states. | Unit coverage proves Team Slug/Auth Token labels plus `name`/`autocomplete`, invite email/role labels, member role labels, Team Name label/metadata, and wrong-token guidance. Rendered package smoke scans all visible `input`, `select`, and `textarea` controls across seven pages plus capability policy edit, override add, request decision forms, and the real-auth connection state. | Focused fixed for rendered happy-path, governance form, and real-auth connection states; any future hidden-form states still need coverage when introduced. |
| T15-14 | Admin analytics no longer blanks the shell on malformed successful responses, initial API failure is announced accessibly across pages, key admin mutations recover cleanly when rejected, and wrong-token auth failures show specific guidance. | The RED malformed-data rendered test reproduced missing recovery UI for `{ tokenUsage: ... }` analytics data. `Analytics.tsx` now validates the runtime response shape before rendering cards, clears stale data on load/error, and exposes incomplete-data recovery as `role="alert"`. A second RED rendered test reproduced missing accessible alerts during all-page API failure; Dashboard, Members, Jobs, Audit, Team Settings, and all Capabilities tabs now expose their existing error banners as `role="alert"`. New RED/GREEN rendered mutation tests cover capability policy save, capability override create/remove, capability request decision, member invite, member role change, member removal, and team settings save failures; the covered forms disable or announce the active action while pending, preserve the user's context after rejection, expose the rejection through `role="alert"`, and keep the shell usable. The real-auth rendered test routes built admin API calls through the real local `securityMiddleware`, proves a wrong token announces `Authentication failed`, then proves a valid token renders real server-injected team/member/task data. The GREEN rendered run passes 14/14 and includes page-level keyboard traversal plus full-page visual snapshots for each covered desktop/mobile admin page. | Focused fixed for malformed analytics data, initial page-load API failure, covered mutation/destructive failures, current page-level keyboard traversal, package-local visual regression, and local bearer-auth behavior. |

## T15 Acceptance

T15 remains open until either:

1. Admin/CLI/MCP utility surfaces are explicitly deferred from the five-persona score, or
2. Evidence proves all of the following:

- Admin-web rendered gate remains green with local bearer-auth evidence.
- `@waggle/cli`, launcher, marketplace CLI, memory MCP, hive-mind MCP, and hive-mind CLI built entries can run their published first commands from a clean environment. Current `@waggle/cli`, legacy memory MCP, hive-mind MCP, and `hive-mind-cli` evidence covers local package closures, including `@waggle/cli` installed local REPL startup/slash-command/exit and streamed chat/provider plumbing; launcher and marketplace evidence covers clean installed packed tarballs; registry-only proof for internal package closures depends on publishing those packages.
- Utility help and invalid-input paths do not mutate user data or exit 0 on errors.
- Package-local and root test commands either pass or have documented, passing alternatives.
- MCP servers have at least one protocol-level smoke for read-only and write-capable scopes.
- README/setup docs match actual command names, provider behavior, and data-dir behavior.

## Phase Impact

This does not change Phase 1. T15 remains a Phase 2/Launch final-product gate after in-app P0 blockers are cleared, unless the user explicitly asks to include admin/CLI/MCP utility work in Phase 1.
