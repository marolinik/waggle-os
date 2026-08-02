# Contributing to `@waggle/hive-mind-core`

This package is the canonical source for the Waggle OS memory substrate and the maintainer-curated Apache-2.0 OSS distribution. Contributions are welcome, but this monorepo package is private because its tree also contains Waggle-only material that must not be published directly.

## How the package is distributed

`@waggle/hive-mind-core` lives in the `marolinik/waggle-os` monorepo at `packages/hive-mind-core/`. The public `github.com/marolinik/hive-mind` layout is produced by a maintainer-curated forward-port: adapt package layout/imports, remove excluded files and interleaved schema logic, review the diff, then publish from the OSS checkout. A raw subtree split is never a publish source.

If you're reading this on **github.com/marolinik/hive-mind** (the OSS mirror): file issues + PRs against that repo. A maintainer must intentionally port accepted changes back into `marolinik/waggle-os` before the next curated forward-port.

If you're reading this on **github.com/marolinik/waggle-os** (the canonical monorepo): file issues + PRs directly here. Public-surface changes ship only through the next curated forward-port.

The curated export excludes `src/mind/evolution-runs.ts`, `execution-traces.ts`, and `improvement-signals.ts`, plus the interleaved `install_audit` DDL/migration inside `src/mind/schema.ts` and `db.ts`. Vault and compliance code remains in `@waggle/core` and is outside this package. A file filter alone cannot enforce the interleaved exclusion.

## Direction of development (maintainers — ratified 2026-06-11)

**The monorepo is the sole source of truth. Maintainers must not author features directly on the OSS mirror.** This invariant broke once: the cross-encoder reranker was written directly on `marolinik/hive-mind` during a benchmark arc and existed only there until a recon pass found it and reverse-ported it (waggle-os `f47ee8f`). The rules that prevent a repeat:

1. Substrate changes are authored in `waggle-os/packages/hive-mind-core/` first; the mirror is updated by a reviewed, maintainer-curated forward-port. `scripts/oss-subtree-split.sh` is inspection-only and its raw branches must never be pushed.
2. Work done in a scratch `hive-mind` checkout (benchmarks, experiments) must be reverse-ported into the monorepo in the same work arc — never left to accumulate on the mirror.
3. Run `scripts/oss-drift-check.sh` before every OSS release push and after any arc that touched a hive-mind checkout. It file-diffs the mapped source trees and flags ONLY-IN-OSS files (the reverse-port failure mode), ONLY-IN-MONO files (pending export), and divergent edits.
4. External contributor PRs against the OSS repo are welcome (see above) — the maintainer ports accepted changes back into the monorepo first, then prepares the next curated forward-port.

## Setting up the dev environment

```bash
# Clone the monorepo
git clone https://github.com/marolinik/waggle-os.git
cd waggle-os

# Install workspace deps (registers all packages including hive-mind-core)
npm install

# Build the substrate
cd packages/hive-mind-core
npx tsc --build

# Run hive-mind-core's tests in isolation
npx vitest run

# Run the full repo test suite
cd ../..
npm run test
```

Node.js >= 20 required. macOS and Linux work natively. Windows works with the postinstall override that `@waggle/hive-mind-cli` provides — see `packages/hive-mind-cli/docs/WINDOWS-QUIRKS.md`.

## Code style

- TypeScript strict mode (the monorepo `tsconfig.base.json` enables `strict: true`, `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`)
- ESM modules — `.js` extensions on all relative imports for runtime resolution after tsc emit
- No `any` in application code — use `unknown` + narrowing
- Public API methods + exported functions get explicit return types
- Internal class methods can rely on type inference

The repository uses ESLint at the workspace root — run `npm run lint` from the repo root.

## Pull request guidelines

1. **Fork** the canonical waggle-os repo (or work on a branch in your local clone if you have direct push access).
2. **Create a branch** named `feat/<short-description>` or `fix/<short-description>`.
3. **Test first** — for any non-trivial change, add or extend a test in `packages/hive-mind-core/tests/`. Existing tests are organized by substrate area (`tests/mind/`, `tests/harvest/`).
4. **Run the full suite** — `npm run test` from the repo root. Failing tests block the PR. (Some env-dependent tests are expected to fail without local Postgres + Redis — they're marked in the `marketplace` + `server` packages, not in `hive-mind-core`.)
5. **tsc must compile clean** — `npx tsc --build` from the package root.
6. **Open the PR** against `main` of waggle-os. Include in the PR body:
   - What changed + why
   - Test plan (which test files added/modified)
   - Whether the change affects the curated OSS surface (i.e., introduces new public exports, changes existing public types, or deprecates a surface)

Maintainer review aim: 2 business days for triage, additional time for substantial changes.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Be excellent to each other.

Report issues to `hello@egzakta.com` or by opening a private security advisory on the canonical repo.

## License

By contributing, you agree your contributions are licensed under Apache 2.0 (see `LICENSE`). Egzakta Group d.o.o. acts as steward for the OSS distribution.

## Quick links

- Canonical monorepo: https://github.com/marolinik/waggle-os
- OSS mirror: https://github.com/marolinik/hive-mind
- Issues: https://github.com/marolinik/waggle-os/issues
- Maintainer: Egzakta Group d.o.o. — `hello@egzakta.com`
