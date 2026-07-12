import React, { useEffect, useState } from 'react';
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

function pageFromHash(hash: string): Page {
  const value = hash.replace(/^#/, '');
  return NAV_ITEMS.some((item) => item.key === value) ? (value as Page) : 'dashboard';
}

export function App() {
  const [page, setPage] = useState<Page>(() => pageFromHash(window.location.hash));
  const [token, setToken] = useState('');
  const [teamSlug, setTeamSlug] = useState('');

  useEffect(() => {
    const syncFromHash = () => setPage(pageFromHash(window.location.hash));
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const main = document.querySelector<HTMLElement>('.admin-main');
    if (main) {
      main.scrollTop = 0;
      main.scrollLeft = 0;
    }
  }, [page]);

  const navigateTo = (nextPage: Page) => {
    setPage(nextPage);
    window.location.hash = nextPage;
  };

  return (
    <div className="admin-shell" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <nav
        className="admin-sidebar"
        aria-label="Admin sections"
        style={{
          background: '#0d0e12',
          color: '#f0f2f7',
          borderRight: '1px solid #2a2d36',
        }}
      >
        <div className="admin-brand" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>&#x2B21;</span>
          <h2 style={{ fontSize: 16, margin: 0, letterSpacing: 1, color: '#f0f2f7', fontWeight: 600 }}>Waggle Admin</h2>
        </div>
        <ul className="admin-nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.key} style={{ marginBottom: 2 }}>
              <button
                type="button"
                onClick={() => navigateTo(item.key)}
                aria-current={page === item.key ? 'page' : undefined}
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
        <div className="admin-connection" style={{ borderTop: '1px solid #2a2d36' }}>
          <label
            htmlFor="admin-team-slug"
            className="admin-field-label"
          >
            Team Slug
          </label>
          <input
            id="admin-team-slug"
            name="teamSlug"
            type="text"
            autoComplete="organization"
            value={teamSlug}
            onChange={(e) => setTeamSlug(e.target.value)}
            placeholder="my-team"
            className="admin-field"
            style={{
              background: '#12141a',
              border: '1px solid #2a2d36',
              color: '#f0f2f7',
            }}
          />
          <label
            htmlFor="admin-auth-token"
            className="admin-field-label"
          >
            Auth Token
          </label>
          <input
            id="admin-auth-token"
            name="authToken"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Bearer token"
            className="admin-field"
            style={{
              background: '#12141a',
              border: '1px solid #2a2d36',
              color: '#f0f2f7',
            }}
          />
        </div>
      </nav>
      <main className="admin-main">
        <div className="admin-content">
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
