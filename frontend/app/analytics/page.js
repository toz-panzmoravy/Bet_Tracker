"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";
import { getAnalyticsSummary, getBookmakers } from "../lib/api";
import { useToast } from "../components/Toast";

const DATE_PRESETS = [
  { label: "30 dní", days: 30 },
  { label: "90 dní", days: 90 },
  { label: "1 rok", days: 365 },
];

function useDateRange(presetDays) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (presetDays || 90));
    setFrom(start.toISOString().slice(0, 10));
    setTo(end.toISOString().slice(0, 10));
  }, [presetDays]);
  return { from, to, setFrom, setTo };
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="glass-card" style={{ padding: "1.25rem" }}>
      <div style={{ marginBottom: 16 }}>
        <h3 className="card-title">{title}</h3>
        {subtitle && (
          <p className="section-subtitle" style={{ marginTop: 2, fontSize: "0.7rem" }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-muted)" }}>
      <p style={{ fontSize: "2.5rem", marginBottom: 8, opacity: 0.4 }}>📊</p>
      <p style={{ fontSize: "0.85rem" }}>Žádná data k zobrazení</p>
      <p style={{ fontSize: "0.7rem", marginTop: 4 }}>Změň filtry nebo přidej tikety přes Import</p>
    </div>
  );
}

function BarLabel({ x, y, width, value }) {
  if (value === 0) return null;
  return (
    <text
      x={x + width / 2}
      y={value >= 0 ? y - 8 : y + 20}
      fill={value >= 0 ? "var(--success)" : "var(--danger)"}
      textAnchor="middle"
      fontSize={11}
      fontWeight={600}
    >
      {value > 0 ? "+" : ""}
      {Number(value).toLocaleString("cs-CZ")}
    </text>
  );
}

function ProfitBarTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: "0.8rem",
        minWidth: 180,
      }}
    >
      <p style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: 8 }}>{d.sport_name}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "var(--text-muted)" }}>Profit</span>
        <span
          style={{
            color: Number(d.profit) >= 0 ? "var(--success)" : "var(--danger)",
            fontWeight: 600,
          }}
        >
          {Number(d.profit) >= 0 ? "+" : ""}
          {Number(d.profit).toLocaleString("cs-CZ")} Kč
        </span>
        <span style={{ color: "var(--text-muted)" }}>Sázek</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{d.tickets_count}</span>
        <span style={{ color: "var(--text-muted)" }}>Hitrate</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{d.hitrate_percent}%</span>
        <span style={{ color: "var(--text-muted)" }}>ROI</span>
        <span
          style={{
            color: d.roi_percent >= 0 ? "var(--success)" : "var(--danger)",
            fontWeight: 600,
          }}
        >
          {d.roi_percent}%
        </span>
      </div>
    </div>
  );
}

function DayOfWeekTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: "0.8rem",
        minWidth: 180,
      }}
    >
      <p style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: 8 }}>{d.day_name}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "var(--text-muted)" }}>Profit</span>
        <span
          style={{
            color: Number(d.profit) >= 0 ? "var(--success)" : "var(--danger)",
            fontWeight: 600,
          }}
        >
          {Number(d.profit) >= 0 ? "+" : ""}
          {Number(d.profit).toLocaleString("cs-CZ")} Kč
        </span>
        <span style={{ color: "var(--text-muted)" }}>Sázek</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{d.tickets_count}</span>
        <span style={{ color: "var(--text-muted)" }}>Hitrate</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{d.hitrate_percent}%</span>
        <span style={{ color: "var(--text-muted)" }}>ROI</span>
        <span
          style={{
            color: d.roi_percent >= 0 ? "var(--success)" : "var(--danger)",
            fontWeight: 600,
          }}
        >
          {d.roi_percent}%
        </span>
      </div>
    </div>
  );
}

function HitrateBarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: "0.8rem",
        minWidth: 180,
      }}
    >
      <p style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: 8 }}>{d.market_type_name}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "var(--text-muted)" }}>Hitrate</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{d.hitrate_percent}%</span>
        <span style={{ color: "var(--text-muted)" }}>Sázek</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{d.tickets_count}</span>
        <span style={{ color: "var(--text-muted)" }}>Profit</span>
        <span
          style={{
            color: Number(d.profit) >= 0 ? "var(--success)" : "var(--danger)",
            fontWeight: 600,
          }}
        >
          {Number(d.profit) >= 0 ? "+" : ""}
          {Number(d.profit).toLocaleString("cs-CZ")} Kč
        </span>
      </div>
    </div>
  );
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: "0.8rem",
        minWidth: 160,
      }}
    >
      <p style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: 8 }}>{d.date}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "var(--text-muted)" }}>Profit</span>
        <span
          style={{
            color: Number(d.profit) >= 0 ? "var(--success)" : "var(--danger)",
            fontWeight: 600,
          }}
        >
          {Number(d.profit) >= 0 ? "+" : ""}
          {Number(d.profit).toLocaleString("cs-CZ")} Kč
        </span>
        <span style={{ color: "var(--text-muted)" }}>Kumulativní</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
          {Number(d.cumulative_profit).toLocaleString("cs-CZ")} Kč
        </span>
        <span style={{ color: "var(--text-muted)" }}>Sázek</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{d.bets_count}</span>
      </div>
    </div>
  );
}

function WeeklyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="chart-tooltip" style={{ minWidth: 180 }}>
      <p style={{ color: "var(--text-primary)", fontWeight: 700, marginBottom: 8 }}>Týden {d.week_label}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "var(--text-muted)" }}>Profit</span>
        <span style={{ color: Number(d.profit) >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>
          {Number(d.profit) >= 0 ? "+" : ""}{Number(d.profit).toLocaleString("cs-CZ")} Kč
        </span>
        <span style={{ color: "var(--text-muted)" }}>ROI</span>
        <span style={{ color: d.roi_percent >= 0 ? "var(--success)" : "var(--danger)", fontWeight: 600 }}>{d.roi_percent}%</span>
        <span style={{ color: "var(--text-muted)" }}>Hitrate</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{d.hitrate_percent}%</span>
        <span style={{ color: "var(--text-muted)" }}>Sázek</span>
        <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{d.bets_count}</span>
      </div>
    </div>
  );
}

const MIN_TICKETS_RECOMMEND = 5;

