/**
 * Analytics page — team usage analytics dashboard.
 *
 * Shows active users, token usage, top tools, capability gaps,
 * and performance trends. Admin-only.
 */

import React, { useEffect, useState } from 'react';
import { api, type AnalyticsResponse } from '../api.js';

interface AnalyticsProps {
  token: string;
  teamSlug: string;
}

/* ─── Shared styles ─── */

const cardStyle: React.CSSProperties = {
  padding: 20,
  background: '#12141a',
  border: '1px solid #2a2d36',
  borderRadius: 8,
  boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '0 0 12px',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 13,
  color: '#9ca3af',
  fontWeight: 600,
  borderBottom: '1px solid #2a2d36',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 14,
  color: '#cbd5e1',
  borderBottom: '1px solid #1a1d25',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: '#12141a',
  border: '1px solid #2a2d36',
  borderRadius: 8,
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
};

/* ─── Sub-components ─── */

function ActiveUsersCard({ data }: { data: AnalyticsResponse['activeUsers'] }) {
  return (
    <div style={cardStyle}>
      <h3 style={sectionTitle}>Active Users</h3>
      <div style={{ display: 'flex', gap: 24 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#e5a000' }}>{data.daily}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Last 24h</div>
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#e5a000' }}>{data.weekly}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Last 7d</div>
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#e5a000' }}>{data.monthly}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Last 30d</div>
        </div>
      </div>
    </div>
  );
}

function TokenUsageCard({ data }: { data: AnalyticsResponse['tokenUsage'] }) {
  const formattedTotal = data.total >= 1000000
    ? `${(data.total / 1000000).toFixed(1)}M`
    : data.total >= 1000
      ? `${(data.total / 1000).toFixed(1)}K`
      : String(data.total);

  return (
    <div style={cardStyle}>
      <h3 style={sectionTitle}>Token Usage</h3>
      <div style={{ fontSize: 28, fontWeight: 'bold', color: '#e5a000', marginBottom: 16 }}>
        {formattedTotal} tokens
      </div>
      {data.byUser.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>No usage data yet.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>User</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Tokens</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.byUser.map((u) => (
              <tr key={u.userId}>
                <td style={tdStyle}>{u.name}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {u.tokens.toLocaleString()}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  ${u.cost.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TopToolsCard({ data }: { data: AnalyticsResponse['topTools'] }) {
  const maxInvocations = data.length > 0 ? Math.max(...data.map((t) => t.invocations)) : 1;

  return (
    <div style={cardStyle}>
      <h3 style={sectionTitle}>Top Tools</h3>
      {data.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>No tool usage data yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map((tool) => {
            const widthPercent = Math.max((tool.invocations / maxInvocations) * 100, 2);
            return (
              <div key={tool.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, color: '#f0f2f7' }}>{tool.name}</span>
                  <span style={{ color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>
                    {tool.invocations}
                  </span>
                </div>
                <div style={{
                  height: 8,
                  background: '#1a1d25',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${widthPercent}%`,
                    height: '100%',
                    background: '#e5a000',
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopCommandsCard({ data }: { data: AnalyticsResponse['topCommands'] }) {
  const maxCount = data.length > 0 ? Math.max(...data.map((c) => c.count)) : 1;

  return (
    <div style={cardStyle}>
      <h3 style={sectionTitle}>Top Commands</h3>
      {data.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>No command usage data yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.map((cmd) => {
            const widthPercent = Math.max((cmd.count / maxCount) * 100, 2);
            return (
              <div key={cmd.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, color: '#f0f2f7', fontFamily: 'monospace' }}>{cmd.name}</span>
                  <span style={{ color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{cmd.count}</span>
                </div>
                <div style={{
                  height: 8,
                  background: '#1a1d25',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${widthPercent}%`,
                    height: '100%',
                    background: '#a78bfa',
                    borderRadius: 4,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CapabilityGapsCard({ data }: { data: AnalyticsResponse['capabilityGaps'] }) {
  return (
    <div style={cardStyle}>
      <h3 style={sectionTitle}>Capability Gaps</h3>
      {data.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13 }}>No capability gaps detected.</p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Tool</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Requests</th>
              <th style={thStyle}>Suggestion</th>
            </tr>
          </thead>
          <tbody>
            {data.map((gap) => (
              <tr key={gap.tool}>
                <td style={tdStyle}>
                  <span style={{
                    padding: '2px 8px',
                    background: 'rgba(229, 160, 0, 0.15)',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#e5a000',
                  }}>
                    {gap.tool}
                  </span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {gap.requestCount}
                </td>
                <td style={{ ...tdStyle, fontSize: 13, color: '#9ca3af' }}>{gap.suggestion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PerformanceTrendsCard({ data }: { data: AnalyticsResponse['performanceTrends'] }) {
  const trendColor = data.correctionTrend < 0 ? '#10b981' : data.correctionTrend > 0 ? '#ef4444' : '#6b7280';
  const trendArrow = data.correctionTrend < 0 ? 'v' : data.correctionTrend > 0 ? '^' : '-';
  const trendLabel = data.correctionTrend < 0 ? 'improving' : data.correctionTrend > 0 ? 'worsening' : 'stable';

  return (
    <div style={cardStyle}>
      <h3 style={sectionTitle}>Performance Trends</h3>
      <div style={{ display: 'flex', gap: 32 }}>
        <div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Correction Rate</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#e5a000' }}>
            {(data.correctionRate * 100).toFixed(1)}%
          </div>
          <div style={{ fontSize: 12, color: trendColor, fontWeight: 500 }}>
            {trendArrow} {Math.abs(data.correctionTrend * 100).toFixed(1)}% ({trendLabel})
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Avg Response Time</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#e5a000' }}>
            {data.avgResponseTime.toFixed(1)}s
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>per completed job</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ─── */

export function Analytics({ token, teamSlug }: AnalyticsProps) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !teamSlug) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await api.getAnalytics(token, teamSlug);
        if (!cancelled) setData(result);
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, teamSlug]);

  if (loading) {
    return (
      <div>
        <h1 style={{ marginTop: 0, color: '#f0f2f7' }}>Analytics</h1>
        <p style={{ color: '#9ca3af' }}>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#f0f2f7' }}>Usage Analytics</h1>

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

      {data && (
        <>
          {/* Row 1: Active Users + Performance Trends */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 16,
            marginTop: 16,
          }}>
            <ActiveUsersCard data={data.activeUsers} />
            <PerformanceTrendsCard data={data.performanceTrends} />
          </div>

          {/* Row 2: Token Usage */}
          <div style={{ marginTop: 24 }}>
            <TokenUsageCard data={data.tokenUsage} />
          </div>

          {/* Row 3: Top Tools + Top Commands */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 16,
            marginTop: 24,
          }}>
            <TopToolsCard data={data.topTools} />
            <TopCommandsCard data={data.topCommands} />
          </div>

          {/* Row 4: Capability Gaps */}
          <div style={{ marginTop: 24 }}>
            <CapabilityGapsCard data={data.capabilityGaps} />
          </div>
        </>
      )}
    </div>
  );
}
