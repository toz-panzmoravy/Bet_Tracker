"use client";
import { useState, useEffect } from "react";
import { getTickets } from "../lib/api";

const STATUS_MAP = {
  open: { label: "Čeká", icon: "⏳" },
  won: { label: "Výhra", icon: "✅" },
  lost: { label: "Prohra", icon: "❌" },
  void: { label: "Vráceno", icon: "↩️" },
};

export default function LivePage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Zobrazit opravdu jen tikety, které jsou označené jako LIVE a ještě nejsou vyhodnocené.
        const data = await getTickets({ is_live: true, status: "open", limit: 100 });
        setTickets(data.items ?? []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: "1rem 0" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>🔴 LIVE</h1>
        <p style={{ color: "var(--color-text-muted)" }}>Načítám aktivní tikety…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "1rem 0" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>🔴 LIVE</h1>
        <p style={{ color: "var(--color-red)" }}>Chyba: {error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "1rem 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>🔴 LIVE</h1>
          <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
            Otevřené a živé tikety ({tickets.length})
          </p>
        </div>
      </div>

      {tickets.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)" }}>
          Žádné otevřené tikety. Importujte aktivní sázky z rozšíření na stránce Tipsport Moje tikety (tlačítko „Importovat aktivní“).
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tickets-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={{ padding: "0.5rem 0.75rem" }}>Sázkovka</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Sport</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Zápas</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Typ sázky</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Výběr</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Kurz</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Vklad</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Stav</th>
                <th style={{ padding: "0.5rem 0.75rem" }}>Poslední skóre</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const snap = t.last_live_snapshot;
                const scoreText = snap && typeof snap === "object" ? (snap.scraped_text || snap.message || "") : "";
                const statusInfo = STATUS_MAP[t.status] || { label: t.status, icon: "•" };
                const typeLabel = t.ticket_type === "aku" ? "AKU" : (t.market_label || "—");
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{t.bookmaker?.name ?? "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{t.sport?.name ?? "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{t.home_team} – {t.away_team}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{typeLabel}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{t.selection || "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{t.odds != null ? Number(t.odds) : "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{t.stake != null ? `${Number(t.stake)} Kč` : "—"}</td>
                    <td style={{ padding: "0.5rem 0.75rem" }}>{statusInfo.icon} {statusInfo.label}</td>
                    <td style={{ padding: "0.5rem 0.75rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={scoreText}>
                      {scoreText ? scoreText.slice(0, 60) + (scoreText.length > 60 ? "…" : "") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ marginTop: "1rem", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
        Pro sledování stavu použijte rozšíření na stránce Tipsport (Moje tikety / detail tiketu / live zápas).
      </p>
    </div>
  );
}
