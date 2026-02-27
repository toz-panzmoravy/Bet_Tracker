"use client";
import { useState, useEffect } from "react";
import { getAppSettings, updateAppSettings } from "../lib/api";

export default function NastaveniPage() {
  const [config, setConfig] = useState({
    ollamaUrl: "http://localhost:11434",
    visionModel: "llama3.2-vision",
    textModel: "mistral-small",
  });
  const [ollamaStatus, setOllamaStatus] = useState("checking");
  const [models, setModels] = useState([]);

  const [bankroll, setBankroll] = useState("");
  const [bankrollSaving, setBankrollSaving] = useState(false);
  const [bankrollSavedAt, setBankrollSavedAt] = useState(null);

  useEffect(() => {
    checkOllama();
    loadBankroll();
  }, []);

  async function checkOllama() {
    try {
      const res = await fetch(`${config.ollamaUrl}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        setModels(data.models || []);
        setOllamaStatus("connected");
      } else {
        setOllamaStatus("error");
      }
    } catch {
      setOllamaStatus("error");
    }
  }

  async function loadBankroll() {
    try {
      const data = await getAppSettings();
      if (data?.bankroll != null) {
        setBankroll(String(data.bankroll));
      }
    } catch {
      // ignore – default empty bankroll
    }
  }

  async function handleSaveBankroll(e) {
    e.preventDefault();
    setBankrollSaving(true);
    try {
      const numeric = bankroll === "" ? null : Number(bankroll.replace(",", "."));
      await updateAppSettings({ bankroll: numeric });
      setBankrollSavedAt(new Date());
    } catch {
      // v1: bez toastu – nekomplikujeme
    } finally {
      setBankrollSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>⚙️ Nastavení</h1>
        <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
          Konfigurace aplikace, bankrollu a LLM
        </p>
      </div>

      {/* Bankroll */}
      <div className="glass-card" style={{ padding: "1.25rem", marginBottom: 16 }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 8 }}>💼 Bankroll</h3>
        <p style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", marginBottom: 12 }}>
          Bankroll je částka, se kterou jsi aktuálně ochotný aktivně sázet. Tuto hodnotu můžeš
          kdykoliv ručně změnit – metriky na dashboardu (např. zhodnocení bankrollu) se přepočítají podle aktuální hodnoty.
        </p>
        <form onSubmit={handleSaveBankroll} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            step="0.01"
            min="0"
            className="input"
            style={{ flex: 1 }}
            value={bankroll}
            onChange={(e) => setBankroll(e.target.value)}
            placeholder="Např. 10000"
          />
          <span style={{ fontSize: "0.85rem" }}>Kč</span>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={bankrollSaving}
            style={{ fontSize: "0.8rem" }}
          >
            {bankrollSaving ? "Ukládám..." : "Uložit"}
          </button>
        </form>
        {bankrollSavedAt && (
          <p style={{ marginTop: 8, fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
            Uloženo: {bankrollSavedAt.toLocaleString("cs-CZ")}
          </p>
        )}
      </div>

      {/* Ollama Status */}
      <div className="glass-card" style={{ padding: "1.25rem", marginBottom: 16 }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>🤖 Ollama stav</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background:
                ollamaStatus === "connected"
                  ? "var(--color-green)"
                  : ollamaStatus === "error"
                  ? "var(--color-red)"
                  : "var(--color-yellow)",
            }}
          />
          <span style={{ fontSize: "0.875rem" }}>
            {ollamaStatus === "connected"
              ? "Připojeno"
              : ollamaStatus === "error"
              ? "Nepřipojeno"
              : "Ověřuji..."}
          </span>
          <button
            className="btn btn-ghost"
            style={{ marginLeft: "auto", padding: "4px 12px", fontSize: "0.8rem" }}
            onClick={checkOllama}
          >
            Zkontrolovat
          </button>
        </div>

        {models.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 6 }}>
              Nainstalované modely:
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {models.map((m) => (
                <span key={m.name} className="badge badge-open" style={{ fontSize: "0.75rem" }}>
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick start guide */}
      <div className="glass-card" style={{ padding: "1.25rem" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>📖 Rychlý start</h3>
        <div
          style={{
            fontSize: "0.85rem",
            color: "var(--color-text-secondary)",
            lineHeight: 1.8,
          }}
        >
          <p>
            <strong>1.</strong> Nainstaluj Ollama modely:
          </p>
          <div
            style={{
              background: "var(--color-bg-input)",
              padding: "8px 12px",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: "0.8rem",
              margin: "6px 0 12px",
            }}
          >
            ollama pull mistral-small
            <br />
            ollama pull llama3.2-vision
          </div>
          <p>
            <strong>2.</strong> Spusť Docker (PostgreSQL):
          </p>
          <div
            style={{
              background: "var(--color-bg-input)",
              padding: "8px 12px",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: "0.8rem",
              margin: "6px 0 12px",
            }}
          >
            cd docker && docker compose up -d
          </div>
          <p>
            <strong>3.</strong> Přejdi na <strong>Import</strong> a vlož screenshot tiketu pomocí Ctrl+V
          </p>
          <p>
            <strong>4.</strong> Sleduj statistiky na <strong>Dashboard</strong> 📊
          </p>
        </div>
      </div>
    </div>
  );
}
