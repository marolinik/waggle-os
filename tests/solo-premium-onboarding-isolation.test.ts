import os from 'node:os';
import { readFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveE2EDataDir } from '../playwright.config';

const onboardingSpec = readFileSync(
  resolve(__dirname, 'e2e/solo-premium-onboarding.spec.ts'),
  'utf8',
);
const playwrightConfig = readFileSync(resolve(__dirname, '../playwright.config.ts'), 'utf8');

describe('Solo premium onboarding acceptance isolation', () => {
  it('requires the journey to own a disposable Waggle server and data directory', () => {
    expect(onboardingSpec).toContain(
      "const OWNS_ISOLATED_SERVER = process.env.WAGGLE_E2E_REUSE_EXISTING_SERVER === '0';",
    );
    expect(onboardingSpec).toContain(
      'const USES_GENERATED_DATA_DIR = process.env.WAGGLE_E2E_DATA_DIR === undefined;',
    );
    expect(onboardingSpec).toMatch(
      /test\.skip\(\s*!RUN_LIVE_SOLO_CHAT \|\| !RUN_LIVE_SOLO_ONBOARDING \|\| !OWNS_ISOLATED_SERVER \|\| !USES_GENERATED_DATA_DIR,/,
    );
    expect(onboardingSpec).toContain('this journey must own its disposable Waggle data dir');
    expect(onboardingSpec).toContain('Leave WAGGLE_E2E_DATA_DIR unset');
    expect(onboardingSpec).toContain(
      "const RUN_LIVE_SOLO_ONBOARDING = process.env.WAGGLE_E2E_SOLO_ONBOARDING === '1';",
    );
    expect(playwrightConfig).toContain("env.WAGGLE_E2E_SOLO_ONBOARDING === '1'");
    expect(playwrightConfig).toContain('resolveE2EDataDir(process.env, randomUUID())');
    expect(playwrightConfig).toContain('WAGGLE_DATA_DIR: e2eDataDir');
  });

  it('rejects unsafe onboarding server and data-directory inputs before startup', () => {
    expect(() => resolveE2EDataDir({
      WAGGLE_E2E_SOLO_ONBOARDING: '1',
      WAGGLE_E2E_REUSE_EXISTING_SERVER: '1',
    }, 'unsafe-reuse', 1234)).toThrow(/REUSE_EXISTING_SERVER=0/);

    expect(() => resolveE2EDataDir({
      WAGGLE_E2E_SOLO_ONBOARDING: '1',
      WAGGLE_E2E_REUSE_EXISTING_SERVER: '0',
      WAGGLE_E2E_DATA_DIR: resolve(__dirname, '../.waggle'),
    }, 'unsafe-profile', 1234)).toThrow(/DATA_DIR to be unset/);
  });

  it('allocates every onboarding run a distinct child of the OS temp directory', () => {
    const env = {
      WAGGLE_E2E_SOLO_ONBOARDING: '1',
      WAGGLE_E2E_REUSE_EXISTING_SERVER: '0',
    } satisfies NodeJS.ProcessEnv;
    const first = resolveE2EDataDir(env, 'run-one', 1234);
    const second = resolveE2EDataDir(env, 'run-two', 1234);

    expect(first).not.toBe(second);
    for (const candidate of [first, second]) {
      const relative = path.relative(os.tmpdir(), candidate);
      expect(relative).not.toBe('');
      expect(relative).not.toMatch(/^\.\.|^[\\/]/);
      expect(path.isAbsolute(relative)).toBe(false);
    }
  });
});
