const DEFAULT_API_URL = "http://127.0.0.1:15555/api";
const DEFAULT_REFRESH_SEC = 30;
const DEFAULT_UPCOMING_HOURS = 24;
const BOOKMAKER_NAMES = ["Tipsport", "Betano", "Fortuna"];

let refreshTimer = null;

function getConfig() {
  try {
    const raw = localStorage.getItem("bettracker-overlay-config");
    if (raw) {
      const c = JSON.parse(raw);
      const filters = Array.isArray(c.filterBookmakers) ? c.filterBookmakers : BOOKMAKER_NAMES.slice();
      return {
        apiUrl: c.apiUrl || DEFAULT_API_URL,
        refreshIntervalSec: c.refreshIntervalSec ?? DEFAULT_REFRESH_SEC,
        upcomingHours: c.upcomingHours ?? DEFAULT_UPCOMING_HOURS,
        filterBookmakers: c.filterBookmakers != null ? filters : BOOKMAKER_NAMES.slice(),
        alwaysOnTop: c.alwaysOnTop === true,
        windowOpacity: Math.max(40, Math.min(100, Number(c.windowOpacity) || 100)),
      };
    }
  } catch (_) { }
  return {
    apiUrl: DEFAULT_API_URL,
    refreshIntervalSec: DEFAULT_REFRESH_SEC,
    upcomingHours: DEFAULT_UPCOMING_HOURS,
    filterBookmakers: BOOKMAKER_NAMES.slice(),
    alwaysOnTop: false,
    windowOpacity: 100,
  };
}

function saveConfig(config) {
  localStorage.setItem("bettracker-overlay-config", JSON.stringify(config));
}

function showError(msg) {
  const el = document.getElementById("error");
  el.textContent = msg;
  el.hidden = false;
}

function hideError() {
  document.getElementById("error").hidden = true;
}

function formatEventDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((dDate - today) / (24 * 60 * 60 * 1000));
  let dayLabel = d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
  if (diffDays === 0) dayLabel = "Dnes";
  else if (diffDays === 1) dayLabel = "Zítra";
  const time = d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  return `${dayLabel} ${time}`;
}

function getBetTrackerUrl() {
  const base = getConfig().apiUrl.replace(/\/api\/?$/, "").replace(/:15555/, ":3001");
  return `${base || "http://127.0.0.1:3001"}/tikety`;
}

/** Odkaz na tiket: přednostně URL u sázkové kanceláře, jinak BetTracker. */
function getTicketClickUrl(ticket) {
  const url = (ticket && ticket.bookmaker_ticket_url) || "";
  if (url && typeof url === "string" && url.trim().length > 0 && (url.startsWith("http://") || url.startsWith("https://"))) {
    return url.trim();
  }
  return getBetTrackerUrl();
}

function renderTicketItem(ticket, listId) {
  const sourceName = (ticket.bookmaker && ticket.bookmaker.name) ? ticket.bookmaker.name : (ticket.source || "");
  const sourceClass = sourceName ? String(sourceName).toLowerCase().replace(/\s+/g, "") : "";
  const li = document.createElement("li");
  li.className = "ticket-item" + (sourceClass ? " " + sourceClass : "") + (ticket.is_live ? " live" : "");
  li.dataset.ticketId = ticket.id;

  const match = `${ticket.home_team || "—"} – ${ticket.away_team || "—"}`;
  const meta = ticket.event_date ? formatEventDate(ticket.event_date) : "—";
  const marketLabel = (ticket.market_label || "").trim();
  const selection = (ticket.selection || "").trim();
  let betBlock = "";
  if (marketLabel && selection) {
    betBlock = `<div class="ticket-bet-block"><span class="ticket-bet-label">${escapeHtml(marketLabel)}</span><span class="ticket-bet-sep"> · </span><span class="ticket-bet-selection">${escapeHtml(selection)}</span></div>`;
  } else if (marketLabel) {
    betBlock = `<div class="ticket-bet-block"><span class="ticket-bet-label">${escapeHtml(marketLabel)}</span></div>`;
  } else if (selection) {
    betBlock = `<div class="ticket-bet-block"><span class="ticket-bet-selection">${escapeHtml(selection)}</span></div>`;
  }

  const odds = ticket.odds != null ? Number(ticket.odds) : null;
  const stake = ticket.stake != null ? Number(ticket.stake) : null;
  const leftMeta = [
    odds != null ? `<span class="ticket-odds">${Number(odds).toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</span>` : "",
    stake != null ? `<span>${Number(stake).toLocaleString("cs-CZ")} Kč</span>` : "",
  ].filter(Boolean).join("");
  const metaRow = `<div class="ticket-meta-row"><span class="ticket-meta-left">${leftMeta}</span><span class="ticket-meta-time">${escapeHtml(meta)}</span></div>`;

  li.innerHTML = `
    <div class="ticket-match">${escapeHtml(match)}</div>
    <div class="ticket-divider"></div>
    ${betBlock}
    ${metaRow}
  `;

  li.addEventListener("click", (e) => {
    const url = getTicketClickUrl(ticket);
    (async () => {
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
      } catch (_) {
        window.open(url, "_blank");
      }
    })();
  });

  return li;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}



