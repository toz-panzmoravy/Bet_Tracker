const DEFAULT_API_URL = "http://127.0.0.1:8000/api";
const DEFAULT_REFRESH_SEC = 60;
const DEFAULT_UPCOMING_HOURS = 24;

let refreshTimer = null;

function getConfig() {
  try {
    const raw = localStorage.getItem("bettracker-overlay-config");
    if (raw) {
      const c = JSON.parse(raw);
      return {
        apiUrl: c.apiUrl || DEFAULT_API_URL,
        refreshIntervalSec: c.refreshIntervalSec ?? DEFAULT_REFRESH_SEC,
        upcomingHours: c.upcomingHours ?? DEFAULT_UPCOMING_HOURS,
      };
    }
  } catch (_) {}
  return {
    apiUrl: DEFAULT_API_URL,
    refreshIntervalSec: DEFAULT_REFRESH_SEC,
    upcomingHours: DEFAULT_UPCOMING_HOURS,
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

function getTicketUrl() {
  const base = getConfig().apiUrl.replace(/\/api\/?$/, "").replace(":8000", ":3000");
  return `${base || "http://127.0.0.1:3000"}/tikety`;
}

function renderTicketItem(ticket, listId) {
  const li = document.createElement("li");
  li.className = "ticket-item" + (ticket.is_live ? " live" : "");
  li.dataset.ticketId = ticket.id;

  const match = `${ticket.home_team || "—"} – ${ticket.away_team || "—"}`;
  const meta = ticket.event_date ? formatEventDate(ticket.event_date) : "—";
  const bet = [ticket.market_label, ticket.selection].filter(Boolean).join(": ") || "—";
  const sourceName = (ticket.bookmaker && ticket.bookmaker.name) ? ticket.bookmaker.name : (ticket.source || "");

  li.innerHTML = `
    ${sourceName ? `<div class="ticket-row-header"><span class="ticket-source">${escapeHtml(sourceName)}</span></div>` : ""}
    <div class="ticket-match">${escapeHtml(match)}</div>
    <div class="ticket-meta">${escapeHtml(meta)}</div>
    <div class="ticket-bet">${escapeHtml(bet)}</div>
    ${ticket.last_live_snapshot && (ticket.last_live_snapshot.scraped_text || ticket.last_live_snapshot.message) ? `<div class="ticket-snapshot">${escapeHtml((ticket.last_live_snapshot.scraped_text || ticket.last_live_snapshot.message || "").slice(0, 80))}</div>` : ""}
  `;

  li.addEventListener("click", async () => {
    const url = getTicketUrl();
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
    } catch (_) {
      window.open(url, "_blank");
    }
  });

  return li;
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

/**
 * Rozdělí tikety na:
 * - upcoming: vsazené zápasy, které ještě NEZAČALY (event_date v budoucnosti).
 * - live: zápasy právě probíhající (is_live).
 * - other: aktivní tikety bez data nebo s datem v minulosti (zobrazíme je, aby uživatel viděl že sync proběhl).
 */
function splitTickets(items, upcomingHours) {
  const now = new Date();
  const end = new Date(now.getTime() + upcomingHours * 60 * 60 * 1000);
  const upcoming = [];
  const live = [];
  const other = [];

  for (const t of items) {
    const status = (t.status || "").toLowerCase();
    const isSettled = ["won", "lost", "void", "half_win", "half_loss"].includes(status);
    if (isSettled) continue;

    if (t.is_live) {
      live.push(t);
    } else {
      const d = t.event_date ? new Date(t.event_date) : null;
      const notStarted = d && d >= now;
      const inWindow = d && d <= end;
      if (notStarted && inWindow) {
        upcoming.push(t);
      } else {
        other.push(t);
      }
    }
  }

  upcoming.sort((a, b) => new Date(a.event_date || 0) - new Date(b.event_date || 0));
  other.sort((a, b) => new Date(a.event_date || 0) - new Date(b.event_date || 0));
  return { upcoming, live, other };
}

async function fetchTickets() {
  const config = getConfig();
  const url = `${config.apiUrl.replace(/\/$/, "")}/tickets?active_or_live=1&limit=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.items || [];
}

function render(tickets) {
  const config = getConfig();
  const { upcoming, live, other } = splitTickets(tickets, config.upcomingHours);

  const listUpcoming = document.getElementById("listUpcoming");
  const listLive = document.getElementById("listLive");
  const listOther = document.getElementById("listOther");
  listUpcoming.innerHTML = "";
  listLive.innerHTML = "";
  if (listOther) listOther.innerHTML = "";

  upcoming.forEach((t) => listUpcoming.appendChild(renderTicketItem(t, "upcoming")));
  live.forEach((t) => listLive.appendChild(renderTicketItem(t, "live")));
  if (listOther) other.forEach((t) => listOther.appendChild(renderTicketItem(t, "other")));

  document.getElementById("loading").hidden = true;
  document.getElementById("sectionUpcoming").hidden = upcoming.length === 0;
  document.getElementById("sectionLive").hidden = live.length === 0;
  const sectionOther = document.getElementById("sectionOther");
  if (sectionOther) sectionOther.hidden = other.length === 0;
  const total = upcoming.length + live.length + other.length;
  const hint = document.getElementById("dataHint");
  if (hint) {
    hint.hidden = total > 0;
    if (total === 0) {
      hint.innerHTML = "Žádné aktivní tikety. Zkontrolujte: 1) Backend běží a v nastavení je správná URL API. 2) Na stránce sázkové kanceláře (Tipsport/Betano/Fortuna) jste klikli na tlačítko <strong>LIVE</strong>.";
    } else {
      hint.textContent = "Data: Tipsport, Betano, Fortuna — v prohlížeči klikněte na tlačítko LIVE v extension.";
    }
  }
}

async function load() {
  const loading = document.getElementById("loading");
  loading.hidden = false;
  hideError();
  try {
    const tickets = await fetchTickets();
    render(tickets);
  } catch (e) {
    showError(e.message || "Chyba načtení");
    document.getElementById("loading").textContent = "Chyba – zkontrolujte backend";
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
}

const settingsModalEl = () => document.getElementById("settingsModal");
const settingsModalContentEl = () => document.getElementById("settingsModalContent");

function closeSettingsModal() {
  settingsModalEl().hidden = true;
}

/** V Tauri/WebView2 někdy kliky na modal nedorazí – zachytíme pointerdown v capture fázi. */
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
    if (id === "btnSaveSettings") {
      doSave(e);
    }
  }, true);
}

document.getElementById("btnRefresh").addEventListener("click", () => load());
document.getElementById("btnSettings").addEventListener("click", () => {
  initSettings();
  document.getElementById("settingsModal").hidden = false;
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("settingsModal").hidden) {
    closeSettingsModal();
    try {
      import("@tauri-apps/api/core").then(({ invoke }) => invoke("close_settings_modal"));
    } catch (_) {}
  }
});

// Zavření nastavení z Rustu (událost close-settings)
import("@tauri-apps/api/event").then(({ listen }) => listen("close-settings", () => closeSettingsModal())).catch(() => {});

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
      saveConfig({ apiUrl, refreshIntervalSec, upcomingHours });
      closeSettingsModal();
      startPolling();
      load();
    } catch (err) {
      closeSettingsModal();
    }
  }
}

initModalPointerCapture();

// Klasické handlery jako záloha
const backdrop = document.getElementById("settingsModalBackdrop");
backdrop.addEventListener("mousedown", (e) => { e.preventDefault(); closeSettingsModal(); }, true);
backdrop.addEventListener("click", (e) => { e.preventDefault(); closeSettingsModal(); }, true);

const btnX = document.getElementById("btnModalCloseX");
btnX.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); closeSettingsModal(); }, true);
btnX.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); closeSettingsModal(); }, true);
btnX.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); closeSettingsModal(); }, true);
btnX.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeSettingsModal(); } }, true);

function delegateModalButtons(e) {
  const id = e.target && e.target.id;
  if (id === "btnCloseSettings") handleModalAction(e, "close");
  if (id === "btnSaveSettings") handleModalAction(e, "save");
}
document.getElementById("settingsModalContent").addEventListener("pointerdown", delegateModalButtons, true);
document.getElementById("settingsModalContent").addEventListener("mousedown", delegateModalButtons, true);
document.getElementById("settingsModalContent").addEventListener("click", delegateModalButtons, true);

document.getElementById("alwaysOnTop").addEventListener("change", async (e) => {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_always_on_top", { value: e.target.checked });
  } catch (_) {
    // Not in Tauri or command failed
  }
});

// V Tauri: zobrazit okno až po načtení stránky (řeší prázdné okno po instalaci)
async function showWindowIfTauri() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const w = getCurrentWindow();
    await w.show();
    await w.setFocus();
    await w.center();
  } catch (_) {
    // Ne v Tauri (dev v prohlížeči)
  }
}

load();
startPolling();
showWindowIfTauri();
