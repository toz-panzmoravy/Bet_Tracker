const API_BASE = "http://127.0.0.1:8000/api";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "bettracker-import-tickets") {
    const source = message.source || "tipsport";
    const payload = { tickets: message.tickets || [] };

    const endpoint =
      source === "betano"
        ? `${API_BASE}/import/betano/scrape`
        : `${API_BASE}/import/tipsport/scrape`;

    (async () => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const text = await res.text();
          sendResponse({
            ok: false,
            error: `API error ${res.status}: ${text}`
          });
          return;
        }

        const data = await res.json();
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();

    // Asynchronous response
    return true;
  }
});

