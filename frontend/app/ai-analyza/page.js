"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getAiAnalyses,
  getStatsOverview,
  getTimeseries,
  startStrategyAnalysis,
  getStrategyAnalysis,
} from "../lib/api";
import { useToast } from "../components/Toast";
import { DashboardSkeleton } from "../components/Skeletons";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="chart-tooltip" style={{ minWidth: 180 }}>
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 2,
          }}
        >
          <span style={{ color: "var(--text-secondary)" }}>{p.name}</span>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {Number(p.value).toLocaleString("cs-CZ")} Kč
          </span>
        </div>
      ))}
    </div>
  );
}

function GlassCard({ title, subtitle, children }) {
  return (
    <div className="glass-card" style={{ padding: "1.25rem" }}>
      {(title || subtitle) && (
        <div style={{ marginBottom: 16 }}>
          {title && (
            <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>{title}</h3>
          )}
          {subtitle && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                marginTop: 2,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyState({ label }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "2.5rem 0",
        color: "var(--text-muted)",
      }}
    >
      <p style={{ fontSize: "2rem", marginBottom: 8, opacity: 0.4 }}>🤖</p>
      <p style={{ fontSize: "0.85rem" }}>
        {label || "Zatím nemáme dostatek dat pro graf."}
      </p>
    </div>
  );
}

function parseSections(text) {
  if (!text) {
    return { summary: "", positives: "", negatives: "", risks: "", recommendations: "" };
  }
  const sections = {
    summary: "",
    positives: "",
    negatives: "",
    risks: "",
    recommendations: "",
  };

  const lines = String(text).split(/\r?\n/);
  let current = "summary";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const lower = line.toLowerCase();
    if (lower.startsWith("shrnutí")) {
      current = "summary";
      continue;
    }
    if (lower.startsWith("pozitiva")) {
      current = "positives";
      continue;
    }
    if (lower.startsWith("negativa")) {
      current = "negatives";
      continue;
    }
    if (lower.startsWith("rizika")) {
      current = "risks";
      continue;
    }
    if (lower.startsWith("doporučení")) {
      current = "recommendations";
      continue;
    }
    sections[current] += (sections[current] ? "\n" : "") + rawLine;
  }
  return sections;
}

export default function AiAnalyzaPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [timeseries, setTimeseries] = useState([]);

  const [running, setRunning] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeHistoryId, setActiveHistoryId] = useState(null);

  useEffect(() => {
    loadBaseData();
    loadHistory();
  }, []);

  async function loadBaseData() {
    setLoading(true);
    try {
      const [overview, ts] = await Promise.all([
        getStatsOverview({}),
        getTimeseries({}),
      ]);
      setStats(overview);
      setTimeseries(ts || []);
    } catch (e) {
      toast.error("Chyba načítání dat pro AI analýzu: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadHistory() {
    try {
      const list = await getAiAnalyses(5);
      setHistory(list || []);
      if (list && list.length > 0) {
        setActiveHistoryId(list[0].id);
        setCurrentAnalysis(list[0]);
      }
    } catch (e) {
      toast.error("Chyba načítání historie AI analýz: " + e.message);
    }
  }

  async function handleRunAnalysis() {
    if (running) return;
    setRunning(true);
    try {
      // Spustíme asynchronní job na backendu (vždy nad všemi tikety)
      const job = await startStrategyAnalysis();
      setActiveHistoryId(job.id);
      setCurrentAnalysis(job);

      // Polling stavu, dokud job neskončí
      let done = false;
      while (!done) {
        // Krátké čekání mezi dotazy, aby se nezahltila API
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 3000));
        // eslint-disable-next-line no-await-in-loop
        const latest = await getStrategyAnalysis(job.id);
        if (!latest) {
          throw new Error("Analýzu se nepodařilo načíst.");
        }
        setCurrentAnalysis(latest);
        if (latest.status === "done") {
          toast.success("AI meta-analýza dokončena");
          done = true;
        } else if (latest.status === "error") {
          const msg = latest.error_message || "Analýza skončila s chybou.";
          throw new Error(msg);
        }
      }

      // Po dokončení jobu obnovíme historii (max 5 posledních)
      await loadHistory();
    } catch (e) {
      toast.error("AI analýza selhala: " + e.message);
    } finally {
      setRunning(false);
    }
  }

  function handleSelectHistory(item) {
    setActiveHistoryId(item.id);
    setCurrentAnalysis(item);
  }

  const overview = stats?.overall;
  const sections = parseSections(currentAnalysis?.response_text);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.6rem", fontWeight: 700 }}>
            🤖 AI analýza strategie
          </h1>
          <p
            style={{
              fontSize: "0.9rem",
              color: "var(--text-secondary)",
              maxWidth: 640,
            }}
          >
            Meta‑analýza tvých historických tiketů – čistě datově a statisticky,
            bez domýšlení budoucích výsledků. Analýza se vždy dělá nad všemi
            uloženými tikety v systému.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunAnalysis}
            disabled={running}
          >
            {running ? "Probíhá analýza…" : "Spustit novou AI analýzu"}
          </button>
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              textAlign: "right",
            }}
          >
            Systém uchovává vždy max. 5 posledních analýz, starší se automaticky
            mažou.
          </span>
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : !overview ? (
        <EmptyState label="Zatím nemáš žádné tikety – přidej je přes Import a potom spusť AI analýzu." />
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 16,
              marginBottom: "1.5rem",
            }}
          >
            <GlassCard title="Celkový profit">
              <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>
                {Number(overview.profit_total || 0) >= 0 ? "+" : ""}
                {Number(overview.profit_total || 0).toLocaleString("cs-CZ")} Kč
              </div>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                  marginTop: 4,
                }}
              >
                ROI {overview.roi_percent || 0}% • {overview.bets_count || 0}{" "}
                sázek • hitrate {overview.hit_rate_percent || 0}%.
              </p>
            </GlassCard>
            <GlassCard title="Drawdown & streaky">
              <div style={{ fontSize: "0.9rem" }}>
                <div style={{ marginBottom: 4 }}>
                  Max. drawdown:{" "}
                  <strong>
                    {Number(overview.max_drawdown || 0).toLocaleString(
                      "cs-CZ"
                    )}{" "}
                    Kč
                  </strong>{" "}
                  ({overview.max_drawdown_percent || 0}%)
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Aktuální série:{" "}
                  <strong>{overview.current_streak || 0}</strong> • Nejlepší
                  série výher:{" "}
                  <strong>{overview.best_streak || 0}</strong> • Nejhorší série
                  proher: <strong>{overview.worst_streak || 0}</strong>
                </div>
              </div>
            </GlassCard>
            <GlassCard title="Obrat sázek">
              <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                {Number(overview.stake_total || 0).toLocaleString("cs-CZ")} Kč
              </div>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--text-secondary)",
                  marginTop: 4,
                }}
              >
                Průměrný kurz {overview.avg_odds || 0} • Součet všech vkladů
                napříč historií.
              </p>
            </GlassCard>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1.4fr)",
              gap: 16,
              alignItems: "stretch",
              marginBottom: "1.5rem",
            }}
          >
            <GlassCard
              title="Vývoj kumulativního profitu"
              subtitle={
                timeseries.length
                  ? `Historie po dnech – čistě z tvých dat`
                  : undefined
              }
            >
              {timeseries.length ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart
                    data={timeseries}
                    margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="aiProfitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                      tickFormatter={(d) => d.slice(5)}
                    />
                    <YAxis
                      tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        `${Number(v).toLocaleString("cs-CZ")} Kč`
                      }
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="cumulative_profit"
                      name="Kumulativní profit"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                      fill="url(#aiProfitGradient)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState />
              )}
            </GlassCard>

            <GlassCard
              title="Historie AI analýz"
              subtitle="Uchovává se vždy max. 5 posledních analýz"
            >
              {history.length === 0 ? (
                <EmptyState label="Zatím žádné uložené AI analýzy. Spusť první analýzu výše." />
              ) : (
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    maxHeight: 260,
                    overflow: "auto",
                  }}
                >
                  {history.map((item) => {
                    const isActive = item.id === activeHistoryId;
                    const created =
                      item.created_at &&
                      new Date(item.created_at).toLocaleString("cs-CZ");
                    const preview =
                      (item.response_text || "").slice(0, 140) +
                      ((item.response_text || "").length > 140 ? "…" : "");
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectHistory(item)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: isActive
                              ? "1px solid var(--accent)"
                              : "1px solid var(--border)",
                            background: isActive
                              ? "var(--accent-soft)"
                              : "var(--bg-card)",
                            fontSize: "0.8rem",
                            cursor: "pointer",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--text-muted)",
                              marginBottom: 4,
                            }}
                          >
                            {created || "Neznámé datum"}
                          </div>
                          <div
                            style={{
                              color: "var(--text-primary)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {preview || "—"}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </GlassCard>
          </div>

          <GlassCard
            title="Report AI (čistě z tvých dat)"
            subtitle={
              currentAnalysis
                ? "Rozděleno na Shrnutí, Pozitiva, Negativa, Rizika a Doporučení. AI nepracuje s ničím jiným než s čísly z tvých tiketů."
                : "Spusť AI analýzu nebo vyber z historie vpravo."
            }
          >
            {!currentAnalysis ? (
              <EmptyState label="Zatím není vybraná žádná AI analýza." />
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1.5fr)",
                  gap: 20,
                  fontSize: "0.9rem",
                  lineHeight: 1.7,
                }}
              >
                <div>
                  {sections.summary && (
                    <section style={{ marginBottom: 16 }}>
                      <h3
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--text-muted)",
                          marginBottom: 4,
                        }}
                      >
                        Shrnutí
                      </h3>
                      <p style={{ whiteSpace: "pre-wrap" }}>{sections.summary}</p>
                    </section>
                  )}
                  {sections.risks && (
                    <section>
                      <h3
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--text-muted)",
                          marginBottom: 4,
                        }}
                      >
                        Rizika & variance
                      </h3>
                      <p style={{ whiteSpace: "pre-wrap" }}>{sections.risks}</p>
                    </section>
                  )}
                </div>

                <div>
                  {sections.positives && (
                    <section style={{ marginBottom: 16 }}>
                      <h3
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--success)",
                          marginBottom: 4,
                        }}
                      >
                        Pozitiva
                      </h3>
                      <p style={{ whiteSpace: "pre-wrap" }}>{sections.positives}</p>
                    </section>
                  )}
                  {sections.negatives && (
                    <section style={{ marginBottom: 16 }}>
                      <h3
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--danger)",
                          marginBottom: 4,
                        }}
                      >
                        Negativa
                      </h3>
                      <p style={{ whiteSpace: "pre-wrap" }}>{sections.negatives}</p>
                    </section>
                  )}
                  {sections.recommendations && (
                    <section>
                      <h3
                        style={{
                          fontSize: "0.85rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "var(--text-muted)",
                          marginBottom: 4,
                        }}
                      >
                        Doporučení (na základě dat)
                      </h3>
                      <p style={{ whiteSpace: "pre-wrap" }}>
                        {sections.recommendations}
                      </p>
                    </section>
                  )}
                </div>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}

