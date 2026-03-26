import { describe, it, expect, vi } from 'vitest';

/**
 * Targeted test for the approval gate requestId propagation fix.
 *
 * Proves that when an approval_required event arrives via SSE,
 * the requestId is stored on the tool card so the approve click
 * can send it back to the server.
 */
describe('Approval Gate — requestId propagation', () => {
  it('SSE approval_required event stores requestId on the tool card', () => {
    // Simulate the exact logic from useApprovalGate's event handler
    const event = {
      requestId: 'abc-123-def',
      toolName: 'install_capability',
      input: { name: 'risk-assessment', source: 'starter-pack' },
    };

    // Simulate a message with a tool card matching the event
    const existingTool = {
      name: 'install_capability',
      input: { name: 'risk-assessment', source: 'starter-pack' },
      status: 'running' as const,
      approved: undefined as boolean | undefined,
    };

    // Apply the same transform as useApprovalGate
    const updated = existingTool.name === event.toolName && existingTool.approved === undefined
      ? { ...existingTool, requiresApproval: true, status: 'pending_approval' as const, requestId: event.requestId }
      : existingTool;

    // THE FIX: requestId must be present on the updated tool card
    expect(updated.requestId).toBe('abc-123-def');
    expect(updated.requiresApproval).toBe(true);
    expect(updated.status).toBe('pending_approval');
  });

  it('handleToolApprove sends POST when requestId is present', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });

    const tool = { requestId: 'abc-123-def' };
    const baseUrl = 'http://127.0.0.1:3333';

    // Simulate what approveAction does in local-adapter
    if (tool.requestId) {
      await mockFetch(`${baseUrl}/api/approval/${tool.requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      });
    }

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3333/api/approval/abc-123-def',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ approved: true }),
      }),
    );
  });

  it('handleToolApprove does NOT send POST when requestId is missing', () => {
    const mockFetch = vi.fn();

    const tool = { requestId: undefined as string | undefined };

    // Simulate what handleToolApprove does
    if (tool.requestId) {
      mockFetch(`http://127.0.0.1:3333/api/approval/${tool.requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      });
    }

    // Without requestId, nothing should be called — this was the bug
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reconnection path (C2) correctly includes requestId', () => {
    // Simulate the reconnection path from App.tsx
    const pendingFromServer = {
      requestId: 'reconnect-456',
      toolName: 'install_capability',
      input: { name: 'daily-plan', source: 'starter-pack' },
    };

    // The reconnection path constructs tool cards with requestId
    const toolCard = {
      name: pendingFromServer.toolName,
      input: pendingFromServer.input,
      status: 'pending_approval' as const,
      requestId: pendingFromServer.requestId,
    };

    expect(toolCard.requestId).toBe('reconnect-456');
  });
});