export default function AnalyticsPage() {
  const toast = useToast();
  const [presetIndex, setPresetIndex] = useState(1);
  const presetDays = DATE_PRESETS[presetIndex]?.days ?? 90;
  const { from, to, setFrom, setTo } = useDateRange(presetDays);
  const [bookmakerId, setBookmakerId] = useState("");
  const [jenVyhodnocene, setJenVyhodnocene] = useState(true);
  const [bookmakers, setBookmakers] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sportFilter, setSportFilter] = useState("");

  useEffect(() => {
    getBookmakers()
      .then((list) => setBookmakers(list || []))
      .catch(() => setBookmakers([]));
  }, []);

  const params = useMemo(() => {
    const p = {};
    if (from) p.date_from = from;
    if (to) p.date_to = to;
    if (bookmakerId) p.bookmaker_id = bookmakerId;
    p.jen_vyhodnocene = jenVyhodnocene;
    return p;
  }, [from, to, bookmakerId, jenVyhodnocene]);

  useEffect(() => {
    setLoading(true);
    getAnalyticsSummary(params)
      .then((res) => setData(res))
      .catch((err) => {
        toast?.error?.(err.message || "Načtení analytiky selhalo");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [params]);

  const sportOptions = useMemo(() => {
    if (!data?.by_sport?.length) return [];
    return data.by_sport.map((s) => ({ id: s.sport_id, name: s.sport_name }));
  }, [data?.by_sport]);

  const bySportChartData = useMemo(() => {
    if (!data?.by_sport?.length) return [];
    return data.by_sport.map((s) => ({
      sport_name: s.sport_name,
      sport_id: s.sport_id,
      tickets_count: s.tickets_count,
      won_count: s.won_count,
      lost_count: s.lost_count,
      profit: Number(s.profit),
      roi_percent: s.roi_percent,
      hitrate_percent: s.hitrate_percent,
    }));
  }, [data?.by_sport]);

  const byMarketFiltered = useMemo(() => {
    if (!data?.by_market?.length) return [];
    let list = data.by_market;
    if (sportFilter) {
      const sid = parseInt(sportFilter, 10);
      list = list.filter((m) => m.sport_id === sid);
    }
    // Výchozí filtr: nezobrazovat "Neznámý" a typy s 0% hitrate
    list = list.filter(
      (m) => m.market_type_name !== "Neznámý" && Number(m.hitrate_percent) !== 0
    );
    return list;
  }, [data?.by_market, sportFilter]);

  // Sloučení řádků se stejným názvem typu sázky (součet hodnot + přepočet hitrate a ROI)
  const byMarketMerged = useMemo(() => {
    const byName = {};
    for (const m of byMarketFiltered) {
      const key = m.market_type_name;
      if (!byName[key]) {
        byName[key] = {
          market_type_name: key,
          market_type_id: m.market_type_id,
          sport_id: m.sport_id,
          sport_name: m.sport_name,
          tickets_count: 0,
          won_count: 0,
          lost_count: 0,
          void_count: 0,
          stake: 0,
          profit: 0,
        };
      }
      const row = byName[key];
      row.tickets_count += m.tickets_count ?? 0;
      row.won_count += m.won_count ?? 0;
      row.lost_count += m.lost_count ?? 0;
      row.void_count += m.void_count ?? 0;
      row.stake += Number(m.stake ?? 0);
      row.profit += Number(m.profit ?? 0);
    }
    return Object.values(byName).map((row) => {
      const w = row.won_count;
      const l = row.lost_count;
      const hitrate_percent = w + l > 0 ? Math.round((w / (w + l)) * 1000) / 10 : 0;
      const roi_percent = row.stake > 0 ? Math.round((row.profit / row.stake) * 10000) / 100 : 0;
      return {
        ...row,
        hitrate_percent,
        roi_percent,
      };
    });
  }, [byMarketFiltered]);

  const byMarketChartData = useMemo(() => {
    return byMarketMerged.map((m) => ({
      market_type_name: m.market_type_name,
      market_type_id: m.market_type_id,
      sport_name: m.sport_name,
      sport_id: m.sport_id,
      tickets_count: m.tickets_count,
      won_count: m.won_count,
      lost_count: m.lost_count,
      profit: Number(m.profit),
      roi_percent: m.roi_percent,
      hitrate_percent: m.hitrate_percent,
    }));
  }, [byMarketMerged]);

  const byDayOfWeekChartData = useMemo(() => {
    if (!data?.by_day_of_week?.length) return [];
    return data.by_day_of_week.map((d) => ({
      day_name: d.day_name,
      day_of_week: d.day_of_week,
      tickets_count: d.tickets_count,
      won_count: d.won_count,
      lost_count: d.lost_count,
      profit: Number(d.profit),
      roi_percent: d.roi_percent,
      hitrate_percent: d.hitrate_percent,
    }));
  }, [data?.by_day_of_week]);

  const weeklyChartData = useMemo(() => {
    if (!data?.weekly_trend?.length) return [];
    return data.weekly_trend.map((w) => ({
      week_label: w.week_label,
      profit: Number(w.profit),
      roi_percent: w.roi_percent,
      hitrate_percent: w.hitrate_percent,
      bets_count: w.bets_count,
    }));
  }, [data?.weekly_trend]);

  const weeklyInsight = useMemo(() => {
    const w = weeklyChartData;
    if (w.length < 4) return null;
    const recent = w.slice(-2);
    const previous = w.slice(-4, -2);
    const recentProfit = recent.reduce((s, x) => s + x.profit, 0);
    const previousProfit = previous.reduce((s, x) => s + x.profit, 0);
    const recentRoi = recent.length ? recent.reduce((s, x) => s + x.roi_percent, 0) / recent.length : 0;
    const previousRoi = previous.length ? previous.reduce((s, x) => s + x.roi_percent, 0) / previous.length : 0;
    if (recentProfit > previousProfit && recentRoi >= previousRoi - 5) return { type: "better", text: "Poslední 2 týdny: zlepšuješ se oproti předchozím." };
    if (recentProfit < previousProfit && recentRoi < previousRoi - 5) return { type: "worse", text: "Poslední 2 týdny: zhoršuješ se oproti předchozím." };
    return { type: "stable", text: "Výkon v posledních týdnech je stabilní." };
  }, [weeklyChartData]);

  const worstCombos = useMemo(() => {
    if (!data?.by_market?.length) return [];
    return [...data.by_market]
      .filter((m) => m.tickets_count >= MIN_TICKETS_RECOMMEND)
      .sort((a, b) => Number(a.profit) - Number(b.profit))
      .slice(0, 5);
  }, [data?.by_market]);

  const bestCombos = useMemo(() => {
    if (!data?.by_market?.length) return [];
    return [...data.by_market]
      .filter((m) => m.tickets_count >= MIN_TICKETS_RECOMMEND)
      .sort((a, b) => Number(b.profit) - Number(a.profit))
      .slice(0, 5);
  }, [data?.by_market]);

  return (
    <div className="content-width">
      <header className="page-header">
        <h1 className="page-title">📈 Analytics</h1>
        <p className="page-subtitle">Vývoj po týdnech, podle sportu a typu sázky – uvidíš, kde se zlepšuješ a kde ztrácíš</p>
      </header>

      {/* Filtry */}
      <div
        className="glass-card"
        style={{
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "flex-end",
        }}
      >
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            Období
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            {DATE_PRESETS.map((p, i) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPresetIndex(i)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: presetIndex === i ? "var(--accent-soft)" : "var(--bg-input)",
                  color: "var(--text-primary)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              type="date"
              value={from || ""}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                fontSize: "0.8rem",
              }}
            />
            <input
              type="date"
              value={to || ""}
              onChange={(e) => setTo(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                fontSize: "0.8rem",
              }}
            />
          </div>
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
            Sázkovka
          </label>
          <select
            value={bookmakerId}
            onChange={(e) => setBookmakerId(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--bg-input)",
              color: "var(--text-primary)",
              fontSize: "0.85rem",
              minWidth: 140,
            }}
          >
            <option value="">Všechny</option>
            {bookmakers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={jenVyhodnocene}
            onChange={(e) => setJenVyhodnocene(e.target.checked)}
          />
          <span style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
            Jen vyhodnocené tikety
          </span>
        </label>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          V grafech: <span style={{ color: "var(--success)" }}>■</span> zisk &nbsp; <span style={{ color: "var(--danger)" }}>■</span> ztráta
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
          Načítám…
        </div>
      ) : !data ? (
        <EmptyState />
      ) : (
        <>
          {/* KPI karty */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <div className="glass-card kpi-card" style={{ padding: "1.25rem 1.5rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                Celkový profit
              </div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: Number(data.kpis?.profit_total) >= 0 ? "var(--success)" : "var(--danger)",
                }}
              >
                {Number(data.kpis?.profit_total ?? 0) >= 0 ? "+" : ""}
                {Number(data.kpis?.profit_total ?? 0).toLocaleString("cs-CZ")} Kč
              </div>
            </div>
            <div className="glass-card kpi-card" style={{ padding: "1.25rem 1.5rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                ROI
              </div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: (data.kpis?.roi_percent ?? 0) >= 0 ? "var(--success)" : "var(--danger)",
                }}
              >
                {(data.kpis?.roi_percent ?? 0)}%
              </div>
            </div>
            <div className="glass-card kpi-card" style={{ padding: "1.25rem 1.5rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                Hitrate
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                {(data.kpis?.hitrate_percent ?? 0)}%
              </div>
            </div>
            <div className="glass-card kpi-card" style={{ padding: "1.25rem 1.5rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 4 }}>
                Počet tiketů
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                {data.kpis?.tickets_count ?? 0}
              </div>
            </div>
          </div>

          {/* Vývoj po týdnech – vidět zlepšení/zhoršení */}
          <div style={{ marginBottom: "1.5rem" }}>
            <ChartCard
              title="Vývoj po týdnech"
              subtitle="Profit za každý týden – sleduj, jestli se zlepšuješ nebo zhoršuješ"
            >
              {weeklyChartData.length ? (
                <>
                  {weeklyInsight && (
                    <p
                      style={{
                        fontSize: "0.8rem",
                        marginBottom: 12,
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: weeklyInsight.type === "better" ? "var(--success-soft)" : weeklyInsight.type === "worse" ? "var(--danger-soft)" : "var(--surface-subtle)",
                        color: weeklyInsight.type === "better" ? "var(--success)" : weeklyInsight.type === "worse" ? "var(--danger)" : "var(--text-secondary)",
                        fontWeight: 600,
                      }}
                    >
                      {weeklyInsight.type === "better" && "📈 "}
                      {weeklyInsight.type === "worse" && "📉 "}
                      {weeklyInsight.text}
                    </p>
                  )}
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={weeklyChartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }} barCategoryGap={8}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="4 4" />
                      <XAxis
                        dataKey="week_label"
                        tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                        axisLine={{ stroke: "var(--border)" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${Number(v).toLocaleString("cs-CZ")}`}
                      />
                      <Tooltip content={<WeeklyTooltip />} cursor={{ fill: "var(--accent-soft)" }} />
                      <Bar dataKey="profit" name="Profit (Kč)" radius={[6, 6, 0, 0]} maxBarSize={40}>
                        <LabelList content={<BarLabel />} />
                        {weeklyChartData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.profit >= 0 ? "var(--success)" : "var(--danger)"}
                            fillOpacity={0.9}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <EmptyState />
              )}
            </ChartCard>
          </div>

          {/* Profit podle sportu */}
          <div style={{ marginBottom: "1.5rem" }}>
            <ChartCard
              title="Podle sportu"
              subtitle={bySportChartData.length ? `Nejlepší: ${bySportChartData[0]?.sport_name ?? "—"} • Nejhorší: ${bySportChartData.length ? bySportChartData[bySportChartData.length - 1]?.sport_name : "—"}` : "Kladný = zisk, záporný = ztráta za zvolené období"}
            >
              {bySportChartData.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={bySportChartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="sport_name"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${Number(v).toLocaleString("cs-CZ")}`}
                    />
                    <Tooltip content={<ProfitBarTooltip />} cursor={{ fill: "var(--accent-soft)" }} />
                    <Bar dataKey="profit" name="Profit (Kč)" radius={[8, 8, 0, 0]} maxBarSize={50}>
                      <LabelList content={<BarLabel />} />
                      {bySportChartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.profit >= 0 ? "var(--success)" : "var(--danger)"}
                          fillOpacity={0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </ChartCard>
          </div>

          {/* Den v týdnu */}
          <div style={{ marginBottom: "1.5rem" }}>
            <ChartCard
              title="Den v týdnu"
              subtitle="Profit podle dne (Po–Ne)"
            >
              {byDayOfWeekChartData.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byDayOfWeekChartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="day_name"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${Number(v).toLocaleString("cs-CZ")}`}
                    />
                    <Tooltip content={<DayOfWeekTooltip />} cursor={{ fill: "var(--accent-soft)" }} />
                    <Bar dataKey="profit" name="Profit (Kč)" radius={[8, 8, 0, 0]} maxBarSize={50}>
                      <LabelList content={<BarLabel />} />
                      {byDayOfWeekChartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.profit >= 0 ? "var(--success)" : "var(--danger)"}
                          fillOpacity={0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </ChartCard>
          </div>

          {/* Podle typu sázky */}
          <div style={{ marginBottom: "1.5rem" }}>
            <ChartCard
              title="Podle typu sázky"
              subtitle={
                sportFilter
                  ? `Sport: ${sportOptions.find((s) => String(s.id) === sportFilter)?.name ?? "—"}`
                  : "Vyber sport pro zúžení (nebo zobraz všechny)"
              }
            >
              <div style={{ marginBottom: 12 }}>
                <select
                  value={sportFilter}
                  onChange={(e) => setSportFilter(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg-input)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                    minWidth: 160,
                  }}
                >
                  <option value="">Všechny sporty</option>
                  {sportOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              {byMarketChartData.length ? (
                <ResponsiveContainer width="100%" height={Math.max(280, byMarketChartData.length * 36)}>
                  <BarChart
                    data={byMarketChartData}
                    layout="vertical"
                    margin={{ top: 8, right: 50, left: 4, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <YAxis
                      type="category"
                      dataKey="market_type_name"
                      width={140}
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<HitrateBarTooltip />} cursor={{ fill: "var(--accent-soft)" }} />
                    <Bar dataKey="hitrate_percent" name="Hitrate %" radius={[0, 4, 4, 0]} maxBarSize={24} barCategoryGap="12%">
                      <LabelList
                        dataKey="hitrate_percent"
                        position="right"
                        formatter={(v) => `${Number(v).toFixed(0)}%`}
                        style={{ fill: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}
                      />
                      {byMarketChartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={Number(entry.profit) >= 0 ? "var(--success)" : "var(--danger)"}
                          fillOpacity={0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </ChartCard>
          </div>

          {/* Kumulativní profit v čase */}
          <div style={{ marginBottom: "1.5rem" }}>
            <ChartCard title="Kumulativní profit" subtitle="Součet profitu od začátku období (po dnech)">
              {data.profit_trend?.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.profit_trend} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${Number(v).toLocaleString("cs-CZ")}`}
                    />
                    <Tooltip content={<TrendTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="cumulative_profit"
                      name="Kumulativní profit"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </ChartCard>
          </div>

          {/* Doporučení: Na co si dát pozor / Silné stránky */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "1.5rem",
            }}
          >
            <div className="glass-card" style={{ padding: "1.25rem" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12, color: "var(--danger)" }}>
                ⚠️ Na co si dát pozor
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 12 }}>
                Kombinace sport + typ sázky s nejhorším profitem (min. {MIN_TICKETS_RECOMMEND} sázek)
              </p>
              {worstCombos.length ? (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {worstCombos.map((m, i) => {
                    const q = new URLSearchParams({ sport_id: m.sport_id });
                    if (from) q.set("date_from", from);
                    if (to) q.set("date_to", to);
                    if (m.market_type_id) q.set("market_type_id", m.market_type_id);
                    return (
                      <li key={i} style={{ marginBottom: 6 }}>
                        <Link
                          href={`/tikety?${q.toString()}`}
                          style={{
                            display: "block",
                            padding: "8px 10px",
                            background: "var(--danger-soft)",
                            borderRadius: 8,
                            fontSize: "0.8rem",
                            textDecoration: "none",
                            color: "inherit",
                          }}
                        >
                          <strong>{m.sport_name}</strong> – {m.market_type_name}: {m.won_count} výher / {m.lost_count}{" "}
                          proher, hitrate {m.hitrate_percent}%, ROI {m.roi_percent}%. Zvaž omezit tento trh. →
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Žádné kombinace s dostatečným počtem sázek.
                </p>
              )}
            </div>
            <div className="glass-card" style={{ padding: "1.25rem" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12, color: "var(--success)" }}>
                ✅ Silné stránky
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 12 }}>
                Kombinace sport + typ sázky s nejlepším profitem (min. {MIN_TICKETS_RECOMMEND} sázek)
              </p>
              {bestCombos.length ? (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {bestCombos.map((m, i) => {
                    const q = new URLSearchParams({ sport_id: m.sport_id });
                    if (from) q.set("date_from", from);
                    if (to) q.set("date_to", to);
                    if (m.market_type_id) q.set("market_type_id", m.market_type_id);
                    return (
                      <li key={i} style={{ marginBottom: 6 }}>
                        <Link
                          href={`/tikety?${q.toString()}`}
                          style={{
                            display: "block",
                            padding: "8px 10px",
                            background: "var(--success-soft)",
                            borderRadius: 8,
                            fontSize: "0.8rem",
                            textDecoration: "none",
                            color: "inherit",
                          }}
                        >
                          <strong>{m.sport_name}</strong> – {m.market_type_name}: {m.won_count} výher / {m.lost_count}{" "}
                          proher, hitrate {m.hitrate_percent}%, ROI {m.roi_percent}%. →
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Žádné kombinace s dostatečným počtem sázek.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
