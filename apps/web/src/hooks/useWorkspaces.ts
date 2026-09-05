import { useState, useCallback, useEffect, useRef } from 'react';
import { adapter } from '@/lib/adapter';
import type { Workspace } from '@/lib/types';
import { useRevalidateOnError } from '@/hooks/useRevalidateOnError';
import { toast } from '@/hooks/use-toast';
import {
  resolveActiveWorkspaceId,
  readPersistedWorkspaceId,
  persistWorkspaceId,
  clearPersistedWorkspaceId,
} from '@/lib/workspace-selection';

function isAuthorizationDenial(err: unknown): boolean {
  const hasStatus = typeof err === 'object' && err !== null && 'status' in err;
  const status = hasStatus ? Number((err as { status?: unknown }).status) : undefined;
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  if (hasStatus && Number.isFinite(status)) return status === 401 || status === 403;
  return message.includes('401') || message.includes('403')
    || message.includes('unauthor') || message.includes('forbid')
    || message.includes('denied');
}

function isMutationAccessRevocation(err: unknown): boolean {
  if (!isAuthorizationDenial(err)) return false;
  const body = typeof err === 'object' && err !== null && 'body' in err
    ? (err as { body?: unknown }).body
    : null;
  const payload = body !== null && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
  // A viewer or tier-limit 403 rejects this mutation but still grants read
  // access. Every other auth-shaped denial fails closed until a list retry.
  return payload?.code !== 'VIEWER_READ_ONLY'
    && !(typeof payload?.tier === 'string' && typeof payload?.limit === 'number');
}

