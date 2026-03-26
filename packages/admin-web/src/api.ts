/**
 * API client for the Waggle Admin Dashboard.
 * Calls the Waggle server REST API.
 */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3100';

async function apiFetch<T = unknown>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function apiMutate<T = unknown>(
  path: string,
  token: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface TeamMemberResponse {
  userId: string;
  displayName?: string;
  email?: string;
  role: string;
  joinedAt?: string;
}

export interface TeamResponse {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  members?: TeamMemberResponse[];
}

export interface TaskResponse {
  id: string;
  teamId: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignedTo?: string;
  createdBy: string;
  parentTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntryResponse {
  id: string;
  userId: string;
  teamId?: string;
  agentName: string;
  actionType: string;
  description: string;
  requiresApproval: boolean;
  approved?: boolean;
  approvedBy?: string;
  createdAt: string;
}

export interface JobResponse {
  id: string;
  teamId: string;
  userId: string;
  jobType: string;
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface CapabilityPolicyResponse {
  id: string;
  teamId: string;
  role: string;
  allowedSources: string[];
  blockedTools: string[];
  approvalThreshold: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityOverrideResponse {
  id: string;
  teamId: string;
  capabilityName: string;
  capabilityType: string;
  decision: string;
  reason: string;
  decidedBy: string;
  createdAt: string;
  decidedAt: string;
}

export interface CapabilityRequestResponse {
  id: string;
  teamId: string;
  requestedBy: string;
  capabilityName: string;
  capabilityType: string;
  justification: string;
  status: string;
  decidedBy?: string;
  decisionReason?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface AnalyticsResponse {
  activeUsers: { daily: number; weekly: number; monthly: number };
  tokenUsage: {
    total: number;
    byUser: Array<{ userId: string; name: string; tokens: number; cost: number }>;
  };
  topTools: Array<{ name: string; invocations: number }>;
  topCommands: Array<{ name: string; count: number }>;
  capabilityGaps: Array<{ tool: string; requestCount: number; suggestion: string }>;
  performanceTrends: {
    correctionRate: number;
    correctionTrend: number;
    avgResponseTime: number;
  };
}

export const api = {
  listTeams: (token: string) => apiFetch<TeamResponse[]>('/api/teams', token),
  getTeam: (token: string, slug: string) =>
    apiFetch<TeamResponse>(`/api/teams/${encodeURIComponent(slug)}`, token),
  updateTeam: (token: string, slug: string, data: { name: string }) =>
    apiMutate<TeamResponse>(`/api/teams/${encodeURIComponent(slug)}`, token, 'PATCH', data),
  inviteMember: (token: string, slug: string, email: string, role: string) =>
    apiMutate<TeamMemberResponse>(
      `/api/teams/${encodeURIComponent(slug)}/members`, token, 'POST', { email, role },
    ),
  removeMember: (token: string, slug: string, userId: string) =>
    apiMutate<void>(
      `/api/teams/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
      token, 'DELETE',
    ),
  updateMemberRole: (token: string, slug: string, userId: string, role: string) =>
    apiMutate<TeamMemberResponse>(
      `/api/teams/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
      token, 'PATCH', { role },
    ),
  listJobs: (token: string, slug: string) =>
    apiFetch<JobResponse[]>(`/api/jobs?teamSlug=${encodeURIComponent(slug)}`, token),
  listCron: (token: string, slug: string) =>
    apiFetch(`/api/teams/${encodeURIComponent(slug)}/cron`, token),
  listAudit: (token: string, slug: string) =>
    apiFetch<AuditEntryResponse[]>(`/api/admin/teams/${encodeURIComponent(slug)}/audit`, token),
  getStats: (token: string, slug: string) =>
    apiFetch(`/api/admin/teams/${encodeURIComponent(slug)}/usage`, token),
  getAnalytics: (token: string, slug: string) =>
    apiFetch<AnalyticsResponse>(`/api/admin/teams/${encodeURIComponent(slug)}/analytics`, token),
  listTasks: (token: string, slug: string) =>
    apiFetch<TaskResponse[]>(`/api/teams/${encodeURIComponent(slug)}/tasks`, token),
  listScoutFindings: (token: string) => apiFetch('/api/scout/findings', token),
  listSuggestions: (token: string) => apiFetch('/api/suggestions', token),
  // Capability Governance
  listCapabilityPolicies: (token: string, slug: string) =>
    apiFetch<CapabilityPolicyResponse[]>(`/api/teams/${encodeURIComponent(slug)}/capability-policies`, token),
  updateCapabilityPolicy: (token: string, slug: string, role: string, data: { allowedSources: string[]; blockedTools: string[]; approvalThreshold: string }) =>
    apiMutate<CapabilityPolicyResponse>(`/api/teams/${encodeURIComponent(slug)}/capability-policies/${encodeURIComponent(role)}`, token, 'PUT', data),
  listCapabilityOverrides: (token: string, slug: string) =>
    apiFetch<CapabilityOverrideResponse[]>(`/api/teams/${encodeURIComponent(slug)}/capability-overrides`, token),
  createCapabilityOverride: (token: string, slug: string, data: { capabilityName: string; capabilityType: string; decision: string; reason: string }) =>
    apiMutate<CapabilityOverrideResponse>(`/api/teams/${encodeURIComponent(slug)}/capability-overrides`, token, 'POST', data),
  deleteCapabilityOverride: (token: string, slug: string, id: string) =>
    apiMutate<void>(`/api/teams/${encodeURIComponent(slug)}/capability-overrides/${encodeURIComponent(id)}`, token, 'DELETE'),
  listCapabilityRequests: (token: string, slug: string, status?: string) =>
    apiFetch<CapabilityRequestResponse[]>(`/api/teams/${encodeURIComponent(slug)}/capability-requests${status ? `?status=${status}` : ''}`, token),
  decideCapabilityRequest: (token: string, slug: string, id: string, decision: { status: string; reason?: string }) =>
    apiMutate<CapabilityRequestResponse>(`/api/teams/${encodeURIComponent(slug)}/capability-requests/${encodeURIComponent(id)}`, token, 'PATCH', decision),
};
