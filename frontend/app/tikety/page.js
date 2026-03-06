"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getTickets, deleteTicket, updateTicket, createTicket, getSports, getBookmakers, exportTicketsCsv } from "../lib/api";

const TICKETS_PAGE_SIZE = 50;
const FILTERS_STORAGE_KEY = "bettracker_tickets_filters";

function paramsToState(searchParams) {
    const filters = {};
    const bookmaker_id = searchParams.get("bookmaker_id");
    if (bookmaker_id) filters.bookmaker_id = bookmaker_id;
    const sport_id = searchParams.get("sport_id");
    if (sport_id) filters.sport_id = sport_id;
    const status = searchParams.get("status");
    if (status) filters.status = status;
    const ticket_type = searchParams.get("ticket_type");
    if (ticket_type) filters.ticket_type = ticket_type;
    const date_from = searchParams.get("date_from");
    if (date_from) filters.date_from = date_from;
    const date_to = searchParams.get("date_to");
    if (date_to) filters.date_to = date_to;
    const market_type_id = searchParams.get("market_type_id");
    if (market_type_id) filters.market_type_id = market_type_id;
    const incomplete = searchParams.get("incomplete");
    if (incomplete === "1" || incomplete === "true") filters.incomplete = true;
    const search = searchParams.get("search");
    if (search) filters.search = search;
    const sort_by = searchParams.get("sort_by") || "created_at";
    const sort_dir = searchParams.get("sort_dir") || "desc";
    return { filters, sort_by: sort_by, sort_dir: sort_dir };
}

function stateToParams(filters, sortBy, sortDir) {
    const p = new URLSearchParams();
    if (filters.bookmaker_id) p.set("bookmaker_id", filters.bookmaker_id);
    if (filters.sport_id) p.set("sport_id", filters.sport_id);
    if (filters.status) p.set("status", filters.status);
    if (filters.ticket_type) p.set("ticket_type", filters.ticket_type);
    if (filters.date_from) p.set("date_from", filters.date_from);
    if (filters.date_to) p.set("date_to", filters.date_to);
    if (filters.market_type_id) p.set("market_type_id", filters.market_type_id);
    if (filters.incomplete) p.set("incomplete", "1");
    if (filters.search) p.set("search", filters.search);
    if (sortBy && sortBy !== "created_at") p.set("sort_by", sortBy);
    if (sortDir && sortDir !== "desc") p.set("sort_dir", sortDir);
    return p;
}
import { useToast } from "../components/Toast";
import { TicketsSkeleton } from "../components/Skeletons";
import Confetti from "../components/Confetti";
import ConfirmModal from "../components/ConfirmModal";

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

function EditableNumberCell({ ticket, field, suffix = "", onSave }) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(ticket[field] ?? "");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setValue(ticket[field] ?? "");
    }, [ticket[field]]);

    async function handleSave() {
        const raw = value === "" ? null : Number(value);
        if (raw === ticket[field]) {
            setEditing(false);
            return;
        }
        setSaving(true);
        try {
            await onSave(ticket.id, { [field]: raw });
            setEditing(false);
        } catch (_e) {
            // toast se řeší v parentu přes onSave
        } finally {
            setSaving(false);
        }
    }

    if (!editing) {
        const display =
            ticket[field] == null
                ? "–"
                : field === "stake"
                    ? `${Number(ticket[field]).toLocaleString("cs-CZ")} ${suffix}`.trim()
                    : Number(ticket[field]).toFixed(2);
        return (
            <span
                style={{ cursor: "pointer" }}
                onClick={() => setEditing(true)}
                title="Klikni pro úpravu"
            >
                {display}
            </span>
        );
    }

    return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
                type="number"
                step={field === "odds" ? "0.01" : "1"}
                className="input"
                style={{ width: 90, padding: "4px 8px", fontSize: "0.8rem" }}
                value={value === null ? "" : value}
                onChange={(e) => setValue(e.target.value)}
                disabled={saving}
            />
            <button
                type="button"
                className="btn btn-success"
                style={{ padding: "4px 6px", fontSize: "0.75rem" }}
                onClick={handleSave}
                disabled={saving}
            >
                ✓
            </button>
            <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "4px 6px", fontSize: "0.75rem" }}
                onClick={() => {
                    setValue(ticket[field] ?? "");
                    setEditing(false);
                }}
                disabled={saving}
            >
                ✕
            </button>
        </span>
    );
}

