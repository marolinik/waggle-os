import { describe, it, expect } from 'vitest';
import {
  resolvePermission,
  filterByPermissions,
  getDefaultPolicies,
  riskExceedsThreshold,
  type EffectivePermissions,
} from '../../src/services/team-capability-governance.js';

function makePerms(overrides?: Partial<EffectivePermissions>): EffectivePermissions {
  return {
    role: 'member',
    allowedSources: ['native', 'skill'],
    blockedTools: ['bash', 'delete_skill'],
    approvalThreshold: 'medium',
    overrides: new Map(),
    ...overrides,
  };
}

describe('riskExceedsThreshold', () => {
  it('high exceeds medium', () => {
    expect(riskExceedsThreshold('high', 'medium')).toBe(true);
  });

  it('medium does not exceed medium', () => {
    expect(riskExceedsThreshold('medium', 'medium')).toBe(false);
  });

  it('low does not exceed medium', () => {
    expect(riskExceedsThreshold('low', 'medium')).toBe(false);
  });

  it('nothing exceeds none threshold', () => {
    expect(riskExceedsThreshold('high', 'none')).toBe(false);
    expect(riskExceedsThreshold('medium', 'none')).toBe(false);
    expect(riskExceedsThreshold('low', 'none')).toBe(false);
  });

  it('medium exceeds low', () => {
    expect(riskExceedsThreshold('medium', 'low')).toBe(true);
  });

  it('low does not exceed low', () => {
    expect(riskExceedsThreshold('low', 'low')).toBe(false);
  });
});

describe('resolvePermission', () => {
  it('override approved returns allowed immediately', () => {
    const perms = makePerms({
      overrides: new Map([['dangerous_tool', 'approved']]),
    });
    // Even if source not in allowedSources, override wins
    expect(resolvePermission(perms, 'dangerous_tool', 'plugin', 'high')).toBe('allowed');
  });

  it('override blocked returns blocked immediately', () => {
    const perms = makePerms({
      overrides: new Map([['some_skill', 'blocked']]),
    });
    // Even if source is allowed and tool not blocked, override wins
    expect(resolvePermission(perms, 'some_skill', 'native', 'low')).toBe('blocked');
  });

  it('source not allowed returns source_not_allowed', () => {
    const perms = makePerms({ allowedSources: ['native'] });
    expect(resolvePermission(perms, 'some_plugin', 'plugin', 'low')).toBe('source_not_allowed');
  });

  it('blocked tool returns blocked', () => {
    const perms = makePerms();
    expect(resolvePermission(perms, 'bash', 'native', 'low')).toBe('blocked');
  });

  it('risk exceeds threshold returns needs_approval', () => {
    const perms = makePerms({ approvalThreshold: 'medium' });
    expect(resolvePermission(perms, 'safe_tool', 'native', 'high')).toBe('needs_approval');
  });

  it('risk within threshold returns allowed', () => {
    const perms = makePerms({ approvalThreshold: 'medium' });
    expect(resolvePermission(perms, 'safe_tool', 'native', 'low')).toBe('allowed');
  });

  it('threshold none means everything allowed (no approval needed)', () => {
    const perms = makePerms({ approvalThreshold: 'none' });
    expect(resolvePermission(perms, 'safe_tool', 'native', 'high')).toBe('allowed');
  });

  it('blocked tool takes priority over source check', () => {
    const perms = makePerms({
      allowedSources: ['native'],
      blockedTools: ['bash'],
    });
    // bash is native (allowed source) but blocked tool — should be blocked
    expect(resolvePermission(perms, 'bash', 'native', 'low')).toBe('blocked');
  });

  it('defaults risk to low when not provided', () => {
    const perms = makePerms({ approvalThreshold: 'low' });
    // low does not exceed low, so allowed
    expect(resolvePermission(perms, 'safe_tool', 'native')).toBe('allowed');
  });
});

describe('filterByPermissions', () => {
  it('removes blocked capabilities', () => {
    const perms = makePerms();
    const caps = [
      { name: 'bash', type: 'native' },
      { name: 'safe_tool', type: 'native', risk: 'low' },
    ];
    const results = filterByPermissions(perms, caps);
    expect(results).toHaveLength(2);
    expect(results[0].result).toBe('blocked');
    expect(results[1].result).toBe('allowed');
  });

  it('keeps approved overrides even if source not in policy', () => {
    const perms = makePerms({
      allowedSources: ['native'],
      overrides: new Map([['my_plugin', 'approved']]),
    });
    const caps = [{ name: 'my_plugin', type: 'plugin', risk: 'high' }];
    const results = filterByPermissions(perms, caps);
    expect(results[0].result).toBe('allowed');
  });

  it('blocks override-blocked even if policy would allow', () => {
    const perms = makePerms({
      allowedSources: ['native', 'skill'],
      blockedTools: [],
      overrides: new Map([['good_skill', 'blocked']]),
    });
    const caps = [{ name: 'good_skill', type: 'skill', risk: 'low' }];
    const results = filterByPermissions(perms, caps);
    expect(results[0].result).toBe('blocked');
  });

  it('marks source_not_allowed for unknown sources', () => {
    const perms = makePerms({ allowedSources: ['native'] });
    const caps = [{ name: 'mcp_tool', type: 'mcp' }];
    const results = filterByPermissions(perms, caps);
    expect(results[0].result).toBe('source_not_allowed');
  });

  it('marks needs_approval when risk exceeds threshold', () => {
    const perms = makePerms({ approvalThreshold: 'low' });
    const caps = [{ name: 'risky_skill', type: 'skill', risk: 'medium' }];
    const results = filterByPermissions(perms, caps);
    expect(results[0].result).toBe('needs_approval');
  });
});

describe('getDefaultPolicies', () => {
  it('returns 3 role policies', () => {
    const policies = getDefaultPolicies();
    expect(policies).toHaveLength(3);
    const roles = policies.map((p) => p.role);
    expect(roles).toContain('owner');
    expect(roles).toContain('admin');
    expect(roles).toContain('member');
  });

  it('owner has all sources and no blocks', () => {
    const owner = getDefaultPolicies().find((p) => p.role === 'owner')!;
    expect(owner.allowedSources).toEqual(['native', 'skill', 'plugin', 'mcp']);
    expect(owner.blockedTools).toEqual([]);
    expect(owner.approvalThreshold).toBe('none');
  });

  it('admin has all sources and no blocks', () => {
    const admin = getDefaultPolicies().find((p) => p.role === 'admin')!;
    expect(admin.allowedSources).toEqual(['native', 'skill', 'plugin', 'mcp']);
    expect(admin.blockedTools).toEqual([]);
    expect(admin.approvalThreshold).toBe('none');
  });

  it('member has restricted sources and blocked tools', () => {
    const member = getDefaultPolicies().find((p) => p.role === 'member')!;
    expect(member.allowedSources).toEqual(['native', 'skill']);
    expect(member.blockedTools).toEqual(['bash', 'delete_skill']);
    expect(member.approvalThreshold).toBe('medium');
  });
});
