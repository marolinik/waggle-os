# Contributing to `@waggle/hive-mind-core`

This package is the canonical private-monorepo source for Waggle OS's memory
substrate and its maintainer-curated Apache-2.0 OSS distribution. Contributions
are welcome, but the private tree also contains Waggle-only material and must
never be published directly.

## Distribution and trust boundary

- Canonical source: private `marolinik/waggle-os`, under
  `packages/hive-mind-core/`.
- Public contribution surface: `github.com/marolinik/hive-mind`.
- Distribution mechanism: a reviewed, maintainer-curated forward-port that
  adapts layout/imports and removes every private exclusion.
- `scripts/oss-subtree-split.sh` produces local inspection refs only. Raw refs
  are never publication sources.

The public export excludes:

- `src/mind/evolution-runs.ts`
- `src/mind/execution-traces.ts`
- `src/mind/improvement-signals.ts`
- private vault/compliance surfaces outside this package
- interleaved `install_audit` DDL and migration logic inside
  `src/mind/{schema,db}.ts`

A file filter cannot enforce the interleaved exclusion.

## Direction of development

The private monorepo is the sole source of truth. Maintainers must not author
features only in the public mirror.

1. Author substrate changes in `waggle-os/packages/hive-mind-core/` first.
2. Reverse-port accepted public contributions into the private monorepo before
   the next curated export.
3. Run `scripts/oss-drift-check.sh` before every OSS release and after any arc
   that touched a Hive Mind checkout. It distinguishes `ONLY-IN-OSS`
   reverse-port candidates, intentional private-only exclusions,
   `FORWARD-PORT-CANDIDATE` files, divergent edits, forbidden whole-file leaks,
   and interleaved `install_audit` markers.
4. Treat any nonzero drift result as release-blocking until every item is
   classified and the curated diff is independently reviewed.

## Development setup

### External contributors

Use the public mirror; private Waggle OS access is neither required nor
expected.

```bash
git clone https://github.com/marolinik/hive-mind.git
cd hive-mind
npm install
npm run build
npm run test
npm run lint
```

Open branches, issues, and pull requests against `marolinik/hive-mind`.

### Maintainers with private access

```bash
git clone https://github.com/marolinik/waggle-os.git
cd waggle-os
npm install
npx tsc --build packages/hive-mind-core/tsconfig.json
npx vitest run packages/hive-mind-core/tests
```

After the canonical change lands, prepare a separate curated forward-port in a
clean public-mirror branch and review the complete export diff.

Node.js 20 or newer is required. Public contributors should use the public
mirror README and issues for current platform support. Maintainers working in
the private monorepo can additionally consult
`packages/hive-mind-cli/docs/WINDOWS-QUIRKS.md`.

## Code style

- TypeScript strict mode; avoid `any` in application code.
- ESM modules with `.js` extensions on relative imports where required by the
  emitted runtime.
- Explicit return types for exported functions and public API methods.
- Follow the repository-root ESLint configuration.

## Pull request checklist

1. Work in the repository you are authorized to access: external contributors
   use `marolinik/hive-mind`; maintainers use the private canonical monorepo.
2. Name branches `feat/<short-description>` or `fix/<short-description>`.
3. Add or extend tests for every non-trivial change.
4. Run that repository's build, tests, and lint before opening the PR.
5. In the PR body, explain the change, list verification, and state whether the
   curated OSS surface is affected.

Maintainers reverse-port accepted public changes into the canonical monorepo
before preparing the next curated export.

## Conduct, security, and license

This project follows the [Contributor Covenant Code of
Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).

Report security issues through a [private security advisory on the public Hive
Mind mirror](https://github.com/marolinik/hive-mind/security/advisories/new) or
email `hello@egzakta.com`. Do not open a public vulnerability issue.

Contributions to the public mirror are licensed under Apache-2.0. Copyright and
notice terms are defined solely by `LICENSE`.
