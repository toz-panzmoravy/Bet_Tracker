"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, LabelList, ReferenceLine
} from "recharts";
import {
  getStatsOverview,
  getTimeseries,
  aiAnalyze,
  getAiAnalyses,
  getSports,
  getBookmakers,
  getAppSettings,
  getMarketTypes,
} from "./lib/api";
import { useToast } from "./components/Toast";
import { DashboardSkeleton } from "./components/Skeletons";
import Confetti from "./components/Confetti";

/* ─── Styled Tooltip ───────────────────────────────────── */

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
            <span style={{ color: "var(--text-secondary)" }}>{p.name}</span>
          </span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {formatter ? formatter(p.value, p.name) : (typeof p.value === 'number' ? Number(p.value).toLocaleString("cs-CZ") : p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Rich Bar Tooltip (shows all metrics) ─────────────── */

function RichBarTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="chart-tooltip chart-tooltip-rich">
      <p style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: 8, fontSize: "0.85rem" }}>{d.label}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "var(--text-muted)" }}>ROI</span>
        <span style={{ color: d.roi_percent >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 700 }}>{d.roi_percent}%</span>
        <span style={{ color: "var(--text-muted)" }}>Sázek</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{d.bets_count}</span>
        <span style={{ color: "var(--text-muted)" }}>Vklad</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{Number(d.stake_total || 0).toLocaleString("cs-CZ")} Kč</span>
        <span style={{ color: "var(--text-muted)" }}>Profit</span>
        <span style={{ color: Number(d.profit_total || 0) >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
          {Number(d.profit_total || 0) > 0 ? "+" : ""}{Number(d.profit_total || 0).toLocaleString("cs-CZ")} Kč
        </span>
      </div>
    </div>
  );
}

/* ─── Custom Bar Label ─────────────────────────────────── */

function BarLabel({ x, y, width, value }) {
  if (value === 0) return null;
  return (
    <text
      x={x + width / 2}
      y={value >= 0 ? y - 10 : y + 22}
      fill={value >= 0 ? "var(--success)" : "var(--danger)"}
      textAnchor="middle"
      fontSize={12}
      fontWeight={700}
    >
      {value > 0 ? "+" : ""}{value}%
    </text>
  );
}

/* ─── ROI Bar Chart (reusable) ─────────────────────────── */

