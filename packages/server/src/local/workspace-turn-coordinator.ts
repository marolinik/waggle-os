import fs from 'node:fs';
import path from 'node:path';
import type { ToolDefinition } from '@waggle/agent';

export type WorkspaceTurnAccess = 'none' | 'read' | 'write';

interface Waiter {
  mode: Exclude<WorkspaceTurnAccess, 'none'>;
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface ResourceState {
  readers: number;
  writer: boolean;
  waiters: Waiter[];
}

const WORKSPACE_READ_TOOLS = new Set([
  'read_file',
  'search_files',
  'search_content',
  'git_status',
  'git_diff',
  'git_log',
]);

const WORKSPACE_WRITE_TOOLS = new Set([
  'bash',
  'write_file',
  'edit_file',
  'multi_edit',
  'run_code',
  'get_task_output',
  'kill_task',
  'generate_docx',
  'generate_xlsx',
  'generate_pptx',
  'generate_pdf',
  'git_branch',
  'git_stash',
  'git_pull',
  'git_commit',
  'git_push',
  'git_merge',
  'git_pr',
  'cli_execute',
  'execute_step',
  'spawn_agent',
  'compose_workflow',
  'orchestrate_workflow',
  'run_harness',
  'browser_navigate',
  'browser_snapshot',
  'browser_screenshot',
  'browser_click',
  'browser_fill',
  'browser_evaluate',
  'lsp_diagnostics',
  'lsp_definition',
  'lsp_references',
  'lsp_hover',
]);

// These tools do not inspect or mutate the physical checkout. Unknown native,
// MCP, plugin, and connector tools fail conservatively into the writer lane.
const WORKSPACE_INDEPENDENT_TOOLS = new Set([
  'search_memory',
  'save_memory',
  'search_all_workspaces',
  'query_knowledge',
  'get_identity',
  'get_awareness',
  'web_search',
  'web_fetch',
  'perplexity_search',
  'tavily_search',
  'brave_search',
  'create_plan',
  'add_plan_step',
  'show_plan',
  'list_agents',
  'get_agent_result',
  'list_harnesses',
  'list_skills',
  'search_skills',
  'suggest_skill',
  'read_skill',
  // Capability files are process-global, not checkout-local. They need their
  // own global store lock; do not make unrelated workspace readers contend.
  'create_skill',
  'delete_skill',
  'install_capability',
  'acquire_capability',
  'find_connector',
  'list_connector_categories',
  'cli_discover',
]);

const BACKGROUND_COMMAND_DENIAL =
  'Error: Background commands are disabled while shared-workspace session isolation is active. '
  + 'Run the command in the foreground or use an isolated worktree.';

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Workspace turn cancelled while waiting for the checkout');
}

export function canonicalWorkspaceRoot(workspaceRoot: string): string {
  let resolved: string;
  try {
    resolved = fs.realpathSync.native(workspaceRoot);
  } catch {
    resolved = path.resolve(workspaceRoot);
  }
  const normalized = path.normalize(resolved);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function classifyWorkspaceTurnAccess(
  tools: readonly Pick<ToolDefinition, 'name'>[],
  externalToolNames: ReadonlySet<string> = new Set<string>(),
): WorkspaceTurnAccess {
  let readsWorkspace = false;
  for (const tool of tools) {
    if (externalToolNames.has(tool.name) || WORKSPACE_WRITE_TOOLS.has(tool.name)) {
      return 'write';
    }
    if (WORKSPACE_READ_TOOLS.has(tool.name)) {
      readsWorkspace = true;
      continue;
    }
    if (!WORKSPACE_INDEPENDENT_TOOLS.has(tool.name)) {
      return 'write';
    }
  }
  return readsWorkspace ? 'read' : 'none';
}

export class WorkspaceTurnCoordinator {
  private readonly resources = new Map<string, ResourceState>();

  createScope(workspaceRoot: string, signal?: AbortSignal): WorkspaceTurnScope {
    return new WorkspaceTurnScope(this, canonicalWorkspaceRoot(workspaceRoot), signal);
  }

  tryAcquireWorkspace(
    workspaceRoot: string,
    mode: Exclude<WorkspaceTurnAccess, 'none'>,
  ): (() => void) | undefined {
    const resource = canonicalWorkspaceRoot(workspaceRoot);
    const state = this.resources.get(resource) ?? { readers: 0, writer: false, waiters: [] };
    if (state.waiters.length > 0 || !this.canGrant(state, mode)) return undefined;
    this.resources.set(resource, state);
    return this.grant(resource, state, mode);
  }

  async acquire(
    resource: string,
    mode: Exclude<WorkspaceTurnAccess, 'none'>,
    signal?: AbortSignal,
    onQueued?: (position: number) => void,
  ): Promise<() => void> {
    if (signal?.aborted) throw abortError(signal);

    const state = this.resources.get(resource) ?? { readers: 0, writer: false, waiters: [] };
    this.resources.set(resource, state);
    if (state.waiters.length === 0 && this.canGrant(state, mode)) {
      return this.grant(resource, state, mode);
    }

    onQueued?.(state.waiters.length + 1);
    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = { mode, resolve, reject, signal };
      state.waiters.push(waiter);
      if (signal) {
        waiter.onAbort = () => {
          const index = state.waiters.indexOf(waiter);
          if (index >= 0) state.waiters.splice(index, 1);
          signal.removeEventListener('abort', waiter.onAbort!);
          reject(abortError(signal));
          this.drain(resource, state);
          this.deleteIfIdle(resource, state);
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
        if (signal.aborted) waiter.onAbort();
      }
    });
  }

  private canGrant(state: ResourceState, mode: Exclude<WorkspaceTurnAccess, 'none'>): boolean {
    return mode === 'read'
      ? !state.writer
      : !state.writer && state.readers === 0;
  }

  private grant(
    resource: string,
    state: ResourceState,
    mode: Exclude<WorkspaceTurnAccess, 'none'>,
  ): () => void {
    if (mode === 'read') state.readers += 1;
    else state.writer = true;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (mode === 'read') state.readers = Math.max(0, state.readers - 1);
      else state.writer = false;
      this.drain(resource, state);
      this.deleteIfIdle(resource, state);
    };
  }

  private drain(resource: string, state: ResourceState): void {
    if (state.writer) return;

    while (state.waiters[0]?.signal?.aborted) {
      const aborted = state.waiters.shift()!;
      aborted.signal?.removeEventListener('abort', aborted.onAbort!);
      aborted.reject(abortError(aborted.signal!));
    }
    if (state.waiters.length === 0) return;

    if (state.readers > 0) {
      while (state.waiters[0]?.mode === 'read') {
        this.resolveWaiter(resource, state, state.waiters.shift()!);
      }
      return;
    }

    if (state.waiters[0].mode === 'write') {
      this.resolveWaiter(resource, state, state.waiters.shift()!);
      return;
    }
    while (state.waiters[0]?.mode === 'read') {
      this.resolveWaiter(resource, state, state.waiters.shift()!);
    }
  }

  private resolveWaiter(resource: string, state: ResourceState, waiter: Waiter): void {
    if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort);
    waiter.resolve(this.grant(resource, state, waiter.mode));
  }

  private deleteIfIdle(resource: string, state: ResourceState): void {
    if (!state.writer && state.readers === 0 && state.waiters.length === 0) {
      this.resources.delete(resource);
    }
  }
}

