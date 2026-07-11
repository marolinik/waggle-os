import { randomUUID } from 'node:crypto';

export type LocalJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface LocalJob {
  id: string;
  jobType: string;
  input: Record<string, unknown>;
  status: LocalJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  output?: Record<string, unknown>;
}

interface LocalJobEntry extends LocalJob {
  controller: AbortController;
}

const MAX_JOBS = 100;

/** Small in-process job store for local-only async surfaces. */
export class LocalJobStore {
  private readonly jobs = new Map<string, LocalJobEntry>();

  create(jobType: string, input: Record<string, unknown>): LocalJob {
    const now = new Date().toISOString();
    const entry: LocalJobEntry = {
      id: randomUUID(),
      jobType,
      input,
      status: 'queued',
      createdAt: now,
      controller: new AbortController(),
    };
    this.jobs.set(entry.id, entry);
    this.trimCompleted();
    return this.publicJob(entry);
  }

  get(id: string): LocalJob | null {
    const entry = this.jobs.get(id);
    return entry ? this.publicJob(entry) : null;
  }

  signal(id: string): AbortSignal | undefined {
    return this.jobs.get(id)?.controller.signal;
  }

  update(id: string, patch: Partial<Pick<LocalJob, 'status' | 'startedAt' | 'completedAt' | 'output'>>): LocalJob | null {
    const entry = this.jobs.get(id);
    if (!entry || entry.status === 'cancelled') return entry ? this.publicJob(entry) : null;
    Object.assign(entry, patch);
    return this.publicJob(entry);
  }

  cancel(id: string): LocalJob | null {
    const entry = this.jobs.get(id);
    if (!entry) return null;
    if (entry.status === 'completed' || entry.status === 'failed' || entry.status === 'cancelled') {
      return this.publicJob(entry);
    }
    entry.controller.abort();
    entry.status = 'cancelled';
    entry.completedAt = new Date().toISOString();
    return this.publicJob(entry);
  }

  close(): void {
    for (const entry of this.jobs.values()) entry.controller.abort();
    this.jobs.clear();
  }

  private publicJob(entry: LocalJobEntry): LocalJob {
    const { controller: _controller, ...job } = entry;
    return job;
  }

  private trimCompleted(): void {
    if (this.jobs.size <= MAX_JOBS) return;
    for (const [id, entry] of this.jobs) {
      if (entry.status === 'completed' || entry.status === 'failed' || entry.status === 'cancelled') {
        this.jobs.delete(id);
        if (this.jobs.size <= MAX_JOBS) break;
      }
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    localJobStore: LocalJobStore;
  }
}
