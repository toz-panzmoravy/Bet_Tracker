const getApiBase = () => {
  const envUrl =
    typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL
      : null;

  if (envUrl) {
    return envUrl.endsWith("/api") ? envUrl : `${envUrl}/api`;
  }

  // Výchozí chování: volat backend na stejném hostu, port 8000
  // (funguje jak pro localhost, tak pro přístup z jiné mašiny v síti)
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    const host = window.location.hostname || "127.0.0.1";
    const base = `${protocol}://${host}:8000`;
    return base.endsWith("/api") ? base : `${base}/api`;
  }

  const fallback = "http://127.0.0.1:8000";
  return fallback.endsWith("/api") ? fallback : `${fallback}/api`;
};

async function fetchApi(path, options = {}) {
  const { timeout = 30000, signal: userSignal, ...fetchOpts } = options;
  const API_BASE = getApiBase();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener("abort", () => controller.abort());
  }

  try {
    // #region agent log
    fetch("http://127.0.0.1:7552/ingest/cb53d3b0-eda4-4d84-994f-77dc1a876629", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "890d0a",
      },
      body: JSON.stringify({
        sessionId: "890d0a",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "frontend/app/lib/api.js:36",
        message: "fetchApi request",
        data: { path, API_BASE, timeout },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...fetchOpts.headers },
      signal: controller.signal,
      ...fetchOpts,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      let message = `API error ${res.status}`;
      if (err.detail != null) {
        if (Array.isArray(err.detail)) {
          message = err.detail.map((d) => d.msg ?? String(d)).join("; ");
        } else {
          message = typeof err.detail === "string" ? err.detail : String(err.detail);
        }
      }
      throw new Error(message);
    }
    return res.json();
  } catch (e) {
    // #region agent log
    fetch("http://127.0.0.1:7552/ingest/cb53d3b0-eda4-4d84-994f-77dc1a876629", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "890d0a",
      },
      body: JSON.stringify({
        sessionId: "890d0a",
        runId: "pre-fix",
        hypothesisId: "H2",
        location: "frontend/app/lib/api.js:56",
        message: "fetchApi error",
        data: { path, API_BASE, errorName: e?.name, errorMessage: e?.message },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion agent log

    clearTimeout(timeoutId);
    throw e;
  }
}

// ─── Tickets ──────────────────────────────────────────
const DEFAULT_TICKETS_LIMIT = 50;

export async function getTickets(params = {}) {
  const qs = new URLSearchParams();
  const { limit = DEFAULT_TICKETS_LIMIT, offset = 0, ...rest } = params;
  qs.set("limit", limit);
  qs.set("offset", offset);
  Object.entries(rest).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });
  return fetchApi(`/tickets?${qs}`);
}

export async function getTicket(id) {
  return fetchApi(`/tickets/${id}`);
}

export async function createTicket(data) {
  return fetchApi("/tickets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateTicket(id, data) {
  return fetchApi(`/tickets/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteTicket(id) {
  return fetchApi(`/tickets/${id}`, { method: "DELETE" });
}

/** Načte náhled importu (tikety z extension) pro preview_id. */
export async function getImportPreview(previewId) {
  return fetchApi(`/import/preview/${encodeURIComponent(previewId)}`);
}

/** Stáhne CSV export tiketů s danými filtry (bez limit/offset). */
export async function exportTicketsCsv(params = {}) {
  const qs = new URLSearchParams();
  const { limit, offset, ...rest } = params;
  Object.entries(rest).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });
  const base = getApiBase();
  const res = await fetch(`${base}/tickets/export?${qs}`, { method: "GET" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = Array.isArray(err.detail)
      ? err.detail.map((d) => d.msg ?? String(d)).join("; ")
      : err.detail || `API error ${res.status}`;
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tikety_export.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Market Types ───────────────────────────────────
export async function getMarketTypes() {
  return fetchApi("/market-types");
}

export async function getMarketTypeStats() {
  return fetchApi("/market-types/stats");
}

export async function getTopMarketTypes(limit = 5, sportId = null) {
  const qs = new URLSearchParams({ limit });
  if (sportId) qs.set("sport_id", sportId);
  return fetchApi(`/market-types/top?${qs}`);
}

export async function createMarketType(data) {
  return fetchApi("/market-types", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/** Najde nebo vytvoří typ sázky (normalizace názvu, méně duplicit). */
export async function findOrCreateMarketType(data) {
  return fetchApi("/market-types/find-or-create", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateMarketType(id, data) {
  return fetchApi(`/market-types/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteMarketType(id) {
  return fetchApi(`/market-types/${id}`, { method: "DELETE" });
}

// ─── Stats ────────────────────────────────────────────
export async function getStatsOverview(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });
  return fetchApi(`/stats/overview?${qs}`);
}

export async function getTimeseries(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, v);
  });
  return fetchApi(`/stats/timeseries?${qs}`);
}

// ─── Analytics ───────────────────────────────────────────
export async function getAnalyticsSummary(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  });
  return fetchApi(`/analytics/summary?${qs}`);
}

// ─── OCR ──────────────────────────────────────────────
export async function ocrParseBase64(imageBase64, bookmaker = "tipsport", signal) {
  return fetchApi("/ocr/parse-base64", {
    method: "POST",
    body: JSON.stringify({ image: imageBase64, bookmaker }),
    timeout: 600000, // 10 minut – pro slabší HW / velké obrázky
    signal,
  });
}

export async function checkOcrHealth(unload = false) {
  const qs = unload ? "?unload=true" : "";
  return fetchApi(`/ocr/health${qs}`, { timeout: 15000 });
}

// ─── AI ───────────────────────────────────────────────
export async function aiAnalyze(filters = {}, question = "") {
  return fetchApi("/ai/analyze", {
    method: "POST",
    body: JSON.stringify({ filters, question }),
    timeout: 600000, // 10 minut – pomalé lokální LLM (Dashboard)
  });
}

export async function getAiAnalyses(limit = 20) {
  return fetchApi(`/ai/analyses?limit=${limit}`);
}

// ─── AI Strategy (asynchronní job) ────────────────────

export async function startStrategyAnalysis() {
  // rychlý request, jen založí job
  return fetchApi("/ai/strategy-analysis/start", {
    method: "POST",
    timeout: 15000,
  });
}

export async function getStrategyAnalysis(id) {
  return fetchApi(`/ai/strategy-analysis/${id}`, {
    method: "GET",
    timeout: 30000,
  });
}

// ─── Meta ─────────────────────────────────────────────
export async function getSports() {
  return fetchApi("/meta/sports");
}

export async function getLeagues(sportId) {
  const qs = sportId ? `?sport_id=${sportId}` : "";
  return fetchApi(`/meta/leagues${qs}`);
}

export async function getBookmakers() {
  return fetchApi("/meta/bookmakers");
}

// ─── App Settings / Bankroll ─────────────────────────
export async function getAppSettings() {
  return fetchApi("/settings/app");
}

export async function updateAppSettings(data) {
  return fetchApi("/settings/app", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
