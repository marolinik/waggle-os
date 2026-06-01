/**
 * Test suites that hard-require live infra — PostgreSQL on host port 5434 +
 * Redis on 6381 (the docker-compose-provisioned services). Without them they
 * fail deterministically (ECONNREFUSED / `beforeAll(buildServer)` timeouts),
 * NOT flakily — see docs/audits/2026-06-01-full-repo-verification-sweep.md.
 *
 * The default `npm test` gate EXCLUDES these (vitest.config.ts) so it runs
 * green on a box without Docker, including bare CI. `npm run test:infra` runs
 * ONLY these — locally (or a future Docker-provisioned CI lane) after
 * `docker-compose up -d postgres redis` + a schema migration.
 *
 * Canonical list captured from a no-Docker full run on 2026-06-01 (19 files).
 * When adding a new infra-dependent suite, add its path here.
 */
export const INFRA_TEST_SUITES = [
  'packages/server/tests/audit.test.ts',
  'packages/server/tests/auth.test.ts',
  'packages/server/tests/cron.test.ts',
  'packages/server/tests/proactive.test.ts',
  'packages/server/tests/server.test.ts',
  'packages/server/tests/daemons/hive-mind.test.ts',
  'packages/server/tests/daemons/scout.test.ts',
  'packages/server/tests/daemons/subconscious.test.ts',
  'packages/server/tests/db/schema.test.ts',
  'packages/server/tests/routes/agents.test.ts',
  'packages/server/tests/routes/analytics.test.ts',
  'packages/server/tests/routes/knowledge.test.ts',
  'packages/server/tests/routes/messages.test.ts',
  'packages/server/tests/routes/resources.test.ts',
  'packages/server/tests/routes/tasks.test.ts',
  'packages/server/tests/routes/teams.test.ts',
  'packages/server/tests/ws/gateway.test.ts',
  'packages/worker/tests/job-processor.test.ts',
  'tests/integration/m3-full-stack.test.ts',
] as const;
