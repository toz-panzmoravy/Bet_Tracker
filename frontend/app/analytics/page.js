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
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>{title}</h3>
        {subtitle && (
          <p style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", marginTop: 2 }}>
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
    <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--color-text-muted)" }}>
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
      fill={value >= 0 ? "#22c55e" : "#ef4444"}
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
        background: "rgba(22, 24, 34, 0.95)",
        border: "1px solid rgba(99, 102, 241, 0.25)",
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: "0.8rem",
        minWidth: 180,
      }}
    >
      <p style={{ color: "#e4e6f0", fontWeight: 700, marginBottom: 8 }}>{d.sport_name}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "#8b8fa3" }}>Profit</span>
        <span
          style={{
            color: Number(d.profit) >= 0 ? "#22c55e" : "#ef4444",
            fontWeight: 600,
          }}
        >
          {Number(d.profit) >= 0 ? "+" : ""}
          {Number(d.profit).toLocaleString("cs-CZ")} Kč
        </span>
        <span style={{ color: "#8b8fa3" }}>Sázek</span>
        <span style={{ color: "#e4e6f0", fontWeight: 600 }}>{d.tickets_count}</span>
        <span style={{ color: "#8b8fa3" }}>Hitrate</span>
        <span style={{ color: "#e4e6f0", fontWeight: 600 }}>{d.hitrate_percent}%</span>
        <span style={{ color: "#8b8fa3" }}>ROI</span>
        <span
          style={{
            color: d.roi_percent >= 0 ? "#22c55e" : "#ef4444",
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
        background: "rgba(22, 24, 34, 0.95)",
        border: "1px solid rgba(99, 102, 241, 0.25)",
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: "0.8rem",
        minWidth: 180,
      }}
    >
      <p style={{ color: "#e4e6f0", fontWeight: 700, marginBottom: 8 }}>{d.market_type_name}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "#8b8fa3" }}>Hitrate</span>
        <span style={{ color: "#e4e6f0", fontWeight: 600 }}>{d.hitrate_percent}%</span>
        <span style={{ color: "#8b8fa3" }}>Sázek</span>
        <span style={{ color: "#e4e6f0", fontWeight: 600 }}>{d.tickets_count}</span>
        <span style={{ color: "#8b8fa3" }}>Profit</span>
        <span
          style={{
            color: Number(d.profit) >= 0 ? "#22c55e" : "#ef4444",
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
        background: "rgba(22, 24, 34, 0.95)",
        border: "1px solid rgba(99, 102, 241, 0.25)",
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: "0.8rem",
        minWidth: 160,
      }}
    >
      <p style={{ color: "#e4e6f0", fontWeight: 700, marginBottom: 8 }}>{d.date}</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px" }}>
        <span style={{ color: "#8b8fa3" }}>Profit</span>
        <span
          style={{
            color: Number(d.profit) >= 0 ? "#22c55e" : "#ef4444",
            fontWeight: 600,
          }}
        >
          {Number(d.profit) >= 0 ? "+" : ""}
          {Number(d.profit).toLocaleString("cs-CZ")} Kč
        </span>
        <span style={{ color: "#8b8fa3" }}>Kumulativní</span>
        <span style={{ color: "#e4e6f0", fontWeight: 600 }}>
          {Number(d.cumulative_profit).toLocaleString("cs-CZ")} Kč
        </span>
        <span style={{ color: "#8b8fa3" }}>Sázek</span>
        <span style={{ color: "#e4e6f0", fontWeight: 600 }}>{d.bets_count}</span>
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
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        📈 Analytics
      </h1>

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
          <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>
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
                  border: "1px solid var(--color-border)",
                  background: presetIndex === i ? "var(--color-accent-soft)" : "var(--color-bg-input)",
                  color: "var(--color-text-primary)",
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
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-input)",
                color: "var(--color-text-primary)",
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
                border: "1px solid var(--color-border)",
                background: "var(--color-bg-input)",
                color: "var(--color-text-primary)",
                fontSize: "0.8rem",
              }}
            />
          </div>
        </div>
        <div>
          <label style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", display: "block", marginBottom: 4 }}>
            Sázkovka
          </label>
          <select
            value={bookmakerId}
            onChange={(e) => setBookmakerId(e.target.value)}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-input)",
              color: "var(--color-text-primary)",
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
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-primary)" }}>
            Jen vyhodnocené tikety
          </span>
        </label>
        <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
          V grafech: <span style={{ color: "#22c55e" }}>■</span> zisk &nbsp; <span style={{ color: "#ef4444" }}>■</span> ztráta
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-muted)" }}>
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
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 4 }}>
                Celkový profit
              </div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: Number(data.kpis?.profit_total) >= 0 ? "var(--color-green)" : "var(--color-red)",
                }}
              >
                {Number(data.kpis?.profit_total ?? 0) >= 0 ? "+" : ""}
                {Number(data.kpis?.profit_total ?? 0).toLocaleString("cs-CZ")} Kč
              </div>
            </div>
            <div className="glass-card kpi-card" style={{ padding: "1.25rem 1.5rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 4 }}>
                ROI
              </div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: (data.kpis?.roi_percent ?? 0) >= 0 ? "var(--color-green)" : "var(--color-red)",
                }}
              >
                {(data.kpis?.roi_percent ?? 0)}%
              </div>
            </div>
            <div className="glass-card kpi-card" style={{ padding: "1.25rem 1.5rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 4 }}>
                Hitrate
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                {(data.kpis?.hitrate_percent ?? 0)}%
              </div>
            </div>
            <div className="glass-card kpi-card" style={{ padding: "1.25rem 1.5rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 4 }}>
                Počet tiketů
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                {data.kpis?.tickets_count ?? 0}
              </div>
            </div>
          </div>

          {/* Graf: Profit podle sportu */}
          <div style={{ marginBottom: "1.5rem" }}>
            <ChartCard
              title="Profit podle sportu"
              subtitle="Kladný = zisk, záporný = ztráta za zvolené období"
            >
              {bySportChartData.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={bySportChartData} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(42, 45, 62, 0.5)" vertical={false} />
                    <XAxis
                      dataKey="sport_name"
                      tick={{ fill: "#8b8fa3", fontSize: 11 }}
                      axisLine={{ stroke: "rgba(42, 45, 62, 0.5)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#5c6078", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${Number(v).toLocaleString("cs-CZ")}`}
                    />
                    <Tooltip content={<ProfitBarTooltip />} cursor={{ fill: "rgba(99, 102, 241, 0.06)" }} />
                    <Bar dataKey="profit" name="Profit (Kč)" radius={[8, 8, 0, 0]} maxBarSize={50}>
                      <LabelList content={<BarLabel />} />
                      {bySportChartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.profit >= 0 ? "#22c55e" : "#ef4444"}
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

          {/* Graf: Hitrate podle typu sázky (s výběrem sportu) */}
          <div style={{ marginBottom: "1.5rem" }}>
            <ChartCard
              title="Hitrate podle typu sázky"
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
                    border: "1px solid var(--color-border)",
                    background: "var(--color-bg-input)",
                    color: "var(--color-text-primary)",
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
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(42, 45, 62, 0.5)" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fill: "#5c6078", fontSize: 10 }}
                      axisLine={{ stroke: "rgba(42, 45, 62, 0.5)" }}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <YAxis
                      type="category"
                      dataKey="market_type_name"
                      width={140}
                      tick={{ fill: "#8b8fa3", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<HitrateBarTooltip />} cursor={{ fill: "rgba(99, 102, 241, 0.06)" }} />
                    <Bar dataKey="hitrate_percent" name="Hitrate %" radius={[0, 4, 4, 0]} maxBarSize={24} barCategoryGap="12%">
                      <LabelList
                        dataKey="hitrate_percent"
                        position="right"
                        formatter={(v) => `${Number(v).toFixed(0)}%`}
                        style={{ fill: "#e4e6f0", fontSize: 11, fontWeight: 600 }}
                      />
                      {byMarketChartData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={Number(entry.profit) >= 0 ? "#22c55e" : "#ef4444"}
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

          {/* Graf: Trend profitu v čase */}
          <div style={{ marginBottom: "1.5rem" }}>
            <ChartCard title="Trend profitu v čase" subtitle="Kumulativní profit po dnech">
              {data.profit_trend?.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.profit_trend} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(42, 45, 62, 0.5)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#8b8fa3", fontSize: 10 }}
                      axisLine={{ stroke: "rgba(42, 45, 62, 0.5)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#5c6078", fontSize: 10 }}
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
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12, color: "var(--color-red)" }}>
                ⚠️ Na co si dát pozor
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 12 }}>
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
                            background: "var(--color-red-soft)",
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
                <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  Žádné kombinace s dostatečným počtem sázek.
                </p>
              )}
            </div>
            <div className="glass-card" style={{ padding: "1.25rem" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 12, color: "var(--color-green)" }}>
                ✅ Silné stránky
              </h3>
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 12 }}>
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
                            background: "var(--color-green-soft)",
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
                <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
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
