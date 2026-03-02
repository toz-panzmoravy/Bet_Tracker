"use client";

import { useEffect } from "react";

export default function MarketTypeModal({ isOpen, onClose, onSubmit, editingId, formData, setFormData, sports = [] }) {
    useEffect(() => {
        if (!isOpen) return;
        function handleKeyDown(e) {
            if (e.key === "Escape") {
                e.preventDefault();
                onClose?.();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const toggleSport = (sportId) => {
        const currentIds = formData.sport_ids || [];
        if (currentIds.includes(sportId)) {
            setFormData({ ...formData, sport_ids: currentIds.filter(id => id !== sportId) });
        } else {
            setFormData({ ...formData, sport_ids: [...currentIds, sportId] });
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 600 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
                        {editingId ? "✏️ Upravit typ sázky" : "➕ Nový typ sázky"}
                    </h2>
                    <button className="btn-icon" onClick={onClose} style={{ fontSize: "1.5rem" }}>×</button>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); onSubmit(e); }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                                Název typu sázky
                            </label>
                            <input
                                className="input"
                                placeholder="např. Over 2.5 gólů"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                                Platné pro sporty
                            </label>
                            <div style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                                gap: 8,
                                background: "rgba(255,255,255,0.03)",
                                padding: "12px",
                                borderRadius: "12px",
                                border: "1px solid var(--color-border)"
                            }}>
                                {sports.map(sport => (
                                    <label key={sport.id} style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        fontSize: "0.85rem",
                                        cursor: "pointer",
                                        padding: "6px 8px",
                                        borderRadius: "8px",
                                        background: (formData.sport_ids || []).includes(sport.id) ? "var(--color-accent-soft)" : "transparent",
                                        transition: "all 0.2s"
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={(formData.sport_ids || []).includes(sport.id)}
                                            onChange={() => toggleSport(sport.id)}
                                        />
                                        <span>{sport.icon} {sport.name}</span>
                                    </label>
                                ))}
                            </div>
                            <p style={{ margin: "6px 0 0 4px", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                                {(formData.sport_ids || []).length === 0 ? "💡 Ponech prázdné pro všechny sporty" : `💡 Vybráno ${formData.sport_ids.length} sportů`}
                            </p>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                                Popis (volitelný)
                            </label>
                            <textarea
                                className="input"
                                placeholder="Doplňující informace o tomto typu sázky..."
                                style={{ minHeight: 80, resize: "vertical" }}
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem", marginTop: "1rem" }}>
                            <button type="button" className="btn btn-ghost" onClick={onClose}>
                                Zrušit
                            </button>
                            <button type="submit" className="btn btn-primary">
                                {editingId ? "Uložit změny" : "Vytvořit typ"}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <style jsx>{`
        .btn-icon {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--color-text-muted);
          transition: color 0.2s;
        }
        .btn-icon:hover {
          color: var(--color-text-primary);
        }
      `}</style>
        </div>
    );
}