function filterOutFinishedMatches(items) {
  // Nevyhodnocené (open) tikety z API chceme vidět vždy.
  // Jelikož overlay načítá jen active_or_live=1, všechny tikety v items jsou nevyhodnocené/open.
  // Takže je nebudeme ručně schovávat, protože chceme vidět i opožděné/nevyhodnocené zápasy.
  return items;
}

/**
 * Rozdělí tikety na upcoming / live / other.
 * - Čas zápasu (event_date) se porovnává s aktuálním časem: když nastane čas začátku, tiket jde do „Právě hraje“.
 * - Tiket se skryje když od začátku zápasu (event_date) uběhlo víc než LIVE_MAX_MINUTES (3 h).
 * - upcoming: zápas ještě nezačal (event_date > now), v časovém okně
 * - live: is_live NEBO (event_date <= now a od začátku uběhlo max 3 h)
 * - other: všechny zbývající aktivní (AKU, Solo bez data, nebo zápas mimo okno) – aby se neztracely např. Betano tikety
 */
/** Vyhodnotí, zda je tiket označen jako live (API může vrátit boolean, string nebo číslo). */
function isTicketLive(t) {
  if (t == null) return false;
  const v = t.is_live;
  return v === true || v === "true" || v === 1 || v === "1";
}

function splitTickets(items, upcomingHours) {
  const now = new Date();
  const end = new Date(now.getTime() + upcomingHours * 60 * 60 * 1000);
  const cutoffLimit = new Date(now.getTime() - 2.5 * 60 * 60 * 1000); // Schovat starší jak 2.5h

  const upcomingAndOther = [];
  const live = [];

  for (const t of items) {
    if (!t || typeof t !== "object") continue;
    const status = (t.status || "").toLowerCase();
    const isSettled = ["won", "lost", "void", "half_win", "half_loss"].includes(status);
    if (isSettled) continue;

    const d = t.event_date ? new Date(t.event_date) : null;
    const validDate = d && !Number.isNaN(d.getTime());
    const markedLive = isTicketLive(t);

    if (!validDate) {
      if (markedLive) live.push(t);
      else upcomingAndOther.push(t);
      continue;
    }

    // Pokud zápas začal před více jak 2.5 hodinami, skryje se (bez výjimek)
    if (d < cutoffLimit) {
      continue;
    }

    // Právě hraje: Zápas začal v posledních 2.5 hodinách (nebo je sázkovkou posunut na Live dřív)
    if (markedLive || (d <= now && d >= cutoffLimit)) {
      live.push(t);
    } else {
      // Zápas nezačal (nebo začne v budoucnu)
      upcomingAndOther.push(t);
    }
  }

  upcomingAndOther.sort((a, b) => new Date(a.event_date || 0) - new Date(b.event_date || 0));
  live.sort((a, b) => new Date(a.event_date || 0) - new Date(b.event_date || 0));

  return { upcoming: upcomingAndOther, live, other: [] };
}

function applyBookmakerFilter(tickets, filterNames) {
  if (!Array.isArray(filterNames)) return tickets;
  if (filterNames.length === 0) return []; // Pokud nenapsal žádné, ukázat žádné
  const set = new Set(filterNames.map((n) => (n || "").toLowerCase()));
  return tickets.filter((t) => {
    const name = (t.bookmaker && t.bookmaker.name) || t.source || "";
    const nameLower = (name || "").toLowerCase();
    if (!nameLower || nameLower === "manual") return true;
    return set.has(nameLower);
  });
}

