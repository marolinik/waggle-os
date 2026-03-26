import React, { useState } from 'react';
import { Dashboard } from './pages/Dashboard.js';
import { Jobs } from './pages/Jobs.js';
import { Audit } from './pages/Audit.js';
import { Members } from './pages/Members.js';
import { Capabilities } from './pages/Capabilities.js';
import { TeamSettings } from './pages/TeamSettings.js';
import { Analytics } from './pages/Analytics.js';

type Page = 'dashboard' | 'analytics' | 'jobs' | 'audit' | 'members' | 'capabilities' | 'settings';

const NAV_ITEMS: { key: Page; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'members', label: 'Members' },
  { key: 'capabilities', label: 'Capabilities' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'audit', label: 'Audit Log' },
  { key: 'settings', label: 'Team Settings' },
];

export function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const [token, setToken] = useState('');
  const [teamSlug, setTeamSlug] = useState('');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <nav
        style={{
          width: 220,
          padding: 16,
          background: '#0d0e12',
          color: '#f0f2f7',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #2a2d36',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>&#x2B21;</span>
          <h2 style={{ fontSize: 16, margin: 0, letterSpacing: 1, color: '#f0f2f7', fontWeight: 600 }}>Waggle Admin</h2>
        </div>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <li key={item.key} style={{ marginBottom: 2 }}>
              <button
                onClick={() => setPage(item.key)}
                style={{
                  background: page === item.key ? 'rgba(229, 160, 0, 0.08)' : 'transparent',
                  color: page === item.key ? '#f0f2f7' : '#9ca3af',
                  border: 'none',
                  borderLeft: page === item.key ? '2px solid #e5a000' : '2px solid transparent',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  borderRadius: '0 4px 4px 0',
                  fontSize: 14,
                  fontWeight: page === item.key ? 500 : 400,
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>

        {/* Connection config at bottom of sidebar */}
        <div style={{ borderTop: '1px solid #2a2d36', paddingTop: 12, marginTop: 12 }}>
          <label style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Team Slug
          </label>
          <input
            type="text"
            value={teamSlug}
            onChange={(e) => setTeamSlug(e.target.value)}
            placeholder="my-team"
            style={{
              width: '100%',
              padding: '6px 8px',
              background: '#12141a',
              border: '1px solid #2a2d36',
              borderRadius: 4,
              color: '#f0f2f7',
              fontSize: 12,
              marginTop: 4,
              marginBottom: 8,
              boxSizing: 'border-box',
            }}
          />
          <label style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Auth Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token"
            style={{
              width: '100%',
              padding: '6px 8px',
              background: '#12141a',
              border: '1px solid #2a2d36',
              borderRadius: 4,
              color: '#f0f2f7',
              fontSize: 12,
              marginTop: 4,
              boxSizing: 'border-box',
            }}
          />
        </div>
      </nav>
      <main style={{ flex: 1, padding: 24, background: '#08090c', overflowY: 'auto' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          {!token || !teamSlug ? (
            <div style={{ color: '#9ca3af', marginTop: 40, textAlign: 'center' }}>
              <h2 style={{ color: '#f0f2f7' }}>Connect to a Team</h2>
              <p>Enter your team slug and auth token in the sidebar to get started.</p>
            </div>
          ) : (
            <>
              {page === 'dashboard' && <Dashboard token={token} teamSlug={teamSlug} />}
              {page === 'analytics' && <Analytics token={token} teamSlug={teamSlug} />}
              {page === 'members' && <Members token={token} teamSlug={teamSlug} />}
              {page === 'capabilities' && <Capabilities token={token} teamSlug={teamSlug} />}
              {page === 'jobs' && <Jobs token={token} teamSlug={teamSlug} />}
              {page === 'audit' && <Audit token={token} teamSlug={teamSlug} />}
              {page === 'settings' && <TeamSettings token={token} teamSlug={teamSlug} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
