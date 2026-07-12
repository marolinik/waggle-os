// Waggle Companion background service worker — routes messages from
// popup.js to the local Waggle sidecar at 127.0.0.1:3333.
//
// MV3 service workers are short-lived; we don't keep any state here
// beyond per-message handlers. The sidecar's session token (if any) is
// pulled from chrome.storage.local on every request.

const SIDECAR = 'http://127.0.0.1:3333';

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function authErrorMessage(status, body) {
  const code = body?.code;
  if (code === 'EXTENSION_NOT_ALLOWLISTED') {
    return 'Browser Companion is not allowlisted. Add this extension ID to Waggle, restart Waggle, then try again.';
  }
  if (status === 401 && code === 'INVALID_TOKEN') {
    return 'Browser Companion pairing expired. Reopen Waggle desktop, then try again.';
  }
  if (status === 401 && (code === 'MISSING_TOKEN' || !code)) {
    return 'Browser Companion is not paired. Start Waggle desktop, then try again.';
  }
  return body?.error || `HTTP ${status}`;
}

async function requestSessionToken() {
  const r = await fetch(`${SIDECAR}/api/browser-ext/session-token`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Waggle-Extension-Id': chrome.runtime.id,
    },
  });
  const data = await readJson(r);
  if (!r.ok || !data?.token) {
    return { ok: false, error: authErrorMessage(r.status, data) };
  }
  await chrome.storage.local.set({ sessionToken: data.token });
  return { ok: true, token: data.token };
}

async function getAuthHeaders(options = {}) {
  try {
    const { sessionToken } = await chrome.storage.local.get(['sessionToken']);
    if (sessionToken) return { headers: { Authorization: `Bearer ${sessionToken}` } };
    if (!options.pair) return { headers: {} };
    const paired = await requestSessionToken();
    if (!paired.ok) return { headers: {}, error: paired.error };
    return { headers: { Authorization: `Bearer ${paired.token}` } };
  } catch (err) {
    return { headers: {}, error: String(err) };
  }
}

async function health() {
  try {
    const auth = await getAuthHeaders({ pair: true });
    if (auth.error) return { ok: false, error: auth.error };
    const r = await fetch(`${SIDECAR}/api/browser-ext/health`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...auth.headers },
    });
    if (!r.ok) return { ok: false, error: authErrorMessage(r.status, await readJson(r)) };
    return await r.json();
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function saveMemory(payload) {
  try {
    const body = JSON.stringify({
      content: payload.content,
      source: payload.source || 'import',
      importance: payload.importance || 'normal',
    });
    const auth = await getAuthHeaders({ pair: true });
    if (auth.error) return { saved: false, error: auth.error };
    let r = await fetch(`${SIDECAR}/api/memory/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      body,
    });
    if (r.status === 401) {
      const paired = await requestSessionToken();
      if (paired.ok) {
        r = await fetch(`${SIDECAR}/api/memory/frames`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${paired.token}` },
          body,
        });
      }
    }
    if (!r.ok) return { saved: false, error: authErrorMessage(r.status, await readJson(r)) };
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
