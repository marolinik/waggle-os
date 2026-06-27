import { test, expect } from '@playwright/test';

const loginEmail = process.env.WAGGLE_E2E_LOGIN_EMAIL;
const loginPassword = process.env.WAGGLE_E2E_LOGIN_PASSWORD;

test.describe('optional Clerk login flow', () => {
  test.skip(
    !loginEmail || !loginPassword,
    'Set WAGGLE_E2E_LOGIN_EMAIL and WAGGLE_E2E_LOGIN_PASSWORD to run the live login flow.',
  );

  test('signs in with configured test credentials', async ({ page }, testInfo) => {
    await page.goto('/auth');

    const accountlessNotice = page.getByText(/local-first|accountless/i).first();
    if (await accountlessNotice.isVisible({ timeout: 2_000 }).catch(() => false)) {
      test.skip(true, 'Clerk is not configured for this environment.');
    }

    const emailInput = page
      .locator('input[name="identifier"], input[name="emailAddress"], input[type="email"]')
      .first();
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
    await emailInput.fill(loginEmail!);

    const continueButton = page
      .getByRole('button', { name: /continue|next|sign in|log in/i })
      .first();
    if (await continueButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await continueButton.click();
    }

    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
    await passwordInput.fill(loginPassword!);

    await page.getByRole('button', { name: /continue|sign in|log in/i }).first().click();
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 20_000 });

    await testInfo.attach('post-login-url', {
      body: page.url(),
      contentType: 'text/plain',
    });
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
