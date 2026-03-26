import React, { useEffect, useState } from 'react';
import { api, type AuditEntryResponse } from '../api.js';

interface AuditProps {
  token: string;
  teamSlug: string;
}

const TABLE_STYLE: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginTop: 16,
  background: '#12141a',
  border: '1px solid #2a2d36',
  borderRadius: 8,
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
};

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 16px',
  borderBottom: '1px solid #2a2d36',
  fontSize: 13,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

const TD_STYLE: React.CSSProperties = {
  padding: '10px 16px',
  fontSize: 14,
  color: '#cbd5e1',
};

function approvalLabel(entry: AuditEntryResponse): string {
  if (!entry.requiresApproval) return '—';
  if (entry.approved === true) return 'Approved';
  if (entry.approved === false) return 'Rejected';
  return 'Pending';
}

function approvalColor(entry: AuditEntryResponse): string {
  if (!entry.requiresApproval) return '#6b7280';
  if (entry.approved === true) return '#10b981';
  if (entry.approved === false) return '#ef4444';
  return '#f59e0b';
}

export function Audit({ token, teamSlug }: AuditProps) {
  const [entries, setEntries] = useState<AuditEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !teamSlug) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.listAudit(token, teamSlug);
        if (!cancelled) setEntries(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (!cancelled) {
          setError('Could not load audit log. You may need admin access, or the server is not running.');
          setEntries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, teamSlug]);

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#f0f2f7' }}>Audit Log</h1>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(251, 191, 36, 0.1)',
          border: '1px solid rgba(251, 191, 36, 0.3)',
          borderRadius: 4,
          color: '#fbbf24',
          marginBottom: 16,
          fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#9ca3af' }}>Loading audit log...</p>
      ) : entries.length === 0 && !error ? (
        <div style={{
          padding: 32,
          background: '#12141a',
          border: '1px solid #2a2d36',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
          textAlign: 'center',
          color: '#9ca3af',
        }}>
          <p style={{ fontSize: 16, marginBottom: 4 }}>No audit entries</p>
          <p style={{ fontSize: 13 }}>Agent actions will appear here as they are logged.</p>
        </div>
      ) : entries.length > 0 ? (
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={TH_STYLE}>Agent</th>
              <th style={TH_STYLE}>Action</th>
              <th style={TH_STYLE}>Approval</th>
              <th style={TH_STYLE}>Details</th>
              <th style={TH_STYLE}>Time</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} style={{ borderBottom: '1px solid #1a1d25' }}>
                <td style={TD_STYLE}>
                  <span style={{ fontWeight: 600, color: '#f0f2f7' }}>{entry.agentName}</span>
                </td>
                <td style={TD_STYLE}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    background: 'rgba(229, 160, 0, 0.12)',
                    color: '#f0b429',
                  }}>
                    {entry.actionType}
                  </span>
                </td>
                <td style={TD_STYLE}>
                  <span style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: approvalColor(entry),
                  }}>
                    {approvalLabel(entry)}
                  </span>
                </td>
                <td style={{ ...TD_STYLE, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.description}
                </td>
                <td style={TD_STYLE}>
                  {new Date(entry.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
