// Waggle Companion popup — talks to background.js via chrome.runtime.sendMessage,
// background talks to the local Waggle sidecar at 127.0.0.1:3333. The popup
// itself never makes network requests so we don't pay the CORS preflight tax
// from an extension origin.

const $ = (id) => document.getElementById(id);

const dot = $('dot');
const statusText = $('status-text');
const workspaceNameEl = $('workspace-name');
const btnSelection = $('save-selection');
const btnPage = $('save-page');
const btnOpen = $('open-waggle');
const toast = $('toast');

let cachedSelection = '';
let cachedPageMeta = null;

function showToast(msg, kind = '') {
  toast.textContent = msg;
  toast.className = kind;
  if (kind === 'ok' || kind === 'err') {
    setTimeout(() => { if (toast.textContent === msg) { toast.textContent = ''; toast.className = ''; } }, 3500);
  }
}

async function refreshHealth() {
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'health' });
    if (reply?.ok) {
      dot.className = 'dot connected';
      statusText.textContent = 'Connected';
      // textContent (not innerHTML) — workspace names are user-controlled
      // and could otherwise be XSS sinks in the extension context.
      workspaceNameEl.textContent = reply.activeWorkspace || 'personal memory';
    } else {
      throw new Error(reply?.error || 'No response');
    }
  } catch (err) {
    dot.className = 'dot disconnected';
    statusText.textContent = 'Not connected';
    workspaceNameEl.textContent = '—';
    showToast('Start Waggle desktop on this machine, then re-open this popup.', 'err');
  }
}

async function readActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'extract' });
    cachedSelection = res?.selection ?? '';
    cachedPageMeta = res?.page ?? null;
    btnSelection.disabled = !cachedSelection;
  } catch {
    // Content script unavailable (e.g. on chrome:// pages) — disable buttons gracefully.
    btnSelection.disabled = true;
    btnPage.disabled = true;
  }
}

async function save(kind) {
  const isSelection = kind === 'selection';
  const text = isSelection ? cachedSelection : (cachedPageMeta?.text || '');
  if (!text) { showToast('Nothing to save.', 'err'); return; }
  const url = cachedPageMeta?.url || '';
  const title = cachedPageMeta?.title || '';
  const prefix = isSelection ? 'Selection from' : 'Saved page';
  const content = `${prefix} ${title || url}\n\n${text}`.slice(0, 16000);
  showToast(`Saving ${isSelection ? 'selection' : 'page'}…`);
  const reply = await chrome.runtime.sendMessage({
    type: 'save-memory',
    content,
    source: 'import',
    importance: isSelection ? 'normal' : 'low',
    url, title,
  });
  if (reply?.saved) {
    showToast(reply.duplicate ? 'Already in memory.' : 'Saved to Waggle memory ✓', 'ok');
  } else {
    showToast(reply?.error || 'Save failed.', 'err');
  }
}

btnSelection.addEventListener('click', () => save('selection'));
btnPage.addEventListener('click', () => save('page'));
btnOpen.addEventListener('click', () => chrome.tabs.create({ url: 'http://127.0.0.1:3333' }));

refreshHealth();
readActiveTab();
