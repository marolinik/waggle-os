import { mergeConfig, defineConfig, type UserConfig } from 'vitest/config';
import rootConfig from './vitest.config';

/**
 * Critical-coverage gate (router-arc P0-C / SPEC C1).
 *
 * A separate vitest project that runs ONLY the security-boundary test suites and
 * enforces hard per-project coverage thresholds over ONLY the security-boundary
 * source files (injection scanning, vault, erasure/suppression, the confirmation
 * gate + permissions, secret redaction, and the approval / held-action route
 * surface). It locks those files against coverage regression without imposing a
 * repo-wide threshold.
 *
 * It reuses the root config's `@waggle/*` src aliases + setup/pool so the
 * critical suites resolve exactly as they do under `npm test`. `mergeConfig`
 * concatenates arrays, so the root `test.include` and `test.coverage` are
 * stripped from the base first — otherwise the whole suite (and whole-repo
 * coverage) would leak back in.
 */
const base: UserConfig = {
  ...rootConfig,
  test: { ...(rootConfig.test ?? {}) },
};
delete (base.test as Record<string, unknown>).include;
delete (base.test as Record<string, unknown>).coverage;

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: [
        // Injection scanning (canonical scanForInjection lives in hive-mind-core).
        'packages/agent/tests/injection-scanner.test.ts',
        // Vault (secret storage) — core + sidecar route.
        'packages/core/tests/vault.test.ts',
        'packages/core/tests/vault-concurrency.test.ts',
        'packages/core/tests/vault-edge-cases.test.ts',
        'packages/server/tests/local/vault-routes.test.ts',
        // Erasure / suppression (GDPR).
        'packages/hive-mind-core/tests/mind/erasure.test.ts',
        'packages/hive-mind-core/tests/mind/suppression.test.ts',
        'packages/server/tests/local/suppression-endpoint.test.ts',
        // Confirmation gate + autonomy, permissions sandbox.
        'packages/agent/tests/confirmation.test.ts',
        'packages/agent/tests/permissions.test.ts',
        // Channels / middleware exfil surface.
        'packages/server/tests/local/security-middleware.test.ts',
        // Approval + durable held-action executor.
        'packages/server/tests/routes/approval-flow.test.ts',
        'packages/server/tests/local/approval-held.test.ts',
        'packages/server/tests/local/held-action-executor.test.ts',
        // Secret / home-path redaction.
        'packages/agent/tests/eval-dataset.test.ts',
        'packages/agent/tests/skill-redaction.test.ts',
      ],
      coverage: {
        provider: 'v8',
        all: true,
        include: [
          'packages/hive-mind-core/src/injection-scanner.ts',
          'packages/core/src/vault.ts',
          'packages/hive-mind-core/src/mind/erasure.ts',
          'packages/hive-mind-core/src/mind/suppression.ts',
          'packages/agent/src/confirmation.ts',
          'packages/agent/src/permissions.ts',
          'packages/agent/src/eval-dataset.ts',
          'packages/agent/src/skill-redaction.ts',
          'packages/server/src/local/routes/approval.ts',
          'packages/server/src/local/held-action-executor.ts',
          'packages/server/src/local/routes/vault.ts',
        ],
        exclude: ['**/*.d.ts'],
        // Calibrated ~5pt below current reality (2026-07-15 pass: stmts/lines
        // 94.55, branches 85.08, funcs 100) so the gate locks against
        // regression, not aspiration.
        thresholds: {
          lines: 89,
          functions: 95,
          branches: 80,
          statements: 89,
        },
      },
    },
  }),
);
