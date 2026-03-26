/**
 * Capabilities page — team capability governance.
 *
 * Three tabs: Role Policies, Overrides, Requests.
 * Allows admins to manage capability policies, overrides, and review requests.
 */

import React, { useEffect, useState } from 'react';
import {
  api,
  type CapabilityPolicyResponse,
  type CapabilityOverrideResponse,
  type CapabilityRequestResponse,
} from '../api.js';

interface CapabilitiesProps {
  token: string;
  teamSlug: string;
}

type Tab = 'policies' | 'overrides' | 'requests';

const TABLE_STYLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse' as const,
  marginTop: 16,
  background: '#12141a',
  border: '1px solid #2a2d36',
  borderRadius: 8,
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
};

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left' as const,
  padding: '12px 16px',
  borderBottom: '1px solid #2a2d36',
  fontSize: 13,
  color: '#9ca3af',
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
};

const TD_STYLE: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 14,
  color: '#cbd5e1',
};

const WARNING_STYLE: React.CSSProperties = {
  padding: '12px 16px',
  background: 'rgba(251, 191, 36, 0.1)',
  border: '1px solid rgba(251, 191, 36, 0.3)',
  borderRadius: 4,
  color: '#fbbf24',
  marginBottom: 16,
  fontSize: 13,
};

const ROLE_COLORS: Record<string, string> = {
  owner: '#10b981',
  admin: '#3b82f6',
  member: '#eab308',
};

const THRESHOLD_COLORS: Record<string, string> = {
  none: '#10b981',
  low: '#ef4444',
  medium: '#eab308',
  high: '#ef4444',
};

const SOURCES = ['native', 'skill', 'plugin', 'mcp', 'subagent'] as const;
const CAP_TYPES = ['native', 'skill', 'plugin', 'mcp'] as const;

