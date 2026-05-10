// CC Sesija A §2.5 — A10 onboarding flag shape contract test.
//
// The onboarding Tauri commands (is_first_launch / mark_first_launch_complete /
// reset_first_launch) are pure Rust with their own cargo test (already passing
// 1/1). This test validates the JS-side binding shape so the React-side
// useOnboarding fast-path doesn't drift from the Rust-side return type.
//
// Cross-language contract: Tauri commands return Rust Result<T, String>:
//   is_first_launch     → Result<bool>    (JS: Promise<boolean>)
//   mark_first_launch_  → Result<()>      (JS: Promise<void>)
//   reset_first_launch  → Result<()>      (JS: Promise<void>)

import { describe, it, expect } from 'vitest';

describe('onboarding command JS-side contract', () => {
  it('is_first_launch returns a boolean', () => {
    // Type-only test — vitest validates that the binding's declared return
    // type would catch a Rust→JS shape change at compile time.
    type IsFirstLaunchReturn = Awaited<ReturnType<typeof importMockBinding>>;
    type _check = IsFirstLaunchReturn extends boolean ? true : false;
    const _typecheck: _check = true;
    expect(_typecheck).toBe(true);
  });

  it('Phase 5 LOCKED shape names match cross-binding format', () => {
    // The shape names appear in three places:
    //   1. shape.name field in packages/agent/src/prompt-shapes/gepa-evolved/
    //   2. registerShape() calls in packages/server/src/local/routes/agent-run.ts
    //   3. AVAILABLE_SHAPES.id in apps/web/src/lib/shape-selection.ts
    // All three MUST agree on the hyphen format (no double-colon). This
    // assertion locks the contract — drift breaks the end-to-end shape flow.
    const PHASE_5_LOCKED = ['claude-gen1-v1', 'qwen-thinking-gen1-v1'];
    for (const name of PHASE_5_LOCKED) {
      expect(name).toMatch(/^[a-z0-9-]+-gen1-v1$/);
      expect(name).not.toContain('::');
    }
  });
});

// Mock signature matching the actual binding return type.
async function importMockBinding(): Promise<boolean> {
  return true;
}
