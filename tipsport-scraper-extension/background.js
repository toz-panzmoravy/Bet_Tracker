const API_BASE_DEFAULT = "http://127.0.0.1:15555/api";
const API_BASE_ALT = "http://localhost:15555/api";
const LIVE_CHECK_PERIOD_MINUTES = 3;

/** API je na portu 15555. Pokud je v nastavení frontend (3000/3001), pouzit vychozi backend. */
function normalizeApiBase(url) {
  if (!url || typeof url !== "string") return API_BASE_DEFAULT;
  const u = url.trim();
  if (!u) return API_BASE_DEFAULT;
  if (/:3000(\/|$)/.test(u) || /:3001(\/|$)/.test(u)) return API_BASE_DEFAULT;
  return u;
}

function getApiBase() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(["bettracker_api_url"], function (r) {
      const raw = (r.bettracker_api_url || "").trim() || API_BASE_DEFAULT;
      resolve(normalizeApiBase(raw));
    });
  });
}

/** Vrátí druhou URL (127.0.0.1 ↔ localhost) pro fallback. */
function alternateApiBase(base) {
  if (/127\.0\.0\.1/.test(base)) return base.replace(/127\.0\.0\.1/, "localhost");
  if (/localhost/.test(base)) return base.replace(/localhost/, "127.0.0.1");
  return null;
}

function isNetworkError(e) {
  const msg = (e && e.message) || String(e);
  return /failed to fetch|networkerror|load failed|err_connection_refused|fetch/i.test(msg);
}

function networkErrorHint(msg) {
  return /failed to fetch|networkerror|load failed|err_connection_refused/i.test(msg)
    ? "API nedostupné (Failed to fetch). Spusťte backend na portu 15555 (BetTracker.bat nebo run-backend.bat). V Nastavení rozšíření (pravý klik na ikonu → Možnosti) zadejte: http://127.0.0.1:15555/api nebo http://localhost:15555/api"
    : msg;
}

/** POST na endpoint; při síťové chybě zkusí druhou URL (localhost/127.0.0.1). */
async function fetchWithFallback(apiBase, path, body) {
  const url = apiBase.replace(/\/+$/, "") + path;
  const opts = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  try {
    const res = await fetch(url, opts);
    return { res, fromFallback: false };
  } catch (e) {
    const alt = alternateApiBase(apiBase);
    if (alt && isNetworkError(e)) {
      const altUrl = alt.replace(/\/+$/, "") + path;
      try {
        const res = await fetch(altUrl, opts);
        return { res, fromFallback: true };
      } catch (_) {}
    }
    throw e;
  }
}

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
    if (message.overlay_sync === true) payload.overlay_sync = true;
    const usePreview = message.preview !== false;

    (async () => {
      try {
        const API_BASE = await getApiBase();
        let path = "/import/tipsport/scrape";
        if (source === "betano") path = "/import/betano/scrape";
        else if (source === "fortuna") path = "/import/fortuna/scrape";
        path += usePreview ? "/preview" : "";

        const { res } = await fetchWithFallback(API_BASE, path, payload);

        if (!res.ok) {
          const text = await res.text();
          sendResponse({ ok: false, error: "API " + res.status + ": " + text });
          return;
        }

        const data = await res.json();
        sendResponse({ ok: true, data });
      } catch (e) {
        const msg = e.message || String(e);
        sendResponse({ ok: false, error: networkErrorHint(msg) });
      }
    })();

    return true;
  }

  if (message && message.type === "bettracker-create-preview") {
    (async () => {
      try {
        const API_BASE = await getApiBase();
        const { res } = await fetchWithFallback(API_BASE, "/import/preview", { tickets: message.tickets || [] });
        if (!res.ok) {
          const text = await res.text();
          sendResponse({ ok: false, error: "API " + res.status + ": " + text });
          return;
        }
        const data = await res.json();
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: networkErrorHint(e.message || String(e)) });
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
        const API_BASE = await getApiBase();
        const { res } = await fetchWithFallback(API_BASE, "/live/link", payload);
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
    const payload = {
      tipsport_match_id: message.tipsportMatchId || null,
      live_match_url: message.liveMatchUrl || null,
      scraped: message.scraped || null
    };

    (async () => {
      try {
        const API_BASE = await getApiBase();
        const { res } = await fetchWithFallback(API_BASE, "/live/state", payload);
        if (!res.ok) {
          const text = await res.text();
          sendResponse({ ok: false, error: "API " + res.status + ": " + text });
          return;
        }
        const data = await res.json();
        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({ ok: false, error: networkErrorHint(e.message || String(e)) });
      }
    })();
    return true;
  }
});

