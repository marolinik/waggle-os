/**
 * Members page — team member management.
 *
 * View members, invite new ones, change roles, remove.
 * Talks to team server via api.ts.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage, type TeamMemberResponse } from '../api.js';

interface MembersProps {
  token: string;
  teamSlug: string;
}

const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;

export function Members({ token, teamSlug }: MembersProps) {
  const [members, setMembers] = useState<TeamMemberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ userId: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const team = await api.getTeam(token, teamSlug);
      setMembers(team.members ?? []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load members'));
    } finally {
      setLoading(false);
    }
  }, [token, teamSlug]);

  useEffect(() => {
    if (token && teamSlug) fetchMembers();
  }, [token, teamSlug, fetchMembers]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      setInviting(true);
      setError(null);
      await api.inviteMember(token, teamSlug, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      await fetchMembers();
    } catch (err) {
      setError(getErrorMessage(err, 'Invite failed'));
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      setError(null);
      setUpdatingRoleId(userId);
      await api.updateMemberRole(token, teamSlug, userId, newRole);
      await fetchMembers();
    } catch (err) {
      setError(getErrorMessage(err, 'Role change failed'));
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleRemove = async (userId: string, displayName?: string) => {
    const name = displayName ?? userId;
    setPendingRemoval({ userId, name });
  };

  const confirmRemove = async () => {
    if (!pendingRemoval) return;
    try {
      setRemoving(true);
      setError(null);
      await api.removeMember(token, teamSlug, pendingRemoval.userId);
      setPendingRemoval(null);
      await fetchMembers();
    } catch (err) {
      setError(getErrorMessage(err, 'Remove failed'));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#f0f2f7' }}>Team Members</h1>

      {error && (
        <div role="alert" style={{
          padding: '8px 12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 4,
          color: '#f87171',
          marginBottom: 16,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {pendingRemoval && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby="member-remove-title"
          style={{
            padding: '12px 14px',
            background: 'rgba(248, 113, 113, 0.08)',
            border: '1px solid rgba(248, 113, 113, 0.32)',
            borderRadius: 8,
            color: '#f0f2f7',
            marginBottom: 16,
          }}
        >
          <div id="member-remove-title" style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
            Remove {pendingRemoval.name} from the team?
          </div>
          <p style={{ margin: 0, color: '#cbd5e1', fontSize: 13 }}>
            This revokes their team access. Existing audit records and completed work stay in the team history.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => setPendingRemoval(null)}
              disabled={removing}
              style={{
                padding: '6px 10px',
                background: '#1a1d25',
                border: '1px solid #2a2d36',
                borderRadius: 4,
                color: '#cbd5e1',
                cursor: removing ? 'wait' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={confirmRemove}
              disabled={removing}
              style={{
                padding: '6px 10px',
                background: '#f87171',
                border: 'none',
                borderRadius: 4,
                color: '#08090c',
                cursor: removing ? 'wait' : 'pointer',
                fontWeight: 700,
              }}
            >
              {removing ? 'Removing...' : 'Remove member'}
            </button>
          </div>
        </div>
      )}

      {/* Invite form */}
      <div style={{
        display: 'flex',
        gap: 8,
        marginBottom: 24,
        padding: 16,
        background: '#12141a',
        border: '1px solid #2a2d36',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
      }}>
        <label style={{ ...labelStyle, flex: 1, marginBottom: 0 }}>
          Invite email
          <input
            name="inviteEmail"
            type="email"
            autoComplete="email"
            placeholder="user@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              padding: '8px 12px',
              background: '#1a1d25',
              border: '1px solid #2a2d36',
              borderRadius: 4,
              fontSize: 14,
              color: '#f0f2f7',
              boxSizing: 'border-box',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
          />
        </label>
        <label style={{ ...labelStyle, marginBottom: 0 }}>
          Invite role
          <select
            name="inviteRole"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            style={{
              display: 'block',
              marginTop: 4,
              padding: '8px 12px',
              background: '#1a1d25',
              border: '1px solid #2a2d36',
              borderRadius: 4,
              fontSize: 14,
              color: '#f0f2f7',
            }}
          >
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <button
          onClick={handleInvite}
          disabled={inviting || !inviteEmail.trim()}
          style={{
            padding: '8px 16px',
            background: '#e5a000',
            color: '#08090c',
            border: 'none',
            borderRadius: 4,
            cursor: inviting ? 'wait' : 'pointer',
            fontSize: 14,
            fontWeight: 600,
            opacity: inviting || !inviteEmail.trim() ? 0.6 : 1,
          }}
        >
          {inviting ? 'Inviting...' : 'Invite'}
        </button>
      </div>

      {/* Member list */}
      {loading ? (
        <p style={{ color: '#9ca3af' }}>Loading members...</p>
      ) : members.length === 0 ? (
        <p style={{ color: '#9ca3af' }}>No members found. Invite someone to get started.</p>
      ) : (
        <div className="admin-table-scroll" data-admin-scroll-region="true" role="region" aria-label="Team members table" tabIndex={0}>
        <table style={{
          width: '100%',
          minWidth: 640,
          borderCollapse: 'collapse',
          background: '#12141a',
          border: '1px solid #2a2d36',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a2d36' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Joined</th>
              <th style={{ ...thStyle, width: 80 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.userId} style={{ borderBottom: '1px solid #1a1d25' }}>
                <td style={tdStyle}>{m.displayName ?? m.userId}</td>
                <td style={tdStyle}>{m.email ?? '—'}</td>
                <td style={tdStyle}>
                  {m.role === 'owner' ? (
                    <span style={{
                      padding: '2px 8px',
                      background: 'rgba(229, 160, 0, 0.15)',
                      color: '#e5a000',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      Owner
                    </span>
                  ) : (
                    <select
                      name={`role-${m.userId}`}
                      aria-label={`Role for ${m.displayName ?? m.userId}`}
                      value={m.role}
                      disabled={updatingRoleId === m.userId}
                      onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                      style={{
                        padding: '4px 8px',
                        background: '#1a1d25',
                        border: '1px solid #2a2d36',
                        borderRadius: 4,
                        fontSize: 13,
                        color: m.role === 'admin' ? '#f0b429' : m.role === 'member' ? '#cbd5e1' : '#9ca3af',
                        cursor: updatingRoleId === m.userId ? 'wait' : 'pointer',
                        opacity: updatingRoleId === m.userId ? 0.7 : 1,
                      }}
                    >
                      {ROLES.filter((r) => r !== 'owner').map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  )}
                  {updatingRoleId === m.userId && (
                    <span role="status" style={{ display: 'block', marginTop: 4, fontSize: 12, color: '#9ca3af' }}>
                      Updating role...
                    </span>
                  )}
                </td>
                <td style={tdStyle}>
                  {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : '—'}
                </td>
                <td style={tdStyle}>
                  {m.role !== 'owner' && (
                    <button
                      onClick={() => handleRemove(m.userId, m.displayName)}
                      aria-label={`Remove ${m.displayName ?? m.userId}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#f87171',
                        cursor: 'pointer',
                        fontSize: 13,
                        padding: '4px 8px',
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 13,
  color: '#9ca3af',
  fontWeight: 600,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 14,
  color: '#cbd5e1',
};
