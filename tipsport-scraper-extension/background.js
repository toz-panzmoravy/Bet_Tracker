const API_BASE = "http://127.0.0.1:8000/api";
const LIVE_CHECK_PERIOD_MINUTES = 3;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("bettracker-live-check", { periodInMinutes: LIVE_CHECK_PERIOD_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "bettracker-live-check") return;
  chrome.tabs.query({ url: "*://*.tipsport.cz/*" }, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { type: "bettracker-live-tick" }).catch(() => {});
      }
    });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "bettracker-import-tickets") {
    const source = message.source || "tipsport";
    const payload = { tickets: message.tickets || [] };
    const usePreview = message.preview !== false;

    const endpoint =
      source === "betano"
        ? `${API_BASE}/import/betano/scrape${usePreview ? "/preview" : ""}`
        : `${API_BASE}/import/tipsport/scrape${usePreview ? "/preview" : ""}`;

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

    return true;
  }

  if (message && message.type === "bettracker-live-link") {
    const payload = {
      tipsport_key: message.tipsportKey || "",
      live_match_url: message.liveMatchUrl || ""
    };
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/live/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const t = await res.text();
          console.warn("BetTracker live/link failed:", res.status, t);
        }
      } catch (e) {
        console.warn("BetTracker live/link error:", e);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message && message.type === "bettracker-live-state") {
    const endpoint = `${API_BASE}/live/state`;
    const payload = {
      tipsport_match_id: message.tipsportMatchId || null,
      live_match_url: message.liveMatchUrl || null,
      scraped: message.scraped || null
    };

    (async () => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const text = await res.text();
          sendResponse({ ok: false, error: `API ${res.status}: ${text}` });
          return;
        }
        const data = await res.json();
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: e.message || String(e) });
      }
    })();
    return true;
  }
});

