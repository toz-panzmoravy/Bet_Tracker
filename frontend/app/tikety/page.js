"use client";
import { useState, useEffect } from "react";
import { getTickets, deleteTicket, updateTicket, getSports, getBookmakers } from "../lib/api";
import { useToast } from "../components/Toast";
import { TicketsSkeleton } from "../components/Skeletons";
import Confetti from "../components/Confetti";

const STATUS_MAP = {
    won: { label: "Výhra", class: "badge-won", icon: "✅" },
    lost: { label: "Prohra", class: "badge-lost", icon: "❌" },
    open: { label: "Čeká", class: "badge-open", icon: "⏳" },
    void: { label: "Vráceno", class: "badge-void", icon: "↩️" },
    half_win: { label: "½ Výhra", class: "badge-won", icon: "✅" },
    half_loss: { label: "½ Prohra", class: "badge-lost", icon: "❌" },
};

const STATUS_OPTIONS = ["open", "won", "lost", "void", "half_win", "half_loss"];

function InlineStatusSelect({ ticket, onUpdate }) {
    const [updating, setUpdating] = useState(false);

    async function handleChange(e) {
        const newStatus = e.target.value;
        if (newStatus === ticket.status) return;
        setUpdating(true);
        await onUpdate(ticket.id, newStatus);
        setUpdating(false);
    }

    const statusClass = ticket.status === "won" || ticket.status === "half_win" ? "won"
        : ticket.status === "lost" || ticket.status === "half_loss" ? "lost"
            : ticket.status === "void" ? "void" : "open";

    return (
        <select
            className={`status-select ${statusClass}`}
            value={ticket.status}
            onChange={handleChange}
            disabled={updating}
            style={{
                ...updating ? { opacity: 0.5 } : {},
                cursor: "pointer",
                padding: "4px 28px 4px 12px",
                borderRadius: "20px",
                border: "1px solid rgba(255,255,255,0.1)",
                fontWeight: 600,
                fontSize: "0.75rem"
            }}
        >
            {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s} style={{ background: "#222", color: "#fff" }}>
                    {STATUS_MAP[s].icon} {STATUS_MAP[s].label}
                </option>
            ))}
        </select>
    );
}

/* ─── Edit Ticket Modal ────────────────────────────────── */

