"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { ocrParseBase64, createTicket, getSports, getLeagues, getBookmakers, getMarketTypes, getTopMarketTypes, createMarketType, checkOcrHealth } from "../lib/api";

const EMPTY_TICKET = {
    home_team: "", away_team: "", sport: "", league: "",
    market_label: "", selection: "", odds: "", stake: "",
    payout: "", status: "open", is_live: false,
};

export default function ImportPage() {
    const [image, setImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [parsedTickets, setParsedTickets] = useState([]);
    const [rawText, setRawText] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [sports, setSports] = useState([]);
    const [leagues, setLeagues] = useState([]);
    const [bookmakers, setBookmakers] = useState([]);
    const [marketTypes, setMarketTypes] = useState([]);
    const [showManual, setShowManual] = useState(false);
    const [ocrError, setOcrError] = useState("");
    const [restartStatus, setRestartStatus] = useState("ok"); // ok, restarting, error

    const [ocrBookmaker, setOcrBookmaker] = useState("tipsport");
    const ocrBookmakerRef = useRef("tipsport");

    const handleBookmakerChange = (val) => {
        setOcrBookmaker(val);
        ocrBookmakerRef.current = val;
    };

    const [topMarketTypes, setTopMarketTypes] = useState([]);
    const [allMarketTypes, setAllMarketTypes] = useState([]);

    useEffect(() => {
        getSports().then(setSports).catch(() => { });
        getLeagues().then(setLeagues).catch(() => { });
        getBookmakers().then(setBookmakers).catch(() => { });
        getMarketTypes().then(setAllMarketTypes).catch(() => { });
        getTopMarketTypes(5).then(setTopMarketTypes).catch(() => { });
    }, []);

    // Ctrl+V paste handler
    const handlePaste = useCallback(async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith("image/")) {
                e.preventDefault();
                processImage(item.getAsFile());
                return;
            }
        }
    }, []);

    useEffect(() => {
        document.addEventListener("paste", handlePaste);
        return () => document.removeEventListener("paste", handlePaste);
    }, [handlePaste]);

    async function resizeImage(dataUrl, maxWidth = 1000, maxHeight = 1000) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", 0.85));
            };
            img.src = dataUrl;
        });
    }

    function processImage(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            let dataUrl = e.target.result;

            setLoading(true);
            setOcrError("");
            setParsedTickets([]);
            setRawText("");
            setSaved(false);
            setShowManual(false);

            try {
                // Resize image before sending to backend
                dataUrl = await resizeImage(dataUrl);
                setImagePreview(dataUrl);
                setImage(dataUrl);

                const result = await ocrParseBase64(dataUrl, ocrBookmakerRef.current);
                setParsedTickets(result.tickets || []);
                setRawText(result.raw_text || "");
                if (!result.tickets || result.tickets.length === 0) {
                    let msg = "";
                    if (result.raw_text?.includes("Chyba při volání Ollama")) {
                        msg = "❌ AI server neodpovídá správně: " + result.raw_text;
                    } else if (result.raw_text && result.raw_text.length > 10) {
                        msg = "⚠️ OCR rozpoznalo text, ale nenašlo žádné tikety. Zkontroluj 'Raw OCR výstup'.";
                    } else {
                        msg = "⚠️ OCR nedokázalo rozpoznat tikety. Zkus obrázek vložit znovu nebo klikni 'Restart OCR'.";
                    }
                    setOcrError(msg);
                    setShowManual(true);
                }
            } catch (err) {
                setOcrError("Chyba OCR: " + err.message);
                setShowManual(true);
            } finally {
                setLoading(false);
            }
        };
        reader.readAsDataURL(file);
    }

    function handleDrop(e) {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (file && file.type.startsWith("image/")) processImage(file);
    }

    function addManualTicket() {
        setParsedTickets([...parsedTickets, { ...EMPTY_TICKET }]);
        setShowManual(false);
    }

    function updateTicket(index, field, value) {
        const updated = [...parsedTickets];
        updated[index] = { ...updated[index], [field]: value };
        setParsedTickets(updated);
    }

    function removeTicket(index) {
        setParsedTickets(parsedTickets.filter((_, i) => i !== index));
    }

    async function saveAll() {
        setSaving(true);
        try {
            for (const t of parsedTickets) {
                const sport = sports.find(s => s.name.toLowerCase() === (t.sport || "").toLowerCase());
                const league = leagues.find(l => l.name.toLowerCase() === (t.league || "").toLowerCase());
                const bookmaker = bookmakers[0];

                // Vyhledat nebo vytvořit MarketType podle market_label
                let marketTypeId = null;
                if (t.market_label) {
                    const existing = allMarketTypes.find(mt => mt.name.toLowerCase() === t.market_label.toLowerCase());
                    if (existing) {
                        marketTypeId = existing.id;
                    } else {
                        // Vytvořit nový pokud neexistuje
                        const newMt = await createMarketType({
                            name: t.market_label,
                            sport_ids: sport ? [sport.id] : []
                        });
                        marketTypeId = newMt.id;
                        // Aktualizovat lokální seznam
                        setAllMarketTypes(prev => [...prev, newMt]);
                    }
                }

                await createTicket({
                    bookmaker_id: bookmaker?.id || 1,
                    sport_id: sport?.id || 1,
                    league_id: league?.id || null,
                    market_type_id: marketTypeId,
                    home_team: t.home_team || "Neznámý",
                    away_team: t.away_team || "Neznámý",
                    market_label: t.market_label || null, // Zachováme textový label pro jistotu
                    selection: t.selection || null,
                    odds: parseFloat(t.odds) || 1.0,
                    stake: parseFloat(t.stake) || 0,
                    payout: parseFloat(t.payout) || 0,
                    status: t.status || "open",
                    is_live: t.is_live || false,
                    source: image ? "ocr" : "manual",
                });
            }
            setSaved(true);
        } catch (e) {
            alert("Chyba při ukládání: " + e.message);
        } finally {
            setSaving(false);
        }
    }

    function reset() {
        setImage(null);
        setImagePreview(null);
        setParsedTickets([]);
        setRawText("");
        setSaved(false);
        setOcrError("");
        setShowManual(false);
    }

    async function handleRestartOcr() {
        setRestartStatus("restarting");
        reset();
        try {
            // unload: true vyhodí model z VRAM a nahraje ho znovu čistý
            const res = await checkOcrHealth(true);
            if (res.status === "ok") {
                setRestartStatus("ok");
                setTimeout(() => setRestartStatus("ok_confirmed"), 2000);
            } else {
                setRestartStatus("error");
                setOcrError(res.message);
            }
        } catch (err) {
            setRestartStatus("error");
            setOcrError("Restart selhal: " + err.message);
        }
    }

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <div>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>📸 Import tiketů</h1>
                    <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                        Vlož screenshot z Tipsportu pomocí{" "}
                        <kbd style={{ background: "var(--color-bg-card)", padding: "2px 8px", borderRadius: 6, fontSize: "0.8rem", border: "1px solid var(--color-border)" }}>Ctrl+V</kbd>
                        {" "}nebo přetáhni obrázek
                    </p>
                </div>
                <button className="btn btn-primary" onClick={addManualTicket}>
                    ✏️ Přidat ručně
                </button>
            </div>

            {/* Výběr zdroje OCR */}
            <div style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "center", background: "var(--color-bg-card)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--color-border)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Vyberte sázkovou kancelář před nahráním tiketu:</span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer", opacity: ocrBookmaker === "tipsport" ? 1 : 0.6 }}>
                    <input type="radio" name="ocrBookmaker" value="tipsport" checked={ocrBookmaker === "tipsport"} onChange={() => handleBookmakerChange("tipsport")} />
                    ⚫ Tipsport (Tmavý)
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", cursor: "pointer", opacity: ocrBookmaker === "betano" ? 1 : 0.6 }}>
                    <input type="radio" name="ocrBookmaker" value="betano" checked={ocrBookmaker === "betano"} onChange={() => handleBookmakerChange("betano")} />
                    ⚪ Betano (Světlý)
                </label>
            </div>

            {/* Pokud ještě není obrázek a nejsou manuální tikety */}
            {!image && parsedTickets.length === 0 ? (
                <div
                    className="paste-zone"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/*";
                        input.onchange = (e) => e.target.files[0] && processImage(e.target.files[0]);
                        input.click();
                    }}
                >
                    <div style={{ fontSize: "3rem", marginBottom: 16 }}>📋</div>
                    <p style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: 8 }}>
                        Stiskni Ctrl+V pro vložení screenshotu
                    </p>
                    <p style={{ color: "var(--color-text-muted)", fontSize: "0.85rem" }}>
                        nebo klikni / přetáhni obrázek sem
                    </p>
                </div>
            ) : (
                <div style={{ display: "grid", gridTemplateColumns: image ? "1fr 1fr" : "1fr", gap: 16 }}>
                    {/* Image preview */}
                    {image && (
                        <div className="glass-card" style={{ padding: "1.25rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>📷 Náhled</h3>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        className={`btn btn-ghost ${restartStatus === 'error' ? 'text-error' : ''}`}
                                        style={{ padding: "4px 12px", fontSize: "0.8rem", color: restartStatus === 'restarting' ? 'var(--color-yellow)' : (restartStatus === 'ok_confirmed' ? 'var(--color-success)' : '') }}
                                        onClick={handleRestartOcr}
                                        disabled={restartStatus === 'restarting'}
                                    >
                                        {restartStatus === 'restarting' ? '⏳ Restartuji...' : (restartStatus === 'ok_confirmed' ? '✅ Systém OK' : '🔄 Restart OCR')}
                                    </button>
                                    <button className="btn btn-ghost" style={{ padding: "4px 12px", fontSize: "0.8rem" }} onClick={reset}>
                                        Nový import
                                    </button>
                                </div>
                            </div>
                            <img src={imagePreview} alt="Screenshot tiketu"
                                style={{ width: "100%", borderRadius: 12, border: "1px solid var(--color-border)" }} />

                            <div style={{ marginTop: 8, textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                                Využitý OCR profil: <strong style={{ color: "var(--color-text)" }}>{ocrBookmaker === "tipsport" ? "Tipsport" : "Betano"}</strong>
                            </div>

                            {/* Raw OCR */}
                            {rawText && (
                                <details style={{ marginTop: 12 }}>
                                    <summary style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "0.8rem" }}>
                                        🔍 Raw OCR výstup
                                    </summary>
                                    <pre style={{ background: "var(--color-bg-input)", padding: 12, borderRadius: 8, marginTop: 8, fontSize: "0.75rem", whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>
                                        {rawText}
                                    </pre>
                                </details>
                            )}
                        </div>
                    )}

                    {/* Tikety */}
                    <div className="glass-card" style={{ padding: "1.25rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                            <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                                🎫 Tikety ({parsedTickets.length})
                            </h3>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: "0.8rem" }} onClick={addManualTicket}>
                                    ✏️ Přidat
                                </button>
                                {parsedTickets.length > 0 && !saved && (
                                    <button className="btn btn-success" onClick={saveAll} disabled={saving}>
                                        {saving ? <>⏳ Ukládám...</> : "💾 Uložit vše"}
                                    </button>
                                )}
                                {saved && (
                                    <span className="badge badge-won" style={{ fontSize: "0.85rem", padding: "6px 14px" }}>✅ Uloženo!</span>
                                )}
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ textAlign: "center", padding: "3rem" }}>
                                <div className="spinner" style={{ width: 32, height: 32 }} />
                                <p style={{ marginTop: 12, color: "var(--color-text-secondary)" }}>
                                    Zpracovávám screenshot přes AI...
                                </p>
                                <p style={{ marginTop: 4, color: "var(--color-text-muted)", fontSize: "0.75rem" }}>
                                    První spuštění může trvat 1-3 minuty
                                </p>
                            </div>
                        ) : parsedTickets.length === 0 ? (
                            <div style={{ padding: "2rem", textAlign: "center" }}>
                                {ocrError ? (
                                    <div style={{ background: "var(--color-yellow-soft)", padding: "12px 16px", borderRadius: 10, marginBottom: 12, fontSize: "0.85rem", color: "var(--color-yellow)" }}>
                                        ⚠️ {ocrError}
                                    </div>
                                ) : (
                                    <p style={{ color: "var(--color-text-muted)" }}>
                                        Žádné tikety. Vlož screenshot nebo klikni "Přidat ručně".
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {parsedTickets.map((t, i) => (
                                    <TicketForm key={i} ticket={t} index={i} sports={sports}
                                        allMarketTypes={allMarketTypes}
                                        topMarketTypes={topMarketTypes}
                                        onUpdate={updateTicket} onRemove={removeTicket} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function MarketTypeSelect({ value, allMarketTypes, onUpdate, sportId }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState(value || "");
    const [sportTopTypes, setSportTopTypes] = useState([]);

    useEffect(() => {
        getTopMarketTypes(5, sportId).then(setSportTopTypes).catch(() => { });
    }, [sportId]);

    useEffect(() => setSearch(value || ""), [value]);

    const filtered = allMarketTypes.filter(t => {
        const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
        if (!sportId) return matchesSearch;

        // Defensive check: if t.sports is missing, assume it belongs to all sports
        const targetSportIds = t.sports ? t.sports.map(s => s.id) : [];
        const isBelongingToSport = targetSportIds.length === 0 || targetSportIds.includes(sportId);

        return matchesSearch && isBelongingToSport;
    });

    const displayList = search ? filtered : sportTopTypes;

    return (
        <div style={{ position: "relative" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <input
                    className="input"
                    style={{ padding: "6px 30px 6px 10px", fontSize: "0.8rem", width: "100%" }}
                    placeholder="Hledat typ sázky..."
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        onUpdate(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                />
                <span style={{ position: "absolute", right: 10, fontSize: "0.8rem", pointerEvents: "none", opacity: 0.5 }}>
                    {isOpen ? "🔼" : "🔽"}
                </span>
            </div>

            {isOpen && (
                <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0,
                    background: "var(--color-bg-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 10, marginTop: 6, zIndex: 1000,
                    maxHeight: 280, overflowY: "auto",
                    boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.6)",
                    width: "max-content", minWidth: "100%",
                    padding: "4px"
                }}>
                    {!search && sportTopTypes.length > 0 && (
                        <div style={{ padding: "8px 12px", fontSize: "0.7rem", color: "var(--color-text-secondary)", background: "rgba(255,255,255,0.02)", borderRadius: "6px 6px 0 0", marginBottom: 2 }}>
                            🔥 Časté pro tento sport
                        </div>
                    )}

                    {displayList.map((mt, idx) => (
                        <div
                            key={mt.id || idx}
                            className="dropdown-item"
                            style={{
                                padding: "10px 12px", cursor: "pointer",
                                fontSize: "0.8rem",
                                borderRadius: 6,
                                marginBottom: 2,
                                background: mt.name === value ? "var(--color-accent-soft)" : "transparent",
                                transition: "all 0.2s"
                            }}
                            onMouseDown={() => {
                                setSearch(mt.name);
                                onUpdate(mt.name);
                                setIsOpen(false);
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span>{mt.name}</span>
                                {mt.sports && mt.sports.length > 0 && (
                                    <div style={{ display: "flex", gap: 2 }}>
                                        {mt.sports.slice(0, 3).map(s => <span key={s.id} style={{ fontSize: "0.7rem" }}>{s.icon}</span>)}
                                        {mt.sports.length > 3 && <span style={{ fontSize: "0.6rem", opacity: 0.5 }}>+{mt.sports.length - 3}</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {search && !allMarketTypes.some(t => t.name.toLowerCase() === search.toLowerCase()) && (
                        <div
                            style={{
                                padding: "12px", cursor: "pointer",
                                color: "var(--color-blue)", fontWeight: 600,
                                borderRadius: 8,
                                background: "rgba(var(--color-blue-rgb), 0.1)",
                                fontSize: "0.8rem",
                                marginTop: 4,
                                textAlign: "center",
                                border: "1px dashed var(--color-blue)"
                            }}
                            onMouseDown={() => {
                                onUpdate(search);
                                setIsOpen(false);
                            }}
                        >
                            ➕ Vytvořit nový: "{search}"
                        </div>
                    )}

                    {displayList.length === 0 && search && (
                        <div style={{ padding: "20px 12px", color: "var(--color-text-muted)", fontSize: "0.75rem", textAlign: "center" }}>
                            🔍 Žádný odpovídající typ nenalezen
                        </div>
                    )}

                    {displayList.length === 0 && !search && (
                        <div style={{ padding: "20px 12px", color: "var(--color-text-muted)", fontSize: "0.75rem", textAlign: "center" }}>
                            Zatím žádné typy sázek
                        </div>
                    )}
                </div>
            )}

            <style jsx>{`
                .dropdown-item:hover {
                    background: rgba(255, 255, 255, 0.05) !important;
                }
            `}</style>
        </div>
    );
}

function TicketForm({ ticket: t, index: i, sports, allMarketTypes, topMarketTypes, onUpdate, onRemove }) {
    return (
        <div style={{
            background: "var(--color-bg-input)",
            borderRadius: 12, padding: "1rem",
            border: "1px solid var(--color-border)",
        }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Tiket #{i + 1}</span>
                <button
                    style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "1rem" }}
                    onClick={() => onRemove(i)}
                >✕</button>
            </div>

            {/* Týmy */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, marginBottom: 10, alignItems: "end" }}>
                <div>
                    <label style={{ color: "var(--color-text-muted)", fontSize: "0.7rem" }}>Domácí</label>
                    <input className="input" style={{ padding: "8px 10px", fontSize: "0.85rem", fontWeight: 600 }}
                        placeholder="Domácí tým"
                        value={t.home_team || ""} onChange={(e) => onUpdate(i, "home_team", e.target.value)} />
                </div>
                <span style={{ padding: "8px 4px", color: "var(--color-text-muted)" }}>–</span>
                <div>
                    <label style={{ color: "var(--color-text-muted)", fontSize: "0.7rem" }}>Hosté</label>
                    <input className="input" style={{ padding: "8px 10px", fontSize: "0.85rem", fontWeight: 600 }}
                        placeholder="Hostující tým"
                        value={t.away_team || ""} onChange={(e) => onUpdate(i, "away_team", e.target.value)} />
                </div>
            </div>

            {/* Detaily */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: "0.8rem" }}>
                <div>
                    <label style={{ color: "var(--color-text-muted)", fontSize: "0.7rem" }}>Sport</label>
                    <select className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        value={t.sport || ""} onChange={(e) => onUpdate(i, "sport", e.target.value)}>
                        <option value="">– vybrat –</option>
                        {sports.map(s => <option key={s.id} value={s.name}>{s.icon} {s.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ color: "var(--color-text-muted)", fontSize: "0.7rem" }}>Typ sázky</label>
                    <MarketTypeSelect
                        value={t.market_label}
                        allMarketTypes={allMarketTypes}
                        sportId={sports.find(s => s.name === t.sport)?.id}
                        onUpdate={(val) => onUpdate(i, "market_label", val)}
                    />
                </div>
                <div>
                    <label style={{ color: "var(--color-text-muted)", fontSize: "0.7rem" }}>Výběr</label>
                    <input className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        placeholder="Over / Under / 1X2..."
                        value={t.selection || ""} onChange={(e) => onUpdate(i, "selection", e.target.value)} />
                </div>
                <div>
                    <label style={{ color: "var(--color-text-muted)", fontSize: "0.7rem" }}>Kurz</label>
                    <input className="input" type="number" step="0.01" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        placeholder="2.22"
                        value={t.odds || ""} onChange={(e) => onUpdate(i, "odds", e.target.value)} />
                </div>
                <div>
                    <label style={{ color: "var(--color-text-muted)", fontSize: "0.7rem" }}>Vklad (Kč)</label>
                    <input className="input" type="number" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        placeholder="50"
                        value={t.stake || ""} onChange={(e) => onUpdate(i, "stake", e.target.value)} />
                </div>
                <div>
                    <label style={{ color: "var(--color-text-muted)", fontSize: "0.7rem" }}>Výhra (Kč)</label>
                    <input className="input" type="number" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        placeholder="111"
                        value={t.payout || ""} onChange={(e) => onUpdate(i, "payout", e.target.value)} />
                </div>
            </div>

            {/* Status + Live */}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <select className="input" style={{ width: 130, padding: "6px 10px", fontSize: "0.8rem" }}
                    value={t.status || "open"} onChange={(e) => onUpdate(i, "status", e.target.value)}>
                    <option value="won">✅ Výhra</option>
                    <option value="lost">❌ Prohra</option>
                    <option value="open">⏳ Čeká</option>
                    <option value="void">↩️ Vráceno</option>
                </select>
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.8rem", color: "var(--color-text-secondary)" }}>
                    <input type="checkbox" checked={t.is_live || false}
                        onChange={(e) => onUpdate(i, "is_live", e.target.checked)} />
                    LIVE
                </label>
            </div>
        </div>
    );
}
