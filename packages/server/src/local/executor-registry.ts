import { buildTaskFit, type AgentPersona, type ExecutorCandidate } from '@waggle/agent';
import { BUILTIN_TOOL_MANIFESTS, type DetectedTool } from '@waggle/shared';

const DETECTION_CACHE_MS = 30_000;
const DEFAULT_RATE_LIMIT_MS = 15 * 60_000;

const PERSONA_IDS = [
  'general-purpose',
  'coder',
  'writer',
  'researcher',
  'analyst',
] as const;

const EGRESS_DESTINATIONS: Readonly<Record<string, string>> = {
  'claude-code': 'Anthropic',
  codex: 'OpenAI',
  hermes: 'Nous',
  openclaw: 'configured provider',
};

interface ExecutorRegistryDeps {
  detectTools: () => Promise<DetectedTool[]>;
  personas: () => AgentPersona[];
}

type RateLimitObservation =
  | { state: 'available' }
  | { state: 'observed_exhausted'; expiresAtMs: number; resumeAtMs?: number };

function normalizeExecutorId(executorId: string): string {
  if (executorId.startsWith('external:') || executorId.startsWith('persona:')) {
    return executorId;
  }
  return `external:${executorId}`;
}

export class ExecutorRegistry {
  private readonly deps: ExecutorRegistryDeps;
  private detectionCache: { detectedAtMs: number; tools: DetectedTool[] } | null = null;
  private readonly rateLimits = new Map<string, RateLimitObservation>();

  constructor(deps: ExecutorRegistryDeps) {
    this.deps = deps;
  }

  async snapshot(nowMs: number): Promise<ExecutorCandidate[]> {
    const detectedTools = await this.getDetectedTools(nowMs);
    const detectedById = new Map(detectedTools.map((tool) => [tool.id, tool]));
    const personasById = new Map(this.deps.personas().map((persona) => [persona.id, persona]));

    const personas = PERSONA_IDS.flatMap((personaId) => {
      const persona = personasById.get(personaId);
      if (!persona || persona.isReadOnly) return [];

      const id = `persona:${persona.id}`;
      return [{
        id,
        kind: 'persona' as const,
        displayName: persona.name,
        taskFit: buildTaskFit(id),
        authClass: 'api-key' as const,
        installed: true,
        healthy: true,
        rateLimit: this.rateLimitFor(id, nowMs, 'unknown'),
        supportsHeadless: false,
        egressDestination: null,
      }];
    });

    const externals = BUILTIN_TOOL_MANIFESTS
      .filter((manifest) => manifest.capabilities?.headlessTask === true && manifest.task)
      .map((manifest): ExecutorCandidate => {
        const detected = detectedById.get(manifest.id);
        const installed = detected?.installed === true;
        const id = `external:${manifest.id}`;
        // Confirm dispatches with access:'read-only' (v1 hard default); tools
        // without a read-only mode would 409 post-confirm, so gate them here.
        const supportsReadOnly = manifest.task?.permissionModes?.includes('read-only') === true;
        return {
          id,
          kind: 'external',
          displayName: manifest.displayName,
          taskFit: buildTaskFit(id),
          authClass: 'subscription-cli',
          installed,
          healthy: installed,
          rateLimit: this.rateLimitFor(id, nowMs, 'unknown'),
          supportsHeadless: supportsReadOnly,
          egressDestination: EGRESS_DESTINATIONS[manifest.id] ?? 'configured provider',
        };
      });

    return [...personas, ...externals];
  }

  noteRateLimit(executorId: string, resumeAtMs: number | null): void {
    const nowMs = Date.now();
    this.rateLimits.set(normalizeExecutorId(executorId), {
      state: 'observed_exhausted',
      expiresAtMs: resumeAtMs ?? nowMs + DEFAULT_RATE_LIMIT_MS,
      ...(resumeAtMs === null ? {} : { resumeAtMs }),
    });
  }

  noteHealthy(executorId: string): void {
    this.rateLimits.set(normalizeExecutorId(executorId), { state: 'available' });
  }

  private async getDetectedTools(nowMs: number): Promise<DetectedTool[]> {
    if (
      this.detectionCache
      && nowMs - this.detectionCache.detectedAtMs < DETECTION_CACHE_MS
    ) {
      return this.detectionCache.tools;
    }

    const tools = await this.deps.detectTools();
    this.detectionCache = { detectedAtMs: nowMs, tools };
    return tools;
  }

  private rateLimitFor(
    executorId: string,
    nowMs: number,
    initialState: 'unknown' | 'available',
  ): ExecutorCandidate['rateLimit'] {
    const observation = this.rateLimits.get(executorId);
    if (!observation) return { state: initialState };
    if (observation.state === 'available') return observation;

    if (nowMs >= observation.expiresAtMs) {
      const available = { state: 'available' as const };
      this.rateLimits.set(executorId, available);
      return available;
    }

    return {
      state: observation.state,
      ...(observation.resumeAtMs === undefined ? {} : { resumeAtMs: observation.resumeAtMs }),
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    executorRegistry: ExecutorRegistry;
  }
}