export const useWorkspaces = (profileId: string | null = null) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [listOwner, setListOwner] = useState<string | null>(profileId);
  // W2A: selection is explicit-only + survives full page loads. Seed from
  // localStorage so a typed-URL visit to / or /workspaces keeps the workspace.
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => readPersistedWorkspaceId());
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<{
    owner: string | null;
    message: string | null;
    accessDenied: boolean;
  }>({ owner: profileId, message: null, accessDenied: false });
  const listRevisionRef = useRef(0);
  const listOwnerRef = useRef<string | null>(profileId);
  const accessGenerationRef = useRef(0);
  const profileIdRef = useRef(profileId);
  profileIdRef.current = profileId;
  const currentErrorState = errorState.owner === profileId ? errorState : null;
  const error = currentErrorState?.message ?? null;
  const accessDenied = currentErrorState?.accessDenied ?? false;

  const revokeWorkspaceAccess = useCallback((owner: string | null) => {
    ++listRevisionRef.current;
    ++accessGenerationRef.current;
    setWorkspaces([]);
    listOwnerRef.current = owner;
    setListOwner(owner);
    setActiveWorkspaceId(null);
    setLoading(false);
    clearPersistedWorkspaceId();
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    const requestOwner = profileId;
    const listRevision = ++listRevisionRef.current;
    setLoading(true);
    try {
      const data = await adapter.getWorkspaces();
      if (listRevision !== listRevisionRef.current) return;
      setWorkspaces(data);
      listOwnerRef.current = requestOwner;
      setListOwner(requestOwner);
      // W2A: NO auto-select. Validate the existing selection against the fresh
      // list (dropping a stale/deleted id to null); never promote data[0].
      setActiveWorkspaceId(prev => {
        const next = resolveActiveWorkspaceId(prev, data.map(w => w.id));
        if (prev !== null && next === null) clearPersistedWorkspaceId();
        return next;
      });
      setErrorState({ owner: requestOwner, message: null, accessDenied: false });
    } catch (err) {
      if (listRevision !== listRevisionRef.current) return;
      console.error('[useWorkspaces] fetch failed:', err);
      const denied = isAuthorizationDenial(err);
      if (denied) revokeWorkspaceAccess(requestOwner);
      // P1b D3: surface the failure (this channel existed but was never set —
      // a lost boot race meant an empty workspace list for the whole session)
      // and keep same-profile data for transient failures. Auth denials revoke
      // that right, and another profile's retained list is hidden below.
      setErrorState({
        owner: requestOwner,
        message: err instanceof Error ? err.message : 'Failed to load workspaces',
        accessDenied: denied,
      });
    } finally {
      if (listRevision === listRevisionRef.current) setLoading(false);
    }
  }, [profileId, revokeWorkspaceAccess]);

  useEffect(() => { void fetchWorkspaces(); }, [fetchWorkspaces]);
  // P1b D3 plus-clause: errored list revalidates on focus/online/connect-settled.
  useRevalidateOnError(error !== null, fetchWorkspaces);

  const createWorkspace = useCallback(async (data: { name: string; group: string; persona?: string; agentGroupId?: string; shared?: boolean; templateId?: string; storageType?: Workspace['storageType']; storagePath?: string; storageConfig?: Record<string, unknown> }) => {
    const accessGeneration = accessGenerationRef.current;
    try {
      const ws = await adapter.createWorkspace(data);
      if (profileIdRef.current !== profileId || accessGenerationRef.current !== accessGeneration) return null;
      const ownsMutationList = listOwnerRef.current === profileId;
      ++listRevisionRef.current;
      setLoading(false);
      setErrorState({ owner: profileId, message: null, accessDenied: false });
      listOwnerRef.current = profileId;
      setListOwner(profileId);
      setWorkspaces(prev => ownsMutationList
        ? [...prev.filter(existing => existing.id !== ws.id), ws]
        : [ws]);
      setActiveWorkspaceId(ws.id);
      persistWorkspaceId(ws.id);
      if (!ownsMutationList) void fetchWorkspaces();
      return ws;
    } catch (err) {
      if (profileIdRef.current !== profileId || accessGenerationRef.current !== accessGeneration) return null;
      console.error('[useWorkspaces] create failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to create workspace';
      const denied = isMutationAccessRevocation(err);
      if (denied) revokeWorkspaceAccess(profileId);
      setErrorState({ owner: profileId, message, accessDenied: denied });
      toast({
        title: "Couldn't create workspace",
        description: message,
        variant: 'destructive',
      });
      return null;
    }
  }, [fetchWorkspaces, profileId, revokeWorkspaceAccess]);

  // G4 (UX-Northstar 2026-06-13): state mutates ONLY on server success — a failed
  // delete/patch must not pretend it happened (error-as-empty antipattern).
  // Returns success so menu-style callers can toast; legacy fire-and-forget
  // callers (AppShell persona/group switch) keep working without throw.
  const deleteWorkspace = useCallback(async (id: string): Promise<boolean> => {
    const accessGeneration = accessGenerationRef.current;
    try {
      await adapter.deleteWorkspace(id);
    } catch (err) {
      if (profileIdRef.current !== profileId || accessGenerationRef.current !== accessGeneration) return false;
      console.error('[useWorkspaces] delete failed:', err);
      if (isMutationAccessRevocation(err)) {
        revokeWorkspaceAccess(profileId);
        setErrorState({
          owner: profileId,
          message: err instanceof Error ? err.message : 'Workspace access denied',
          accessDenied: true,
        });
      }
      return false;
    }
    if (profileIdRef.current !== profileId || accessGenerationRef.current !== accessGeneration) return false;
    const ownsMutationList = listOwnerRef.current === profileId;
    ++listRevisionRef.current;
    setErrorState({ owner: profileId, message: null, accessDenied: false });
    listOwnerRef.current = profileId;
    setListOwner(profileId);
    setWorkspaces(prev => ownsMutationList ? prev.filter(w => w.id !== id) : []);
    // W2A: deleting the active workspace clears the selection (no silent
    // successor-pick) — the shell then prompts the user to choose one.
    setActiveWorkspaceId(current => {
      if (current !== id) return current;
      clearPersistedWorkspaceId();
      return null;
    });
    if (!ownsMutationList) {
      void fetchWorkspaces();
      return true;
    }
    setLoading(false);
    return true;
  }, [fetchWorkspaces, profileId, revokeWorkspaceAccess]);

  const patchWorkspace = useCallback(async (id: string, data: Partial<Pick<Workspace, 'persona' | 'agentGroupId' | 'name' | 'group' | 'model' | 'status' | 'description'>>): Promise<boolean> => {
    const accessGeneration = accessGenerationRef.current;
    try {
      await adapter.patchWorkspace(id, data);
    } catch (err) {
      if (profileIdRef.current !== profileId || accessGenerationRef.current !== accessGeneration) return false;
      console.error('[useWorkspaces] patch failed:', err);
      if (isMutationAccessRevocation(err)) {
        revokeWorkspaceAccess(profileId);
        setErrorState({
          owner: profileId,
          message: err instanceof Error ? err.message : 'Workspace access denied',
          accessDenied: true,
        });
      }
      return false;
    }
    if (profileIdRef.current !== profileId || accessGenerationRef.current !== accessGeneration) return false;
    const ownsMutationList = listOwnerRef.current === profileId;
    ++listRevisionRef.current;
    setErrorState({ owner: profileId, message: null, accessDenied: false });
    listOwnerRef.current = profileId;
    setListOwner(profileId);
    setWorkspaces(prev => ownsMutationList
      ? prev.map(w => w.id === id ? { ...w, ...data } : w)
      : []);
    if (!ownsMutationList) {
      void fetchWorkspaces();
      return true;
    }
    setLoading(false);
    return true;
  }, [fetchWorkspaces, profileId, revokeWorkspaceAccess]);

  const selectWorkspace = useCallback((id: string) => {
    setActiveWorkspaceId(id);
    persistWorkspaceId(id);
  }, []);

  const ownsList = listOwner === profileId;
  const visibleWorkspaces = ownsList ? workspaces : [];
  const visibleActiveWorkspaceId = ownsList ? activeWorkspaceId : null;
  const activeWorkspace = visibleWorkspaces.find(w => w.id === visibleActiveWorkspaceId) || null;

  return {
    workspaces: visibleWorkspaces, activeWorkspace, activeWorkspaceId: visibleActiveWorkspaceId,
    loading: loading || (!ownsList && error === null), error, accessDenied, createWorkspace, deleteWorkspace,
    patchWorkspace, selectWorkspace, refresh: fetchWorkspaces,
  };
};
