/**
 * Workspace Desktop Tasks tab (UX-Northstar 2026-06-13 G8) — the real task
 * board. Pins:
 *  - tasks load from the adapter and render on the board
 *  - add (input + button) calls createWorkspaceTask and appends
 *  - clicking the status icon cycles open → in_progress → done via PATCH
 *  - delete removes the row
 *  - memory-derived signals (WorkspaceStateView) still render below
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import TasksTab from '@/components/os/apps/workspace/TasksTab';
import type { WorkspaceTask, WorkspaceStateView } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    getWorkspaceTasks: vi.fn(),
    createWorkspaceTask: vi.fn(),
    patchWorkspaceTask: vi.fn(),
    deleteWorkspaceTask: vi.fn(),
  },
  toast: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

const task = (id: string, title: string, status: WorkspaceTask['status'] = 'open'): WorkspaceTask => ({
  id, title, status, createdAt: '2026-06-13T00:00:00Z', updatedAt: '2026-06-13T00:00:00Z',
});

const emptyState: WorkspaceStateView = {
  active: [], openQuestions: [], pending: [], blocked: [],
  completed: [], stale: [], recentDecisions: [], nextActions: [],
};

describe('TasksTab', () => {
  beforeEach(() => {
    mocks.adapter.getWorkspaceTasks.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders loaded tasks on the board', async () => {
    mocks.adapter.getWorkspaceTasks.mockResolvedValue([task('t1', 'Ship the report')]);
    render(<TasksTab workspaceId="w1" state={null} />);
    expect(await screen.findByText('Ship the report')).toBeTruthy();
    expect(mocks.adapter.getWorkspaceTasks).toHaveBeenCalledWith('w1');
  });

  it('adds a task through the input', async () => {
    mocks.adapter.createWorkspaceTask.mockResolvedValue(task('t2', 'Call the client'));
    render(<TasksTab workspaceId="w1" state={null} />);
    await screen.findByTestId('ws-task-input');

    fireEvent.change(screen.getByTestId('ws-task-input'), { target: { value: 'Call the client' } });
    fireEvent.click(screen.getByTestId('ws-task-add'));

    await waitFor(() => {
      expect(mocks.adapter.createWorkspaceTask).toHaveBeenCalledWith('w1', 'Call the client');
      expect(screen.getByText('Call the client')).toBeTruthy();
    });
    expect((screen.getByTestId('ws-task-input') as HTMLInputElement).value).toBe('');
  });

  it('cycles status open → in_progress via PATCH', async () => {
    mocks.adapter.getWorkspaceTasks.mockResolvedValue([task('t1', 'Draft outline')]);
    mocks.adapter.patchWorkspaceTask.mockResolvedValue(task('t1', 'Draft outline', 'in_progress'));
    render(<TasksTab workspaceId="w1" state={null} />);

    fireEvent.click(await screen.findByLabelText('Mark "Draft outline" as in progress'));
    await waitFor(() => {
      expect(mocks.adapter.patchWorkspaceTask).toHaveBeenCalledWith('w1', 't1', { status: 'in_progress' });
    });
  });

  it('deletes a task', async () => {
    mocks.adapter.getWorkspaceTasks.mockResolvedValue([task('t1', 'Old task')]);
    mocks.adapter.deleteWorkspaceTask.mockResolvedValue(undefined);
    render(<TasksTab workspaceId="w1" state={null} />);

    fireEvent.click(await screen.findByLabelText('Delete task "Old task"'));
    await waitFor(() => {
      expect(mocks.adapter.deleteWorkspaceTask).toHaveBeenCalledWith('w1', 't1');
      expect(screen.queryByText('Old task')).toBeNull();
    });
  });

  it('renders memory-derived signals below the board', async () => {
    render(
      <TasksTab
        workspaceId="w1"
        state={{ ...emptyState, pending: [{ id: 'p1', content: 'Waiting on legal review' }] }}
      />,
    );
    expect(await screen.findByText('Waiting on legal review')).toBeTruthy();
    expect(screen.getByText(/From this workspace/)).toBeTruthy();
  });
});
