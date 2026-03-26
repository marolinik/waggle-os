import { test, expect, Page } from '@playwright/test';

const TOKEN = '36a36b027129a154c0e86122ed56927409b612b6eb41f612b9177c85848719d3';
const BASE_URL = 'http://localhost:3333';
const SS = 'UAT 3/mega-test-v2/screenshots';

async function setupPage(page: Page, theme = 'dark') {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.evaluate((t: string) => {
    localStorage.setItem('waggle:onboarding', JSON.stringify({ completed: true }));
    localStorage.setItem('waggle:theme', t);
  }, theme);
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(2000);
}

async function clickNavView(page: Page, viewName: string): Promise<boolean> {
  const all = await page.locator('button').all();
  for (const btn of all) {
    const t = (await btn.textContent().catch(() => '')).trim();
    const a = (await btn.getAttribute('aria-label').catch(() => '') || '');
    if (t.toLowerCase() === viewName.toLowerCase() || a.toLowerCase().includes(viewName.toLowerCase())) {
      await btn.click();
      await page.waitForTimeout(800);
      return true;
    }
  }
  return false;
}

test.describe('R2 - Mega UAT Visual', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('40 - chat view dark 1920x1080', async ({ page }) => {
    await setupPage(page, 'dark');
    await page.screenshot({ path: `${SS}/40-chat-dark.png` });

    const html = await page.content();
    const honeyCount = (html.match(/honey|amber|#F5A|#f5a/gi) || []).length;
    const hexCount = (html.match(/hex|hexagon|honeycomb/gi) || []).length;
    const emojiCount = (html.match(/[\u{1F300}-\u{1FFFF}]/gu) || []).length;
    const imgCount = (html.match(/<img/g) || []).length;
    const hasBee = html.toLowerCase().includes('bee');
    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const navTxts = await page.locator('nav button, aside button').allTextContents();

    console.log(`honey/amber refs: ${honeyCount}`);
    console.log(`hex/hexagon refs: ${hexCount}`);
    console.log(`emoji in HTML: ${emojiCount}`);
    console.log(`img tags: ${imgCount}`);
    console.log(`bee refs: ${hasBee}`);
    console.log(`body font: ${bodyFont}`);
    console.log(`body bg: ${bgColor}`);
    console.log(`nav buttons: ${navTxts.slice(0, 8).join(' | ')}`);

    expect(bgColor).not.toBe('rgb(255, 255, 255)');
  });

  test('41 - cockpit view', async ({ page }) => {
    await setupPage(page, 'dark');
    const found = await clickNavView(page, 'Cockpit');
    const btns = await page.locator('nav button, aside button').allTextContents();
    console.log(`Nav buttons: ${btns.join(' | ')}`);
    console.log(`Found cockpit: ${found}`);
    await page.screenshot({ path: `${SS}/41-cockpit.png` });
    const html = await page.content();
    console.log(`Has KPI/metric: ${html.includes('kpi') || html.includes('KPI') || html.includes('metric')}`);
    console.log(`Has cost chart: ${html.includes('cost') || html.includes('Cost')}`);
    console.log(`Has heartbeat/health: ${html.includes('health') || html.includes('Health')}`);
  });

  test('42 - memory browser', async ({ page }) => {
    await setupPage(page, 'dark');
    await clickNavView(page, 'Memory');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SS}/42-memory.png` });
    const html = await page.content();
    console.log(`Has source dots: ${html.includes('dot') || html.includes('source-type') || html.includes('hex')}`);
    console.log(`Has bee researcher: ${html.includes('bee') && html.includes('empty')}`);
  });

  test('43 - settings tabs', async ({ page }) => {
    await setupPage(page, 'dark');
    await clickNavView(page, 'Settings');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SS}/43-settings.png` });
    const tabCount = await page.locator('[role="tab"]').count();
    const tabTexts = await page.locator('[role="tab"]').allTextContents();
    console.log(`Settings tab count: ${tabCount}`);
    console.log(`Tab labels: ${tabTexts.join(' | ')}`);
    const html = await page.content();
    console.log(`Has DEFAULT badge: ${html.includes('DEFAULT') || html.includes('default-badge')}`);
    console.log(`Has model grid: ${html.includes('model') || html.includes('Model')}`);
  });

  test('44 - capabilities', async ({ page }) => {
    await setupPage(page, 'dark');
    await clickNavView(page, 'Capabilities');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SS}/44-capabilities.png` });
    const html = await page.content();
    const hasWave8A = html.includes('Wave 8A') || html.includes('wave-8a');
    const beeImgCount = await page.locator('img[src*="bee"], img[alt*="bee"]').count();
    console.log(`Has Wave 8A text (should be false): ${hasWave8A}`);
    console.log(`Bee img elements: ${beeImgCount}`);
  });

  test('45 - onboarding re-trigger', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.evaluate(() => {
      localStorage.removeItem('waggle:onboarding');
    });
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SS}/45-onboarding.png` });
    const html = await page.content();
    console.log(`Onboarding welcome: ${html.includes('Welcome') || html.includes('welcome')}`);
    console.log(`Has Hive: ${html.includes('Hive') || html.includes('hive')}`);
    console.log(`Has bee mascot: ${html.toLowerCase().includes('bee')}`);
    console.log(`Has hex/progress dots: ${html.includes('hex') || html.includes('progress')}`);
    console.log(`Has provider selection: ${html.includes('provider') || html.includes('API Key')}`);
  });

  test('46 - events', async ({ page }) => {
    await setupPage(page, 'dark');
    await clickNavView(page, 'Events');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SS}/46-events.png` });
    const html = await page.content();
    console.log(`Has timeline: ${html.includes('timeline') || html.includes('Timeline') || html.includes('event')}`);
    console.log(`Has filter: ${html.includes('filter') || html.includes('Filter')}`);
  });

  test('47 - light mode', async ({ page }) => {
    await setupPage(page, 'light');
    await page.screenshot({ path: `${SS}/47-light-chat.png` });
    const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    console.log(`Body bg (light): ${bgColor}`);
    console.log(`HTML classes: ${htmlClass}`);
    const isLight = !bgColor.includes('17,') && !bgColor.includes('20,') && !bgColor.includes('0, 0, 0');
    console.log(`Light mode applied: ${isLight}`);

    await clickNavView(page, 'Cockpit');
    await page.screenshot({ path: `${SS}/47-light-cockpit.png` });
    await clickNavView(page, 'Memory');
    await page.screenshot({ path: `${SS}/47-light-memory.png` });
  });

  test('48-49 - brand assets and custom icons', async ({ page }) => {
    const r1 = await page.goto(`${BASE_URL}/brand/logo.jpeg`);
    const s1 = r1?.status();
    const r2 = await page.goto(`${BASE_URL}/brand/logo-light.jpeg`);
    const s2 = r2?.status();
    console.log(`logo.jpeg: ${s1}`);
    console.log(`logo-light.jpeg: ${s2}`);

    await setupPage(page, 'dark');
    const iconImgs = await page.locator('img[src*="icon-"]').count();
    const svgNavIcons = await page.locator('nav svg, aside svg').count();
    const emojiInNav = await page.evaluate(() => {
      const navEl = document.querySelector('nav, aside, [role="navigation"]');
      if (!navEl) return 0;
      const txt = navEl.textContent || '';
      return (txt.match(/[\u{1F300}-\u{1FFFF}]/gu) || []).length;
    });
    console.log(`icon- img tags: ${iconImgs}`);
    console.log(`nav SVG elements: ${svgNavIcons}`);
    console.log(`emoji in nav: ${emojiInNav}`);

    expect(s1).toBe(200);
  });

  test('50 - bee character count', async ({ page }) => {
    await setupPage(page, 'dark');
    const beeImgs = await page.locator('img[src*="bee"], img[alt*="bee"], img[alt*="Bee"]').count();
    const html = await page.content();
    const beeInText = (html.match(/\bbee\b/gi) || []).length;
    console.log(`Bee img elements: ${beeImgs}`);
    console.log(`bee word in HTML: ${beeInText}`);
  });

  test('51-53 - contrast readability', async ({ page }) => {
    await setupPage(page, 'dark');
    const metrics = await page.evaluate(() => {
      const bodyColor = getComputedStyle(document.body).color;
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const bodyFontSize = getComputedStyle(document.body).fontSize;
      const sidebar = document.querySelector('nav, aside, [role="navigation"]');
      const sidebarColor = sidebar ? getComputedStyle(sidebar).color : 'N/A';
      const sidebarBg = sidebar ? getComputedStyle(sidebar).backgroundColor : 'N/A';
      return { bodyColor, bodyBg, bodyFontSize, sidebarColor, sidebarBg };
    });
    console.log(JSON.stringify(metrics, null, 2));
  });

  test('54 - 1024x768 resize', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await setupPage(page, 'dark');
    await page.screenshot({ path: `${SS}/54-1024x768.png` });
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(`Horizontal scroll at 1024: ${hasHScroll}`);
    await clickNavView(page, 'Settings');
    await page.screenshot({ path: `${SS}/54-1024-settings.png` });
    const tabCount = await page.locator('[role="tab"]').count();
    console.log(`Settings tabs at 1024: ${tabCount}`);
  });

  test('55 - 768x1024 mobile', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await setupPage(page, 'dark');
    await page.screenshot({ path: `${SS}/55-768x1024.png` });
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const sidebarVisible = await page.locator('nav, aside').first().isVisible().catch(() => false);
    console.log(`768 - horizontal scroll: ${hasHScroll}`);
    console.log(`768 - sidebar visible: ${sidebarVisible}`);
  });
});
