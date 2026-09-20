/// <reference lib="dom" />
/**
 * Browser Tools — browser automation via playwright-core.
 *
 * Tools:
 *   browser_navigate   — Navigate to a URL
 *   browser_screenshot  — Take a screenshot of the current page
 *   browser_click       — Click an element by CSS selector
 *   browser_fill        — Fill an input by CSS selector
 *   browser_evaluate    — Evaluate JavaScript in the page context
 *   browser_snapshot    — Get a simplified DOM snapshot (accessibility tree)
 *
 * All tools dynamically import playwright-core. If not installed, they
 * return a helpful message. A single browser instance is managed per
 * session (module-level). Headless only.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { ToolDefinition } from './tools.js';

// playwright-core is an OPTIONAL runtime dependency loaded via dynamic import.
// It is not a declared dependency of this package, so we describe only the
// minimal surface we use rather than importing its types (which would create
// an undeclared compile-time dependency). These structural interfaces narrow
// the otherwise-untyped dynamic module to exactly the calls we make.
interface BrowserPage {
  goto(url: string, opts?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  title(): Promise<string>;
  url(): string;
  screenshot(opts: { path: string; fullPage: boolean }): Promise<unknown>;
  click(selector: string, opts?: { timeout?: number }): Promise<unknown>;
  fill(selector: string, value: string, opts?: { timeout?: number }): Promise<unknown>;
  evaluate<R>(pageFunction: () => R): Promise<Awaited<R>>;
  evaluate(pageFunction: string): Promise<unknown>;
}
interface BrowserContext {
  newPage(): Promise<BrowserPage>;
}
interface BrowserInstance {
  newContext(): Promise<BrowserContext>;
  close(): Promise<void>;
}
interface ChromiumLauncher {
  launch(opts: { headless: boolean; args: string[] }): Promise<BrowserInstance>;
}
interface PlaywrightModule {
  chromium?: ChromiumLauncher;
  default?: { chromium?: ChromiumLauncher };
}

// Module-level browser state — shared across all tool invocations in a session
let browserInstance: BrowserInstance | null = null;
let pageInstance: BrowserPage | null = null;
let playwrightModule: PlaywrightModule | null = null;

/**
 * Held in a variable, not written inline, and that is the whole point.
 *
 * `await import('playwright-core')` with a LITERAL specifier makes TypeScript
 * resolve the module at compile time and fail with TS2307 when it is absent —
 * and absent is the intended state. `scripts/build-sidecar.mjs` marks it
 * external and `scripts/stage-sidecar-deps.mjs` deliberately does not stage it
 * ("100s of MB of dead weight"); the user installs it only if they want browser
 * tools. The structural interfaces above already avoid importing its types for
 * the same reason, but they could not stop the specifier itself from being
 * resolved.
 *
 * So the package compiled only while npm happened to hoist playwright-core out
 * of apps/web's `@playwright/test`, two levels up a transitive chain. The day a
 * bump changed that hoist, this file stopped compiling — which is exactly what
 * dependabot #99 hit. A variable specifier is not resolved by TypeScript, so
 * the optional dependency is now optional at compile time too. See TD-DEP-1.
 */
const PLAYWRIGHT_SPECIFIER = 'playwright-core';

/** Try to import playwright-core. Returns the module or null. */
async function getPlaywright(): Promise<PlaywrightModule | null> {
  if (playwrightModule) return playwrightModule;
  try {
    playwrightModule = (await import(PLAYWRIGHT_SPECIFIER)) as PlaywrightModule;
    return playwrightModule;
  } catch {
    return null;
  }
}

