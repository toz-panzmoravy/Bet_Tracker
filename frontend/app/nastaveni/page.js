"use client";
import { useState, useEffect } from "react";

export default function NastaveniPage() {
    const [config, setConfig] = useState({
        ollamaUrl: "http://localhost:11434",
        visionModel: "llama3.2-vision",
        textModel: "mistral-small",
    });
    const [ollamaStatus, setOllamaStatus] = useState("checking");
    const [models, setModels] = useState([]);

    useEffect(() => {
        checkOllama();
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

    return (
        <div style={{ maxWidth: 700 }}>
            <div style={{ marginBottom: "1.5rem" }}>
                <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>⚙️ Nastavení</h1>
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                    Konfigurace LLM a připojení
                </p>
            </div>

            {/* Ollama Status */}
            <div className="glass-card" style={{ padding: "1.25rem", marginBottom: 16 }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>🤖 Ollama stav</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                        width: 10, height: 10, borderRadius: "50%",
                        background: ollamaStatus === "connected" ? "var(--color-green)" : ollamaStatus === "error" ? "var(--color-red)" : "var(--color-yellow)",
                    }} />
                    <span style={{ fontSize: "0.875rem" }}>
                        {ollamaStatus === "connected" ? "Připojeno" : ollamaStatus === "error" ? "Nepřipojeno" : "Ověřuji..."}
                    </span>
                    <button className="btn btn-ghost" style={{ marginLeft: "auto", padding: "4px 12px", fontSize: "0.8rem" }} onClick={checkOllama}>
                        Zkontrolovat
                    </button>
                </div>

                {models.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                        <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", marginBottom: 6 }}>Nainstalované modely:</p>
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

            {/* Config */}
            <div className="glass-card" style={{ padding: "1.25rem", marginBottom: 16 }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>🔧 Konfigurace</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 4, display: "block" }}>Ollama URL</label>
                        <input className="input" value={config.ollamaUrl}
                            onChange={(e) => setConfig({ ...config, ollamaUrl: e.target.value })} />
                    </div>
                    <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 4, display: "block" }}>Vision model (OCR)</label>
                        <input className="input" value={config.visionModel}
                            onChange={(e) => setConfig({ ...config, visionModel: e.target.value })} />
                    </div>
                    <div>
                        <label style={{ fontSize: "0.75rem", color: "var(--color-text-secondary)", marginBottom: 4, display: "block" }}>Text model (AI analýza)</label>
                        <input className="input" value={config.textModel}
                            onChange={(e) => setConfig({ ...config, textModel: e.target.value })} />
                    </div>
                </div>
            </div>

            {/* Quick start guide */}
            <div className="glass-card" style={{ padding: "1.25rem" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: 12 }}>📖 Rychlý start</h3>
                <div style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", lineHeight: 1.8 }}>
                    <p><strong>1.</strong> Nainstaluj Ollama modely:</p>
                    <div style={{ background: "var(--color-bg-input)", padding: "8px 12px", borderRadius: 8, fontFamily: "monospace", fontSize: "0.8rem", margin: "6px 0 12px" }}>
                        ollama pull mistral-small<br />
                        ollama pull llama3.2-vision
                    </div>
                    <p><strong>2.</strong> Spusť Docker (PostgreSQL):</p>
                    <div style={{ background: "var(--color-bg-input)", padding: "8px 12px", borderRadius: 8, fontFamily: "monospace", fontSize: "0.8rem", margin: "6px 0 12px" }}>
                        cd docker && docker compose up -d
                    </div>
                    <p><strong>3.</strong> Přejdi na <strong>Import</strong> a vlož screenshot tiketu pomocí Ctrl+V</p>
                    <p><strong>4.</strong> Sleduj statistiky na <strong>Dashboard</strong> 📊</p>
                </div>
            </div>
        </div>
    );
}
