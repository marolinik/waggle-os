// Waggle Companion background service worker — routes messages from
// popup.js to the local Waggle sidecar at 127.0.0.1:3333.
//
// MV3 service workers are short-lived; we don't keep any state here
// beyond per-message handlers. The sidecar's session token (if any) is
// pulled from chrome.storage.local on every request.

const SIDECAR = 'http://127.0.0.1:3333';

async function getAuthHeaders() {
  // Future: support per-user bearer token paired from the desktop.
  // For MVP we rely on the sidecar's localhost-only binding for trust.
  try {
    const { sessionToken } = await chrome.storage.local.get(['sessionToken']);
    return sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {};
  } catch {
    return {};
  }
}

async function health() {
  try {
    const r = await fetch(`${SIDECAR}/api/browser-ext/health`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...(await getAuthHeaders()) },
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    return await r.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function saveMemory(payload) {
  try {
    const r = await fetch(`${SIDECAR}/api/memory/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({
        content: payload.content,
        source: payload.source || 'import',
        importance: payload.importance || 'normal',
      }),
    });
    if (!r.ok) return { saved: false, error: `HTTP ${r.status}` };
    const data = await r.json();
    return {
      saved: data?.saved ?? true,
      duplicate: data?.duplicate ?? false,
      frameId: data?.frameId,
    };
  } catch (err) {
    return { saved: false, error: String(err) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'health') sendResponse(await health());
    else if (msg?.type === 'save-memory') sendResponse(await saveMemory(msg));
    else sendResponse({ error: 'unknown message type' });
  })();
  return true; // keep channel open for async sendResponse
});

// Context menu: right-click selection → "Save to Waggle memory"
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'waggle-save-selection',
    title: 'Save to Waggle memory',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'waggle-save-selection' || !info.selectionText) return;
  const result = await saveMemory({
    content: `Selection from ${tab?.title || tab?.url}\n\n${info.selectionText}`,
    source: 'import',
    importance: 'normal',
  });
  // Best-effort badge feedback (MV3 has no toast API in background).
  await chrome.action.setBadgeText({ text: result.saved ? '✓' : '!' });
  await chrome.action.setBadgeBackgroundColor({ color: result.saved ? '#10b981' : '#ef4444' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
});
