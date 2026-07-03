<!--
Thanks for contributing to Waggle OS! Please read docs/CONTRIBUTING.md and the
root CLAUDE.md before opening a PR. Keep each PR to one focused change.
-->

## What & why

<!-- What does this change do, and why is it needed? Link any related issue. -->

Closes #

## Type of change

- [ ] `feat` — new feature
- [ ] `fix` — bug fix
- [ ] `refactor` — code restructuring (no behavior change)
- [ ] `test` — tests only
- [ ] `docs` — documentation only
- [ ] `chore` / `perf` / `ci`

## How it was tested

<!-- Commands you ran and what you observed. Bug fixes should add a regression test. -->

- [ ] `npm run test` (Vitest) passes
- [ ] `npx tsc --noEmit` passes for the package(s) I touched
- [ ] `npm run lint` passes

## Checklist

- [ ] The change is scoped to one concern (no unrelated edits or reformatting).
- [ ] New behavior has accompanying tests; bug fixes have a regression test.
- [ ] No secrets, API keys, or credentials are committed.
- [ ] Docs updated if behavior, commands, or configuration changed.
- [ ] If this touches the memory substrate (`packages/hive-mind-core`), I read
      CLAUDE.md §7.5 (the monorepo is the source of truth; do not author
      substrate features directly on the OSS mirror).