function RoiBarChart({
  data,
  positiveColor = "var(--success)",
  negativeColor = "var(--danger)",
  colorMap = null,
  highlightBest = false,
  onBarClick,
  emptyHasFilters = false,
  emptyOnReset,
}) {
  if (!data?.length) {
    return (
      <EmptyState
        hasFilters={emptyHasFilters}
        onResetFilters={emptyOnReset}
      />
    );
  }

  // Najdeme nejlepší řádek podle ROI pro zvýraznění sloupcem
  const best =
    highlightBest && data.length > 0
      ? data.reduce((acc, item) => (acc == null || item.roi_percent > acc.roi_percent ? item : acc), null)
      : null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 24, right: 16, left: 8, bottom: 8 }} barCategoryGap={14}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.8} />
        <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--text-secondary)", fontSize: 12, fontWeight: 500 }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          interval={0}
        />
        <YAxis
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={36}
        />
        <Tooltip content={<RichBarTooltip />} cursor={{ fill: "var(--surface-subtle)", stroke: "var(--border)" }} />
        <Bar dataKey="roi_percent" name="ROI %" radius={[8, 8, 0, 0]} maxBarSize={52}>
          <LabelList content={<BarLabel />} />
          {data.map((entry, i) => {
            let fill = entry.roi_percent >= 0 ? positiveColor : negativeColor;
            if (colorMap && colorMap[entry.label]) {
              fill = colorMap[entry.label];
            }
            const isBest = best && entry.label === best.label;
            return (
              <Cell
                key={i}
                cursor={onBarClick ? "pointer" : "default"}
                fill={fill}
                fillOpacity={isBest ? 1 : 0.85}
                stroke={isBest ? "var(--border-hover)" : "none"}
                strokeWidth={isBest ? 1.5 : 0}
                onClick={onBarClick ? () => onBarClick(entry) : undefined}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Chart Card wrapper ───────────────────────────────── */

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="glass-card" style={{ padding: "1.25rem" }}>
      <div style={{ marginBottom: 16 }}>
        <h3 className="card-title">{title}</h3>
        {subtitle && <p className="section-subtitle" style={{ marginTop: 2, fontSize: "0.7rem" }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/* ─── Empty State ──────────────────────────────────────── */

function EmptyState({ hasFilters = false, onResetFilters }) {
  const hasReset = hasFilters && typeof onResetFilters === "function";
  return (
    <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-muted)" }}>
      <p style={{ fontSize: "2.5rem", marginBottom: 8, opacity: 0.4 }}>📊</p>
      <p style={{ fontSize: "0.85rem" }}>
        {hasFilters ? "Žádná data pro zvolený rozsah filtrů" : "Žádná data k zobrazení"}
      </p>
      <p style={{ fontSize: "0.7rem", marginTop: 4 }}>
        {hasFilters
          ? "Zkus rozšířit období nebo zrušit filtry."
          : "Přidej tikety přes Import."}
      </p>
      {hasReset && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginTop: 12, fontSize: "0.8rem" }}
          onClick={onResetFilters}
        >
          ✕ Zrušit filtry
        </button>
      )}
    </div>
  );
}

/* ─── Monthly Stats Table ──────────────────────────────── */

function MonthlyStatsTable({ data, emptyHasFilters = false, emptyOnReset }) {
  if (!data?.length) {
    return (
      <EmptyState
        hasFilters={emptyHasFilters}
        onResetFilters={emptyOnReset}
      />
    );
  }
  return (
    <div className="glass-card" style={{ padding: "1.25rem", overflow: "auto" }}>
      <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 16 }}>📅 Měsíční přehled</h3>
      <table className="data-table" style={{ borderCollapse: "separate", borderSpacing: "0 4px" }}>
        <thead>
          <tr>
            <th style={{ background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px", borderBottom: "1px solid var(--border)" }}>Měsíc</th>
            <th style={{ background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px", borderBottom: "1px solid var(--border)" }}>Počet tipů</th>
            <th style={{ background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px", borderBottom: "1px solid var(--border)" }}>WIN</th>
            <th style={{ background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px", borderBottom: "1px solid var(--border)" }}>LOSE</th>
            <th style={{ background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px", borderBottom: "1px solid var(--border)" }}>STORNO</th>
            <th style={{ background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px", borderBottom: "1px solid var(--border)" }}>Profit</th>
            <th style={{ background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px", borderBottom: "1px solid var(--border)" }}>ROI</th>
            <th style={{ background: "var(--bg-card)", color: "var(--text-primary)", padding: "10px", borderBottom: "1px solid var(--border)" }}>Kurz</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m, i) => {
            const isProfit = m.profit_total >= 0;
            const bg = isProfit ? "var(--success-soft)" : "var(--danger-soft)";
            return (
              <tr key={i} style={{ background: bg }}>
                <td style={{ padding: "8px 12px", color: "var(--text-primary)", fontWeight: 500 }}>{m.label}</td>
                <td style={{ padding: "8px 12px", color: "var(--text-primary)", textAlign: "center" }}>{m.bets_count}</td>
                <td style={{ padding: "8px 12px", color: "var(--text-primary)", textAlign: "center" }}>{m.wins_count}</td>
                <td style={{ padding: "8px 12px", color: "var(--text-primary)", textAlign: "center" }}>{m.losses_count}</td>
                <td style={{ padding: "8px 12px", color: "var(--text-primary)", textAlign: "center" }}>{m.voids_count}</td>
                <td style={{ padding: "8px 12px", color: "var(--text-primary)", fontWeight: 600 }}>
                  {m.profit_total > 0 ? "+" : ""}{Number(m.profit_total).toLocaleString("cs-CZ")}
                </td>
                <td style={{ padding: "8px 12px", color: "var(--text-primary)", fontWeight: 600 }}>{m.roi_percent}%</td>
                <td style={{ padding: "8px 12px", color: "var(--text-primary)" }}>ø{m.avg_odds}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── KPI Card ─────────────────────────────────────────── */

function KpiCard({ label, value, suffix = "", color = "accent", icon }) {
  return (
    <div className={`kpi-card ${color}`}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ fontSize: "1.25rem" }}>{icon}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          {value}
        </span>
        {suffix && (
          <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)", marginLeft: 4 }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Weekly Summary Cards ─────────────────────────────── */

function WeeklySummary({ data }) {
  const { current_week, last_week } = data || {};

  const Card = ({ title, stats, type }) => (
    <div className="glass-card" style={{
      padding: "12px 16px",
      flex: 1,
      borderLeft: `3px solid ${type === 'current' ? 'var(--accent)' : 'var(--text-muted)'}`,
      display: "flex",
      flexDirection: "column",
      gap: 4
    }}>
      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase" }}>{title}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: "1.1rem", fontWeight: 700 }}>
          {Number(stats?.profit_total || 0).toLocaleString("cs-CZ")} Kč
        </span>
        <span style={{ fontSize: "0.8rem", color: stats?.roi_percent >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
          {stats?.roi_percent > 0 ? "+" : ""}{stats?.roi_percent}% ROI
        </span>
      </div>
      <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
        {stats?.bets_count || 0} tipů • ø {stats?.avg_odds || 0}
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: "1.5rem" }}>
      <Card title="Posledních 7 dní" stats={current_week} type="current" />
      <Card title="Předchozích 7 dní" stats={last_week} type="last" />
    </div>
  );
}

/* ─── Filter Dropdown ──────────────────────────────────── */

const DATE_PRESETS = [
  { id: "all", label: "Celé období" },
  { id: "7d", label: "7 dní" },
  { id: "30d", label: "30 dní" },
  { id: "90d", label: "90 dní" },
  { id: "month", label: "Aktuální měsíc" },
];

function applyDatePreset(presetId, setFilters) {
  const now = new Date();
  let from = null;
  let to = null;

  if (presetId === "7d") {
    to = now;
    from = new Date();
    from.setDate(now.getDate() - 7);
  } else if (presetId === "30d") {
    to = now;
    from = new Date();
    from.setDate(now.getDate() - 30);
  } else if (presetId === "90d") {
    to = now;
    from = new Date();
    from.setDate(now.getDate() - 90);
  } else if (presetId === "month") {
    to = now;
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  setFilters((prev) => {
    const next = { ...prev };
    if (!from || !to) {
      delete next.date_from;
      delete next.date_to;
    } else {
      next.date_from = from.toISOString().slice(0, 10);
      next.date_to = to.toISOString().slice(0, 10);
    }
    next._date_preset = presetId === "all" ? undefined : presetId;
    return next;
  });
}

function FilterDropdown({ filters, setFilters, sports, bookmakers }) {
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = Object.keys(filters).filter((k) => !k.startsWith("_")).length;

  return (
    <div style={{ position: "relative" }}>
      <button
        className={`btn ${activeCount > 0 ? "btn-primary" : "btn-ghost"}`}
        onClick={() => setIsOpen(!isOpen)}
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <span>🔍 Filtry</span>
        {activeCount > 0 && (
          <span style={{
            background: "var(--bg-primary)",
            color: "var(--accent)",
            borderRadius: "50%",
            width: 18, height: 18,
            fontSize: "0.7rem",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800
          }}>
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 40 }}
            onClick={() => setIsOpen(false)}
          />
          <div className="glass-card" style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            width: 280, padding: 20, zIndex: 50,
            boxShadow: "0 10px 40px var(--shadow-strong)",
            display: "flex", flexDirection: "column", gap: 12
          }}>
            <h4 className="card-title" style={{ fontSize: "0.8rem", marginBottom: 4 }}>Nastavení filtrů</h4>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                {DATE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="btn btn-ghost"
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.75rem",
                      borderRadius: 999,
                      border:
                        filters._date_preset === p.id ||
                        (p.id === "all" && !filters._date_preset && !filters.date_from && !filters.date_to)
                          ? "1px solid var(--accent)"
                          : "1px solid transparent",
                    }}
                    onClick={() => applyDatePreset(p.id, setFilters)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

            <div className="form-group">
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Sport</label>
              <select className="input" style={{ width: "100%" }}
                value={filters.sport_id || ""}
                onChange={(e) => setFilters({ ...filters, sport_id: e.target.value || undefined })}>
                <option value="">Všechny sporty</option>
                {sports.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Bookmaker</label>
              <select className="input" style={{ width: "100%" }}
                value={filters.bookmaker_id || ""}
                onChange={(e) => setFilters({ ...filters, bookmaker_id: e.target.value || undefined })}>
                <option value="">Všichni bookmakeři</option>
                {bookmakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Od</label>
                <input type="date" className="input" style={{ width: "100%" }}
                  value={filters.date_from || ""}
                  onChange={(e) => setFilters({ ...filters, date_from: e.target.value || undefined })} />
              </div>
              <div>
                <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Do</label>
                <input type="date" className="input" style={{ width: "100%" }}
                  value={filters.date_to || ""}
                  onChange={(e) => setFilters({ ...filters, date_to: e.target.value || undefined })} />
              </div>
            </div>

            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: "0.8rem" }} onClick={() => { setFilters({}); setIsOpen(false); }}>Reset</button>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: "0.8rem" }} onClick={() => setIsOpen(false)}>Použít</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Dashboard Tabs ───────────────────────────────────── */

/* ─── Main Dashboard ───────────────────────────────────── */

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [timeseries, setTimeseries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [filters, setFilters] = useState({});
  const [sports, setSports] = useState([]);
  const [bookmakers, setBookmakers] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [bankroll, setBankroll] = useState(null);
  const [showAiHistoryModal, setShowAiHistoryModal] = useState(false);
  const [aiHistoryList, setAiHistoryList] = useState([]);
  const [aiHistoryDetail, setAiHistoryDetail] = useState(null);
  const [marketTypes, setMarketTypes] = useState([]);
  const [aiScope, setAiScope] = useState("overview");
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    loadData();
    getSports().then(setSports).catch(() => { });
    getBookmakers().then(setBookmakers).catch(() => { });
    getAppSettings().then((data) => setBankroll(data?.bankroll ?? null)).catch(() => { });
    getMarketTypes().then(setMarketTypes).catch(() => { });
  }, []);

  useEffect(() => {
    const onBankrollUpdated = () => {
      getAppSettings().then((data) => setBankroll(data?.bankroll ?? null)).catch(() => { });
    };
    window.addEventListener("bankroll-updated", onBankrollUpdated);
    return () => window.removeEventListener("bankroll-updated", onBankrollUpdated);
  }, []);

  useEffect(() => { loadData(); }, [filters]);

  async function loadData() {
    setLoading(true);
    try {
      const [s, ts] = await Promise.all([
        getStatsOverview(filters),
        getTimeseries(filters),
      ]);
      setStats(s);
      setTimeseries(ts);
      if (s?.overall?.best_streak >= 3) setShowConfetti(true);
    } catch (e) {
      toast.error("Chyba načítání dat: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAiAnalyze() {
    setAiLoading(true);
    setShowAiModal(true);
    try {
      const scope = aiScope || "overview";
      let question = "";
      if (scope === "markets") {
        question =
          "Zaměř se hlavně na typy sázek (by_market_type) a kurzová pásma (by_odds_bucket).";
      } else if (scope === "sport" && filters?.sport_id) {
        const sport = sports.find(
          (s) => String(s.id) === String(filters.sport_id)
        );
        const sportName = sport?.name || "vybraný sport";
        question = `Zaměř se hlavně na sport ${sportName} a porovnej ho s ostatními segmenty.`;
      } else {
        question =
          "Zaměř se na celkový přehled – shrň ROI, celkový profit, hitrate a drawdown, a jasně odděl silné a slabé stránky.";
      }

      const effectiveFilters = {
        ...filters,
        _ai_scope: scope,
      };

      const res = await aiAnalyze(effectiveFilters, question);
      setAiResult(res.analysis_text);
      toast.success("AI analýza dokončena");
    } catch (e) {
      setAiResult("Chyba při AI analýze: " + e.message);
      toast.error("AI analýza selhala");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleOpenAiHistory() {
    setShowAiHistoryModal(true);
    setAiHistoryDetail(null);
    try {
      const list = await getAiAnalyses(20);
      setAiHistoryList(list || []);
    } catch (e) {
      toast.error("Chyba načítání historie: " + e.message);
      setAiHistoryList([]);
    }
  }

  const o = stats?.overall || {};
  const profitColor = (o.profit_total || 0) >= 0 ? "green" : "red";

  // Připravíme data pro ROI grafy: seřazeno a s minimálním počtem sázek, aby ROI z 1–2 tiketů nezkreslovalo
  function prepareGrouped(data, { minBets = 5, sortBy = "roi", limit = 10 } = {}) {
    if (!data) return [];
    const filtered = data.filter((d) => d.bets_count >= minBets);
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "profit") {
        return Number(b.profit_total || 0) - Number(a.profit_total || 0);
      }
      // default: roi
      return (b.roi_percent || 0) - (a.roi_percent || 0);
    });
    return sorted.slice(0, limit);
  }

  const bySportPrepared = prepareGrouped(stats?.by_sport, {
    minBets: 5,
    sortBy: "roi",
    limit: 8,
  });
  const byMarketPrepared = prepareGrouped(stats?.by_market_type, {
    minBets: 5,
    sortBy: "roi",
    limit: 12,
  });

  // Akční insighty: nejlepší / nejhorší typy sázek podle profitu
  const rawMarketInsights = (stats?.by_market_type || []).filter(
    (m) => m.bets_count >= 5
  );
  const sortedMarketsByProfit = [...rawMarketInsights].sort(
    (a, b) => Number(b.profit_total || 0) - Number(a.profit_total || 0)
  );
  const bestMarkets = sortedMarketsByProfit
    .filter((m) => Number(m.profit_total || 0) > 0)
    .slice(0, 5);
  const worstMarkets = [...sortedMarketsByProfit]
    .reverse()
    .filter((m) => Number(m.profit_total || 0) < 0)
    .slice(0, 5);
  const hasMarketInsights =
    bestMarkets.length > 0 || worstMarkets.length > 0;

  function buildTicketsQuery(extraFilters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (key.startsWith("_")) return;
      if (value === undefined || value === null || value === "") return;
      params.set(key, String(value));
    });
    Object.entries(extraFilters || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    return params.toString();
  }

  function openTickets(extraFilters = {}) {
    const qs = buildTicketsQuery(extraFilters);
    const url = qs ? `/tikety?${qs}` : "/tikety";
    router.push(url);
  }

  function handleSportBarClick(entry) {
    if (!entry) return;
    const sport = sports.find((s) => s.name === entry.label);
    if (!sport) return;
    openTickets({ sport_id: sport.id });
  }

  function handleMarketBarClick(entry) {
    if (!entry) return;
    const mt = marketTypes.find((m) => m.name === entry.label);
    if (!mt) return;
    openTickets({ market_type_id: mt.id });
  }

  function handleMarketInsightClick(label) {
    if (!label) return;
    const mt = marketTypes.find((m) => m.name === label);
    if (!mt) return;
    openTickets({ market_type_id: mt.id });
  }

  function formatAiFiltersSummary(ctx) {
    if (!ctx || typeof ctx !== "object") return "";
    const parts = [];

    const scope = ctx._ai_scope || "overview";
    if (scope === "markets") {
      parts.push("zaměření: trhy a kurzy");
    } else if (scope === "sport") {
      parts.push("zaměření: vybraný sport");
    } else {
      parts.push("zaměření: celkový přehled");
    }

    if (ctx.date_from || ctx.date_to) {
      const from = ctx.date_from;
      const to = ctx.date_to;
      if (from && to) {
        parts.push(`období ${from} – ${to}`);
      } else if (from) {
        parts.push(`od ${from}`);
      } else if (to) {
        parts.push(`do ${to}`);
      }
    }

    if (ctx.sport_id) {
      const sportMatch = sports.find(
        (s) => String(s.id) === String(ctx.sport_id)
      );
      if (sportMatch) {
        parts.push(`sport: ${sportMatch.name}`);
      }
    }

    if (ctx.bookmaker_id) {
      const bmMatch = bookmakers.find(
        (b) => String(b.id) === String(ctx.bookmaker_id)
      );
      if (bmMatch) {
        parts.push(`sázkovka: ${bmMatch.name}`);
      }
    }

    return parts.join(" • ");
  }

  const maxDrawdownAmount = Number(o.max_drawdown || 0);
  const bankrollNumber = bankroll != null ? Number(bankroll) : null;
  let recommendedUnit = "Nastav bankroll v Nastavení";
  if (bankrollNumber && bankrollNumber > 0) {
    const low = Math.max(1, Math.round(bankrollNumber * 0.01));
    const high = Math.max(low, Math.round(bankrollNumber * 0.02));
    recommendedUnit = `${low.toLocaleString("cs-CZ")}–${high.toLocaleString("cs-CZ")} Kč`;
  }
  const bankrollReturnPct =
    bankrollNumber && bankrollNumber > 0
      ? ((Number(o.profit_total || 0) / bankrollNumber) * 100).toFixed(2)
      : null;

  const hasRealFilters = Object.entries(filters || {}).some(
    ([key, value]) =>
      !key.startsWith("_") &&
      value !== undefined &&
      value !== null &&
      value !== ""
  );

  function formatDashboardFiltersSummary() {
    const parts = [];

    // Období
    let periodLabel = "celé období";
    if (filters._date_preset) {
      const preset = DATE_PRESETS.find(
        (p) => p.id === filters._date_preset
      );
      if (preset) {
        periodLabel = preset.label;
      }
    } else if (filters.date_from || filters.date_to) {
      const from = filters.date_from;
      const to = filters.date_to;
      if (from && to) {
        periodLabel = `${from} – ${to}`;
      } else if (from) {
        periodLabel = `od ${from}`;
      } else if (to) {
        periodLabel = `do ${to}`;
      }
    }
    parts.push(`Období: ${periodLabel}`);

    // Sport
    let sportText = "všechny sporty";
    if (filters.sport_id) {
      const sportMatch = sports.find(
        (s) => String(s.id) === String(filters.sport_id)
      );
      if (sportMatch) {
        sportText = sportMatch.name;
      } else {
        sportText = `ID ${filters.sport_id}`;
      }
    }
    parts.push(`Sport: ${sportText}`);

    // Sázkovka
    let bookText = "všechny sázkovky";
    if (filters.bookmaker_id) {
      const bmMatch = bookmakers.find(
        (b) => String(b.id) === String(filters.bookmaker_id)
      );
      if (bmMatch) {
        bookText = bmMatch.name;
      } else {
        bookText = `ID ${filters.bookmaker_id}`;
      }
    }
    parts.push(`Sázkovka: ${bookText}`);

    return parts.join(" • ");
  }

  const filterSummaryText = formatDashboardFiltersSummary();

  return (
    <div className="content-width">
      <Confetti active={showConfetti} onDone={() => setShowConfetti(false)} />

      {/* Header */}
      <header className="page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Nejdůležitější čísla a kde vyděláváš vs. ztrácíš
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <FilterDropdown
            filters={filters}
            setFilters={setFilters}
            sports={sports}
            bookmakers={bookmakers}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="input"
              style={{ width: 170, fontSize: "0.75rem" }}
              value={aiScope}
              onChange={(e) => setAiScope(e.target.value)}
            >
              <option value="overview">AI: Celkový přehled</option>
              <option value="markets">AI: Trhy a kurzy</option>
              <option value="sport">AI: Vybraný sport</option>
            </select>
            <button className="btn btn-primary" onClick={handleAiAnalyze}>
              🤖 AI Analýza
            </button>
          </div>
          <button className="btn btn-ghost" onClick={handleOpenAiHistory}>
            📜 Historie analýz
          </button>
        </div>
      </header>

      {/* Weekly Summary */}
      {!loading && stats?.weekly && <WeeklySummary data={stats.weekly} />}

      {/* Filters summary */}
      <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
        Aktuální filtry: {filterSummaryText}
      </p>


      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* KPI – jen to nejdůležitější pro sázkaře */}
          <div className="dashboard-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: "1.5rem" }}>
            <KpiCard
              label="Celkový profit"
              value={`${Number(o.profit_total || 0).toLocaleString("cs-CZ")} Kč`}
              color={profitColor}
              icon="💰"
            />
            <KpiCard
              label="ROI (yield)"
              value={`${o.roi_percent || 0}%`}
              color={o.roi_percent >= 0 ? "green" : "red"}
              icon="📈"
            />
            <KpiCard
              label="Hit rate"
              value={`${o.hit_rate_percent || 0}%`}
              color="blue"
              icon="🎯"
            />
            <KpiCard
              label="Počet sázek"
              value={o.bets_count || 0}
              color="accent"
              icon="🎫"
            />
          </div>

          {/* Více čísel – drawdown, bankroll, série, jednotka */}
          <div
            className="glass-card"
            style={{
              padding: "1rem 1.25rem",
              marginBottom: "1.5rem",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "1rem",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Max drawdown</span>
              <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--danger)" }}>
                {maxDrawdownAmount > 0 ? `-${maxDrawdownAmount.toLocaleString("cs-CZ")} Kč` : "0 Kč"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Bankroll</span>
              <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {bankroll != null ? `${Number(bankroll).toLocaleString("cs-CZ")} Kč` : "—"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Zhodnocení BR</span>
              <span style={{ fontSize: "1rem", fontWeight: 700, color: bankrollReturnPct != null ? (Number(bankrollReturnPct) >= 0 ? "var(--success)" : "var(--danger)") : "var(--text-muted)" }}>
                {bankrollReturnPct != null ? `${Number(bankrollReturnPct) >= 0 ? "+" : ""}${bankrollReturnPct}%` : "—"}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Nejdelší série proher</span>
              <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--danger)" }}>{o.worst_streak ?? 0}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Dop. jednotka (1–2 %)</span>
              <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-secondary)" }}>{recommendedUnit}</span>
            </div>
          </div>

          {/* Grafy – kde vyděláváš vs. ztrácíš */}
          <div className="dashboard-charts-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: "1.5rem" }}>
                <ChartCard
                  title="📈 Profit v čase"
                  subtitle={timeseries.length > 0 ? `Trend – jde to nahoru nebo dolů? • ${timeseries.length} dní` : null}
                >
            {timeseries.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={timeseries} margin={{ top: 16, right: 16, left: 8, bottom: 8 }}>
                        <defs>
                          <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--success)" stopOpacity={0.25} />
                            <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} opacity={0.8} />
                        <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="4 4" />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "var(--text-secondary)", fontSize: 12, fontWeight: 500 }}
                          axisLine={{ stroke: "var(--border)" }}
                          tickLine={false}
                          tickFormatter={(d) => d.slice(5)}
                        />
                        <YAxis
                          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${v} Kč`}
                          width={48}
                        />
                        <Tooltip
                          content={<ChartTooltip formatter={(v, name) => `${Number(v).toLocaleString("cs-CZ")} Kč`} />}
                          cursor={{ stroke: "var(--accent)", strokeWidth: 2, strokeOpacity: 0.5 }}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={36}
                          iconType="line"
                          iconSize={12}
                          wrapperStyle={{ paddingTop: 12 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="cumulative_profit"
                          name="Kumulativní profit"
                          stroke="var(--accent)"
                          strokeWidth={3}
                          fill="url(#profitGradient)"
                          dot={false}
                          activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--accent)", fill: "var(--bg-card)" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="profit"
                          name="Denní profit"
                          stroke="var(--success)"
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          fill="url(#dailyGradient)"
                          dot={false}
                          activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--success)", fill: "var(--bg-card)" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState
                      hasFilters={hasRealFilters}
                      onResetFilters={() => setFilters({})}
                    />
                  )}
                </ChartCard>

                <ChartCard
                  title="🏆 ROI podle sportu"
                  subtitle="Kde vyděláváš a kde ztrácíš – klikni na sport pro filtry (min. 5 sázek)"
                >
                  <RoiBarChart
                    data={bySportPrepared}
                    highlightBest
                    onBarClick={handleSportBarClick}
                    emptyHasFilters={hasRealFilters}
                    emptyOnReset={() => setFilters({})}
                  />
                </ChartCard>

                <ChartCard
                  title="🎲 ROI podle typu sázky"
                  subtitle="Které typy sázek ti jdou a které ne – klikni pro filtry (min. 5 sázek)"
                >
                  <RoiBarChart
                    data={byMarketPrepared}
                    positiveColor="var(--info)"
                    highlightBest
                    onBarClick={handleMarketBarClick}
                    emptyHasFilters={hasRealFilters}
                    emptyOnReset={() => setFilters({})}
                  />
                </ChartCard>
          </div>

          {/* Na co sázet vs. čeho se vyvarovat – vždy viditelné když máme data */}
          {hasMarketInsights && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: 16,
                marginBottom: "1.5rem",
              }}
            >
              <div className="glass-card" style={{ padding: "1.25rem" }}>
                <h3
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    marginBottom: 12,
                    color: "var(--danger)",
                  }}
                >
                  ⚠️ Do čeho se nepouštět
                </h3>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginBottom: 12,
                  }}
                >
                  Typy sázek, kde dlouhodobě ztrácíš – raději je vynech (min. 5 sázek).
                </p>
                {worstMarkets.length ? (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {worstMarkets.map((m, i) => {
                      const bets = (m.wins_count || 0) + (m.losses_count || 0);
                      const hitrate =
                        bets > 0
                          ? Math.round(
                              ((m.wins_count || 0) / bets) * 1000
                            ) / 10
                          : 0;
                      return (
                        <li key={`${m.label}-worst-${i}`} style={{ marginBottom: 6 }}>
                          <div
                            onClick={() => handleMarketInsightClick(m.label)}
                            style={{
                              padding: "8px 10px",
                              background: "var(--danger-soft)",
                              borderRadius: 8,
                              fontSize: "0.8rem",
                              cursor: "pointer",
                            }}
                          >
                            <strong>{m.label}</strong>:{" "}
                            {Number(m.profit_total || 0).toLocaleString(
                              "cs-CZ"
                            )}{" "}
                            Kč (ROI {m.roi_percent}%,
                            {" "}
                            {m.wins_count} výher / {m.losses_count} proher,
                            {" "}
                            hitrate {hitrate}%)
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    Nenašly se žádné typy sázek s dostatečným počtem tiketů.
                  </p>
                )}
              </div>

              <div className="glass-card" style={{ padding: "1.25rem" }}>
                <h3
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    marginBottom: 12,
                    color: "var(--success)",
                  }}
                >
                  ✅ Na co sázet
                </h3>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginBottom: 12,
                  }}
                >
                  Typy sázek, kde ti to vychází – tady máš edge (min. 5 sázek).
                </p>
                {bestMarkets.length ? (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {bestMarkets.map((m, i) => {
                      const bets = (m.wins_count || 0) + (m.losses_count || 0);
                      const hitrate =
                        bets > 0
                          ? Math.round(
                              ((m.wins_count || 0) / bets) * 1000
                            ) / 10
                          : 0;
                      return (
                        <li key={`${m.label}-best-${i}`} style={{ marginBottom: 6 }}>
                          <div
                            onClick={() => handleMarketInsightClick(m.label)}
                            style={{
                              padding: "8px 10px",
                              background: "var(--success-soft)",
                              borderRadius: 8,
                              fontSize: "0.8rem",
                              cursor: "pointer",
                            }}
                          >
                            <strong>{m.label}</strong>:{" "}
                            {Number(m.profit_total || 0).toLocaleString(
                              "cs-CZ"
                            )}{" "}
                            Kč (ROI {m.roi_percent}%,
                            {" "}
                            {m.wins_count} výher / {m.losses_count} proher,
                            {" "}
                            hitrate {hitrate}%)
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    Zatím žádné trhy s dostatečným počtem sázek.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* AI Modal */}
      {showAiModal && (
        <div className="modal-overlay" onClick={() => !aiLoading && setShowAiModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>🤖 AI Analýza</h2>
              <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => setShowAiModal(false)}>✕</button>
            </div>
            {aiLoading ? (
              <div style={{ textAlign: "center", padding: "3rem" }}>
                <div className="spinner" style={{ width: 32, height: 32 }} />
                <p style={{ marginTop: 12, color: "var(--text-secondary)" }}>Analyzuji tvoje sázky...</p>
              </div>
            ) : (
              <div style={{
                background: "var(--bg-card)",
                borderRadius: 12,
                padding: "1.25rem",
                lineHeight: 1.7,
                fontSize: "0.9rem",
                whiteSpace: "pre-wrap",
              }}>
                {aiResult}
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Historie Modal */}
      {showAiHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowAiHistoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>📜 Historie AI analýz</h2>
              <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => setShowAiHistoryModal(false)}>✕</button>
            </div>
            <div style={{ overflow: "auto", flex: 1 }}>
              {aiHistoryDetail ? (
                <>
                  <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>
                    {aiHistoryDetail.created_at ? new Date(aiHistoryDetail.created_at).toLocaleString("cs-CZ") : ""}
                  </p>
                  {aiHistoryDetail.context && (
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: 12 }}>
                      {formatAiFiltersSummary(aiHistoryDetail.context)}
                    </p>
                  )}
                  <div style={{
                    background: "var(--bg-card)",
                    borderRadius: 12,
                    padding: "1rem",
                    lineHeight: 1.6,
                    fontSize: "0.9rem",
                    whiteSpace: "pre-wrap",
                  }}>
                    {aiHistoryDetail.response_text || "—"}
                  </div>
                  <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setAiHistoryDetail(null)}>
                    ← Zpět na seznam
                  </button>
                </>
              ) : aiHistoryList.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Zatím žádné analýzy.</p>
              ) : (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {aiHistoryList.map((item) => (
                    <li
                      key={item.id}
                      onClick={() => setAiHistoryDetail(item)}
                      style={{
                        padding: "12px 14px",
                        marginBottom: 8,
                        background: "var(--bg-card)",
                        borderRadius: 10,
                        cursor: "pointer",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 4 }}>
                        {item.created_at ? new Date(item.created_at).toLocaleString("cs-CZ") : ""}
                      </div>
                      {item.context && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: 4 }}>
                          {formatAiFiltersSummary(item.context)}
                        </div>
                      )}
                      <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                        {(item.response_text || "").slice(0, 200)}
                        {(item.response_text || "").length > 200 ? "…" : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
