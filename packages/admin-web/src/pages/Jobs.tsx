import React, { useEffect, useState } from 'react';
import { api, type JobResponse } from '../api.js';

interface JobsProps {
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

const STATUS_COLORS: Record<string, string> = {
  queued: '#6b7280',
  running: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
};

export function Jobs({ token, teamSlug }: JobsProps) {
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !teamSlug) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.listJobs(token, teamSlug);
        if (!cancelled) setJobs(Array.isArray(data) ? data : []);
      } catch (err: any) {
        if (!cancelled) {
          setError('Job queue not available. The team server may not support job listing, or is not running.');
          setJobs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [token, teamSlug]);

  return (
    <div>
      <h1 style={{ marginTop: 0, color: '#f0f2f7' }}>Agent Jobs</h1>

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
        <p style={{ color: '#9ca3af' }}>Loading jobs...</p>
      ) : jobs.length === 0 && !error ? (
        <div style={{
          padding: 32,
          background: '#12141a',
          border: '1px solid #2a2d36',
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
          textAlign: 'center',
          color: '#9ca3af',
        }}>
          <p style={{ fontSize: 16, marginBottom: 4 }}>No jobs found</p>
          <p style={{ fontSize: 13 }}>Jobs appear here when agents execute tasks in the team workspace.</p>
        </div>
      ) : jobs.length > 0 ? (
        <table style={TABLE_STYLE}>
          <thead>
            <tr>
              <th style={TH_STYLE}>ID</th>
              <th style={TH_STYLE}>Type</th>
              <th style={TH_STYLE}>Status</th>
              <th style={TH_STYLE}>Created</th>
              <th style={TH_STYLE}>Completed</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} style={{ borderBottom: '1px solid #1a1d25' }}>
                <td style={{ ...TD_STYLE, fontFamily: 'monospace', fontSize: 12 }}>
                  {job.id.slice(0, 8)}
                </td>
                <td style={TD_STYLE}>{job.jobType}</td>
                <td style={TD_STYLE}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    background: (STATUS_COLORS[job.status] ?? '#6b7280') + '20',
                    color: STATUS_COLORS[job.status] ?? '#6b7280',
                  }}>
                    {job.status}
                  </span>
                </td>
                <td style={TD_STYLE}>
                  {new Date(job.createdAt).toLocaleString()}
                </td>
                <td style={TD_STYLE}>
                  {job.completedAt ? new Date(job.completedAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
