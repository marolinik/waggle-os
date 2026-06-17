/**
 * PR4 Phase C — agent-search route pure helpers: need tokenization, the
 * connector lane (the one searchCapabilities can't produce), engine-candidate
 * annotation (id rejoin), and the one-of-each-kind three-up grouping.
 */
import { describe, it, expect } from 'vitest';
import type { ConnectorDefinition } from '@waggle/shared';
import type { CapabilityCandidate } from '@waggle/agent';
import {
  tokenizeNeed, scoreConnectors, annotateEngineCandidate, pickThreeUp,
  type AgentSearchCandidate,
} from '../../src/local/routes/agent-search.js';

const conn = (over: Partial<ConnectorDefinition>): ConnectorDefinition => ({
  id: 'x', name: 'X', description: '', service: 'x', authType: 'bearer',
  status: 'disconnected', capabilities: [], substrate: 'waggle', tools: [], category: 'misc',
  ...over,
});

describe('tokenizeNeed', () => {
  it('drops stopwords + short tokens and dedupes', () => {
    expect(tokenizeNeed('I need to send a Slack message about slack')).toEqual(['send', 'slack', 'message']);
  });
  it('returns empty for an all-stopword need', () => {
    expect(tokenizeNeed('I can do it')).toEqual([]);
  });
});

describe('scoreConnectors', () => {
  const defs = [
    conn({ id: 'slack', name: 'Slack', description: 'Team chat', service: 'slack', authType: 'bearer', tools: ['send_message'], category: 'comms' }),
    conn({ id: 'gcal', name: 'Google Calendar', description: 'Calendar events', service: 'google', authType: 'oauth2', category: 'productivity' }),
    conn({ id: 'github', name: 'GitHub', description: 'Code hosting', service: 'github', authType: 'bearer', status: 'connected', category: 'dev' }),
  ];

  it('matches a token connector to a store-install descriptor with the namespaced id', () => {
    const out = scoreConnectors(defs, 'send a slack message');
    expect(out[0].name).toBe('Slack');
    expect(out[0].type).toBe('connector');
    expect(out[0].matchReason).toMatch(/slack/);
    expect(out[0].install).toEqual({ mode: 'store', extensionId: 'connector:slack', type: 'connector', kind: 'federated', authType: 'bearer' });
  });

  it('routes an OAuth connector to the Hub (open-in), never an inline token', () => {
    const out = scoreConnectors(defs, 'add a calendar event');
    const gcal = out.find(c => c.name === 'Google Calendar');
    expect(gcal?.install).toEqual({ mode: 'open-in', appId: 'connectors' });
  });

  it('an already-connected match is active (no install action)', () => {
    const out = scoreConnectors(defs, 'github code hosting');
    const gh = out.find(c => c.name === 'GitHub');
    expect(gh?.availability).toBe('active');
    expect(gh?.installAction).toBeNull();
    expect(gh?.install).toEqual({ mode: 'active' });
  });

  it('returns nothing when no token matches', () => {
    expect(scoreConnectors(defs, 'quantum chromodynamics')).toEqual([]);
  });
});

describe('annotateEngineCandidate', () => {
  const cand = (over: Partial<CapabilityCandidate>): CapabilityCandidate => ({
    name: 'c', type: 'marketplace', availability: 'installable', description: '',
    source: 'marketplace', matchScore: 0.5, matchReason: 'why', installAction: 'install_capability', ...over,
  });
  const byName = new Map([
    ['web-scraper', { id: 7, waggle_install_type: 'skill' as const }],
    ['pg-mcp', { id: 9, waggle_install_type: 'mcp' as const }],
  ]);

  it('rejoins a marketplace candidate to its package id (skill)', () => {
    const a = annotateEngineCandidate(cand({ name: 'web-scraper' }), byName);
    expect(a.install).toEqual({ mode: 'store', extensionId: 'pkg:7', type: 'skill', kind: 'package', packageId: 7 });
  });
  it('maps an mcp package via waggle_install_type', () => {
    const a = annotateEngineCandidate(cand({ name: 'pg-mcp' }), byName);
    expect(a.install).toMatchObject({ mode: 'store', extensionId: 'pkg:9', type: 'mcp', packageId: 9 });
  });
  it('an installable starter skill installs via the starter-pack path', () => {
    const a = annotateEngineCandidate(cand({ name: 'pdf', type: 'skill', source: 'starter-pack' }), byName);
    expect(a.install).toEqual({ mode: 'starter-pack', name: 'pdf' });
  });
  it('a native tool is active (already available)', () => {
    const a = annotateEngineCandidate(cand({ name: 'web_search', type: 'native', availability: 'active', installAction: null }), byName);
    expect(a.install).toEqual({ mode: 'active' });
  });
});

describe('pickThreeUp', () => {
  it('returns one of each kind, highest-scored first', () => {
    const mk = (over: Partial<AgentSearchCandidate>): AgentSearchCandidate => ({
      name: 'n', type: 'skill', availability: 'installable', description: '', source: 's',
      matchScore: 0.5, matchReason: 'why', installAction: null, install: { mode: 'active' }, ...over,
    });
    const all: AgentSearchCandidate[] = [
      mk({ name: 'Slack', type: 'connector', matchScore: 0.9 }),
      mk({ name: 'pdf-skill', type: 'skill', matchScore: 0.7 }),
      mk({ name: 'web_search', type: 'native', matchScore: 0.6 }),
      mk({ name: 'other-skill', type: 'skill', matchScore: 0.3 }),
    ];
    const picks = pickThreeUp(all);
    expect(picks.connector?.name).toBe('Slack');
    expect(picks.skill?.name).toBe('pdf-skill'); // first skill-ish by order
    expect(picks.tool?.name).toBe('web_search');
  });
});
