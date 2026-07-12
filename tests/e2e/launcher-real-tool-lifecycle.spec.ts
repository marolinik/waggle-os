import { expect, test } from '@playwright/test';

const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=power';
const PREFERRED_TOOL_IDS = ['openclaw', 'claude-code', 'hermes'] as const;
const SAFE_ARGS_BY_TOOL: Record<string, string[]> = {
  openclaw: ['--version'],
  'claude-code': ['--version'],
  hermes: ['--version'],
};

type DetectedTool = {
  id: string;
  displayName: string;
  installed: boolean;
  installedPath: string | null;
  launchable?: boolean;
};

type DetectionEnvelope = {
  tools: DetectedTool[];
};

type LaunchEnvelope = {
  ok: boolean;
  pid: number | null;
  error?: string;
};

function routeWithSkip(route: string): string {
  const sep = route.includes('?') ? '&' : '?';
  return `${route}${sep}${SKIP_PARAMS}`;
}

function chooseSafeTool(tools: DetectedTool[]): DetectedTool | undefined {
  return PREFERRED_TOOL_IDS
    .map((id) => tools.find((tool) => tool.id === id && tool.installed && tool.installedPath && tool.launchable))
    .find((tool): tool is DetectedTool => Boolean(tool));
}

async function readObservedStream(
  baseURL: string,
  pid: number,
): Promise<{ lines: string[]; exitCode: number | null | undefined }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
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
      buffer += decoder.decode(chunk.value, { stream: true });

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

        if (event === 'line') {
          lines.push((JSON.parse(data) as { line: string }).line);
        }
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

test.describe('Launcher real tool lifecycle', () => {
  test('renders a real detected CLI and observes a safe launch to exit', async ({ baseURL, page, request }) => {
    test.skip(
      process.env.WAGGLE_E2E_REAL_TOOLS !== '1',
      'Set WAGGLE_E2E_REAL_TOOLS=1 on a machine with Claude, Hermes, or OpenClaw installed.',
    );
    const root = baseURL ?? process.env.WAGGLE_E2E_BASE_URL ?? 'http://127.0.0.1:3333';

    const detectionResponse = await request.get('/api/tools/detect');
    expect(detectionResponse.ok()).toBe(true);
    const detection = await detectionResponse.json() as DetectionEnvelope;
    const tool = chooseSafeTool(detection.tools);
    expect(tool, 'expected at least one safe real CLI tool to be installed').toBeTruthy();

    await page.goto(routeWithSkip('/launcher?watch=1'), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 });
    await expect(page.getByText('Tool Launcher')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(tool!.displayName, { exact: true })).toBeVisible({ timeout: 10_000 });

    const launchResponse = await request.post('/api/tools/launch', {
      data: {
        id: tool!.id,
        installedPath: tool!.installedPath,
        args: SAFE_ARGS_BY_TOOL[tool!.id],
        workspaceId: 'e2e-real-tool-lifecycle',
        observe: true,
      },
    });
    expect(launchResponse.status()).toBe(202);
    const launch = await launchResponse.json() as LaunchEnvelope;
    expect(launch, launch.error).toMatchObject({ ok: true });
    expect(launch.pid).toEqual(expect.any(Number));

    const stream = await readObservedStream(root, launch.pid!);
    expect(stream.exitCode).toBe(0);
    expect(stream.lines.join('\n').trim().length).toBeGreaterThan(0);

    await expect.poll(async () => {
      const processesResponse = await request.get('/api/tools/processes');
      expect(processesResponse.ok()).toBe(true);
      const body = await processesResponse.json() as {
        processes: Array<{ pid: number }>;
      };
      return body.processes.some((process) => process.pid === launch.pid);
    }, { timeout: 5_000 }).toBe(false);
  });
});
