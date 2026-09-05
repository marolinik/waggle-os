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
  readLegacyPersistedWorkspaceId,
  clearLegacyPersistedWorkspaceId,
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
  const [selection, setSelection] = useState<{ owner: string | null; id: string | null }>(() => ({
    owner: profileId,
    id: readPersistedWorkspaceId(profileId),
  }));
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
  const pendingSelectionRef = useRef<{
    owner: string | null;
    id: string;
    verifying: boolean;
  } | null>(null);
  const rejectedSelectionRef = useRef<{ owner: string | null; id: string; revision: number } | null>(null);
  const membershipRef = useRef<{
    owner: string | null;
    ids: ReadonlySet<string>;
    revision: number;
    authoritative: boolean;
  }>({ owner: profileId, ids: new Set(), revision: 0, authoritative: false });
  if (profileIdRef.current !== profileId) {
    ++listRevisionRef.current;
    ++accessGenerationRef.current;
    profileIdRef.current = profileId;
    pendingSelectionRef.current = null;
    rejectedSelectionRef.current = null;
  }
  const currentErrorState = errorState.owner === profileId ? errorState : null;
  const error = currentErrorState?.message ?? null;
  const accessDenied = currentErrorState?.accessDenied ?? false;

  const revokeWorkspaceAccess = useCallback((owner: string | null) => {
    ++listRevisionRef.current;
    ++accessGenerationRef.current;
    setWorkspaces([]);
    listOwnerRef.current = owner;
    setListOwner(owner);
    setSelection({ owner, id: null });
    setLoading(false);
    clearPersistedWorkspaceId(owner);
    if (owner !== null) clearLegacyPersistedWorkspaceId();
    if (pendingSelectionRef.current?.owner === owner) pendingSelectionRef.current = null;
    if (rejectedSelectionRef.current?.owner === owner) rejectedSelectionRef.current = null;
    membershipRef.current = {
      owner,
      ids: new Set(),
      revision: listRevisionRef.current,
      authoritative: false,
    };
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    const requestOwner = profileId;
    // A callback retained by a previous profile must be inert. In particular,
    // it must not advance the shared revision and starve the current profile's
    // in-flight hydration.
    if (profileIdRef.current !== requestOwner) return;
    const listRevision = ++listRevisionRef.current;
    setLoading(true);
    try {
      const data = await adapter.getWorkspaces();
      if (profileIdRef.current !== requestOwner || listRevision !== listRevisionRef.current) return;
      setWorkspaces(data);
      listOwnerRef.current = requestOwner;
      setListOwner(requestOwner);
      const ids = data.map(w => w.id);
      membershipRef.current = {
        owner: requestOwner,
        ids: new Set(ids),
        revision: listRevision,
        authoritative: true,
      };
      const scopedPersistedId = readPersistedWorkspaceId(requestOwner);
      let verifiedPersistedId = scopedPersistedId;
      // Existing installs have one unscoped v1 selection. Migrate it only
      // after a resolved profile's authoritative list proves ownership; an
      // unknown local-* id is deliberately not trusted across that boundary.
      if (requestOwner !== null) {
        const legacyId = readLegacyPersistedWorkspaceId();
        if (verifiedPersistedId === null && legacyId !== null && ids.includes(legacyId)) {
          verifiedPersistedId = legacyId;
          persistWorkspaceId(legacyId, requestOwner);
        }
        clearLegacyPersistedWorkspaceId();
      }
      const pendingSelection = pendingSelectionRef.current?.owner === requestOwner
        ? pendingSelectionRef.current
        : null;
      if (pendingSelection !== null) pendingSelectionRef.current = null;
      const pendingId = pendingSelection !== null && ids.includes(pendingSelection.id)
        ? pendingSelection.id
        : null;
      if (pendingSelection !== null && pendingId === null) {
        rejectedSelectionRef.current = {
          owner: requestOwner,
          id: pendingSelection.id,
          revision: listRevision,
        };
      }
      if (pendingId !== null) persistWorkspaceId(pendingId, requestOwner);
      // W2A: NO auto-select. Validate the existing selection against the fresh
      // list (dropping a stale/deleted id to null); never promote data[0].
      setSelection(previous => {
        const previousId = pendingId ?? (previous.owner === requestOwner && previous.id !== null
          ? previous.id
          : verifiedPersistedId);
        const next = resolveActiveWorkspaceId(previousId, ids);
        if (previousId !== null && next === null) clearPersistedWorkspaceId(requestOwner);
        return { owner: requestOwner, id: next };
      });
      setErrorState({ owner: requestOwner, message: null, accessDenied: false });
    } catch (err) {
      if (profileIdRef.current !== requestOwner || listRevision !== listRevisionRef.current) return;
      console.error('[useWorkspaces] fetch failed:', err);
      const denied = isAuthorizationDenial(err);
      if (denied) {
        revokeWorkspaceAccess(requestOwner);
      } else if (pendingSelectionRef.current?.owner === requestOwner) {
        pendingSelectionRef.current = { ...pendingSelectionRef.current, verifying: false };
      }
      // P1b D3: surface the failure (this channel existed but was never set —
      // a lost boot race meant an empty workspace list for the whole session)
      // and keep same-profile data for transient failures. Auth denials revoke
      // that right, and another profile's retained list is hidden below.
      setErrorState(current => ({
        owner: requestOwner,
        message: err instanceof Error ? err.message : 'Failed to load workspaces',
        accessDenied: denied || (current.owner === requestOwner && current.accessDenied),
      }));
    } finally {
      if (profileIdRef.current === requestOwner && listRevision === listRevisionRef.current) setLoading(false);
    }
  }, [profileId, revokeWorkspaceAccess]);

  useEffect(() => { void fetchWorkspaces(); }, [fetchWorkspaces]);
  // P1b D3 plus-clause: errored list revalidates on focus/online/connect-settled.
  useRevalidateOnError(error !== null, fetchWorkspaces);

  const createWorkspace = useCallback(async (data: { name: string; group: string; persona?: string; agentGroupId?: string; shared?: boolean; templateId?: string; storageType?: Workspace['storageType']; storagePath?: string; storageConfig?: Record<string, unknown> }) => {
    if (profileIdRef.current !== profileId) return null;
    const accessGeneration = accessGenerationRef.current;
    try {
      const ws = await adapter.createWorkspace(data);
      if (profileIdRef.current !== profileId || accessGenerationRef.current !== accessGeneration) return null;
      const ownsMutationList = listOwnerRef.current === profileId
        && membershipRef.current.owner === profileId
        && membershipRef.current.authoritative;
      const listRevision = ++listRevisionRef.current;
      pendingSelectionRef.current = null;
      rejectedSelectionRef.current = null;
      setLoading(false);
      setErrorState({ owner: profileId, message: null, accessDenied: false });
      listOwnerRef.current = profileId;
      setListOwner(profileId);
      membershipRef.current = ownsMutationList
        ? {
            owner: profileId,
            ids: new Set([...membershipRef.current.ids, ws.id]),
            revision: listRevision,
            authoritative: true,
          }
        : { owner: profileId, ids: new Set([ws.id]), revision: listRevision, authoritative: false };
      setWorkspaces(prev => ownsMutationList
        ? [...prev.filter(existing => existing.id !== ws.id), ws]
        : [ws]);
      setSelection({ owner: profileId, id: ws.id });
      persistWorkspaceId(ws.id, profileId);
      if (profileId !== null) clearLegacyPersistedWorkspaceId();
      if (!ownsMutationList) void fetchWorkspaces();
      return ws;
    } catch (err) {
      if (profileIdRef.current !== profileId || accessGenerationRef.current !== accessGeneration) return null;
      console.error('[useWorkspaces] create failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to create workspace';
      const denied = isMutationAccessRevocation(err);
      if (denied) revokeWorkspaceAccess(profileId);
      setErrorState(current => ({
        owner: profileId,
        message,
        // A non-auth mutation failure is not proof that a previously revoked
        // profile regained read access. Only a successful list (or mutation)
        // may clear the fail-closed state for the same owner.
        accessDenied: denied || (current.owner === profileId && current.accessDenied),
      }));
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
    if (profileIdRef.current !== profileId) return false;
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
    const ownsMutationList = listOwnerRef.current === profileId
      && membershipRef.current.owner === profileId
      && membershipRef.current.authoritative;
    const listRevision = ++listRevisionRef.current;
    pendingSelectionRef.current = null;
    rejectedSelectionRef.current = null;
    setErrorState({ owner: profileId, message: null, accessDenied: false });
    listOwnerRef.current = profileId;
    setListOwner(profileId);
    if (ownsMutationList && membershipRef.current.owner === profileId && membershipRef.current.authoritative) {
      const ids = new Set(membershipRef.current.ids);
      ids.delete(id);
      membershipRef.current = { owner: profileId, ids, revision: listRevision, authoritative: true };
    }
    setWorkspaces(prev => ownsMutationList ? prev.filter(w => w.id !== id) : []);
    // W2A: deleting the active workspace clears the selection (no silent
    // successor-pick) — the shell then prompts the user to choose one.
    setSelection(current => {
      if (current.owner !== profileId || current.id !== id) return current;
      clearPersistedWorkspaceId(profileId);
      return { owner: profileId, id: null };
    });
    if (!ownsMutationList) {
      void fetchWorkspaces();
      return true;
    }
    setLoading(false);
    return true;
  }, [fetchWorkspaces, profileId, revokeWorkspaceAccess]);

  const patchWorkspace = useCallback(async (id: string, data: Partial<Pick<Workspace, 'persona' | 'agentGroupId' | 'name' | 'group' | 'model' | 'status' | 'description'>>): Promise<boolean> => {
    if (profileIdRef.current !== profileId) return false;
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
    const ownsMutationList = listOwnerRef.current === profileId
      && membershipRef.current.owner === profileId
      && membershipRef.current.authoritative;
    ++listRevisionRef.current;
    pendingSelectionRef.current = null;
    rejectedSelectionRef.current = null;
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

  const selectionAccessGeneration = accessGenerationRef.current;
  const selectWorkspace = useCallback((id: string) => {
    if (profileIdRef.current !== profileId
      || accessGenerationRef.current !== selectionAccessGeneration
      || accessDenied) return;
    const membership = membershipRef.current;
    if (membership.owner !== profileId || !membership.authoritative) {
      // Deep links can request a workspace before the mount/profile hydration
      // effect resolves. Queue only the intent; the in-flight authoritative
      // fetch validates it without starting a duplicate request.
      pendingSelectionRef.current = { owner: profileId, id, verifying: false };
      return;
    }
    if (!membership.ids.has(id)) {
      // Some trusted product flows create through the adapter before the
      // Shell-owned list knows the ID. Revalidate it instead of either
      // accepting an unverified route value or silently dropping the choice.
      const rejected = rejectedSelectionRef.current;
      if (rejected?.owner === profileId && rejected.id === id && rejected.revision === membership.revision) return;
      const pending = pendingSelectionRef.current;
      if (pending?.owner === profileId && pending.id === id && pending.verifying) return;
      pendingSelectionRef.current = { owner: profileId, id, verifying: true };
      void fetchWorkspaces();
      return;
    }
    pendingSelectionRef.current = null;
    rejectedSelectionRef.current = null;
    setSelection({ owner: profileId, id });
    persistWorkspaceId(id, profileId);
  }, [accessDenied, fetchWorkspaces, profileId, selectionAccessGeneration]);

  const ownsList = listOwner === profileId;
  const visibleWorkspaces = ownsList ? workspaces : [];
  const visibleActiveWorkspaceId = ownsList && selection.owner === profileId ? selection.id : null;
  const activeWorkspace = visibleWorkspaces.find(w => w.id === visibleActiveWorkspaceId) || null;

  return {
    workspaces: visibleWorkspaces, activeWorkspace, activeWorkspaceId: visibleActiveWorkspaceId,
    loading: loading || (!ownsList && error === null), error, accessDenied, createWorkspace, deleteWorkspace,
    patchWorkspace, selectWorkspace, refresh: fetchWorkspaces,
  };
};