/** Ensure a browser and page are running. Returns { browser, page } or throws. */
async function ensureBrowser(
  workspacePath: string,
): Promise<{ browser: BrowserInstance; page: BrowserPage }> {
  const pw = await getPlaywright();
  if (!pw) {
    throw new Error(
      [
        'Browser automation requires playwright-core.',
        '',
        'To set up:',
        '1. Open a terminal in your Waggle directory',
        '2. Run: npm install playwright-core',
        '3. Run: npx playwright install chromium',
        '',
        'Or install the "Browser Automation" skill from Skills & Apps.',
      ].join('\n'),
    );
  }

  if (!browserInstance) {
    const userDataDir = path.join(workspacePath, '.waggle-tmp', 'browser-data');
    fs.mkdirSync(userDataDir, { recursive: true });

    const chromium = pw.chromium ?? pw.default?.chromium;
    if (!chromium) {
      throw new Error('Could not find chromium launcher in playwright-core');
    }

    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    // Register cleanup on process exit
    const cleanup = () => {
      try {
        browserInstance?.close();
      } catch {
        // Already closed
      }
      browserInstance = null;
      pageInstance = null;
    };
    process.on('exit', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }

  if (!pageInstance) {
    const context = await browserInstance.newContext();
    pageInstance = await context.newPage();
  }

  return { browser: browserInstance, page: pageInstance };
}

/** Close the browser session (for cleanup). */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      // Already closed
    }
    browserInstance = null;
    pageInstance = null;
  }
}

/** Reset module-level state (for testing). */
export function _resetBrowserState(): void {
  browserInstance = null;
  pageInstance = null;
  playwrightModule = null;
}

