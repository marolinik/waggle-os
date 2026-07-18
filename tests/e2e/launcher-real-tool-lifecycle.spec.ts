import { expect, test, type APIRequestContext } from '@playwright/test';
import { SUPPORTED_TOOLS } from '@waggle/shared';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=power';
const TOOL_IDS = SUPPORTED_TOOLS;
const SAFE_VERSION_ARGS: Partial<Record<typeof TOOL_IDS[number], string[]>> = {
  'claude-code': ['--version'],
  codex: ['--version'],
  hermes: ['--version'],
  openclaw: ['--version'],
};
const SECRET_ENV_NAMES = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'XAI_API_KEY',
  'MISTRAL_API_KEY',
  'COHERE_API_KEY',
  'DEEPSEEK_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'HF_TOKEN',
] as const;

type DetectedTool = {
  id: string;
  displayName: string;
  installed: boolean;
  installedPath: string | null;
  launchable?: boolean;
  hookCapable?: boolean;
  builtin?: boolean;
  capabilities?: {
    interactiveLaunch: boolean;
    headlessTask: boolean;
  };
};

type DetectionEnvelope = {
  platform: string;
  tools: DetectedTool[];
};

type LaunchEnvelope = {
  ok: boolean;
  pid: number | null;
  roomId?: string;
  runId?: string;
  error?: string;
};

type WorkspaceEnvelope = {
  id?: string;
  name?: string;
  storageType?: string;
};

type RouteResult = {
  id: string;
  displayName: string;
  status: 'unavailable' | 'safe-version-exit' | 'interactive-only-rejected';
  installedPath: string | null;
  exitCode?: number | null;
  output?: string;
  route?: string;
};

function routeWithSkip(route: string): string {
  const sep = route.includes('?') ? '&' : '?';
  return `${route}${sep}${SKIP_PARAMS}`;
}

function assertTemporaryDataDir(): void {
  const dataDir = process.env.WAGGLE_E2E_DATA_DIR;
  const guardedRoot = process.env.WAGGLE_E2E_TEMP_ROOT;
  expect(dataDir, 'WAGGLE_E2E_DATA_DIR must be explicitly isolated').toBeTruthy();
  expect(guardedRoot, 'guarded runner must issue WAGGLE_E2E_TEMP_ROOT').toBeTruthy();
  const relative = path.relative(path.resolve(guardedRoot!), path.resolve(dataDir!));
  expect(relative, 'E2E data dir must be a child of the guarded temp root').not.toMatch(/^\.\.|^[\\/]/);
  expect(relative, 'E2E data dir must not be the guarded temp root itself').not.toBe('');
}

async function createManagedWorkspace(request: APIRequestContext): Promise<WorkspaceEnvelope & { id: string }> {
  const createResponse = await request.post('/api/workspaces', {
    data: {
      name: `Windows external-agent route ${randomUUID().slice(0, 8)}`,
      group: 'external-agent-e2e',
      icon: 'Terminal',
      tone: 'technical',
      storageType: 'virtual',
    },
  });
  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const created = await createResponse.json() as WorkspaceEnvelope;
  expect(created.id, 'managed workspace id from POST /api/workspaces').toMatch(/\S/);

  const persistedResponse = await request.get(`/api/workspaces/${encodeURIComponent(created.id!)}`);
  expect(persistedResponse.status(), await persistedResponse.text()).toBe(200);
  const persisted = await persistedResponse.json() as WorkspaceEnvelope;
  expect(persisted).toMatchObject({ id: created.id, name: created.name });
  return { ...created, id: created.id! };
}

async function readObservedStream(
  baseURL: string,
  pid: number,
): Promise<{ lines: string[]; exitCode: number | null | undefined }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const lines: string[] = [];
  let exitCode: number | null | undefined;

  try {
    const response = await fetch(new URL(`/api/tools/stream?pid=${pid}`, baseURL), {
      signal: controller.signal,
    });
    expect(response.ok).toBe(true);
    expect(response.body).toBeTruthy();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (exitCode === undefined) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');

      let eventEnd = buffer.indexOf('\n\n');
      while (eventEnd >= 0) {
        const rawEvent = buffer.slice(0, eventEnd);
        buffer = buffer.slice(eventEnd + 2);
        eventEnd = buffer.indexOf('\n\n');

        let event = 'message';
        let data = '';
        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) event = line.slice('event:'.length).trim();
          if (line.startsWith('data:')) data += line.slice('data:'.length).trim();
        }

        if (event === 'line') lines.push((JSON.parse(data) as { line: string }).line);
        if (event === 'exit') {
          exitCode = (JSON.parse(data) as { code: number | null }).code;
          break;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
  }

  return { lines, exitCode };
}

async function waitForProcessClear(request: APIRequestContext, pid: number): Promise<void> {
  await expect.poll(async () => {
    const processesResponse = await request.get('/api/tools/processes');
    expect(processesResponse.ok()).toBe(true);
    const body = await processesResponse.json() as { processes: Array<{ pid: number }> };
    return body.processes.some(process => process.pid === pid);
  }, { timeout: 10_000 }).toBe(false);
}