/* ─── Přidat sázku do AKU (inline formulář) ─────────────── */

function AddAkuLegForm({ parent, sports, onSuccess, onCancel, onError }) {
    const [loading, setLoading] = useState(false);
    const [form, setForm] = useState({
        sport_id: parent.sport_id ?? "",
        home_team: "",
        away_team: "",
        market_label: "",
        selection: "",
        odds: "",
        stake: parent.stake ? String(parent.stake) : "",
        status: "open",
    });

    async function handleSubmit(e) {
        e.preventDefault();
        const sportId = form.sport_id ? Number(form.sport_id) : null;
        const odds = form.odds ? Number(form.odds) : null;
        const stake = form.stake ? Number(form.stake) : null;
        if (!sportId || odds == null || stake == null) {
            onError?.("Vyplň alespoň sport, kurz a vklad.");
            return;
        }
        setLoading(true);
        try {
            await createTicket({
                parent_id: parent.id,
                bookmaker_id: parent.bookmaker_id ?? undefined,
                sport_id: sportId,
                home_team: (form.home_team || "").trim() || "-",
                away_team: (form.away_team || "").trim() || "-",
                market_label: (form.market_label || "").trim() || undefined,
                selection: (form.selection || "").trim() || undefined,
                odds,
                stake,
                status: form.status || "open",
                ticket_type: "aku",
            });
            onSuccess?.();
        } catch (err) {
            onError?.(err?.message || "Nepodařilo se přidat sázku.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <tr>
            <td colSpan={12} style={{ padding: "12px 16px", background: "var(--color-bg-card)", borderBottom: "1px solid var(--color-border)", verticalAlign: "top" }}>
                <form onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", maxWidth: 900 }}>
                    <div className="form-group" style={{ minWidth: 120 }}>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>Sport</label>
                        <select className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }} value={form.sport_id} onChange={e => setForm(f => ({ ...f, sport_id: e.target.value }))} required>
                            {sports.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                        </select>
                    </div>
                    <div className="form-group" style={{ minWidth: 100 }}>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>Domácí</label>
                        <input className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }} placeholder="–" value={form.home_team} onChange={e => setForm(f => ({ ...f, home_team: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ minWidth: 100 }}>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>Hosté</label>
                        <input className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }} placeholder="–" value={form.away_team} onChange={e => setForm(f => ({ ...f, away_team: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ minWidth: 90 }}>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>Typ sázky</label>
                        <input className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }} placeholder="1X2" value={form.market_label} onChange={e => setForm(f => ({ ...f, market_label: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ minWidth: 100 }}>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>Výběr</label>
                        <input className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }} value={form.selection} onChange={e => setForm(f => ({ ...f, selection: e.target.value }))} />
                    </div>
                    <div className="form-group" style={{ width: 70 }}>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>Kurz</label>
                        <input type="number" step="0.01" className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }} value={form.odds} onChange={e => setForm(f => ({ ...f, odds: e.target.value }))} required />
                    </div>
                    <div className="form-group" style={{ width: 80 }}>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>Vklad</label>
                        <input type="number" className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }} value={form.stake} onChange={e => setForm(f => ({ ...f, stake: e.target.value }))} required />
                    </div>
                    <div className="form-group" style={{ minWidth: 100 }}>
                        <label style={{ fontSize: "0.7rem", color: "var(--color-text-muted)", display: "block", marginBottom: 2 }}>Stav</label>
                        <select className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_MAP[s].icon} {STATUS_MAP[s].label}</option>)}
                        </select>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ padding: "8px 14px", fontSize: "0.8rem" }} disabled={loading}>{loading ? "Ukládám…" : "Přidat sázku"}</button>
                    <button type="button" className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: "0.8rem" }} onClick={() => onCancel?.()} disabled={loading}>Zrušit</button>
                </form>
            </td>
        </tr>
    );
}