export function createBrowserTools(workspacePath: string): ToolDefinition[] {
  return [
    // 1. browser_navigate — Navigate to a URL
    {
      name: 'browser_navigate',
      description:
        'Navigate the browser to a URL. Returns the page title and final URL after navigation.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate to' },
        },
        required: ['url'],
      },
      execute: async (args) => {
        try {
          const url = args.url as string;
          const { page } = await ensureBrowser(workspacePath);
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          const title = await page.title();
          const finalUrl = page.url();
          return `Navigated to: ${finalUrl}\nTitle: ${title}`;
        } catch (err: unknown) {
          return `Browser navigate error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // 2. browser_screenshot — Take a screenshot
    {
      name: 'browser_screenshot',
      description:
        'Take a screenshot of the current browser page. Saves to the workspace temp directory and returns the file path.',
      parameters: {
        type: 'object',
        properties: {
          full_page: {
            type: 'boolean',
            description: 'Capture the full scrollable page (default: false, viewport only)',
          },
        },
      },
      execute: async (args) => {
        try {
          const fullPage = (args.full_page as boolean) ?? false;
          const { page } = await ensureBrowser(workspacePath);
          const screenshotDir = path.join(workspacePath, '.waggle-tmp', 'screenshots');
          fs.mkdirSync(screenshotDir, { recursive: true });
          const filename = `screenshot-${Date.now()}.png`;
          const filepath = path.join(screenshotDir, filename);
          await page.screenshot({ path: filepath, fullPage });
          return `Screenshot saved: ${filepath}`;
        } catch (err: unknown) {
          return `Browser screenshot error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // 3. browser_click — Click an element by CSS selector
    {
      name: 'browser_click',
      description:
        'Click an element on the current page by CSS selector.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector of the element to click',
          },
        },
        required: ['selector'],
      },
      execute: async (args) => {
        try {
          const selector = args.selector as string;
          const { page } = await ensureBrowser(workspacePath);
          await page.click(selector, { timeout: 10_000 });
          return `Clicked element: ${selector}`;
        } catch (err: unknown) {
          return `Browser click error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // 4. browser_fill — Fill an input by CSS selector
    {
      name: 'browser_fill',
      description:
        'Fill an input element with a value by CSS selector. Clears existing content first.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector of the input element',
          },
          value: {
            type: 'string',
            description: 'Value to fill into the input',
          },
        },
        required: ['selector', 'value'],
      },
      execute: async (args) => {
        try {
          const selector = args.selector as string;
          const value = args.value as string;
          const { page } = await ensureBrowser(workspacePath);
          await page.fill(selector, value, { timeout: 10_000 });
          return `Filled "${selector}" with value (${value.length} chars)`;
        } catch (err: unknown) {
          return `Browser fill error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // 5. browser_evaluate — Evaluate JavaScript in the page context
    {
      name: 'browser_evaluate',
      description:
        'Evaluate a JavaScript expression in the current page context. Returns the serialized result.',
      parameters: {
        type: 'object',
        properties: {
          script: {
            type: 'string',
            description: 'JavaScript expression or code to evaluate',
          },
        },
        required: ['script'],
      },
      execute: async (args) => {
        try {
          const script = args.script as string;
          const { page } = await ensureBrowser(workspacePath);
          const result = await page.evaluate(script);
          if (result === undefined) return 'Result: undefined';
          if (result === null) return 'Result: null';
          if (typeof result === 'object') {
            return `Result: ${JSON.stringify(result, null, 2)}`;
          }
          return `Result: ${String(result)}`;
        } catch (err: unknown) {
          return `Browser evaluate error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // 6. browser_snapshot — Simplified DOM snapshot
    {
      name: 'browser_snapshot',
      description:
        'Get a simplified DOM snapshot of the current page. Returns an accessibility-tree-like view showing text, links, buttons, and inputs.',
      parameters: {
        type: 'object',
        properties: {},
      },
      execute: async () => {
        try {
          const { page } = await ensureBrowser(workspacePath);

          // Extract a simplified view of the page content
          const snapshot = await page.evaluate(() => {
            const lines: string[] = [];
            const walk = (node: Element, depth: number) => {
              const indent = '  '.repeat(depth);
              const tag = node.tagName.toLowerCase();

              // Skip hidden elements, scripts, styles
              if (['script', 'style', 'noscript', 'svg', 'path'].includes(tag)) return;
              const style = window.getComputedStyle(node);
              if (style.display === 'none' || style.visibility === 'hidden') return;

              // Extract meaningful info based on element type
              if (tag === 'a') {
                const href = node.getAttribute('href') ?? '';
                const text = (node.textContent ?? '').trim().slice(0, 100);
                if (text) lines.push(`${indent}[link] ${text} → ${href}`);
              } else if (tag === 'button' || node.getAttribute('role') === 'button') {
                const text = (node.textContent ?? '').trim().slice(0, 100);
                if (text) lines.push(`${indent}[button] ${text}`);
              } else if (tag === 'input') {
                const type = node.getAttribute('type') ?? 'text';
                const name = node.getAttribute('name') ?? node.getAttribute('id') ?? '';
                const val = (node as HTMLInputElement).value ?? '';
                lines.push(`${indent}[input:${type}] name="${name}" value="${val.slice(0, 50)}"`);
              } else if (tag === 'textarea') {
                const name = node.getAttribute('name') ?? node.getAttribute('id') ?? '';
                const val = (node as HTMLTextAreaElement).value ?? '';
                lines.push(`${indent}[textarea] name="${name}" value="${val.slice(0, 50)}"`);
              } else if (tag === 'select') {
                const name = node.getAttribute('name') ?? node.getAttribute('id') ?? '';
                lines.push(`${indent}[select] name="${name}"`);
              } else if (tag === 'img') {
                const alt = node.getAttribute('alt') ?? '';
                const src = node.getAttribute('src') ?? '';
                lines.push(`${indent}[image] alt="${alt}" src="${src.slice(0, 80)}"`);
              } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
                const text = (node.textContent ?? '').trim().slice(0, 200);
                if (text) lines.push(`${indent}[${tag}] ${text}`);
              } else if (tag === 'p' || tag === 'li' || tag === 'td' || tag === 'th') {
                const text = (node.textContent ?? '').trim().slice(0, 200);
                if (text && node.children.length === 0) {
                  lines.push(`${indent}[${tag}] ${text}`);
                }
              }

              // Recurse into children
              for (const child of Array.from(node.children)) {
                walk(child, depth + 1);
              }
            };

            walk(document.body, 0);
            return lines.join('\n');
          });

          if (!snapshot || snapshot.trim().length === 0) {
            return 'Page snapshot: (empty or no visible content)';
          }

          // Truncate if very long
          const maxLen = 15_000;
          if (snapshot.length > maxLen) {
            return `Page snapshot (truncated to ${maxLen} chars):\n\n${snapshot.slice(0, maxLen)}\n\n... (truncated)`;
          }

          return `Page snapshot:\n\n${snapshot}`;
        } catch (err: unknown) {
          return `Browser snapshot error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ];
}
