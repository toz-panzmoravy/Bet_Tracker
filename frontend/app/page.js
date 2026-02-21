"use client";
import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, Legend, LabelList
} from "recharts";
import { getStatsOverview, getTimeseries, aiAnalyze, getSports, getBookmakers } from "./lib/api";
import { useToast } from "./components/Toast";
import { DashboardSkeleton } from "./components/Skeletons";
import Confetti from "./components/Confetti";

/* ─── Styled Tooltip ───────────────────────────────────── */

function ChartTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: "rgba(22, 24, 34, 0.95)",
      border: "1px solid rgba(99, 102, 241, 0.25)",
      borderRadius: 12,
      padding: "12px 16px",
      fontSize: "0.8rem",
      backdropFilter: "blur(12px)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      minWidth: 160,
    }}>
      <p style={{ color: "#8b8fa3", marginBottom: 6, fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 2 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, display: "inline-block" }} />
            <span style={{ color: "#a0a4b8" }}>{p.name}</span>
          </span>
          <span style={{ color: "#e4e6f0", fontWeight: 600 }}>
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
    <div style={{
      background: "rgba(22, 24, 34, 0.95)",
      border: "1px solid rgba(99, 102, 241, 0.25)",
      borderRadius: 12,
      padding: "14px 18px",
      fontSize: "0.8rem",
      backdropFilter: "blur(12px)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      minWidth: 180,
    }}>
      <p style={{ color: "#e4e6f0", fontWeight: 700, marginBottom: 8, fontSize: "0.85rem" }}>{d.label}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "#8b8fa3" }}>ROI</span>
        <span style={{ color: d.roi_percent >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{d.roi_percent}%</span>
        <span style={{ color: "#8b8fa3" }}>Sázek</span>
        <span style={{ color: "#e4e6f0", fontWeight: 600 }}>{d.bets_count}</span>
        <span style={{ color: "#8b8fa3" }}>Vklad</span>
        <span style={{ color: "#e4e6f0", fontWeight: 600 }}>{Number(d.stake_total || 0).toLocaleString("cs-CZ")} Kč</span>
        <span style={{ color: "#8b8fa3" }}>Profit</span>
        <span style={{ color: Number(d.profit_total || 0) >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
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
      y={value >= 0 ? y - 8 : y + 20}
      fill={value >= 0 ? "#22c55e" : "#ef4444"}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
    >
      {value > 0 ? "+" : ""}{value}%
    </text>
  );
}

/* ─── ROI Bar Chart (reusable) ─────────────────────────── */

function RoiBarChart({ data, positiveColor = "#22c55e", negativeColor = "#ef4444" }) {
  if (!data?.length) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(42, 45, 62, 0.5)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#8b8fa3", fontSize: 11 }}
          axisLine={{ stroke: "rgba(42, 45, 62, 0.5)" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#5c6078", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<RichBarTooltip />} cursor={{ fill: "rgba(99, 102, 241, 0.06)" }} />
        <Bar dataKey="roi_percent" name="ROI %" radius={[8, 8, 0, 0]} maxBarSize={50}>
          <LabelList content={<BarLabel />} />
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.roi_percent >= 0 ? positiveColor : negativeColor} fillOpacity={0.85} />
          ))}
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
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>{title}</h3>
        {subtitle && <p style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", marginTop: 2 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/* ─── Empty State ──────────────────────────────────────── */

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--color-text-muted)" }}>
      <p style={{ fontSize: "2.5rem", marginBottom: 8, opacity: 0.4 }}>📊</p>
      <p style={{ fontSize: "0.85rem" }}>Žádná data k zobrazení</p>
      <p style={{ fontSize: "0.7rem", marginTop: 4 }}>Přidej tikety přes Import</p>
    </div>
  );
}

/* ─── KPI Card ─────────────────────────────────────────── */

