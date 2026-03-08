/**
 * Service worker: fetch k BetTracker API probíhá z kontextu extension,
 * takže nedochází k blokaci CORS z content scriptu na stránce SofaScore.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "fetchEvents") {
    const apiBase = (message.apiBase || "").replace(/\/+$/, "");
    const url = `${apiBase}/sofascore-sync/events?limit=200`;
    fetch(url)
      .then((res) => {
        if (!res.ok) return res.text().then((t) => Promise.reject(new Error(`API ${res.status}: ${t}`)));
        return res.json();
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true; // async sendResponse
  }
});