test.describe('Launcher real Windows supported-route lifecycle', () => {
  test('covers every built-in tool without credentials, unsafe GUI launch, or fabricated workspace ids', async ({ baseURL, page, request }, testInfo) => {
    test.setTimeout(240_000);
    test.skip(process.platform !== 'win32', 'This real-host route lane is Windows-specific.');
    test.skip(
      process.env.WAGGLE_E2E_REAL_TOOLS !== '1',
      'Use scripts/test-windows-external-agents.ps1 to run the guarded real-tool lane.',
    );
    assertTemporaryDataDir();
    expect(
      SECRET_ENV_NAMES.filter(name => Boolean(process.env[name])),
      'provider and cloud credentials must be scrubbed by the guarded runner',
    ).toEqual([]);
    const root = baseURL ?? process.env.WAGGLE_E2E_BASE_URL ?? 'http://127.0.0.1:3333';

    const detectionResponse = await request.get('/api/tools/detect');
    expect(detectionResponse.ok()).toBe(true);
    const detection = await detectionResponse.json() as DetectionEnvelope;
    expect(detection.platform).toBe('win32');
    expect(
      detection.tools.filter(tool => tool.builtin === true).map(tool => tool.id),
    ).toEqual(TOOL_IDS);

    await page.goto(routeWithSkip('/launcher?watch=1'), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 });
    await expect(page.getByText('Tool Launcher')).toBeVisible({ timeout: 10_000 });
    for (const tool of detection.tools) {
      await expect(page.getByText(tool.displayName, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    }

    const workspace = await createManagedWorkspace(request);
    const activePids = new Set<number>();
    const results: RouteResult[] = [];

    try {
      for (const toolId of TOOL_IDS) {
        const tool = detection.tools.find(candidate => candidate.id === toolId)!;
        if (!tool.installed || !tool.installedPath) {
          results.push({
            id: tool.id,
            displayName: tool.displayName,
            status: 'unavailable',
            installedPath: null,
          });
          testInfo.annotations.push({ type: 'tool-unavailable', description: tool.displayName });
          continue;
        }

        await test.step(`${tool.displayName} supported route`, async () => {
          if (tool.capabilities?.headlessTask !== true) {
            const unsupported = await request.post('/api/tools/run', {
              data: {
                toolId: tool.id,
                workspaceIds: [workspace.id],
                prompt: 'Do not run. This request must be rejected as interactive-only.',
                timeoutMs: 10_000,
              },
            });
            expect(unsupported.status(), await unsupported.text()).toBe(409);
            expect(await unsupported.json()).toMatchObject({
              error: 'TOOL_NOT_HEADLESS',
              toolId: tool.id,
            });
            results.push({
              id: tool.id,
              displayName: tool.displayName,
              status: 'interactive-only-rejected',
              installedPath: tool.installedPath,
              route: '/api/tools/run',
            });
            return;
          }

          const args = SAFE_VERSION_ARGS[tool.id as typeof TOOL_IDS[number]];
          expect(args, `${tool.displayName} must have an audited no-network version command`).toBeTruthy();
          const launchResponse = await request.post('/api/tools/launch', {
            data: {
              id: tool.id,
              args,
              workspaceId: workspace.id,
              observe: true,
            },
          });
          expect(launchResponse.status(), await launchResponse.text()).toBe(202);
          const launch = await launchResponse.json() as LaunchEnvelope;
          expect(launch, launch.error).toMatchObject({ ok: true });
          expect(launch.pid).toEqual(expect.any(Number));
          expect(launch.roomId).toMatch(/\S/);
          expect(launch.runId).toMatch(/\S/);
          activePids.add(launch.pid!);

          const stream = await readObservedStream(root, launch.pid!);
          expect(stream.exitCode).toBe(0);
          expect(stream.lines.join('\n').trim().length).toBeGreaterThan(0);
          await waitForProcessClear(request, launch.pid!);
          activePids.delete(launch.pid!);
          results.push({
            id: tool.id,
            displayName: tool.displayName,
            status: 'safe-version-exit',
            installedPath: tool.installedPath,
            exitCode: stream.exitCode,
            output: stream.lines.join('\n').trim(),
            route: '/api/tools/launch',
          });
        });
      }

      expect(results.map(result => result.id)).toEqual(TOOL_IDS);
      expect(results.some(result => result.status !== 'unavailable'), 'at least one real installed tool route').toBe(true);
      await testInfo.attach('windows-external-tool-route-summary', {
        body: Buffer.from(JSON.stringify({ workspace, results }, null, 2)),
        contentType: 'application/json',
      });
    } finally {
      for (const pid of activePids) {
        await request.post('/api/tools/kill', { data: { pid } }).catch(() => null);
      }
      const deleteResponse = await request.delete(`/api/workspaces/${encodeURIComponent(workspace.id)}`).catch(() => null);
      if (deleteResponse) expect([204, 404]).toContain(deleteResponse.status());
    }
  });
});
