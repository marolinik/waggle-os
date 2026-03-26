import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Check if a migration from default.mind to personal.mind is needed.
 * Returns true if default.mind exists AND personal.mind does NOT exist.
 */
export function needsMigration(waggleDir: string): boolean {
  const defaultMind = path.join(waggleDir, 'default.mind');
  const personalMind = path.join(waggleDir, 'personal.mind');
  return fs.existsSync(defaultMind) && !fs.existsSync(personalMind);
}

/**
 * Migrate from the old single-mind layout (default.mind) to the
 * M4 multi-mind layout (personal.mind + workspaces/).
 *
 * Steps when migration is needed:
 *   1. Copy default.mind -> personal.mind
 *   2. Rename default.mind -> default.mind.bak
 *   3. Create workspaces/ directory
 *
 * This is a pure file operation -- no data transformation is performed.
 */
export function migrateToMultiMind(waggleDir: string): { migrated: boolean; message: string } {
  if (!needsMigration(waggleDir)) {
    return { migrated: false, message: 'No migration needed' };
  }

  const defaultMind = path.join(waggleDir, 'default.mind');
  const personalMind = path.join(waggleDir, 'personal.mind');
  const backupMind = path.join(waggleDir, 'default.mind.bak');
  const workspacesDir = path.join(waggleDir, 'workspaces');

  // 1. Copy default.mind -> personal.mind
  fs.copyFileSync(defaultMind, personalMind);

  // 2. Rename default.mind -> default.mind.bak
  fs.renameSync(defaultMind, backupMind);

  // 3. Create workspaces/ directory (idempotent)
  fs.mkdirSync(workspacesDir, { recursive: true });

  return { migrated: true, message: 'Migrated default.mind to personal.mind' };
}
