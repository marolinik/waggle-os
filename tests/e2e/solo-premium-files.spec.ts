import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const RUN_LIVE_SOLO_FILES = process.env.WAGGLE_E2E_SOLO_FILES === '1';
const OWNS_ISOLATED_SERVER = process.env.WAGGLE_E2E_REUSE_EXISTING_SERVER === '0';
const SKIP_PARAMS = 'skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=simple';

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

async function readBrowserSessionToken(page: Page): Promise<string> {
  const response = await page.request.get('/api/auth/session-token', {
    headers: {
      Accept: 'application/json',
      'sec-fetch-site': 'same-origin',
    },
  });
  if (!response.ok()) throw new Error(`Session bootstrap failed: ${response.status()}`);
  const body = await response.json() as { token?: unknown };
  if (typeof body.token !== 'string' || !body.token) {
    throw new Error('Session bootstrap returned no token.');
  }
  return body.token;
}

test.describe('Windows Solo premium file download', () => {
  test.skip(
    !RUN_LIVE_SOLO_FILES || !OWNS_ISOLATED_SERVER,
    'Set WAGGLE_E2E_SOLO_FILES=1 and WAGGLE_E2E_REUSE_EXISTING_SERVER=0; this journey must own its disposable Waggle data dir.',
  );
  test.describe.configure({ retries: 0 });
  test.setTimeout(180_000);

  test('downloads the exact workspace file with its original name and bytes', async ({ page }) => {
    page.setDefaultTimeout(20_000);
    const suffix = randomUUID().slice(0, 8);
    const workspaceName = `File proof ${suffix}`;
    const fileName = `launch-brief-${suffix}.md`;
    const sentinel = `Waggle file download proof ${suffix}\nExact bytes survive the visible Files journey.\n`;
    const payload = Buffer.from(sentinel, 'utf8');
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    let token: string | null = null;
    let workspaceId: string | null = null;

    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));

    try {
      token = await readBrowserSessionToken(page);

      const onboardingStatusResponse = await page.request.get('/api/onboarding/status', {
        headers: authHeaders(token),
      });
      expect(onboardingStatusResponse.ok(), await onboardingStatusResponse.text().catch(() => '')).toBe(true);
      const onboardingStatus = await onboardingStatusResponse.json() as { profileId?: string };
      expect(onboardingStatus.profileId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      const onboardingCompleteResponse = await page.request.post('/api/onboarding/complete', {
        data: { expectedProfileId: onboardingStatus.profileId },
        headers: authHeaders(token),
      });
      expect(onboardingCompleteResponse.ok(), await onboardingCompleteResponse.text().catch(() => '')).toBe(true);

      const workspaceResponse = await page.request.post('/api/workspaces', {
        headers: authHeaders(token),
        data: {
          name: workspaceName,
          group: 'Tests',
          storageType: 'virtual',
        },
      });
      expect(workspaceResponse.status(), await workspaceResponse.text().catch(() => '')).toBe(201);
      workspaceId = (await workspaceResponse.json() as { id: string }).id;

      const uploadResponse = await page.request.post(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/files/upload`,
        {
          headers: authHeaders(token),
          data: {
            path: '/',
            name: fileName,
            data: payload.toString('base64'),
          },
        },
      );
      expect(uploadResponse.status(), await uploadResponse.text().catch(() => '')).toBe(201);

      await page.goto(
        `/files?workspace=${encodeURIComponent(workspaceId)}&${SKIP_PARAMS}`,
        { waitUntil: 'domcontentloaded' },
      );
      await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
      await page.getByRole('tab', { name: 'Files', exact: true }).click();
      const fileBrowser = page.getByRole('region', { name: `Files in ${workspaceName}` });
      await expect(fileBrowser.getByText(fileName, { exact: true })).toBeVisible();
      await fileBrowser.getByText(fileName, { exact: true }).click();

      const downloadButtons = page.getByRole('button', { name: 'Download', exact: true });
      await expect(downloadButtons.last()).toBeVisible();
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        downloadButtons.last().click(),
      ]);

      expect(download.suggestedFilename()).toBe(fileName);
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(payload);
      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    } finally {
      if (token && workspaceId) {
        const cleanup = await page.request.delete(
          `/api/workspaces/${encodeURIComponent(workspaceId)}`,
          { headers: authHeaders(token) },
        );
        expect.soft(cleanup.status()).toBe(204);
      }
    }
  });
});
