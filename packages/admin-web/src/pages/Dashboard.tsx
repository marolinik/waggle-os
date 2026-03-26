import React, { useEffect, useState } from 'react';
import { api, type TeamResponse, type TaskResponse } from '../api.js';

interface DashboardProps {
  token: string;
  teamSlug: string;
}

interface StatCardProps {
  title: string;
  value: string;
}

function StatCard({ title, value }: StatCardProps) {
  return (
    <div
      style={{
        padding: 20,
        background: '#12141a',
        border: '1px solid #2a2d36',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
      }}
    >
      <h3 style={{ margin: 0, fontSize: 14, color: '#9ca3af' }}>{title}</h3>
      <p style={{ margin: '8px 0 0', fontSize: 32, fontWeight: 'bold', color: '#e5a000' }}>
        {value}
      </p>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  open: '#3b82f6',
  'in-progress': '#f59e0b',
  completed: '#10b981',
  cancelled: '#6b7280',
};

export function Dashboard({ token, teamSlug }: DashboardProps) {
  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [tasks, setTasks] = useState<TaskResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !teamSlug) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [teamData, taskData] = await Promise.allSettled([
          api.getTeam(token, teamSlug),
          api.listTasks(token, teamSlug),
        ]);

        if (cancelled) return;

        if (teamData.status === 'fulfilled') {
          setTeam(teamData.value);
        }
        if (taskData.status === 'fulfilled') {
          setTasks(taskData.value);
        }

        if (teamData.status === 'rejected' && taskData.status === 'rejected') {
          setError('Could not connect to team server. Is it running?');
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'Failed to load dashboard data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, teamSlug]);

  const memberCount = team?.members?.length ?? 0;
  const activeTasks = tasks.filter((t) => t.status === 'open' || t.status === 'in-progress');
  const recentTasks = tasks.slice(0, 5);

  if (loading) {
    return (
      <div>
        <h1 style={{ marginTop: 0, color: '#f0f2f7' }}>Dashboard</h1>
        <p style={{ color: '#9ca3af' }}>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#f0f2f7' }}>
        {team ? `${team.name} Dashboard` : 'Dashboard'}
      </h1>

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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginTop: 16,
        }}
      >
        <StatCard title="Members" value={String(memberCount)} />
        <StatCard title="Active Tasks" value={String(activeTasks.length)} />
        <StatCard title="Total Tasks" value={String(tasks.length)} />
        <StatCard title="Team Slug" value={teamSlug} />
      </div>

      {/* Active Members */}
      {team?.members && team.members.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ color: '#f0f2f7', borderBottom: '1px solid #2a2d36', paddingBottom: 8 }}>Team Members</h2>
          <div style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            {team.members.map((m) => (
              <div
                key={m.userId}
                style={{
                  padding: '12px 16px',
                  background: '#12141a',
                  border: '1px solid #2a2d36',
                  borderRadius: 8,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
                  minWidth: 150,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f2f7' }}>
                  {m.displayName ?? m.userId.slice(0, 8)}
                </div>
                <div style={{
                  fontSize: 12,
                  color: '#9ca3af',
                  marginTop: 4,
                }}>
                  {m.role}
                  {m.email ? ` - ${m.email}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Tasks */}
      <div style={{ marginTop: 32 }}>
        <h2 style={{ color: '#f0f2f7', borderBottom: '1px solid #2a2d36', paddingBottom: 8 }}>Recent Tasks</h2>
        {recentTasks.length === 0 ? (
          <p style={{ color: '#9ca3af' }}>No tasks yet.</p>
        ) : (
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            background: '#12141a',
            border: '1px solid #2a2d36',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
          }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2d36' }}>
                <th style={thStyle}>Title</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Priority</th>
                <th style={thStyle}>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentTasks.map((task) => (
                <tr key={task.id} style={{ borderBottom: '1px solid #1a1d25' }}>
                  <td style={tdStyle}>{task.title}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      background: (STATUS_COLORS[task.status] ?? '#6b7280') + '20',
                      color: STATUS_COLORS[task.status] ?? '#6b7280',
                    }}>
                      {task.status}
                    </span>
                  </td>
                  <td style={tdStyle}>{task.priority}</td>
                  <td style={tdStyle}>
                    {new Date(task.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 14,
  color: '#cbd5e1',
};