/* ─── Edit Ticket Modal ────────────────────────────────── */

function EditTicketModal({ ticket, onClose, onSave, sports, bookmakers }) {
    const [form, setForm] = useState({ ...ticket });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        function handleKeyDown(e) {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

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
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Sport</label>
                            <select className="input" style={{ width: "100%" }} value={form.sport_id || ""} onChange={e => setForm({ ...form, sport_id: e.target.value })}>
                                {sports.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Sázkovka</label>
                            <select className="input" style={{ width: "100%" }} value={form.bookmaker_id || ""} onChange={e => setForm({ ...form, bookmaker_id: e.target.value })}>
                                {bookmakers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                        </div>
                    </div>
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
                    <div className="form-group">
                        <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Typ tiketu</label>
                        <select className="input" style={{ width: "100%" }} value={form.ticket_type || "solo"} onChange={e => setForm({ ...form, ticket_type: e.target.value })}>
                            <option value="solo">SÓLO (jedna sázka)</option>
                            <option value="aku">AKU (akumulátor)</option>
                        </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Typ sázky</label>
                            <input className="input" style={{ width: "100%" }} value={form.market_label || form.market_type || ""} onChange={e => setForm({ ...form, market_label: e.target.value })} placeholder="např. 1X2" />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Výběr</label>
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
                            <label style={{ fontSize: "0.75rem", color: "#8b8fa3", display: "block", marginBottom: 4 }}>Stav</label>
                            <select className="input" style={{ width: "100%" }} value={form.status || "open"} onChange={e => setForm({ ...form, status: e.target.value })}>
                                {STATUS_OPTIONS.map(s => (
                                    <option key={s} value={s}>{STATUS_MAP[s].icon} {STATUS_MAP[s].label}</option>
                                ))}
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

function TiketyPageContent() {
    const [tickets, setTickets] = useState([]);
    const [totalCount, setTotalCount] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const searchParams = useSearchParams();
    const [filters, setFilters] = useState({});
    const [sports, setSports] = useState([]);
    const [bookmakers, setBookmakers] = useState([]);
    const [sortBy, setSortBy] = useState("created_at");
    const [sortDir, setSortDir] = useState("desc");
    const filtersInitialized = useRef(false);
    const [showConfetti, setShowConfetti] = useState(false);
    const [editingTicket, setEditingTicket] = useState(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [expandedParents, setExpandedParents] = useState({});
    const [addingLegToParentId, setAddingLegToParentId] = useState(null);
    const toast = useToast();

    useEffect(() => {
        getSports().then(setSports).catch(() => { });
        getBookmakers().then(setBookmakers).catch(() => { });
    }, []);

    useEffect(() => {
        if (filtersInitialized.current) return;
        filtersInitialized.current = true;
        const fromUrl = paramsToState(searchParams);
        const hasUrlParams = searchParams.toString().length > 0;
        if (hasUrlParams) {
            setFilters(fromUrl.filters);
            setSortBy(fromUrl.sort_by);
            setSortDir(fromUrl.sort_dir);
        } else {
            try {
                const stored = localStorage.getItem(FILTERS_STORAGE_KEY);
                if (stored) {
                    const { filters: f, sort_by: sb, sort_dir: sd } = JSON.parse(stored);
                    if (f) setFilters(f);
                    if (sb) setSortBy(sb);
                    if (sd) setSortDir(sd);
                }
            } catch (_) { /* ignore */ }
        }
    }, [searchParams]);

    useEffect(() => {
        const params = stateToParams(filters, sortBy, sortDir);
        if (params.toString()) {
            window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
        } else {
            window.history.replaceState(null, "", window.location.pathname);
        }
        try {
            localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify({ filters, sort_by: sortBy, sort_dir: sortDir }));
        } catch (_) { /* ignore */ }
    }, [filters, sortBy, sortDir]);

    useEffect(() => {
        loadTickets(false);
    }, [filters, sortBy, sortDir]);

    async function loadTickets(append = false) {
        const offset = append ? tickets.length : 0;
        if (!append) setLoading(true);
        else setLoadingMore(true);
        try {
            const params = { ...filters, sort_by: sortBy, sort_dir: sortDir, limit: TICKETS_PAGE_SIZE, offset };
            if (filters.incomplete) params.incomplete = 1;
            const data = await getTickets(params);
            const items = data.items ?? data;
            const total = data.total ?? items.length;
            setTotalCount(total);
            setHasMore(items.length >= TICKETS_PAGE_SIZE);
            if (append) {
                setTickets((prev) => [...prev, ...items]);
            } else {
                setTickets(items);
            }
        } catch (e) {
            toast.error("Chyba načítání tiketů: " + e.message);
        } finally {
            setLoading(false);
            setLoadingMore(false);
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
            const payload = { status: newStatus };
            const ticket = tickets.find((t) => t.id === id);
            if (newStatus === "won" && ticket && (!ticket.payout || Number(ticket.payout) === 0)) {
                const odds = Number(ticket.odds) || 0;
                const stake = Number(ticket.stake) || 0;
                if (odds && stake) payload.payout = odds * stake;
            }
            const updated = await updateTicket(id, payload);
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

    function handleDeleteClick(id) {
        setDeleteConfirmId(id);
    }

    async function confirmDelete() {
        const id = deleteConfirmId;
        setDeleteConfirmId(null);
        if (id == null) return;
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

    // Do statistik počítáme jen sólové tikety a děti AKU (rodiče AKU ne – ti jsou jen „obal“)
    const statsTickets = tickets.filter((t) => t.parent_id != null || t.ticket_type !== "aku");
    const totalProfit = statsTickets.reduce((sum, t) => sum + Number(t.profit || 0), 0);
    const totalStake = statsTickets.reduce((sum, t) => sum + Number(t.stake || 0), 0);

    const childrenByParent = tickets.reduce((acc, t) => {
        if (t.parent_id != null) {
            if (!acc[t.parent_id]) acc[t.parent_id] = [];
            acc[t.parent_id].push(t);
        }
        return acc;
    }, {});

    const parentTickets = tickets.filter((t) => t.parent_id == null);

    /** Pro rodiče AKU: odvozené hodnoty z dětí (kombinovaný kurz = součin, status = musí vyjít všechny). */
    function getAkuAggregate(children) {
        if (!children?.length) return null;
        const combinedOdds = children.reduce((acc, c) => acc * Number(c.odds || 1), 1);
        const hasLost = children.some((c) => c.status === "lost" || c.status === "half_loss");
        const hasOpen = children.some((c) => c.status === "open");
        const allVoid = children.length > 0 && children.every((c) => c.status === "void");
        const derivedStatus = hasLost ? "lost" : hasOpen ? "open" : allVoid ? "void" : "won";
        return { combinedOdds, derivedStatus };
    }

    function renderTicketRow(t, { isChild, isAkuParent }) {
        const children = isAkuParent ? (childrenByParent[t.id] || []) : [];
        const akuAggregate = isAkuParent && children.length > 0 ? getAkuAggregate(children) : null;
        const effectiveOdds = (akuAggregate && (t.odds != null && Number(t.odds) > 0))
            ? Number(t.odds)
            : (akuAggregate?.combinedOdds ?? 0);
        const profit = Number(t.profit || 0);
        const isIncompleteRow = !!filters.incomplete;
        const rowStyle = {};

        if (isAkuParent) {
            rowStyle.background = "var(--color-bg-card-hover)";
        } else if (isChild) {
            rowStyle.background = "var(--color-bg-card)";
        }
        if (isIncompleteRow) {
            rowStyle.borderLeft = "3px solid var(--color-yellow)";
        }

        const bookmakerStyle = t.bookmaker
            ? {
                fontSize: "0.75rem",
                padding: "2px 6px",
                borderRadius: "999px",
                border: "1px solid var(--color-border-hover)",
                color: "var(--color-text-secondary)",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "24px",
                textAlign: "center",
                background: t.bookmaker.name === "Tipsport"
                    ? "rgba(59,130,246,0.15)"
                    : t.bookmaker.name === "Betano"
                        ? "rgba(249,115,22,0.15)"
                        : "transparent",
            }
            : null;

        const childCount = isAkuParent ? (childrenByParent[t.id]?.length || 0) : 0;

        return (
            <tr key={`${isChild ? "child" : "row"}-${t.id}`} style={rowStyle}>
                <td style={{ whiteSpace: "nowrap", paddingLeft: isChild ? 28 : undefined }}>
                    {isAkuParent && (
                        <button
                            type="button"
                            onClick={() =>
                                setExpandedParents((prev) => ({
                                    ...prev,
                                    [t.id]: !prev[t.id],
                                }))
                            }
                            style={{
                                marginRight: 6,
                                cursor: "pointer",
                                background: "transparent",
                                border: "none",
                                color: "var(--color-text-muted)",
                                padding: 0,
                            }}
                            aria-label={expandedParents[t.id] ? "Skrýt pod-sázky" : "Zobrazit pod-sázky"}
                        >
                            {expandedParents[t.id] ? "▾" : "▸"}
                        </button>
                    )}
                    {isChild && !isAkuParent && (
                        <span style={{ marginRight: 6, color: "var(--color-text-muted)" }}>↳</span>
                    )}
                    {t.created_at ? new Date(t.created_at).toLocaleDateString("cs-CZ") : "–"}
                </td>
                <td>
                    {t.bookmaker && (
                        <span style={bookmakerStyle} title={t.bookmaker.name}>
                            {(t.bookmaker.name || "?")[0]}
                        </span>
                    )}
                </td>
                <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: "1.1rem" }}>{t.sport?.icon}</span>
                        <span>{t.sport?.name || "–"}</span>
                        {(t.ticket_type === "aku" || t.ticket_type === "solo") && !isChild && (
                            <span style={{
                                fontSize: "0.65rem",
                                padding: "2px 5px",
                                borderRadius: 4,
                                background: t.ticket_type === "aku" ? "var(--color-accent-soft)" : "rgba(255,255,255,0.06)",
                                color: t.ticket_type === "aku" ? "var(--color-accent)" : "var(--color-text-muted)",
                                fontWeight: 600,
                            }}>
                                {t.ticket_type === "aku" ? "AKU" : "SÓLO"}
                            </span>
                        )}
                        {isAkuParent && childCount > 0 && (
                            <span style={{
                                fontSize: "0.7rem",
                                color: "var(--color-text-secondary)",
                            }}>
                                • {childCount} sázky
                            </span>
                        )}
                        {isIncompleteRow && (
                            <span style={{
                                fontSize: "0.65rem",
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: "var(--color-yellow-soft)",
                                color: "var(--color-yellow)",
                                fontWeight: 600,
                            }}>
                                K&nbsp;doplnění
                            </span>
                        )}
                    </div>
                </td>
                <td style={{ fontWeight: 500, paddingLeft: isChild ? 20 : undefined }}>
                    {akuAggregate
                        ? `AKU (${children.length} sázek)`
                        : <>{t.home_team} – {t.away_team}</>
                    }
                </td>
                <td style={{ color: "var(--color-text-secondary)" }}>
                    {akuAggregate ? "Kombinace" : (t.market_label || t.market_type || "–")}
                </td>
                <td>{akuAggregate ? "–" : (t.selection || "–")}</td>
                <td style={{ fontWeight: 600 }} title={akuAggregate ? "Celkový kurz AKU (lze upravit)" : undefined}>
                    <EditableNumberCell ticket={t} field="odds" onSave={handleUpdateTicket} />
                </td>
                <td title={akuAggregate ? "Jeden vklad na celý AKU (lze upravit)" : undefined}>
                    {isChild
                        ? <span title="Vklad je jeden u celého AKU (u rodiče)">–</span>
                        : <EditableNumberCell ticket={t} field="stake" suffix="Kč" onSave={handleUpdateTicket} />
                    }
                </td>
                <td>
                    {akuAggregate
                        ? (akuAggregate.derivedStatus === "won" && t.stake != null && effectiveOdds > 0
                            ? `${(Number(t.stake) * effectiveOdds).toLocaleString("cs-CZ")} Kč`
                            : (akuAggregate.derivedStatus === "lost" || akuAggregate.derivedStatus === "half_loss")
                                ? "0 Kč"
                                : "–")
                        : (t.payout ? `${Number(t.payout).toLocaleString("cs-CZ")} Kč` : "–")
                    }
                </td>
                <td style={{
                    fontWeight: 600,
                    color: profit > 0 ? "var(--color-green)" : profit < 0 ? "var(--color-red)" : "var(--color-text-secondary)"
                }}>
                    {akuAggregate && t.stake != null
                        ? (akuAggregate.derivedStatus === "won" && effectiveOdds > 0
                            ? `+${(Number(t.stake) * (effectiveOdds - 1)).toLocaleString("cs-CZ")} Kč`
                            : akuAggregate.derivedStatus === "lost" || akuAggregate.derivedStatus === "half_loss"
                                ? `-${Number(t.stake).toLocaleString("cs-CZ")} Kč`
                                : "–")
                        : <>{profit > 0 ? "+" : ""}{profit.toLocaleString("cs-CZ")} Kč</>
                    }
                </td>
                <td>
                    {akuAggregate
                        ? (
                            <span
                                className={`badge-${akuAggregate.derivedStatus === "won" || akuAggregate.derivedStatus === "half_win" ? "won" : akuAggregate.derivedStatus === "lost" || akuAggregate.derivedStatus === "half_loss" ? "lost" : akuAggregate.derivedStatus === "void" ? "void" : "open"}`}
                                style={{ padding: "4px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 600 }}
                                title="Odvozeno z výsledků všech sázek v AKU"
                            >
                                {STATUS_MAP[akuAggregate.derivedStatus]?.icon} {STATUS_MAP[akuAggregate.derivedStatus]?.label ?? akuAggregate.derivedStatus}
                            </span>
                        )
                        : <InlineStatusSelect ticket={t} onUpdate={handleStatusUpdate} />
                    }
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
                            onClick={() => handleDeleteClick(t.id)}
                        >🗑</button>
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <div>
            <Confetti active={showConfetti} onDone={() => setShowConfetti(false)} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>🎫 Tikety</h1>
                    <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                        {totalCount != null ? `Zobrazeno ${tickets.length} z ${totalCount}` : `${tickets.length} tiketů`}
                        {" • "}Vklad: {totalStake.toLocaleString("cs-CZ")} Kč •
                        Profit: <span style={{ color: totalProfit >= 0 ? "var(--color-green)" : "var(--color-red)" }}>
                            {totalProfit.toLocaleString("cs-CZ")} Kč
                        </span>
                    </p>
                </div>
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={async () => {
                        try {
                            await exportTicketsCsv({ ...filters, sort_by: sortBy, sort_dir: sortDir });
                            toast.success("Export CSV stažen");
                        } catch (e) {
                            toast.error("Export selhal: " + e.message);
                        }
                    }}
                >
                    📥 Export CSV
                </button>
            </div>

            {/* Filters */}
            <div className="glass-card" style={{ padding: "1rem 1.25rem", marginBottom: "1.5rem", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <select className="input" style={{ width: 150 }}
                    value={filters.bookmaker_id || ""}
                    onChange={(e) => setFilters({ ...filters, bookmaker_id: e.target.value || undefined })}
                >
                    <option value="">Všechny sázkovky</option>
                    {bookmakers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
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
                <select className="input" style={{ width: 120 }}
                    value={filters.ticket_type || ""}
                    onChange={(e) => setFilters({ ...filters, ticket_type: e.target.value || undefined })}
                >
                    <option value="">Typ: vše</option>
                    <option value="solo">SÓLO</option>
                    <option value="aku">AKU</option>
                </select>
                <input type="date" className="input" style={{ width: 150 }}
                    value={filters.date_from || ""}
                    onChange={(e) => setFilters({ ...filters, date_from: e.target.value || undefined })}
                />
                <input type="date" className="input" style={{ width: 150 }}
                    value={filters.date_to || ""}
                    onChange={(e) => setFilters({ ...filters, date_to: e.target.value || undefined })}
                />
                <input
                    type="text"
                    className="input"
                    style={{ width: 220 }}
                    placeholder="Hledat (tým, liga, trh, výběr)"
                    value={filters.search || ""}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer", whiteSpace: "nowrap" }}>
                    <input
                        type="checkbox"
                        checked={!!filters.incomplete}
                        onChange={(e) => setFilters({ ...filters, incomplete: e.target.checked || undefined })}
                    />
                    <span>Jen neúplné</span>
                </label>
                {Object.keys(filters).length > 0 && (
                    <button className="btn btn-ghost" onClick={() => setFilters({})}>✕ Reset</button>
                )}
            </div>

            {/* Table */}
            <div className="glass-card tickets-table-wrapper" style={{ overflow: "auto" }}>
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
                                <th onClick={() => handleSort("event_date")} style={{ cursor: "pointer" }}>
                                    Datum <SortIndicator col="event_date" />
                                </th>
                                <th>Sázkovka</th>
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
                            {parentTickets.map((t) => {
                                const isAkuParent = t.ticket_type === "aku";
                                const rows = [];
                                rows.push(renderTicketRow(t, { isChild: false, isAkuParent }));
                                if (isAkuParent && expandedParents[t.id]) {
                                    const children = childrenByParent[t.id] || [];
                                    children.forEach((child) => {
                                        rows.push(renderTicketRow(child, { isChild: true, isAkuParent: false }));
                                    });
                                    if (addingLegToParentId === t.id) {
                                        rows.push(
                                            <AddAkuLegForm
                                                key={`add-leg-${t.id}`}
                                                parent={t}
                                                sports={sports}
                                                onSuccess={async () => {
                                                    await loadTickets(false);
                                                    setAddingLegToParentId(null);
                                                    toast.success("Sázka přidána do AKU");
                                                }}
                                                onCancel={() => setAddingLegToParentId(null)}
                                                onError={(msg) => toast.error(msg)}
                                            />
                                        );
                                    } else {
                                        rows.push(
                                            <tr key={`add-leg-btn-${t.id}`}>
                                                <td colSpan={12} style={{ padding: "8px 16px", background: "var(--color-bg-card)", borderBottom: "1px solid var(--color-border)" }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost"
                                                        style={{ fontSize: "0.85rem", padding: "6px 12px", border: "1px dashed rgba(255,255,255,0.2)" }}
                                                        onClick={() => setAddingLegToParentId(t.id)}
                                                    >
                                                        ➕ Přidat sázku do AKU
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    }
                                }
                                return rows;
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {!loading && tickets.length > 0 && hasMore && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                    <button
                        className="btn btn-ghost"
                        onClick={() => loadTickets(true)}
                        disabled={loadingMore}
                        style={{ padding: "10px 24px" }}
                    >
                        {loadingMore ? "Načítám…" : "Načíst další"}
                    </button>
                </div>
            )}

            {editingTicket && (
                <EditTicketModal
                    ticket={editingTicket}
                    sports={sports}
                    bookmakers={bookmakers}
                    onClose={() => setEditingTicket(null)}
                    onSave={handleUpdateTicket}
                />
            )}

            <ConfirmModal
                open={deleteConfirmId != null}
                title="Smazat tiket?"
                message="Tato akce je nevratná."
                confirmLabel="Smazat"
                cancelLabel="Zrušit"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteConfirmId(null)}
            />
        </div>
    );
}

export default function TiketyPage() {
    return (
        <Suspense fallback={<TicketsSkeleton />}>
            <TiketyPageContent />
        </Suspense>
    );
}
