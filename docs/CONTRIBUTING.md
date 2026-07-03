# Contributing to Waggle

## Prerequisites

- **Node.js 20+** (required)
- **Rust toolchain** (only for the desktop app -- `app/` package)
- **Docker** (only for team mode tests -- PostgreSQL and Redis)

## Setup

```bash
git clone https://github.com/marolinik/waggle-os.git
cd waggle-os
npm install
```

## Running the App

```bash
# Local server / sidecar (http://localhost:3333)
cd packages/server && npx tsx src/local/start.ts
# — or, from the repo root: npm run dev:server

# Web app (http://localhost:8080)
npm run dev          # — or: npm run dev:web

# Desktop app (requires Rust)
cd app && npm run tauri dev

# CLI REPL
cd packages/cli && npx tsx src/index.ts
```

## Running Tests

Tests are the product's safety net. All PRs must pass the full test suite.

```bash
# Run all tests (3000+ across 190+ files)
npx vitest run

# Watch mode during development
npx vitest

# Run tests for a specific package
npx vitest run packages/core

# Run a specific test file
npx vitest run packages/agent/src/__tests__/tools.test.ts

# Coverage report
npx vitest run --coverage
```

### Test Requirements

- All existing tests must pass before submitting a PR
- New features require accompanying tests
- Bug fixes require a regression test
- Team mode tests require Docker services running (`docker compose up -d`)

### Test Organization

Tests live alongside source files in `__tests__/` directories or as `.test.ts` siblings. The monorepo uses a single Vitest config at the root.

## Pull Request Process

1. **Fork** the repository and create a feature branch from `main`
2. **Read the CLAUDE.md** for execution rules and product truths
3. **Make your changes** following the slice-based approach (one focused change per PR)
4. **Write tests** for new functionality
5. **Run the full test suite**: `npx vitest run`
6. **Verify the build**: `npx tsc --noEmit`
7. **Submit a pull request** against `main`
8. **Describe your changes**: what was added, what was preserved, what was tested

### PR Title Format

Use descriptive titles that indicate the type of change:

- `feat: add Notion connector` -- new feature
- `fix: memory search scope filtering` -- bug fix
- `refactor: extract FrameStore from MindDB` -- code restructuring
- `test: add coverage for approval gates` -- test additions
- `docs: update API reference` -- documentation

## Code Style

### TypeScript

- ESM modules (`"type": "module"` in package.json)
- Explicit imports (no barrel re-exports)
- Strict TypeScript (`strict: true`)
- Use `type` imports where possible: `import type { Foo } from './foo.js'`
- Include `.js` extensions in imports (ESM requirement)

### File Organization

- One concept per file where practical
- Co-locate tests: `foo.ts` and `__tests__/foo.test.ts`
- Route files export a Fastify plugin async function
- Types go in the `@waggle/shared` package if used across packages

### Naming Conventions

- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Route handlers: descriptive comments with HTTP method and path

### Error Handling

- Route handlers catch errors and return appropriate HTTP status codes
- Non-critical operations use try/catch with empty catch (logging is acceptable)
- Critical operations throw with descriptive error messages
- Avoid swallowing errors silently in core logic

## Package Structure

### Adding to an Existing Package

1. Add your source file in the appropriate directory
2. Export from the package's `index.ts` if it's a public API
3. Add tests in the `__tests__/` directory
4. Run `npx vitest run packages/<name>` to verify

### Key Directories

```
packages/<name>/
  src/
    index.ts          # Public exports
    __tests__/        # Test files
  package.json        # Package metadata
  tsconfig.json       # TypeScript config
```

## Product Rules

Read `CLAUDE.md` in the repo root for the full execution protocol. Key rules:

- **Waggle is workspace-native** -- do not collapse into a global chat
- **Memory is a product primitive** -- do not treat it as decorative
- **Tool transparency matters** -- users see what the agent does
- **Approval gates are required** for sensitive operations
- **No scope reduction without approval** -- do not simplify features "for now"
- **Tests are part of the product** -- not an afterthought

## Troubleshooting

### Windows: sidecar fails to start with an esbuild platform error

The Fastify sidecar runs through `tsx`, which uses esbuild. On a clean Windows
machine the platform-specific esbuild binary is sometimes not resolved, and
`npm run dev:server` (or `npx tsx src/local/start.ts`) fails with an error like
`Cannot find module @esbuild/win32-x64` or an esbuild version/host mismatch.

Fix it by installing the matching Windows esbuild binary without adding it to
`package.json`:

```bash
npm i @esbuild/win32-x64@0.28.0 --no-save
```

This affects **Windows only** — macOS and Linux resolve their esbuild binaries
normally. The version should match the esbuild your install resolved; `0.28.0`
is the known-good pin for the sidecar.

## Questions?

Open an issue for architecture questions, feature proposals, or bug reports.