function badge(label: string, bg: string, fg: string): React.ReactElement {
  return (
    <span
      key={label}
      style={{
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        background: bg,
        color: fg,
        marginRight: 4,
        display: 'inline-block',
        marginBottom: 2,
      }}
    >
      {label}
    </span>
  );
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

// ─── Role Policies Tab ─────────────────────────────────────────────

function PoliciesTab({ token, teamSlug }: CapabilitiesProps) {
  const [policies, setPolicies] = useState<CapabilityPolicyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editSources, setEditSources] = useState<string[]>([]);
  const [editBlocked, setEditBlocked] = useState('');
  const [editThreshold, setEditThreshold] = useState('none');

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listCapabilityPolicies(token, teamSlug);
      setPolicies(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && teamSlug) fetchPolicies();
  }, [token, teamSlug]);

  const startEdit = (p: CapabilityPolicyResponse) => {
    setEditingRole(p.role);
    setEditSources([...p.allowedSources]);
    setEditBlocked(p.blockedTools.join(', '));
    setEditThreshold(p.approvalThreshold);
  };

  const cancelEdit = () => setEditingRole(null);

  const saveEdit = async () => {
    if (!editingRole) return;
    try {
      setError(null);
      await api.updateCapabilityPolicy(token, teamSlug, editingRole, {
        allowedSources: editSources,
        blockedTools: editBlocked
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        approvalThreshold: editThreshold,
      });
      setEditingRole(null);
      await fetchPolicies();
    } catch (err: any) {
      setError(err.message ?? 'Failed to update policy');
    }
  };

  const toggleSource = (src: string) => {
    setEditSources((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src],
    );
  };

  if (loading) return <p style={{ color: '#9ca3af' }}>Loading...</p>;

  return (
    <div>
      {error && <div style={WARNING_STYLE}>{error}</div>}
      <table style={TABLE_STYLE}>
        <thead>
          <tr>
            <th style={TH_STYLE}>Role</th>
            <th style={TH_STYLE}>Allowed Sources</th>
            <th style={TH_STYLE}>Blocked Tools</th>
            <th style={TH_STYLE}>Approval Threshold</th>
            <th style={{ ...TH_STYLE, width: 80 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr key={p.role} style={{ borderBottom: '1px solid #1a1d25' }}>
              <td style={TD_STYLE}>
                {badge(p.role, (ROLE_COLORS[p.role] ?? '#6b7280') + '20', ROLE_COLORS[p.role] ?? '#6b7280')}
              </td>
              <td style={TD_STYLE}>
                {p.allowedSources.map((s) => badge(s, '#4f46e520', '#4f46e5'))}
              </td>
              <td style={TD_STYLE}>
                {p.blockedTools.length > 0
                  ? p.blockedTools.map((t) => badge(t, '#ef444420', '#ef4444'))
                  : <span style={{ color: '#9ca3af', fontSize: 13 }}>None</span>}
              </td>
              <td style={TD_STYLE}>
                {badge(
                  p.approvalThreshold,
                  (THRESHOLD_COLORS[p.approvalThreshold] ?? '#6b7280') + '20',
                  THRESHOLD_COLORS[p.approvalThreshold] ?? '#6b7280',
                )}
              </td>
              <td style={TD_STYLE}>
                <button
                  onClick={() => startEdit(p)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#e5a000',
                    cursor: 'pointer',
                    fontSize: 13,
                    padding: '4px 8px',
                  }}
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editingRole && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: '#12141a',
            border: '1px solid #2a2d36',
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
          }}
        >
          <h3 style={{ marginTop: 0, fontSize: 15, color: '#f0f2f7' }}>
            Edit Policy: {editingRole}
          </h3>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
              Allowed Sources
            </label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {SOURCES.map((src) => (
                <label key={src} style={{ fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editSources.includes(src)}
                    onChange={() => toggleSource(src)}
                    style={{ marginRight: 4 }}
                  />
                  {src}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 13, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
              Blocked Tools (comma-separated)
            </label>
            <input
              type="text"
              value={editBlocked}
              onChange={(e) => setEditBlocked(e.target.value)}
              placeholder="tool_name_1, tool_name_2"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#1a1d25',
                border: '1px solid #2a2d36',
                borderRadius: 4,
                fontSize: 14,
                color: '#f0f2f7',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
              Approval Threshold
            </label>
            <select
              value={editThreshold}
              onChange={(e) => setEditThreshold(e.target.value)}
              style={{
                padding: '8px 12px',
                background: '#1a1d25',
                border: '1px solid #2a2d36',
                borderRadius: 4,
                fontSize: 14,
                color: '#f0f2f7',
              }}
            >
              <option value="none">None</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={saveEdit}
              style={{
                padding: '8px 16px',
                background: '#e5a000',
                color: '#08090c',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Save
            </button>
            <button
              onClick={cancelEdit}
              style={{
                padding: '8px 16px',
                background: '#1a1d25',
                color: '#cbd5e1',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Overrides Tab ──────────────────────────────────────────────────

function OverridesTab({ token, teamSlug }: CapabilitiesProps) {
  const [overrides, setOverrides] = useState<CapabilityOverrideResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('native');
  const [formDecision, setFormDecision] = useState('approved');
  const [formReason, setFormReason] = useState('');

  const fetchOverrides = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listCapabilityOverrides(token, teamSlug);
      setOverrides(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load overrides');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && teamSlug) fetchOverrides();
  }, [token, teamSlug]);

  const handleCreate = async () => {
    if (!formName.trim()) return;
    try {
      setError(null);
      await api.createCapabilityOverride(token, teamSlug, {
        capabilityName: formName.trim(),
        capabilityType: formType,
        decision: formDecision,
        reason: formReason.trim(),
      });
      setFormName('');
      setFormType('native');
      setFormDecision('approved');
      setFormReason('');
      setShowForm(false);
      await fetchOverrides();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create override');
    }
  };

  const handleRemove = async (id: string) => {
    try {
      setError(null);
      await api.deleteCapabilityOverride(token, teamSlug, id);
      await fetchOverrides();
    } catch (err: any) {
      setError(err.message ?? 'Failed to remove override');
    }
  };

  if (loading) return <p style={{ color: '#9ca3af' }}>Loading...</p>;

  return (
    <div>
      {error && <div style={WARNING_STYLE}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '8px 16px',
            background: '#e5a000',
            color: '#08090c',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          + Add Override
        </button>
      </div>

      {showForm && (
        <div
          style={{
            padding: 16,
            background: '#12141a',
            border: '1px solid #2a2d36',
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
                Capability Name
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. shell_exec"
                style={{
                  padding: '8px 12px',
                  background: '#1a1d25',
                  border: '1px solid #2a2d36',
                  borderRadius: 4,
                  fontSize: 14,
                  color: '#f0f2f7',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
                Type
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: '#1a1d25',
                  border: '1px solid #2a2d36',
                  borderRadius: 4,
                  fontSize: 14,
                  color: '#f0f2f7',
                }}
              >
                {CAP_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
                Decision
              </label>
              <select
                value={formDecision}
                onChange={(e) => setFormDecision(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: '#1a1d25',
                  border: '1px solid #2a2d36',
                  borderRadius: 4,
                  fontSize: 14,
                  color: '#f0f2f7',
                }}
              >
                <option value="approved">Approved</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
                Reason
              </label>
              <input
                type="text"
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                placeholder="Optional reason"
                style={{
                  padding: '8px 12px',
                  background: '#1a1d25',
                  border: '1px solid #2a2d36',
                  borderRadius: 4,
                  fontSize: 14,
                  color: '#f0f2f7',
                }}
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={!formName.trim()}
              style={{
                padding: '8px 16px',
                background: '#e5a000',
                color: '#08090c',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 14,
                opacity: !formName.trim() ? 0.6 : 1,
              }}
            >
              Submit
            </button>
          </div>
        </div>
      )}

      <table style={TABLE_STYLE}>
        <thead>
          <tr>
            <th style={TH_STYLE}>Capability</th>
            <th style={TH_STYLE}>Type</th>
            <th style={TH_STYLE}>Decision</th>
            <th style={TH_STYLE}>Reason</th>
            <th style={{ ...TH_STYLE, width: 80 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {overrides.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...TD_STYLE, color: '#9ca3af', textAlign: 'center' }}>
                No overrides configured.
              </td>
            </tr>
          ) : (
            overrides.map((o) => (
              <tr key={o.id} style={{ borderBottom: '1px solid #1a1d25' }}>
                <td style={TD_STYLE}>{o.capabilityName}</td>
                <td style={TD_STYLE}>
                  {badge(o.capabilityType, '#4f46e520', '#4f46e5')}
                </td>
                <td style={TD_STYLE}>
                  {o.decision === 'approved'
                    ? badge('approved', '#10b98120', '#10b981')
                    : badge('blocked', '#ef444420', '#ef4444')}
                </td>
                <td style={{ ...TD_STYLE, color: '#9ca3af', fontSize: 13 }}>
                  {o.reason || '--'}
                </td>
                <td style={TD_STYLE}>
                  <button
                    onClick={() => handleRemove(o.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontSize: 13,
                      padding: '4px 8px',
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Requests Tab ───────────────────────────────────────────────────

function RequestsTab({
  token,
  teamSlug,
  onPendingCount,
}: CapabilitiesProps & { onPendingCount: (n: number) => void }) {
  const [requests, setRequests] = useState<CapabilityRequestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState('');

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listCapabilityRequests(token, teamSlug);
      setRequests(data);
      onPendingCount(data.filter((r) => r.status === 'pending').length);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && teamSlug) fetchRequests();
  }, [token, teamSlug]);

  const handleDecision = async (id: string, status: string) => {
    try {
      setError(null);
      await api.decideCapabilityRequest(token, teamSlug, id, {
        status,
        reason: decisionReason.trim() || undefined,
      });
      setDecidingId(null);
      setDecisionReason('');
      await fetchRequests();
    } catch (err: any) {
      setError(err.message ?? 'Failed to process decision');
    }
  };

  if (loading) return <p style={{ color: '#9ca3af' }}>Loading...</p>;

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  return (
    <div>
      {error && <div style={WARNING_STYLE}>{error}</div>}

      {pending.length === 0 && decided.length === 0 && (
        <p style={{ color: '#9ca3af' }}>No capability requests.</p>
      )}

      {pending.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, color: '#cbd5e1', marginBottom: 12 }}>
            Pending Requests ({pending.length})
          </h3>
          {pending.map((r) => (
            <div
              key={r.id}
              style={{
                padding: 16,
                background: '#12141a',
                border: '1px solid #2a2d36',
                borderRadius: 8,
                boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#f0f2f7' }}>{r.capabilityName}</span>
                {badge(r.capabilityType, '#4f46e520', '#4f46e5')}
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
                Requested by {r.requestedBy} {r.createdAt ? relativeTime(r.createdAt) : ''}
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>
                {r.justification}
              </div>

              {decidingId === r.id ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    placeholder="Reason (optional)"
                    style={{
                      padding: '6px 10px',
                      background: '#1a1d25',
                      border: '1px solid #2a2d36',
                      borderRadius: 4,
                      color: '#f0f2f7',
                      fontSize: 13,
                      flex: 1,
                      minWidth: 200,
                    }}
                  />
                  <button
                    onClick={() => handleDecision(r.id, 'approved')}
                    style={{
                      padding: '6px 14px',
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDecision(r.id, 'rejected')}
                    style={{
                      padding: '6px 14px',
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => { setDecidingId(null); setDecisionReason(''); }}
                    style={{
                      padding: '6px 14px',
                      background: '#1a1d25',
                      color: '#cbd5e1',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setDecidingId(r.id)}
                    style={{
                      padding: '6px 14px',
                      background: '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setDecidingId(r.id)}
                    style={{
                      padding: '6px 14px',
                      background: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {decided.length > 0 && (
        <>
          <h3 style={{ fontSize: 15, color: '#cbd5e1', marginTop: 24, marginBottom: 12 }}>
            Decided Requests ({decided.length})
          </h3>
          {decided.map((r) => (
            <div
              key={r.id}
              style={{
                padding: 16,
                background: '#12141a',
                border: '1px solid #2a2d36',
                borderRadius: 8,
                boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
                marginBottom: 12,
                opacity: 0.7,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#f0f2f7' }}>{r.capabilityName}</span>
                {badge(r.capabilityType, '#4f46e520', '#4f46e5')}
                {r.status === 'approved'
                  ? badge('approved', '#10b98120', '#10b981')
                  : badge('rejected', '#ef444420', '#ef4444')}
              </div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 4 }}>
                Requested by {r.requestedBy} {r.createdAt ? relativeTime(r.createdAt) : ''}
              </div>
              <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 4 }}>
                {r.justification}
              </div>
              {r.decisionReason && (
                <div style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
                  Decision reason: {r.decisionReason}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function Capabilities({ token, teamSlug }: CapabilitiesProps) {
  const [tab, setTab] = useState<Tab>('policies');
  const [pendingCount, setPendingCount] = useState(0);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'policies', label: 'Role Policies' },
    { key: 'overrides', label: 'Overrides' },
    { key: 'requests', label: 'Requests' },
  ];

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#f0f2f7' }}>Capabilities</h1>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #2a2d36', marginBottom: 16 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid #e5a000' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? '#f0f2f7' : '#9ca3af',
              marginBottom: -1,
            }}
          >
            {t.label}
            {t.key === 'requests' && pendingCount > 0 && (
              <span
                style={{
                  marginLeft: 6,
                  padding: '2px 7px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 700,
                  background: '#ef4444',
                  color: '#fff',
                }}
              >
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'policies' && <PoliciesTab token={token} teamSlug={teamSlug} />}
      {tab === 'overrides' && <OverridesTab token={token} teamSlug={teamSlug} />}
      {tab === 'requests' && (
        <RequestsTab token={token} teamSlug={teamSlug} onPendingCount={setPendingCount} />
      )}
    </div>
  );
}