function EditTicketModal({ ticket, onClose, onSave, sports, bookmakers }) {
    const [form, setForm] = useState({ ...ticket });
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(ticket.id, form);
            onClose();
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                    <h2 style={{ fontSize: "1.1rem", fontWeight: 700 }}>✏️ Upravit tiket</h2>
                    <button className="btn btn-ghost" onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Domácí</label>
                            <input className="input" style={{ width: "100%" }} value={form.home_team || ""} onChange={e => setForm({ ...form, home_team: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Hosté</label>
                            <input className="input" style={{ width: "100%" }} value={form.away_team || ""} onChange={e => setForm({ ...form, away_team: e.target.value })} />
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Typ sázky (např. 1X2)</label>
                            <input className="input" style={{ width: "100%" }} value={form.market_label || form.market_type || ""} onChange={e => setForm({ ...form, market_label: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Sázka / Výběr</label>
                            <input className="input" style={{ width: "100%" }} value={form.selection || ""} onChange={e => setForm({ ...form, selection: e.target.value })} />
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Kurz</label>
                            <input type="number" step="0.01" className="input" style={{ width: "100%" }} value={form.odds || ""} onChange={e => setForm({ ...form, odds: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Vklad</label>
                            <input type="number" className="input" style={{ width: "100%" }} value={form.stake || ""} onChange={e => setForm({ ...form, stake: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Výhra</label>
                            <input type="number" className="input" style={{ width: "100%" }} value={form.payout || ""} onChange={e => setForm({ ...form, payout: e.target.value })} />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Sport</label>
                            <select className="input" style={{ width: "100%" }} value={form.sport_id || ""} onChange={e => setForm({ ...form, sport_id: e.target.value })}>
                                {sports.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={loading}>Zrušit</button>
                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>{loading ? "Ukládám..." : "Uložit změny"}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function TiketyPage() {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({});
    const [sports, setSports] = useState([]);
    const [bookmakers, setBookmakers] = useState([]);
    const [sortBy, setSortBy] = useState("created_at");
    const [sortDir, setSortDir] = useState("desc");
    const [showConfetti, setShowConfetti] = useState(false);
    const [editingTicket, setEditingTicket] = useState(null);
    const toast = useToast();

    useEffect(() => {
        getSports().then(setSports).catch(() => { });
        getBookmakers().then(setBookmakers).catch(() => { });
    }, []);

    useEffect(() => {
        loadTickets();
    }, [filters, sortBy, sortDir]);

    async function loadTickets() {
        setLoading(true);
        try {
            const data = await getTickets({ ...filters, sort_by: sortBy, sort_dir: sortDir });
            setTickets(data);
        } catch (e) {
            toast.error("Chyba načítání tiketů: " + e.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleUpdateTicket(id, data) {
        try {
            const updated = await updateTicket(id, data);
            setTickets((prev) =>
                prev.map((t) => (t.id === id ? { ...t, ...updated } : t))
            );
            toast.success("✅ Tiket byl aktualizován");
        } catch (e) {
            toast.error("Chyba při ukládání: " + e.message);
        }
    }

    async function handleStatusUpdate(id, newStatus) {
        try {
            const updated = await updateTicket(id, { status: newStatus });
            setTickets((prev) =>
                prev.map((t) => (t.id === id ? { ...t, ...updated } : t))
            );

            const st = STATUS_MAP[newStatus];
            toast.success(`${st.icon} Status změněn na: ${st.label}`);

            // Check for win streak confetti
            if (newStatus === "won") {
                const sorted = [...tickets].sort((a, b) =>
                    new Date(b.created_at) - new Date(a.created_at)
                );
                // Count consecutive wins from top (most recent)
                let streak = 1; // counting the one we just changed
                for (const t of sorted) {
                    if (t.id === id) continue; // skip the one we just changed
                    if (t.status === "won" || t.status === "half_win") streak++;
                    else break;
                }
                if (streak >= 3) {
                    setShowConfetti(true);
                    toast.success(`🔥 ${streak}× výherní série! Parádní!`);
                }
            }
        } catch (e) {
            toast.error("Chyba: " + e.message);
        }
    }

    async function handleDelete(id) {
        if (!confirm("Opravdu smazat tento tiket?")) return;
        try {
            await deleteTicket(id);
            setTickets((prev) => prev.filter((t) => t.id !== id));
            toast.success("🗑 Tiket smazán");
        } catch (e) {
            toast.error("Chyba: " + e.message);
        }
    }

    function handleSort(col) {
        if (sortBy === col) {
            setSortDir(sortDir === "desc" ? "asc" : "desc");
        } else {
            setSortBy(col);
            setSortDir("desc");
        }
    }

    function SortIndicator({ col }) {
        if (sortBy !== col) return null;
        return <span style={{ marginLeft: 4 }}>{sortDir === "desc" ? "↓" : "↑"}</span>;
    }

    const totalProfit = tickets.reduce((sum, t) => sum + Number(t.profit || 0), 0);
    const totalStake = tickets.reduce((sum, t) => sum + Number(t.stake || 0), 0);

    return (
        <div>
            <Confetti active={showConfetti} onDone={() => setShowConfetti(false)} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>🎫 Tikety</h1>
                    <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                        {tickets.length} tiketů • Vklad: {totalStake.toLocaleString("cs-CZ")} Kč •
                        Profit: <span style={{ color: totalProfit >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
                            {totalProfit.toLocaleString("cs-CZ")} Kč
                        </span>
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="glass-card" style={{ padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <select className="input" style={{ width: 150 }}
                    value={filters.sport_id || ""}
                    onChange={(e) => setFilters({ ...filters, sport_id: e.target.value || undefined })}
                >
                    <option value="">Všechny sporty</option>
                    {sports.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                </select>
                <select className="input" style={{ width: 130 }}
                    value={filters.status || ""}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
                >
                    <option value="">Všechny statusy</option>
                    <option value="won">✅ Výhra</option>
                    <option value="lost">❌ Prohra</option>
                    <option value="open">⏳ Čeká</option>
                    <option value="void">↩️ Vráceno</option>
                </select>
                <select className="input" style={{ width: 140 }}
                    value={filters.is_live ?? ""}
                    onChange={(e) => setFilters({ ...filters, is_live: e.target.value === "" ? undefined : e.target.value === "true" })}
                >
                    <option value="">Live + Prematch</option>
                    <option value="true">🔴 Live</option>
                    <option value="false">📋 Prematch</option>
                </select>
                <input type="date" className="input" style={{ width: 150 }}
                    value={filters.date_from || ""}
                    onChange={(e) => setFilters({ ...filters, date_from: e.target.value || undefined })}
                />
                <input type="date" className="input" style={{ width: 150 }}
                    value={filters.date_to || ""}
                    onChange={(e) => setFilters({ ...filters, date_to: e.target.value || undefined })}
                />
                {Object.keys(filters).length > 0 && (
                    <button className="btn btn-ghost" onClick={() => setFilters({})}>✕ Reset</button>
                )}
            </div>

            {/* Table */}
            <div className="glass-card" style={{ overflow: "auto" }}>
                {loading ? (
                    <div style={{ padding: "1.25rem" }}>
                        <TicketsSkeleton />
                    </div>
                ) : tickets.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "4rem", color: "var(--color-text-muted)" }}>
                        <p style={{ fontSize: "2rem", marginBottom: 8 }}>🎫</p>
                        <p>Zatím nemáš žádné tikety.</p>
                        <p style={{ fontSize: "0.8rem" }}>Přejdi na <strong>Import</strong> a vlož screenshot z Tipsportu.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th onClick={() => handleSort("created_at")} style={{ cursor: "pointer" }}>
                                    Datum <SortIndicator col="created_at" />
                                </th>
                                <th>Sport</th>
                                <th>Zápas</th>
                                <th>Typ sázky</th>
                                <th>Výběr</th>
                                <th onClick={() => handleSort("odds")} style={{ cursor: "pointer" }}>
                                    Kurz <SortIndicator col="odds" />
                                </th>
                                <th onClick={() => handleSort("stake")} style={{ cursor: "pointer" }}>
                                    Vklad <SortIndicator col="stake" />
                                </th>
                                <th>Výhra</th>
                                <th onClick={() => handleSort("profit")} style={{ cursor: "pointer" }}>
                                    Profit <SortIndicator col="profit" />
                                </th>
                                <th>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {tickets.map((t) => {
                                const profit = Number(t.profit || 0);
                                return (
                                    <tr key={t.id}>
                                        <td style={{ whiteSpace: "nowrap" }}>
                                            {t.created_at ? new Date(t.created_at).toLocaleDateString("cs-CZ") : "–"}
                                        </td>
                                        <td>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                                                <span style={{ fontSize: "1.1rem" }}>{t.sport?.icon}</span>
                                                <span>{t.sport?.name || "–"}</span>
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: 500 }}>
                                            {t.home_team} – {t.away_team}
                                            {t.is_live && <span style={{ marginLeft: 6, fontSize: "0.7rem", background: "var(--color-red-soft)", color: "var(--color-red)", padding: "2px 6px", borderRadius: 6 }}>LIVE</span>}
                                        </td>
                                        <td style={{ color: "var(--color-text-secondary)" }}>{t.market_label || t.market_type || "–"}</td>
                                        <td>{t.selection || "–"}</td>
                                        <td style={{ fontWeight: 600 }}>{Number(t.odds).toFixed(2)}</td>
                                        <td>{Number(t.stake).toLocaleString("cs-CZ")} Kč</td>
                                        <td>{t.payout ? `${Number(t.payout).toLocaleString("cs-CZ")} Kč` : "–"}</td>
                                        <td style={{ fontWeight: 600, color: profit > 0 ? "var(--color-green)" : profit < 0 ? "var(--color-red)" : "var(--color-text-secondary)" }}>
                                            {profit > 0 ? "+" : ""}{profit.toLocaleString("cs-CZ")} Kč
                                        </td>
                                        <td>
                                            <InlineStatusSelect ticket={t} onUpdate={handleStatusUpdate} />
                                        </td>
                                        <td style={{ whiteSpace: "nowrap" }}>
                                            <div style={{ display: "flex", gap: 6 }}>
                                                <button
                                                    className="btn btn-ghost"
                                                    style={{ padding: "4px 8px", fontSize: "0.8rem", border: "1px solid rgba(255,255,255,0.1)" }}
                                                    onClick={() => setEditingTicket(t)}
                                                >✏️</button>
                                                <button
                                                    className="btn btn-danger"
                                                    style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                                                    onClick={() => handleDelete(t.id)}
                                                >🗑</button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {editingTicket && (
                <EditTicketModal
                    ticket={editingTicket}
                    sports={sports}
                    bookmakers={bookmakers}
                    onClose={() => setEditingTicket(null)}
                    onSave={handleUpdateTicket}
                />
            )}
        </div>
    );
}