function setRefreshMessage(text) {
  const el = document.getElementById("loadingMessage");
  if (el) el.textContent = text;
}

function showRefreshLoading(message) {
  const loading = document.getElementById("loading");
  if (!loading) return;
  loading.hidden = false;
  loading.classList.add("loading-visible");
  loading.classList.remove("loading-done");
  setRefreshMessage(message || "Aktualizuji…");
}

function hideRefreshLoading() {
  const loading = document.getElementById("loading");
  if (!loading) return;
  loading.hidden = true;
  loading.classList.remove("loading-visible", "loading-done");
}

function getApiBase() {
  return (getConfig().apiUrl || DEFAULT_API_URL).replace(/\/+$/, "");
}

/**
 * Normalizuje is_live z API (může přijít jako boolean, string, číslo), aby split Právě hraje / Zápas nezačal fungoval.
 */
function normalizeTicketsFromApi(items) {
  if (!Array.isArray(items)) return [];
  return items.map((t) => {
    if (!t || typeof t !== "object") return t;
    const isLive = t.is_live === true || t.is_live === "true" || t.is_live === 1 || t.is_live === "1";
    return { ...t, is_live: isLive };
  });
}

/**
 * Načte z API jen nevyhodnocené tikety (active_or_live=1 => status=open).
 * Po aktualizaci stavů na Tipsportu (Import ze všech záložek) a po Refresh zde
 * vyhodnocené tikety (výhra/prohra/vráceno) v seznamu nejsou – zmizí z overlay.
 */
async function fetchTickets() {
  const config = getConfig();
  const base = (config.apiUrl || DEFAULT_API_URL).replace(/\/+$/, "");
  const res = await fetch(`${base}/tickets?active_or_live=1&limit=500`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : []);
  return normalizeTicketsFromApi(raw);
}

/** Vyhodnocené tikety (won/lost/void/…) v overlay nezobrazovat – zmizí hned po vyhodnocení. */
function onlyUnresolved(tickets) {
  const settled = ["won", "lost", "void", "half_win", "half_loss"];
  return (tickets || []).filter((t) => {
    if (!t || typeof t !== "object") return false;
    const s = (t.status || "").toLowerCase();
    return !settled.includes(s);
  });
}

function render(tickets) {
  const config = getConfig();
  const unresolved = onlyUnresolved(tickets);
  const filtered = applyBookmakerFilter(unresolved, config.filterBookmakers);
  const withoutFinished = filterOutFinishedMatches(filtered);
  const { upcoming, live, other } = splitTickets(withoutFinished, config.upcomingHours);

  const listUpcoming = document.getElementById("listUpcoming");
  const listLive = document.getElementById("listLive");
  listUpcoming.innerHTML = "";
  listLive.innerHTML = "";

  upcoming.forEach((t) => listUpcoming.appendChild(renderTicketItem(t, "upcoming")));
  live.forEach((t) => listLive.appendChild(renderTicketItem(t, "live")));

  const sectionLive = document.getElementById("sectionLive");
  const sectionUpcoming = document.getElementById("sectionUpcoming");
  const titleLive = sectionLive?.querySelector(".section-title");
  const titleUpcoming = sectionUpcoming?.querySelector(".section-title");
  if (titleLive) titleLive.textContent = "Právě hraje (" + live.length + ")";
  if (titleUpcoming) titleUpcoming.textContent = "Vsazené – zápas nezačal (" + upcoming.length + ")";

  sectionUpcoming.hidden = upcoming.length === 0;
  sectionLive.hidden = live.length === 0;
  const total = upcoming.length + live.length;
  const fromApiLiveCount = (withoutFinished || []).filter((t) => t.is_live === true || t.is_live === "true" || t.is_live === 1).length;
  const hint = document.getElementById("dataHint");
  if (hint) {
    hint.hidden = total > 0;
    if (total === 0) {
      hint.innerHTML = "Žádné aktivní tikety. Zkontrolujte: 1) Backend běží (URL v nastavení). 2) Na stránce sázkové kanceláře jste klikli na <strong>LIVE</strong>. 3) Filtr sázkové kanceláře výše.";
    } else {
      hint.innerHTML = "Kliknutím na tiket otevřete ho u sázkové kanceláře nebo v BetTrackeru.";
    }
  }
  const lastRefreshEl = document.getElementById("lastRefresh");
  if (lastRefreshEl) {
    lastRefreshEl.hidden = false;
    const timeStr = new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    lastRefreshEl.innerHTML = "Obnoveno " + timeStr + " <span style='opacity:0.7;font-size:0.85em'>| Z API is_live: " + fromApiLiveCount + "/" + (withoutFinished?.length || 0) + "</span>";
  }
}