function KpiCard({ label, value, suffix = "", color = "accent", icon }) {
  return (
    <div className={`kpi-card ${color}`}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
          {label}
        </span>
        <span style={{ fontSize: "1.25rem" }}>{icon}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          {value}
        </span>
        {suffix && (
          <span style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)", marginLeft: 4 }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Dashboard Tabs ───────────────────────────────────── */

const TABS = [
  { id: "prehled", label: "📊 Přehled" },
  { id: "trhy", label: "🔍 Trhy" },
  { id: "vzorce", label: "⚡ Vzorce" },
];

function TabBar({ active, onChange }) {
  return (
    <div style={{
      display: "flex", gap: 4,
      background: "var(--color-bg-secondary)",
      borderRadius: 12, padding: 4,
      marginBottom: "1.25rem",
    }}>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            flex: 1,
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            cursor: "pointer",
            fontSize: "0.85rem",
            fontWeight: 600,
            transition: "all 0.2s ease",
            background: active === tab.id ? "var(--color-accent-soft)" : "transparent",
            color: active === tab.id ? "var(--color-accent-hover)" : "var(--color-text-secondary)",
            outline: active === tab.id ? "1px solid var(--color-accent)" : "none",
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState("prehled");
  const [showConfetti, setShowConfetti] = useState(false);
  const toast = useToast();

  useEffect(() => {
    loadData();
    getSports().then(setSports).catch(() => { });
    getBookmakers().then(setBookmakers).catch(() => { });
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
      const res = await aiAnalyze(filters);
      setAiResult(res.analysis_text);
      toast.success("AI analýza dokončena");
    } catch (e) {
      setAiResult("Chyba při AI analýze: " + e.message);
      toast.error("AI analýza selhala");
    } finally {
      setAiLoading(false);
    }
  }

  const o = stats?.overall || {};
  const profitColor = (o.profit_total || 0) >= 0 ? "green" : "red";

  // Compute chart subtitles
  const bestSport = stats?.by_sport?.reduce((best, s) => (!best || s.roi_percent > best.roi_percent) ? s : best, null);
  const bestMarket = stats?.by_market_type?.reduce((best, s) => (!best || s.roi_percent > best.roi_percent) ? s : best, null);

  return (
    <div>
      <Confetti active={showConfetti} onDone={() => setShowConfetti(false)} />

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Dashboard</h1>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
            Přehled tvých sázkových výsledků
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleAiAnalyze}>
          🤖 AI Analýza
        </button>
      </div>

      {/* Filters */}
      <div className="glass-card" style={{ padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select className="input" style={{ width: 160 }}
          value={filters.sport_id || ""}
          onChange={(e) => setFilters({ ...filters, sport_id: e.target.value || undefined })}>
          <option value="">Všechny sporty</option>
          {sports.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
        </select>
        <select className="input" style={{ width: 160 }}
          value={filters.bookmaker_id || ""}
          onChange={(e) => setFilters({ ...filters, bookmaker_id: e.target.value || undefined })}>
          <option value="">Všichni bookmakeři</option>
          {bookmakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input type="date" className="input" style={{ width: 160 }}
          placeholder="Od" value={filters.date_from || ""}
          onChange={(e) => setFilters({ ...filters, date_from: e.target.value || undefined })} />
        <input type="date" className="input" style={{ width: 160 }}
          placeholder="Do" value={filters.date_to || ""}
          onChange={(e) => setFilters({ ...filters, date_to: e.target.value || undefined })} />
        {Object.keys(filters).length > 0 && (
          <button className="btn btn-ghost" onClick={() => setFilters({})}>✕ Reset</button>
        )}
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: "1rem" }}>
            <KpiCard label="Celkový profit" value={`${Number(o.profit_total || 0).toLocaleString("cs-CZ")} Kč`} color={profitColor} icon="💰" />
            <KpiCard label="ROI" value={`${o.roi_percent || 0}%`} color={o.roi_percent >= 0 ? "green" : "red"} icon="📈" />
            <KpiCard label="Hit rate" value={`${o.hit_rate_percent || 0}%`} color="blue" icon="🎯" />
            <KpiCard label="Celkový vklad" value={`${Number(o.stake_total || 0).toLocaleString("cs-CZ")} Kč`} color="accent" icon="💵" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: "1.5rem" }}>
            <KpiCard label="Počet sázek" value={o.bets_count || 0} color="yellow" icon="🎫" />
            <KpiCard label="Ø Kurz" value={o.avg_odds || 0} color="accent" icon="📊" />
            <KpiCard label="🔥 Nejlepší série" value={`${o.best_streak || 0}×`} color="green" icon="🏆" />
            <KpiCard label="📉 Max drawdown" value={`${Number(o.max_drawdown || 0).toLocaleString("cs-CZ")} Kč`}
              suffix={o.max_drawdown_percent ? `(${o.max_drawdown_percent}%)` : ""}
              color={o.max_drawdown > 0 ? "red" : "accent"} icon="🩸" />
          </div>

          {/* Tabs */}
          <TabBar active={activeTab} onChange={setActiveTab} />

          {/* Tab Content */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: "1.5rem" }}>

            {/* ─── Přehled ─── */}
            {activeTab === "prehled" && (
              <>
                <ChartCard
                  title="📈 Profit v čase"
                  subtitle={timeseries.length > 0 ? `${timeseries.length} dní • Poslední: ${timeseries[timeseries.length - 1]?.date}` : null}
                >
                  {timeseries.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <AreaChart data={timeseries} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <defs>
                          <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="dailyGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(42, 45, 62, 0.5)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fill: "#5c6078", fontSize: 10 }}
                          axisLine={{ stroke: "rgba(42, 45, 62, 0.5)" }}
                          tickLine={false}
                          tickFormatter={(d) => d.slice(5)} // MM-DD
                        />
                        <YAxis
                          tick={{ fill: "#5c6078", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => `${v} Kč`}
                        />
                        <Tooltip
                          content={<ChartTooltip formatter={(v, name) => `${Number(v).toLocaleString("cs-CZ")} Kč`} />}
                          cursor={{ stroke: "rgba(99, 102, 241, 0.3)", strokeWidth: 1 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="cumulative_profit"
                          name="Kumulativní profit"
                          stroke="#6366f1"
                          strokeWidth={2.5}
                          fill="url(#profitGradient)"
                          dot={false}
                          activeDot={{ r: 5, strokeWidth: 2, stroke: "#6366f1", fill: "#1c1f2e" }}
                        />
                        <Area
                          type="monotone"
                          dataKey="profit"
                          name="Denní profit"
                          stroke="#22c55e"
                          strokeWidth={1}
                          strokeDasharray="5 3"
                          fill="url(#dailyGradient)"
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 2, stroke: "#22c55e", fill: "#1c1f2e" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : <EmptyState />}
                </ChartCard>

                <ChartCard
                  title="🏆 ROI podle sportu"
                  subtitle={bestSport ? `Nejlepší: ${bestSport.label} (${bestSport.roi_percent > 0 ? "+" : ""}${bestSport.roi_percent}%)` : null}
                >
                  <RoiBarChart data={stats?.by_sport} />
                </ChartCard>
              </>
            )}

            {/* ─── Trhy ─── */}
            {activeTab === "trhy" && (
              <>
                <ChartCard
                  title="🎲 ROI podle typu sázky"
                  subtitle={bestMarket ? `Nejlepší: ${bestMarket.label} (${bestMarket.roi_percent > 0 ? "+" : ""}${bestMarket.roi_percent}%)` : null}
                >
                  <RoiBarChart data={stats?.by_market_type} positiveColor="#3b82f6" />
                </ChartCard>

                <ChartCard
                  title="🎰 ROI podle kurzového pásma"
                  subtitle="Kde máš edge?"
                >
                  <RoiBarChart data={stats?.by_odds_bucket} positiveColor="#eab308" />
                </ChartCard>
              </>
            )}

            {/* ─── Vzorce ─── */}
            {activeTab === "vzorce" && (
              <>
                <ChartCard title="⚡ Live vs Prematch" subtitle="Kde sázíš lépe?">
                  {stats?.live_vs_prematch?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={stats.live_vs_prematch} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(42, 45, 62, 0.5)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "#8b8fa3", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#5c6078", fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<RichBarTooltip />} cursor={{ fill: "rgba(99, 102, 241, 0.06)" }} />
                        <Bar dataKey="roi_percent" name="ROI %" radius={[8, 8, 0, 0]} maxBarSize={60}>
                          <LabelList content={<BarLabel />} />
                          {stats.live_vs_prematch.map((entry, i) => (
                            <Cell key={i} fill={entry.roi_percent >= 0 ? "#22c55e" : "#ef4444"} fillOpacity={0.85} />
                          ))}
                        </Bar>
                        <Bar dataKey="bets_count" name="Počet sázek" radius={[8, 8, 0, 0]} fill="#6366f1" fillOpacity={0.25} maxBarSize={60} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <EmptyState />}
                </ChartCard>

                <ChartCard title="📅 ROI podle dne v týdnu" subtitle="Kdy sázet a kdy ne?">
                  <RoiBarChart data={stats?.by_weekday} positiveColor="#8b5cf6" />
                </ChartCard>
              </>
            )}
          </div>
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
                <p style={{ marginTop: 12, color: "var(--color-text-secondary)" }}>Analyzuji tvoje sázky...</p>
              </div>
            ) : (
              <div style={{
                background: "var(--color-bg-card)",
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
    </div>
  );
}
