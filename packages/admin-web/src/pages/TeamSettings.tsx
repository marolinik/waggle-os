/**
 * TeamSettings page — edit team name and view team info.
 *
 * Minimal — just enough to manage a team without raw API calls.
 */

import React, { useEffect, useState } from 'react';
import { api, type TeamResponse } from '../api.js';

interface TeamSettingsProps {
  token: string;
  teamSlug: string;
  onTeamUpdated?: () => void;
}

export function TeamSettings({ token, teamSlug, onTeamUpdated }: TeamSettingsProps) {
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token || !teamSlug) return;
    (async () => {
      try {
        setLoading(true);
        const t = await api.getTeam(token, teamSlug);
        setTeam(t);
        setName(t.name);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load team');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, teamSlug]);

  const handleSave = async () => {
    if (!name.trim() || name === team?.name) return;
    try {
      setSaving(true);
      setError(null);
      const updated = await api.updateTeam(token, teamSlug, { name: name.trim() });
      setTeam(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onTeamUpdated?.();
    } catch (err: any) {
      setError(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p style={{ color: '#9ca3af' }}>Loading team settings...</p>;

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#f0f2f7' }}>Team Settings</h1>

      {error && (
        <div style={{
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

      <div style={{
        padding: 24,
        background: '#12141a',
        border: '1px solid #2a2d36',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        maxWidth: 480,
      }}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Team Name</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#1a1d25',
                border: '1px solid #2a2d36',
                borderRadius: 4,
                fontSize: 14,
                color: '#f0f2f7',
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || name === team?.name}
              style={{
                padding: '8px 16px',
                background: '#e5a000',
                color: '#08090c',
                border: 'none',
                borderRadius: 4,
                cursor: saving ? 'wait' : 'pointer',
                fontSize: 14,
                fontWeight: 600,
                opacity: saving || !name.trim() || name === team?.name ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Slug</label>
          <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1' }}>{team?.slug ?? '—'}</p>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Team ID</label>
          <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', fontFamily: 'monospace' }}>{team?.id ?? '—'}</p>
        </div>

        <div>
          <label style={labelStyle}>Created</label>
          <p style={{ margin: 0, fontSize: 14, color: '#cbd5e1' }}>
            {team?.createdAt ? new Date(team.createdAt).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#9ca3af',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};