async function load() {
  showRefreshLoading("Aktualizuji…");
  hideError();
  try {
    const tickets = await fetchTickets();
    render(tickets);

    const loading = document.getElementById("loading");
    if (loading && !loading.hidden) {
      loading.classList.add("loading-done");
      setRefreshMessage("Hotovo");
      await new Promise((r) => setTimeout(r, 1500));
    }
    const lastRefreshEl = document.getElementById("lastRefresh");
    if (lastRefreshEl) {
      lastRefreshEl.hidden = false;
      lastRefreshEl.textContent = "Obnoveno " + new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    hideRefreshLoading();
  } catch (e) {
    const msg = e.message || "Chyba načtení";
    const isNetwork = /failed to fetch|networkerror|load failed|connection refused|fetch/i.test(msg);
    showError(isNetwork
      ? "Backend není dostupný. Spusťte backend na http://127.0.0.1:15555 (např. Restart-a-spust-vse.bat)."
      : msg);
    hideRefreshLoading();
  }
}

function startPolling() {
  if (refreshTimer) clearInterval(refreshTimer);
  const config = getConfig();
  refreshTimer = setInterval(load, config.refreshIntervalSec * 1000);
}

function initSettings() {
  const config = getConfig();
  document.getElementById("apiUrl").value = config.apiUrl;
  document.getElementById("refreshInterval").value = config.refreshIntervalSec;
  document.getElementById("upcomingHours").value = config.upcomingHours;
  const opacity = config.windowOpacity ?? 100;
  const slider = document.getElementById("opacitySlider");
  const valueEl = document.getElementById("opacityValue");
  if (slider) slider.value = opacity;
  if (valueEl) valueEl.textContent = opacity;
  const names = config.filterBookmakers || BOOKMAKER_NAMES.slice();
  document.getElementById("filterTipsport").checked = names.map((n) => n.toLowerCase()).includes("tipsport");
  document.getElementById("filterBetano").checked = names.map((n) => n.toLowerCase()).includes("betano");
  document.getElementById("filterFortuna").checked = names.map((n) => n.toLowerCase()).includes("fortuna");
}

function applyOpacity(value) {
  const v = Math.max(40, Math.min(100, Number(value) || 100));
  document.body.style.opacity = String(v / 100);
  const el = document.getElementById("opacityValue");
  if (el) el.textContent = v;
}

function applyPinState(active) {
  const btn = document.getElementById("alwaysOnTop");
  if (!btn) return;
  if (active) btn.classList.add("is-active"); else btn.classList.remove("is-active");
}

function saveFilterFromChips() {
  const config = getConfig();
  config.filterBookmakers = [];
  if (document.getElementById("filterTipsport").checked) config.filterBookmakers.push("Tipsport");
  if (document.getElementById("filterBetano").checked) config.filterBookmakers.push("Betano");
  if (document.getElementById("filterFortuna").checked) config.filterBookmakers.push("Fortuna");
  saveConfig(config);
}

const settingsModalEl = () => document.getElementById("settingsModal");
const settingsModalContentEl = () => document.getElementById("settingsModalContent");

function closeSettingsModal() {
  settingsModalEl().hidden = true;
}

function initModalPointerCapture() {
  const modal = settingsModalEl();
  const doClose = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeSettingsModal();
  };
  const doSave = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    handleModalAction(e, "save");
  };
  modal.addEventListener("pointerdown", (e) => {
    if (modal.hidden) return;
    const t = e.target;
    const id = t && t.id;
    if (id === "settingsModalBackdrop" || id === "btnModalCloseX" || id === "btnCloseSettings") {
      doClose(e);
      return;
    }
    if (id === "btnSaveSettings") doSave(e);
  }, true);
}

