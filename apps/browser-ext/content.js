// Waggle Companion content script — runs on every page, responds to
// "extract" messages from the popup with the current selection + the
// page's main text. Page-text extraction is intentionally simple
// (innerText of the body, trimmed) — the right place to do article
// extraction is server-side once the user opts in.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'extract') return;
  try {
    const selection = String(window.getSelection?.() || '').trim();
    const bodyText = (document.body?.innerText || '').replace(/\s+\n/g, '\n').trim();
    sendResponse({
      selection,
      page: {
        url: location.href,
        title: document.title || location.href,
        // Cap at 12k chars so popup → background message-passing stays snappy.
        // Server-side ingest pipeline can re-fetch the URL for the full body.
        text: bodyText.slice(0, 12000),
      },
    });
  } catch (err) {
    sendResponse({ selection: '', page: null, error: String(err) });
  }
  // Returning true keeps the message channel open for the async sendResponse.
  return true;
});