export class WorkspaceTurnScope {
  private releaseTurn?: () => void;
  private access: WorkspaceTurnAccess = 'none';
  private mutationTail: Promise<void> = Promise.resolve();
  private readonly childTransactions = new WorkspaceTurnCoordinator();
  private readonly activeChildTransactions = new Set<Promise<void>>();
  private releasePromise?: Promise<void>;
  private released = false;

  constructor(
    private readonly coordinator: WorkspaceTurnCoordinator,
    private readonly resource: string,
    private readonly signal?: AbortSignal,
  ) {}

  classify(
    tools: readonly Pick<ToolDefinition, 'name'>[],
    externalToolNames: ReadonlySet<string> = new Set<string>(),
  ): WorkspaceTurnAccess {
    return classifyWorkspaceTurnAccess(tools, externalToolNames);
  }

  wrapTools(
    tools: readonly ToolDefinition[],
    externalToolNames: ReadonlySet<string> = new Set<string>(),
  ): ToolDefinition[] {
    return tools.map((tool) => {
      if (classifyWorkspaceTurnAccess([tool], externalToolNames) !== 'write') return tool;
      return {
        ...tool,
        execute: async (args) => {
          if (tool.name === 'bash' && Boolean(args.run_in_background)) {
            return BACKGROUND_COMMAND_DENIAL;
          }
          return this.runMutation(() => tool.execute(args));
        },
      };
    });
  }

  async runChildTransaction<T>(
    tools: readonly Pick<ToolDefinition, 'name'>[],
    operation: () => Promise<T>,
    externalToolNames: ReadonlySet<string> = new Set<string>(),
  ): Promise<T> {
    if (this.releasePromise || this.released || this.access !== 'write' || !this.releaseTurn) {
      throw new Error('Child agent attempted to run without an active writer lease');
    }
    if (this.signal?.aborted) throw abortError(this.signal);

    let settleChild!: () => void;
    const childSettled = new Promise<void>((resolve) => { settleChild = resolve; });
    this.activeChildTransactions.add(childSettled);
    try {
      const access = classifyWorkspaceTurnAccess(tools, externalToolNames);
      if (access === 'none') return await operation();

      const releaseChild = await this.childTransactions.acquire(
        this.resource,
        access,
        this.signal,
      );
      try {
        if (this.signal?.aborted) throw abortError(this.signal);
        return await operation();
      } finally {
        releaseChild();
      }
    } finally {
      this.activeChildTransactions.delete(childSettled);
      settleChild();
    }
  }

  async acquire(
    access: Exclude<WorkspaceTurnAccess, 'none'>,
    onQueued?: (position: number) => void,
  ): Promise<void> {
    if (this.releaseTurn || this.releasePromise || this.released) {
      throw new Error('Workspace turn scope cannot be acquired twice');
    }
    this.releaseTurn = await this.coordinator.acquire(
      this.resource,
      access,
      this.signal,
      onQueued,
    );
    this.access = access;
  }

  async release(): Promise<void> {
    if (this.releasePromise) return this.releasePromise;
    if (this.released) return;
    this.releasePromise = (async () => {
      await Promise.allSettled([...this.activeChildTransactions]);
      await this.mutationTail.catch(() => undefined);
      this.releaseTurn?.();
      this.releaseTurn = undefined;
      this.access = 'none';
      this.released = true;
    })();
    return this.releasePromise;
  }

  private async runMutation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.released || this.access !== 'write' || !this.releaseTurn) {
      throw new Error('Workspace mutation attempted without an active writer lease');
    }

    const previous = this.mutationTail.catch(() => undefined);
    let finish!: () => void;
    const current = new Promise<void>((resolve) => { finish = resolve; });
    this.mutationTail = previous.then(() => current);
    await previous;
    if (this.signal?.aborted) {
      finish();
      throw abortError(this.signal);
    }
    try {
      return await operation();
    } finally {
      finish();
    }
  }
}

export { BACKGROUND_COMMAND_DENIAL };
