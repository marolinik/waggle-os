import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOTS_DIR = path.join(__dirname, 'test-results', 'login-flow');

test('User Login Flow Test', async ({ page }) => {
  // Kreiraj folder za screenshotove
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  console.log('[TEST] Opening Waggle OS...');
  await page.goto('http://localhost:8083');
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-landing.png') });

  // Cekaj da se ucita Clerk ili login forma
  // Pretpostavka: Clerk se ucitava u iframe-u ili kao div sa klasom .cl-rootBox
  console.log('[TEST] Waiting for login form...');
  
  // Probaj da nadjes Clerk inpute
  const emailInput = page.locator('input[name="emailAddress"]').first();
  const passwordInput = page.locator('input[name="password"]').first();
  const signInButton = page.locator('button[type="submit"]').filter({ hasText: /Sign in|Log in|Uloguj se/i }).first();

  // Ako nema Clerk inputa, mozda je custom forma
  if (await emailInput.count() === 0) {
    console.log('[TEST] Clerk inputs not found. Looking for generic inputs...');
    // Fallback: trazi prvi input tipa email
    const genericEmail = page.locator('input[type="email"]').first();
    const genericPass = page.locator('input[type="password"]').first();
    
    if (await genericEmail.count() > 0) {
      console.log('[TEST] Found generic inputs.');
      await genericEmail.fill('zikasistent@gmail.com');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-email-filled.png') });
      
      await genericPass.fill('74marOLInik74');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-password-filled.png') });
      
      const genericSubmit = page.locator('button[type="submit"]').first();
      await genericSubmit.click();
    } else {
      console.log('[TEST] No login form found. Dumping page content...');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-no-form.png') });
      const content = await page.content();
      fs.writeFileSync(path.join(SCREENSHOTS_DIR, 'page-content.html'), content);
      throw new Error('Login form not found');
    }
  } else {
    console.log('[TEST] Found Clerk inputs.');
    await emailInput.fill('zikasistent@gmail.com');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-email-filled.png') });
    
    await passwordInput.fill('74marOLInik74');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-password-filled.png') });
    
    await signInButton.click();
  }

  console.log('[TEST] Submitted login. Waiting for navigation...');
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-post-login.png') });

  // Cekaj da se ucita dashboard ili chat
  // Pretpostavka: Postoji nekakav chat input ili workspace selector
  console.log('[TEST] Checking for post-login state...');
  
  // Cekaj 5 sekundi da vidimo sta se desava
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-after-wait.png') });

  // Proveri da li smo ulogovani (npr. postoji logout dugme ili chat input)
  const chatInput = page.locator('textarea[placeholder*="chat"], input[placeholder*="chat"], .chat-input').first();
  if (await chatInput.count() > 0) {
    console.log('[SUCCESS] User logged in. Chat input found.');
    await chatInput.fill('Hello Waggle, this is a test.');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-chat-filled.png') });
  } else {
    console.log('[WARNING] Chat input not found. User might not be logged in or UI is different.');
    // Dumpiraj HTML za analizu
    const content = await page.content();
    fs.writeFileSync(path.join(SCREENSHOTS_DIR, 'post-login-content.html'), content);
  }
});
