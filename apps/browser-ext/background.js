// Waggle Companion background service worker — the only extension process that
// talks to the loopback sidecar. The popup supplies a one-time code; only the
// resulting scoped credential is persisted.

const SIDECAR = 'http://127.0.0.1:3333';
const PAIRING_REQUIRED = 'Browser Companion not paired. Generate a one-time code in Waggle Settings.';

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
    return 'Browser Companion not allowlisted. Add the extension ID in Waggle, restart Waggle, and try again.';
  }
  if (code === 'PAIRING_CODE_INVALID') {
    return 'Invalid or expired pairing code. Generate a new one-time code in Waggle Settings.';
  }
  if (status === 401 && (code === 'INVALID_TOKEN' || code === 'MISSING_TOKEN' || !code)) {
    return PAIRING_REQUIRED;
  }
  return body?.error || `HTTP ${status}`;
}

async function removeLegacyToken() {
  await chrome.storage.local.remove('sessionToken');
}

async function getAuthHeaders() {
  try {
    const { companionToken, sessionToken } = await chrome.storage.local.get([
      'companionToken',
      'sessionToken',
    ]);
    if (sessionToken) await removeLegacyToken();
    if (!companionToken) return { headers: {}, error: PAIRING_REQUIRED };
    return { headers: { Authorization: `Bearer ${companionToken}` } };
  } catch (err) {
    return { headers: {}, error: String(err) };
  }
}

async function pairWithCode(rawCode) {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
    return { ok: false, error: 'Enter the 8-character code shown in Waggle Settings.' };
  }
  try {
    const response = await fetch(`${SIDECAR}/api/browser-ext/pair`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Waggle-Extension-Id': chrome.runtime.id,
      },
      body: JSON.stringify({ code }),
    });
    const data = await readJson(response);
    if (!response.ok || typeof data?.token !== 'string') {
      return { ok: false, error: authErrorMessage(response.status, data) };
    }
    await chrome.storage.local.set({ companionToken: data.token });
    await removeLegacyToken();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function health() {
  try {
    const auth = await getAuthHeaders();
    if (auth.error) return { ok: false, error: auth.error };
    const response = await fetch(`${SIDECAR}/api/browser-ext/health`, {
      method: 'GET',
      headers: { Accept: 'application/json', ...auth.headers },
    });
    const data = await readJson(response);
    if (response.status === 401) {
      await chrome.storage.local.remove('companionToken');
      return { ok: false, error: PAIRING_REQUIRED };
    }
    if (!response.ok) return { ok: false, error: authErrorMessage(response.status, data) };
    return data;
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function saveMemory(payload) {
  try {
    const auth = await getAuthHeaders();
    if (auth.error) return { saved: false, error: auth.error };
    const response = await fetch(`${SIDECAR}/api/memory/frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth.headers },
      body: JSON.stringify({
        content: payload.content,
        source: payload.source || 'import',
        importance: payload.importance || 'normal',
      }),
    });
    const data = await readJson(response);
    if (response.status === 401) {
      await chrome.storage.local.remove('companionToken');
      return { saved: false, error: PAIRING_REQUIRED };
    }
    if (!response.ok) return { saved: false, error: authErrorMessage(response.status, data) };
    return {
      saved: data?.saved ?? true,
      duplicate: data?.duplicate ?? false,
      frameId: data?.frameId,
    };
  } catch (err) {
    return { saved: false, error: String(err) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === 'health') sendResponse(await health());
    else if (message?.type === 'pair') sendResponse(await pairWithCode(message.code));
    else if (message?.type === 'save-memory') sendResponse(await saveMemory(message));
    else sendResponse({ error: 'unknown message type' });
  })();
  return true;
});

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
  await chrome.action.setBadgeText({ text: result.saved ? '✓' : '!' });
  await chrome.action.setBadgeBackgroundColor({ color: result.saved ? '#10b981' : '#ef4444' });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
});
