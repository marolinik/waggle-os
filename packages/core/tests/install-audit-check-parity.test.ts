/**
 * P7/D15 A3 — drift-lock for the install_audit CHECK constraints.
 *
 * The table is declared in TWO places: install-audit.ts (core, generated from
 * the canonical @waggle/shared arrays) and hive-mind-core/src/mind/schema.ts
 * (the OSS substrate, a standalone literal). They MUST produce identical CHECK
 * lists or auditStore.record() crashes on one path. This test pins both to the
 * single canonical source, so a drift in either fails CI instead of production.
 */
import { describe, it, expect } from 'vitest';
import {
  sqlInList, RISK_LEVELS, APPROVAL_CLASSES, AUDIT_ACTIONS,
  AUDIT_CAPABILITY_TYPES, AUDIT_INITIATORS, TRUST_SOURCES,
} from '@waggle/shared';
import { SCHEMA_SQL } from '@waggle/hive-mind-core';
import { INSTALL_AUDIT_TABLE_SQL } from '../src/install-audit.js';

const COLUMNS = [
  { col: 'capability_type', values: AUDIT_CAPABILITY_TYPES },
  { col: 'risk_level', values: RISK_LEVELS },
  { col: 'trust_source', values: TRUST_SOURCES },
  { col: 'approval_class', values: APPROVAL_CLASSES },
  { col: 'action', values: AUDIT_ACTIONS },
  { col: 'initiator', values: AUDIT_INITIATORS },
] as const;

describe('install_audit CHECK parity (A3)', () => {
  for (const { col, values } of COLUMNS) {
    const expected = `${col} IN (${sqlInList(values)})`;

    it(`core install-audit DDL pins ${col} to the canonical list`, () => {
      expect(INSTALL_AUDIT_TABLE_SQL).toContain(expected);
    });

    it(`OSS substrate schema.ts pins ${col} to the canonical list`, () => {
      expect(SCHEMA_SQL).toContain(expected);
    });
  }

  it('both DDLs accept the P5/D4 uninstalled action', () => {
    expect(INSTALL_AUDIT_TABLE_SQL).toContain("'uninstalled'");
    expect(SCHEMA_SQL).toContain("'uninstalled'");
  });
});
