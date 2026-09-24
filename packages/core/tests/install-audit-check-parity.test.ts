/**
 * P7/D15 A3 — drift-lock for the install_audit CHECK constraints.
 *
 * The table used to be declared in two places, core and a hive-mind-core
 * literal. Since D-1 the governance context in core is its only owner, and the
 * Mind schema must not declare it at all. The DDL still pins every CHECK list
 * to the canonical @waggle/shared arrays, so a drift fails CI instead of
 * crashing auditStore.record() in production.
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
    it(`core install-audit DDL pins ${col} to the canonical list`, () => {
      expect(INSTALL_AUDIT_TABLE_SQL).toContain(`${col} IN (${sqlInList(values)})`);
    });
  }

  it('accepts the P5/D4 uninstalled action', () => {
    expect(INSTALL_AUDIT_TABLE_SQL).toContain("'uninstalled'");
  });

  it('is not declared by the Mind schema (D-1)', () => {
    expect(SCHEMA_SQL).not.toMatch(/CREATE TABLE IF NOT EXISTS (install_audit|ai_interactions)\b/);
    expect(SCHEMA_SQL).not.toMatch(/ON (install_audit|ai_interactions)\b/);
  });
});
