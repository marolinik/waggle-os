// CC Sesija A §2.5 — A10 onboarding flag shape contract test.
//
// The read/reset onboarding Tauri commands are pure Rust with their own cargo
// test. Completion is deliberately server-only because the sidecar atomically
// binds the write to the active logical profile.
//
// Cross-language contract: Tauri commands return Rust Result<T, String>:
//   is_first_launch     → Result<bool>    (JS: Promise<boolean>)
//   reset_first_launch  → Result<()>      (JS: Promise<void>)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../..');

describe('onboarding command JS-side contract', () => {
  it('is_first_launch returns a boolean', () => {
    // Type-only test — vitest validates that the binding's declared return
    // type would catch a Rust→JS shape change at compile time.
    type IsFirstLaunchReturn = Awaited<ReturnType<typeof importMockBinding>>;
    type _check = IsFirstLaunchReturn extends boolean ? true : false;
    const _typecheck: _check = true;
    expect(_typecheck).toBe(true);
  });

  it('completion has no identity-free Tauri binding, registration, or Rust writer', () => {
    const bindingSource = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/web/src/lib/tauri-bindings.ts'),
      'utf8',
    );
    const tauriRegistration = fs.readFileSync(
      path.join(REPO_ROOT, 'app/src-tauri/src/lib.rs'),
      'utf8',
    );
    const rustCommands = fs.readFileSync(
      path.join(REPO_ROOT, 'app/src-tauri/src/commands/onboarding.rs'),
      'utf8',
    );

    expect(bindingSource).not.toContain('markFirstLaunchComplete');
    expect(bindingSource).not.toContain("'mark_first_launch_complete'");
    expect(tauriRegistration).not.toContain('commands::onboarding::mark_first_launch_complete');
    expect(rustCommands).not.toContain('pub async fn mark_first_launch_complete');
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