document.getElementById("btnRefresh").addEventListener("click", () => load());

document.getElementById("btnSettings").addEventListener("click", () => {
  initSettings();
  document.getElementById("settingsModal").hidden = false;
});

["filterTipsport", "filterBetano", "filterFortuna"].forEach((id) => {
  document.getElementById(id).addEventListener("change", () => {
    saveFilterFromChips();
    const tickets = []; // re-render from cached? We don't cache; refetch.
    fetchTickets().then((t) => render(t)).catch(() => { });
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("settingsModal").hidden) {
    closeSettingsModal();
    try {
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("close_settings_modal"));
    } catch (_) { }
  }
});

import("@tauri-apps/api/event").then(({ listen }) => listen("close-settings", () => closeSettingsModal())).catch(() => { });

function handleModalAction(e, action) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  if (action === "close") {
    closeSettingsModal();
    return;
  }
  if (action === "save") {
    try {
      const apiUrl = document.getElementById("apiUrl").value.trim() || DEFAULT_API_URL;
      const refreshIntervalSec = Math.max(30, Math.min(300, parseInt(document.getElementById("refreshInterval").value, 10) || 60));
      const upcomingHours = Math.max(1, Math.min(168, parseInt(document.getElementById("upcomingHours").value, 10) || 24));
      const windowOpacity = Math.max(40, Math.min(100, parseInt(document.getElementById("opacitySlider").value, 10) || 100));
      saveConfig({ ...getConfig(), apiUrl, refreshIntervalSec, upcomingHours, windowOpacity });
      applyOpacity(windowOpacity);
      closeSettingsModal();
      startPolling();
      load();
    } catch (err) {
      closeSettingsModal();
    }
  }
}

initModalPointerCapture();

const backdrop = document.getElementById("settingsModalBackdrop");
backdrop.addEventListener("mousedown", (e) => { e.preventDefault(); closeSettingsModal(); }, true);
backdrop.addEventListener("click", (e) => { e.preventDefault(); closeSettingsModal(); }, true);

const btnX = document.getElementById("btnModalCloseX");
if (btnX) {
  btnX.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); closeSettingsModal(); }, true);
  btnX.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); closeSettingsModal(); }, true);
  btnX.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closeSettingsModal(); }, true);
  btnX.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeSettingsModal(); } }, true);
}

function delegateModalButtons(e) {
  const id = e.target && e.target.id;
  if (id === "btnCloseSettings") handleModalAction(e, "close");
  if (id === "btnSaveSettings") handleModalAction(e, "save");
}
document.getElementById("settingsModalContent").addEventListener("pointerdown", delegateModalButtons, true);
document.getElementById("settingsModalContent").addEventListener("mousedown", delegateModalButtons, true);
document.getElementById("settingsModalContent").addEventListener("click", delegateModalButtons, true);

document.getElementById("alwaysOnTop").addEventListener("click", async () => {
  const config = getConfig();
  const next = !config.alwaysOnTop;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_always_on_top", { value: next });
    saveConfig({ ...config, alwaysOnTop: next });
    applyPinState(next);
  } catch (_) { }
});

document.getElementById("opacitySlider").addEventListener("input", (e) => {
  const v = parseInt(e.target.value, 10);
  applyOpacity(v);
  saveConfig({ ...getConfig(), windowOpacity: v });
});

document.getElementById("btnExpand").addEventListener("click", async () => {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_window_expanded", { expanded: true });
  } catch (_) { }
});

async function showWindowIfTauri() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    await w.show();
    await w.setFocus();
    await w.center();
  } catch (_) { }
}

(function applyFilterStateFromConfig() {
  const config = getConfig();
  const names = (config.filterBookmakers || BOOKMAKER_NAMES.slice()).map((n) => (n || "").toLowerCase());
  document.getElementById("filterTipsport").checked = names.includes("tipsport");
  document.getElementById("filterBetano").checked = names.includes("betano");
  document.getElementById("filterFortuna").checked = names.includes("fortuna");
})();

(function applyInitialState() {
  const config = getConfig();
  applyOpacity(config.windowOpacity);
  applyPinState(config.alwaysOnTop);
  try {
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_always_on_top", { value: config.alwaysOnTop }));
  } catch (_) { }
})();

load();
startPolling();
showWindowIfTauri();
