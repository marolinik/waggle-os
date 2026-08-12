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
const pairForm = $('pair-form');
const pairCode = $('pair-code');
const pairSubmit = $('pair-submit');

let cachedSelection = '';
let cachedPageMeta = null;
let toastTimer = null;

function showToast(msg, kind = '', options = {}) {
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.className = kind;
  if (!options.sticky && (kind === 'ok' || kind === 'err')) {
    toastTimer = setTimeout(() => {
      if (toast.textContent === msg) {
        toast.textContent = '';
        toast.className = '';
      }
    }, 3500);
  }
}

function isSetupError(msg) {
  return /allowlisted|paired|pairing/i.test(msg);
}

function formatMemoryDestination(reply) {
  const workspaceName = typeof reply?.activeWorkspaceName === 'string'
    ? reply.activeWorkspaceName.trim()
    : '';
  const workspaceId = typeof reply?.activeWorkspaceId === 'string'
    ? reply.activeWorkspaceId.trim()
    : typeof reply?.activeWorkspace === 'string'
      ? reply.activeWorkspace.trim()
      : '';
  if (workspaceName) return workspaceName;
  if (workspaceId && workspaceId !== 'local-default' && workspaceId !== 'default-workspace') {
    return `Workspace id: ${workspaceId}`;
  }
  return 'Personal memory';
}

async function refreshHealth() {
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'health' });
    if (reply?.ok) {
      dot.className = 'dot connected';
      statusText.textContent = 'Connected';
      // textContent (not innerHTML) — workspace names are user-controlled
      // and could otherwise be XSS sinks in the extension context.
      workspaceNameEl.textContent = formatMemoryDestination(reply);
      pairForm.hidden = true;
    } else {
      throw new Error(reply?.error || 'No response');
    }
  } catch (err) {
    dot.className = 'dot disconnected';
    statusText.textContent = 'Not connected';
    workspaceNameEl.textContent = 'Unavailable';
    pairForm.hidden = false;
    const msg = err?.message || 'Start Waggle desktop on this machine, then re-open this popup.';
    showToast(msg, 'err', { sticky: true });
  }
}

async function pair(event) {
  event.preventDefault();
  const code = pairCode.value.trim().toUpperCase();
  pairSubmit.disabled = true;
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'pair', code });
    if (!reply?.ok) {
      showToast(reply?.error || 'Pairing failed.', 'err', { sticky: true });
      return;
    }
    pairCode.value = '';
    showToast('Browser Companion paired.', 'ok');
    await refreshHealth();
  } catch (err) {
    showToast(err?.message || 'Pairing failed.', 'err', { sticky: true });
  } finally {
    pairSubmit.disabled = false;
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
    showToast('Waggle cannot read this browser page. Open a normal webpage, then try again.', 'err', { sticky: true });
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
    const msg = reply?.error || 'Save failed.';
    if (isSetupError(msg)) pairForm.hidden = false;
    showToast(msg, 'err', { sticky: isSetupError(msg) });
  }
}

btnSelection.addEventListener('click', () => save('selection'));
btnPage.addEventListener('click', () => save('page'));
btnOpen.addEventListener('click', () => chrome.tabs.create({ url: 'http://127.0.0.1:3333' }));
pairForm.addEventListener('submit', pair);

refreshHealth();
readActiveTab();
