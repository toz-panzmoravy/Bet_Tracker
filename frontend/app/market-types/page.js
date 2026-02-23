"use client";

import { useState, useEffect, useMemo } from "react";
import {
    getMarketTypeStats,
    createMarketType,
    updateMarketType,
    deleteMarketType,
    getSports
} from "../lib/api";
import MarketTypeModal from "./MarketTypeModal";
import MarketTypeKPIs from "./MarketTypeKPIs";

export default function MarketTypesPage() {
    const [marketTypes, setMarketTypes] = useState([]);
    const [sports, setSports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ name: "", description: "", sport_ids: [] });

    useEffect(() => {
        loadData();
        getSports().then(setSports).catch(() => { });
    }, []);

    async function loadData() {
        try {
            setLoading(true);
            const data = await getMarketTypeStats();
            setMarketTypes(data);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    const filteredMarketTypes = useMemo(() => {
        return marketTypes.filter(mt =>
            mt.name.toLowerCase().includes(search.toLowerCase()) ||
            (mt.description && mt.description.toLowerCase().includes(search.toLowerCase()))
        );
    }, [marketTypes, search]);

    async function handleSubmit(e) {
        try {
            if (editingId) {
                await updateMarketType(editingId, formData);
            } else {
                await createMarketType(formData);
            }
            setIsModalOpen(false);
            setEditingId(null);
            setFormData({ name: "", description: "" });
            loadData();
        } catch (e) {
            alert("Chyba: " + e.message);
        }
    }

    async function handleDelete(id) {
        if (!confirm("Opravdu smazat tento typ sázky?")) return;
        try {
            await deleteMarketType(id);
            loadData();
        } catch (e) {
            alert("Chyba: " + e.message);
        }
    }

    const openCreateModal = () => {
        setEditingId(null);
        setFormData({ name: "", description: "", sport_ids: [] });
        setIsModalOpen(true);
    };

    const openEditModal = (mt) => {
        setEditingId(mt.id);
        const sportIds = mt.sports ? mt.sports.map(s => s.id) : [];
        setFormData({
            name: mt.name,
            description: mt.description || "",
            sport_ids: sportIds
        });
        setIsModalOpen(true);
    };

    if (loading && marketTypes.length === 0) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
                <div className="spinner" style={{ width: 40, height: 40 }} />
            </div>
        );
    }

    return (
        <div className="container" style={{ maxWidth: 1100, margin: "0 auto", padding: "1rem" }}>
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "2.5rem" }}>
                <div>
                    <h1 style={{ fontSize: "1.85rem", fontWeight: 800, marginBottom: "0.5rem", letterSpacing: "-0.02em" }}>
                        🧩 Typy sázek
                    </h1>
                    <p style={{ color: "var(--color-text-secondary)", fontSize: "0.95rem" }}>
                        Správa kategorií sázek a jejich výkonnostní metriky
                    </p>
                </div>
                <button className="btn btn-primary" onClick={openCreateModal}>
                    ➕ Přidat typ sázky
                </button>
            </header>

            <MarketTypeKPIs marketTypes={marketTypes} />

            {error && (
                <div className="glass-card" style={{ padding: "1rem", marginBottom: "2rem", borderLeft: "4px solid var(--color-red)", background: "var(--color-red-soft)" }}>
                    <p style={{ margin: 0, color: "var(--color-red)", fontWeight: 600 }}>⚠️ {error}</p>
                </div>
            )}

            <div className="glass-card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <h2 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>📋 Seznam kategorií</h2>
                    <div style={{ position: "relative", width: "300px" }}>
                        <input
                            className="input"
                            placeholder="Hledat podle názvu nebo popisu..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{ paddingLeft: "2.5rem" }}
                        />
                        <span style={{ position: "absolute", left: "1rem", top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}>🔍</span>
                    </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th style={{ width: "35%" }}>Typ sázky</th>
                                <th style={{ textAlign: "center" }}>Počet sázek</th>
                                <th style={{ width: "25%" }}>Úspěšnost (Win Rate)</th>
                                <th style={{ textAlign: "right" }}>Celkový Profit</th>
                                <th style={{ textAlign: "right", width: "100px" }}>Akce</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredMarketTypes.map((mt) => (
                                <tr key={mt.id}>
                                    <td>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                                            {mt.sports && mt.sports.map(s => (
                                                <span key={s.id} title={s.name} style={{ fontSize: "0.8rem", background: "rgba(255,255,255,0.05)", padding: "2px 4px", borderRadius: "4px" }}>
                                                    {s.icon}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: 2 }}>{mt.name}</div>
                                        <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {mt.description || "Žádný popis"}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: "center" }}>
                                        <span className="badge" style={{ background: "rgba(255,255,255,0.05)", color: "var(--color-text-secondary)" }}>
                                            {mt.bets_count}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                            <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.05)", borderRadius: "10px", overflow: "hidden" }}>
                                                <div style={{
                                                    width: `${mt.win_rate}%`,
                                                    height: "100%",
                                                    background: mt.win_rate >= 50 ? "var(--color-green)" : mt.win_rate >= 30 ? "var(--color-yellow)" : "var(--color-red)",
                                                    borderRadius: "10px",
                                                    boxShadow: `0 0 10px ${mt.win_rate >= 50 ? "var(--color-green-soft)" : mt.win_rate >= 30 ? "var(--color-yellow-soft)" : "var(--color-red-soft)"}`
                                                }} />
                                            </div>
                                            <span style={{
                                                fontSize: "0.85rem",
                                                fontWeight: 700,
                                                color: mt.win_rate >= 50 ? "var(--color-green)" : mt.win_rate >= 30 ? "var(--color-yellow)" : "var(--color-red)"
                                            }}>
                                                {mt.win_rate}%
                                            </span>
                                        </div>
                                    </td>
                                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                                        <span style={{
                                            color: mt.profit > 0 ? "var(--color-green)" : mt.profit < 0 ? "var(--color-red)" : "inherit",
                                            background: mt.profit > 0 ? "var(--color-green-soft)" : mt.profit < 0 ? "var(--color-red-soft)" : "transparent",
                                            padding: "4px 8px",
                                            borderRadius: "6px"
                                        }}>
                                            {mt.profit > 0 ? "+" : ""}{mt.profit.toLocaleString()} CZK
                                        </span>
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                                            <button className="btn-icon-v2" onClick={() => openEditModal(mt)} title="Upravit">✏️</button>
                                            <button className="btn-icon-v2 danger" onClick={() => handleDelete(mt.id)} title="Smazat">🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredMarketTypes.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: "center", padding: "4rem", color: "var(--color-text-muted)" }}>
                                        {search ? `Žádné výsledky pro "${search}"` : "Zatím nebyly vytvořeny žádné typy sázek."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <MarketTypeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleSubmit}
                editingId={editingId}
                formData={formData}
                setFormData={setFormData}
                sports={sports}
            />

            <style jsx>{`
                .btn-icon-v2 {
                    background: transparent;
                    border: 1px solid transparent;
                    padding: 6px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-size: 1rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--color-text-secondary);
                }
                .btn-icon-v2:hover {
                    background: var(--color-bg-card-hover);
                    border-color: var(--color-border-hover);
                    color: var(--color-text-primary);
                    transform: translateY(-1px);
                }
                .btn-icon-v2.danger:hover {
                    background: var(--color-red-soft);
                    border-color: var(--color-red);
                    color: var(--color-red);
                }
            `}</style>
        </div>
    );
}
