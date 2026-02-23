const API_BASE = "http://127.0.0.1:8000/api";

async function fetchApi(path, options = {}) {
  const { timeout = 30000, ...fetchOpts } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json", ...fetchOpts.headers },
      signal: controller.signal,
      ...fetchOpts,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `API error ${res.status}`);
    }
    return res.json();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") {
      throw new Error("Požadavek vypršel (timeout). Zkus to znovu.");
    }
    throw e;
  }
}

// ─── Tickets ──────────────────────────────────────────
export async function getTickets(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
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

// ─── OCR ──────────────────────────────────────────────
export async function ocrParseBase64(imageBase64, bookmaker = "tipsport") {
  return fetchApi("/ocr/parse-base64", {
    method: "POST",
    body: JSON.stringify({ image: imageBase64, bookmaker }),
    timeout: 600000, // 10 minut – pro slabší HW / velké obrázky
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
    timeout: 180000, // 3 minuty – LLM analýza
  });
}

export async function getAiAnalyses(limit = 20) {
  return fetchApi(`/ai/analyses?limit=${limit}`);
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
