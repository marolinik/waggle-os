/**
 * Phase 5b · R4-007 — ConnectorsApp shared-credential footgun.
 *
 * `ConnectorsApp` holds a SINGLE `tokenInput` (and `emailInput`) state that is
 * reused by every connector row. Before the fix, switching the expanded
 * connector left whatever was typed for connector A sitting in connector B's
 * input — a wrong-credential footgun where A's token could be submitted to B.
 *
 * The fix routes every expand/collapse through `selectConnector`, which clears
 * the inputs whenever the target connector changes. The decision rule is
 * extracted into the pure `shouldResetCredentialInputs(prev, next)` so it can
 * be regression-tested here without rendering React.
 *
 * Why no component-render test: `@testing-library/react` (built for React 19,
 * hoisted to the monorepo root) mixes its `react-dom/client` copy with this
 * app's React 18.3 and throws "A React Element from an older version of React
 * was rendered." This is the same documented constraint that keeps
 * `useDeveloperMode.test.ts` and `TextBlock.test.tsx` at the pure-function
 * layer; full render is covered by Playwright.
 */
import { describe, it, expect } from 'vitest';
import { shouldResetCredentialInputs } from '@/components/os/apps/ConnectorsApp';

describe('ConnectorsApp · R4-007 shouldResetCredentialInputs', () => {
  it('resets when switching from one connector to a different one', () => {
    // Token typed for "github" must NOT survive into "slack".
    expect(shouldResetCredentialInputs('github', 'slack')).toBe(true);
  });

  it('does NOT reset when re-collapsing the same open connector', () => {
    // Toggling the open row shut keeps the field as-is for that connector.
    expect(shouldResetCredentialInputs('github', 'github')).toBe(false);
  });

  it('resets when opening the first connector from a collapsed state', () => {
    expect(shouldResetCredentialInputs(null, 'github')).toBe(true);
  });

  it('resets when collapsing an open connector to none', () => {
    expect(shouldResetCredentialInputs('github', null)).toBe(true);
  });

  it('does NOT reset when nothing is open and nothing opens', () => {
    expect(shouldResetCredentialInputs(null, null)).toBe(false);
  });
});
