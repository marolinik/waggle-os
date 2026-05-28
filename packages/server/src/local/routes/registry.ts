/**
 * Public Skill Registry (FR-3) — /registry + /api/registry/catalog
 *
 * MVP from the 2026-05-28 addictiveness audit. Surfaces the 148-entry
 * MCP_CATALOG as a browseable web page so personas P4/P8/P9/P10 see
 * "what's in the marketplace" without having to launch Waggle first —
 * closes rubric dim 5 (reward of the tribe) by giving Waggle a public
 * artifact peers can link to ("here's the skill registry, here's the
 * one I use, install it in Waggle").
 *
 * MVP scope:
 *   - GET /api/registry/catalog   → JSON dump of MCP_CATALOG + categories
 *   - GET /registry               → self-contained HTML page (no build)
 *
 * Future (apps/registry/): extract to a Vite app, deploy at
 * registry.waggle-os.ai, support submissions via PR-to-mcp-catalog.ts.
 * The JSON endpoint stays the canonical data source either way.
 */

import type { FastifyInstance } from 'fastify';
import { MCP_CATALOG, MCP_CATEGORIES, CATEGORY_EMOJI } from '@waggle/shared';

// HTML page is a single template literal — keeps the MVP one-file. The
// JS inside fetches the catalog endpoint so future hosted versions can
// repoint at https://api.waggle-os.ai/registry/catalog without changing
// the page. Inline styles use the Hive design tokens approximated for
// non-Waggle visitors.
const REGISTRY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Waggle Skill Registry</title>
<meta name="description" content="Browse Waggle's curated MCP server catalog. One-click install to your local Waggle workspace.">
<style>
  :root {
    color-scheme: dark;
    --bg: #08090c;
    --fg: #f4f4f5;
    --muted: #71717a;
    --muted-fg: #a1a1aa;
    --primary: #e5a000;
    --primary-fg: #08090c;
    --card: #14141a;
    --card-hover: #1c1c24;
    --border: #27272a;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--fg);
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  header {
    border-bottom: 1px solid var(--border);
    padding: 24px 32px;
    background: linear-gradient(180deg, #11121a 0%, var(--bg) 100%);
  }
  .header-row { display: flex; align-items: baseline; gap: 12px; max-width: 1200px; margin: 0 auto; }
  .logo { width: 28px; height: 28px; background: var(--primary); border-radius: 6px; display: grid; place-items: center; font-weight: 700; color: var(--primary-fg); font-size: 16px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0; }
  .tag { font-size: 12px; color: var(--muted-fg); }
  .count { font-size: 12px; color: var(--muted); margin-left: auto; }

  main { max-width: 1200px; margin: 0 auto; padding: 20px 32px 60px; }
  .controls {
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    margin-bottom: 20px;
  }
  input[type="search"] {
    flex: 1; min-width: 240px;
    padding: 8px 12px;
    background: var(--card);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 8px;
    font: inherit;
  }
  input[type="search"]:focus { outline: none; border-color: var(--primary); }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    padding: 4px 10px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 999px;
    font-size: 11px;
    color: var(--muted-fg);
    cursor: pointer;
    transition: all 120ms;
    user-select: none;
  }
  .chip:hover { color: var(--fg); border-color: var(--muted); }
  .chip.active { background: var(--primary); color: var(--primary-fg); border-color: var(--primary); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    display: flex; flex-direction: column; gap: 8px;
    transition: background 120ms, border-color 120ms;
  }
  .card:hover { background: var(--card-hover); border-color: var(--muted); }
  .card-head { display: flex; align-items: center; gap: 8px; }
  .card-logo { font-size: 18px; line-height: 1; }
  .card-name { font-weight: 600; font-size: 14px; }
  .card-official { font-size: 10px; padding: 1px 6px; background: rgba(229,160,0,0.15); color: var(--primary); border-radius: 4px; }
  .card-desc { color: var(--muted-fg); font-size: 12px; line-height: 1.5; flex: 1; }
  .card-meta { font-size: 11px; color: var(--muted); display: flex; gap: 8px; flex-wrap: wrap; }
  .card-actions { display: flex; gap: 6px; margin-top: 4px; }
  .btn {
    padding: 6px 10px;
    border-radius: 6px;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
    border: 1px solid var(--border);
    text-decoration: none;
    display: inline-flex; align-items: center; gap: 4px;
    background: var(--card);
    color: var(--fg);
  }
  .btn:hover { background: var(--card-hover); border-color: var(--muted); }
  .btn-primary { background: var(--primary); color: var(--primary-fg); border-color: var(--primary); font-weight: 600; }
  .btn-primary:hover { background: #d18f00; border-color: #d18f00; }
  .empty { text-align: center; padding: 60px 20px; color: var(--muted); }
  footer { text-align: center; padding: 32px; color: var(--muted); font-size: 11px; border-top: 1px solid var(--border); }
  footer a { color: var(--primary); text-decoration: none; }
</style>
</head>
<body>
<header>
  <div class="header-row">
    <span class="logo">W</span>
    <h1>Waggle Skill Registry</h1>
    <span class="tag">curated MCP servers</span>
    <span class="count" id="count">loading…</span>
  </div>
</header>
<main>
  <div class="controls">
    <input type="search" id="search" placeholder="Search 148+ skills by name, capability, or author…">
    <div class="chips" id="chips"></div>
  </div>
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" hidden>No skills match your filters.</div>
</main>
<footer>
  Source: <code>packages/shared/src/mcp-catalog.ts</code> · Catalog grows via PR ·
  <a href="https://github.com/marolinik/waggle-os" target="_blank" rel="noreferrer">GitHub</a>
</footer>
<script src="/registry/main.js"></script>
</body>
</html>
`;

// JS bundle served separately so the CSP's script-src 'self' allows it
// (inline scripts would need 'unsafe-inline' or a per-request nonce, both
// worse than a same-origin .js file fetched by the page).
const REGISTRY_JS = `
(async () => {
  const grid = document.getElementById('grid');
  const empty = document.getElementById('empty');
  const search = document.getElementById('search');
  const chips = document.getElementById('chips');
  const count = document.getElementById('count');

  let catalog = [];
  let categories = [];
  let activeCategory = null;
  let query = '';

  try {
    const r = await fetch('/api/registry/catalog');
    const data = await r.json();
    catalog = data.servers || [];
    categories = data.categories || [];
    count.textContent = catalog.length + ' skills';
  } catch (err) {
    // textContent on a constructed node — never interpolate raw
    // error strings into innerHTML, even from "trusted" sources.
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = 'Catalog unavailable: ' + (err && err.message ? err.message : String(err));
    grid.replaceChildren(e);
    return;
  }

  // Build category chips
  const allChip = document.createElement('button');
  allChip.className = 'chip active';
  allChip.textContent = 'All';
  allChip.onclick = () => { activeCategory = null; updateChips(); render(); };
  chips.appendChild(allChip);
  for (const cat of categories) {
    const c = document.createElement('button');
    c.className = 'chip';
    c.textContent = cat;
    c.dataset.cat = cat;
    c.onclick = () => { activeCategory = cat; updateChips(); render(); };
    chips.appendChild(c);
  }

  function updateChips() {
    for (const c of chips.children) {
      const matches = (activeCategory === null && c === allChip) ||
                      (activeCategory && c.dataset.cat === activeCategory);
      c.classList.toggle('active', matches);
    }
  }

  function card(s) {
    // Use safe DOM construction — catalog entries are user-controlled
    // (contributed via PR), so we never interpolate raw values into HTML.
    const el = document.createElement('div');
    el.className = 'card';

    const head = document.createElement('div');
    head.className = 'card-head';
    const logo = document.createElement('span'); logo.className = 'card-logo'; logo.textContent = s.logo || '\\u{1F4E6}';
    const name = document.createElement('span'); name.className = 'card-name'; name.textContent = s.name;
    head.appendChild(logo); head.appendChild(name);
    if (s.official) {
      const off = document.createElement('span'); off.className = 'card-official'; off.textContent = 'official';
      head.appendChild(off);
    }
    el.appendChild(head);

    const desc = document.createElement('p');
    desc.className = 'card-desc';
    desc.textContent = s.description;
    el.appendChild(desc);

    const meta = document.createElement('div');
    meta.className = 'card-meta';
    const cat = document.createElement('span'); cat.textContent = s.category;
    const auth = document.createElement('span'); auth.textContent = 'by ' + s.author;
    meta.appendChild(cat); meta.appendChild(auth);
    el.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const installBtn = document.createElement('a');
    installBtn.className = 'btn btn-primary';
    installBtn.textContent = '⬇ Open in Waggle';
    // Deep link: opens the local Waggle desktop's Marketplace + scrolls
    // to this skill. When Waggle isn't running, the browser shows a
    // connection error — the registry can't launch the desktop binary
    // (a future protocol-handler ship covers that — listed as TODO in
    // apps/registry/README.md).
    installBtn.href = 'http://127.0.0.1:3333/?openSkill=' + encodeURIComponent(s.id);
    actions.appendChild(installBtn);

    if (s.url) {
      const srcBtn = document.createElement('a');
      srcBtn.className = 'btn';
      srcBtn.textContent = 'source';
      srcBtn.href = s.url; srcBtn.target = '_blank'; srcBtn.rel = 'noreferrer noopener';
      actions.appendChild(srcBtn);
    }

    el.appendChild(actions);
    return el;
  }

  function render() {
    const q = query.toLowerCase();
    const filtered = catalog.filter(s => {
      if (activeCategory && s.category !== activeCategory) return false;
      if (!q) return true;
      const hay = (s.name + ' ' + s.description + ' ' + s.author + ' ' + (s.capabilities || []).join(' ')).toLowerCase();
      return hay.includes(q);
    });
    // replaceChildren with no args clears safely — never use innerHTML='''
    // even for clearing, so this stays consistent + lint-clean.
    grid.replaceChildren();
    if (filtered.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    for (const s of filtered) grid.appendChild(card(s));
  }

  search.addEventListener('input', e => { query = e.target.value; render(); });
  render();
})();
`;

export async function registryRoutes(server: FastifyInstance) {
  // ── JSON catalog (canonical data source) ────────────────────────
  server.get('/api/registry/catalog', async (_request, reply) => {
    // Static — set a modest cache so this can sit behind a CDN later.
    reply.header('Cache-Control', 'public, max-age=300');
    return {
      version: '0.1.0',
      generatedAt: new Date().toISOString(),
      categories: MCP_CATEGORIES,
      categoryEmoji: CATEGORY_EMOJI,
      servers: MCP_CATALOG,
    };
  });

  // ── HTML page (one-file MVP — extract to apps/registry/ later) ──
  server.get('/registry', async (_request, reply) => {
    reply.type('text/html; charset=utf-8');
    return REGISTRY_HTML;
  });

  // ── Page JS — separate route so script-src 'self' in CSP allows it
  // without falling back to inline-script + unsafe-inline (which would
  // weaken the whole sidecar's XSS posture).
  server.get('/registry/main.js', async (_request, reply) => {
    reply.type('application/javascript; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=300');
    return REGISTRY_JS;
  });
}
