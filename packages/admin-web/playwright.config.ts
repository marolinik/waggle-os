import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.ADMIN_WEB_E2E_PORT ?? '4182');

export default defineConfig({
  testDir: './tests',
  testMatch: 'admin-rendered.spec.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    trace: 'off',
    viewport: { width: 1200, height: 800 },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port}`,
    port,
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
