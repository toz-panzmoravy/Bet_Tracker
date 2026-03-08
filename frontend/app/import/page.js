"use client";
import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ocrParseBase64, createTicket, getSports, getLeagues, getBookmakers, getMarketTypes, getTopMarketTypes, findOrCreateMarketType, checkOcrHealth, getImportPreview } from "../lib/api";
import { useToast } from "../components/Toast";

const EMPTY_TICKET = {
    home_team: "", away_team: "", sport: "", league: "",
    market_label: "", selection: "", odds: "", stake: "",
    payout: "", status: "open", is_live: false, bookmaker_id: null,
    ticket_type: "solo",
};

function ImportPageContent() {
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
    const ocrAbortRef = useRef(null);

    const handleBookmakerChange = (val) => {
        setOcrBookmaker(val);
        ocrBookmakerRef.current = val;
    };

    const [topMarketTypes, setTopMarketTypes] = useState([]);
    const [allMarketTypes, setAllMarketTypes] = useState([]);

    useEffect(() => {
        getSports().then(setSports).catch(() => { });
        getLeagues().then(setLeagues).catch(() => { });
        getBookmakers().then(list => {
            const filtered = list.filter(b => ['Tipsport', 'Betano'].includes(b.name));
            setBookmakers(filtered);
        }).catch(() => { });
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
        ocrAbortRef.current = new AbortController();
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

                const result = await ocrParseBase64(dataUrl, ocrBookmakerRef.current, ocrAbortRef.current?.signal);
                const selectedProfile = ocrBookmakerRef.current?.toLowerCase() || "tipsport";
                const mapped = (result.tickets || []).map(t => ({
                    ...t,
                    ticket_type: t.ticket_type || "solo",
                    bookmaker_id: t.bookmaker_id || (bookmakers.find(b => b.name.toLowerCase() === selectedProfile)?.id ?? null),
                }));
                // AKU: jeden nadřazený tiket + 2 prázdné subtikety k ručnímu doplnění
                const expanded = [];
                for (const t of mapped) {
                    if (t.ticket_type === "aku") {
                        const akuKey = `aku_${Date.now()}_${Math.random().toString(36).slice(2)}`;
                        expanded.push({ ...t, _isAkuParent: true, _akuKey: akuKey });
                        const currentBook = bookmakers.find(b => b.name.toLowerCase() === selectedProfile);
                        for (let k = 0; k < 2; k++) {
                            expanded.push({
                                ...EMPTY_TICKET,
                                bookmaker_id: currentBook?.id ?? t.bookmaker_id,
                                _akuParentKey: akuKey,
                            });
                        }
                    } else {
                        expanded.push(t);
                    }
                }
                setParsedTickets(expanded);
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
                if (err.name === "AbortError") {
                    setOcrError("Rozpoznávání zrušeno.");
                } else {
                    setOcrError("Chyba OCR: " + err.message);
                }
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
        const currentBook = bookmakers.find(b => b.name.toLowerCase() === ocrBookmakerRef.current.toLowerCase());
        setParsedTickets([...parsedTickets, { ...EMPTY_TICKET, bookmaker_id: currentBook?.id || bookmakers[0]?.id || 1 }]);
        setShowManual(false);
    }

    function updateTicket(index, field, value) {
        const updated = [...parsedTickets];
        updated[index] = { ...updated[index], [field]: value };
        setParsedTickets(updated);
    }

    function removeTicket(index) {
        const t = parsedTickets[index];
        if (t._isAkuParent && t._akuKey) {
            setParsedTickets(parsedTickets.filter((item, i) => item._akuParentKey !== t._akuKey && !(item._isAkuParent && item._akuKey === t._akuKey)));
        } else if (t._akuParentKey) {
            setParsedTickets(parsedTickets.filter((_, i) => i !== index));
        } else {
            setParsedTickets(parsedTickets.filter((_, i) => i !== index));
        }
        setValidationErrors({});
    }

    function validateTicket(t) {
        const errors = [];
        const sportVal = (t.sport || "").toString().trim();
        if (!sportVal) errors.push("chybí sport");
        const stakeNum = parseFloat(t.stake);
        if (isNaN(stakeNum) || stakeNum <= 0) errors.push("vklad musí být kladné číslo");
        const oddsNum = parseFloat(t.odds);
        if (isNaN(oddsNum) || oddsNum <= 0) errors.push("kurz musí být kladné číslo");
        return { valid: errors.length === 0, errors };
    }

    function validateTicketAkuParent(t) {
        const errors = [];
        const stakeNum = parseFloat(t.stake);
        if (isNaN(stakeNum) || stakeNum <= 0) errors.push("vklad musí být kladné číslo");
        const oddsNum = parseFloat(t.odds);
        if (isNaN(oddsNum) || oddsNum <= 0) errors.push("kurz musí být kladné číslo");
        return { valid: errors.length === 0, errors };
    }

    function validateAll() {
        const validIndices = [];
        const invalid = [];
        for (let i = 0; i < parsedTickets.length; i++) {
            const t = parsedTickets[i];
            if (t._akuParentKey) continue;
            if (t._isAkuParent && t._akuKey) {
                const childIndices = parsedTickets.map((item, idx) => idx).filter(idx => parsedTickets[idx]._akuParentKey === t._akuKey);
                const parentResult = validateTicketAkuParent(t);
                const childResults = childIndices.map(ci => ({ idx: ci, ...validateTicket(parsedTickets[ci]) }));
                const allChildrenValid = childResults.every(r => r.valid);
                if (parentResult.valid && allChildrenValid) {
                    validIndices.push(i);
                } else {
                    if (!parentResult.valid) invalid.push({ index: i, errors: parentResult.errors });
                    childResults.forEach(r => { if (!r.valid) invalid.push({ index: r.idx, errors: r.errors }); });
                }
            } else {
                const { valid, errors } = validateTicket(t);
                if (valid) validIndices.push(i);
                else invalid.push({ index: i, errors });
            }
        }
        return { validIndices, invalid };
    }

    const [validationErrors, setValidationErrors] = useState({});
    const [previewError, setPreviewError] = useState("");
    const searchParams = useSearchParams();
    const previewId = searchParams.get("preview_id");
    const toast = useToast();

    useEffect(() => {
        if (!previewId || !bookmakers.length) return;
        setPreviewError("");
        getImportPreview(previewId)
            .then((res) => {
                const tickets = res.tickets || [];
                const mapped = tickets.map((t) => ({
                    home_team: t.home_team ?? "",
                    away_team: t.away_team ?? "",
                    sport: t.sport_name ?? "",
                    sport_id: t.sport_id,
                    market_label: t.market_label ?? "",
                    selection: t.selection ?? "",
                    odds: t.odds != null ? String(t.odds) : "",
                    stake: t.stake != null ? String(t.stake) : "",
                    payout: t.payout != null ? String(t.payout) : "",
                    status: t.status ?? "open",
                    bookmaker_id: t.bookmaker_id ?? null,
                    ticket_type: t.ticket_type ?? "solo",
                    is_live: false,
                    source: "manual",
                    legs: t.legs || [],
                }));
                setParsedTickets(mapped);
            })
            .catch((err) => {
                setPreviewError(err?.message?.includes("404") ? "Náhled vypršel nebo není k dispozici." : (err?.message || "Načtení náhledu selhalo."));
            });
    }, [previewId, bookmakers.length]);

    async function createOneTicket(t, opts = {}) {
        const sport = sports.find(s => s.name.toLowerCase() === (t.sport || "").toLowerCase());
        const league = leagues.find(l => l.name.toLowerCase() === (t.league || "").toLowerCase());
        let bookmakerId = t.bookmaker_id;
        if (!bookmakerId) {
            const ocrBook = bookmakers.find(b => b.name.toLowerCase() === ocrBookmakerRef.current.toLowerCase());
            bookmakerId = ocrBook?.id || bookmakers[0]?.id || 1;
        }
        let marketTypeId = null;
        const normLabel = (s) => (s || "").trim().toLowerCase().replace(/,/g, ".");
        if (t.market_label) {
            const existing = allMarketTypes.find(mt => normLabel(mt.name) === normLabel(t.market_label));
            if (existing) marketTypeId = existing.id;
            else {
                const newMt = await findOrCreateMarketType({ name: (t.market_label || "").trim(), sport_ids: sport ? [sport.id] : [] });
                marketTypeId = newMt.id;
                setAllMarketTypes(prev => (prev.some(m => m.id === newMt.id) ? prev : [...prev, newMt]));
            }
        }
        return createTicket({
            bookmaker_id: bookmakerId,
            sport_id: opts.sport_id ?? sport?.id ?? 1,
            league_id: league?.id || null,
            market_type_id: marketTypeId,
            parent_id: opts.parent_id ?? null,
            home_team: opts.home_team ?? (t.home_team || "Neznámý"),
            away_team: opts.away_team ?? (t.away_team || "Neznámý"),
            market_label: t.market_label || null,
            selection: t.selection || null,
            odds: parseFloat(t.odds) || 1.0,
            stake: parseFloat(t.stake) || 0,
            payout: parseFloat(t.payout) || 0,
            status: t.status || "open",
            ticket_type: opts.ticket_type ?? (t.ticket_type || "solo"),
            is_live: false,
            source: image ? "ocr" : "manual",
        });
    }

    async function saveAll() {
        setValidationErrors({});
        const { validIndices, invalid } = validateAll();
        const errorMap = {};
        invalid.forEach(({ index, errors }) => { errorMap[index] = errors; });
        setValidationErrors(errorMap);

        setSaving(true);
        let savedCount = 0;
        const apiErrors = [];

        try {
            for (let i = 0; i < parsedTickets.length; i++) {
                if (parsedTickets[i]._akuParentKey) continue;
                if (!validIndices.includes(i)) continue;
                const t = parsedTickets[i];

                if (t.legs && t.legs.length > 0 && t.ticket_type === "aku") {
                    try {
                        const bookmakerId = t.bookmaker_id || bookmakers[0]?.id;
                        const sportId = t.sport_id || sports.find(s => s.name.toLowerCase() === (t.sport || "").toLowerCase())?.id || 1;
                        const parent = await createTicket({
                            bookmaker_id: bookmakerId,
                            sport_id: sportId,
                            league_id: null,
                            market_type_id: null,
                            parent_id: null,
                            home_team: t.home_team || "AKU",
                            away_team: t.away_team || "Kombinace",
                            market_label: null,
                            selection: null,
                            odds: parseFloat(t.odds) || 1.0,
                            stake: parseFloat(t.stake) || 0,
                            payout: t.payout != null ? parseFloat(t.payout) : null,
                            status: t.status || "open",
                            ticket_type: "aku",
                            is_live: false,
                            source: "manual",
                        });
                        savedCount++;
                        for (const leg of t.legs) {
                            const legSportId = sportId;
                            await createTicket({
                                bookmaker_id: bookmakerId,
                                sport_id: legSportId,
                                league_id: null,
                                market_type_id: null,
                                parent_id: parent.id,
                                home_team: leg.home_team || "–",
                                away_team: leg.away_team || "–",
                                market_label: leg.market_label || null,
                                selection: leg.selection || null,
                                odds: parseFloat(leg.odds) || 1.0,
                                stake: 0,
                                payout: null,
                                status: t.status || "open",
                                ticket_type: "solo",
                                is_live: false,
                                source: "manual",
                            });
                            savedCount++;
                        }
                    } catch (e) {
                        apiErrors.push({ index: i, message: e.message });
                    }
                    continue;
                }

                if (t._isAkuParent && t._akuKey) {
                    const childIndices = parsedTickets.map((_, idx) => idx).filter(idx => parsedTickets[idx]._akuParentKey === t._akuKey);
                    try {
                        const firstChild = parsedTickets[childIndices[0]];
                        const sportId = (firstChild && sports.find(s => s.name.toLowerCase() === (firstChild.sport || "").toLowerCase()))?.id || 1;
                        const parent = await createTicket({
                            bookmaker_id: t.bookmaker_id || bookmakers.find(b => b.name.toLowerCase() === ocrBookmakerRef.current?.toLowerCase())?.id || bookmakers[0]?.id,
                            sport_id: sportId,
                            league_id: null,
                            market_type_id: null,
                            parent_id: null,
                            home_team: "AKU",
                            away_team: "AKU sázka",
                            market_label: null,
                            selection: null,
                            odds: parseFloat(t.odds) || 1.0,
                            stake: parseFloat(t.stake) || 0,
                            payout: parseFloat(t.payout) || 0,
                            status: t.status || "open",
                            ticket_type: "aku",
                            is_live: false,
                            source: image ? "ocr" : "manual",
                        });
                        savedCount++;
                        for (const ci of childIndices) {
                            const child = parsedTickets[ci];
                            await createOneTicket(child, { parent_id: parent.id, ticket_type: "solo" });
                            savedCount++;
                        }
                    } catch (e) {
                        apiErrors.push({ index: i, message: e.message });
                        childIndices.forEach(ci => apiErrors.push({ index: ci, message: e.message }));
                    }
                    continue;
                }

                try {
                    await createOneTicket(t);
                    savedCount++;
                } catch (e) {
                    apiErrors.push({ index: i, message: e.message });
                }
            }

            const totalInvalid = invalid.length + apiErrors.length;
            if (apiErrors.length > 0) {
                setValidationErrors((prev) => {
                    const next = { ...prev };
                    apiErrors.forEach(({ index, message }) => {
                        next[index] = [...(next[index] || []), `API: ${message}`];
                    });
                    return next;
                });
            }

            if (totalInvalid === 0 && apiErrors.length === 0) {
                setSaved(true);
                toast.success("Všechny tikety byly uloženy.");
                if (previewId && typeof window !== "undefined") {
                    const u = new URL(window.location.href);
                    u.searchParams.delete("preview_id");
                    window.history.replaceState({}, "", u.pathname + u.search);
                }
            } else if (savedCount > 0) {
                setSaved(true);
                toast.success(`Uloženo ${savedCount} tiketů.`);
                if (previewId && typeof window !== "undefined") {
                    const u = new URL(window.location.href);
                    u.searchParams.delete("preview_id");
                    window.history.replaceState({}, "", u.pathname + u.search);
                }
                if (totalInvalid > 0) toast.error(`Počet chyb: ${totalInvalid}. Zkontrolujte zvýrazněné řádky.`);
            } else {
                toast.error(`Žádný tiket nebyl uložen. Opravte chyby (sport, vklad, kurz) a zkuste znovu.`);
            }
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
                    <h1 className="page-title">📸 Import tiketů</h1>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                        Vlož screenshot z Tipsportu pomocí{" "}
                        <kbd style={{ background: "var(--bg-card)", padding: "2px 8px", borderRadius: 6, fontSize: "0.8rem", border: "1px solid var(--border)" }}>Ctrl+V</kbd>
                        {" "}nebo přetáhni obrázek
                    </p>
                </div>
                <button className="btn btn-primary" onClick={addManualTicket}>
                    ✏️ Přidat ručně
                </button>
            </div>

            {previewError && (
                <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "var(--danger-soft)", color: "var(--danger)", fontSize: "0.9rem" }}>
                    {previewError}
                </div>
            )}
            {previewId && parsedTickets.length > 0 && !previewError && (
                <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", fontSize: "0.9rem" }}>
                    Tikety z extension – zkontrolujte a uložte.
                </div>
            )}

            {/* Výběr zdroje OCR */}
            <div style={{ marginBottom: 16, display: "flex", gap: 16, alignItems: "center", background: "var(--bg-card)", padding: "12px 16px", borderRadius: 12, border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>Vyberte sázkovou kancelář před nahráním tiketu:</span>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", cursor: "pointer", opacity: ocrBookmaker === "tipsport" ? 1 : 0.6 }}>
                    <input type="radio" name="ocrBookmaker" value="tipsport" checked={ocrBookmaker === "tipsport"} onChange={() => handleBookmakerChange("tipsport")} />
                    <span style={{
                        border: "1.5px solid #3498db",
                        color: "#3498db",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontWeight: 800,
                        fontSize: "0.75rem",
                        lineHeight: "1"
                    }}>T</span>
                    <span style={{ color: ocrBookmaker === "tipsport" ? "#3498db" : "inherit" }}>Tipsport</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", cursor: "pointer", opacity: ocrBookmaker === "betano" ? 1 : 0.6 }}>
                    <input type="radio" name="ocrBookmaker" value="betano" checked={ocrBookmaker === "betano"} onChange={() => handleBookmakerChange("betano")} />
                    <span style={{
                        border: "1.5px solid #ff7000",
                        color: "#ff7000",
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontWeight: 800,
                        fontSize: "0.75rem",
                        lineHeight: "1"
                    }}>B</span>
                    <span style={{ color: ocrBookmaker === "betano" ? "#ff7000" : "inherit" }}>Betano</span>
                </label>
            </div>

            {/* Prázdný stav – žádný obrázek, žádné tikety */}
            {!image && parsedTickets.length === 0 ? (
                <div
                    className="paste-zone glass-card"
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/*";
                        input.onchange = (e) => e.target.files[0] && processImage(e.target.files[0]);
                        input.click();
                    }}
                    style={{
                        textAlign: "center",
                        padding: "3rem 2rem",
                        cursor: "pointer",
                        border: "2px dashed var(--border)",
                    }}
                >
                    <p style={{ fontSize: "2.5rem", marginBottom: 8, opacity: 0.4 }}>📸</p>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", marginBottom: 4 }}>
                        Vlož screenshot (Ctrl+V) nebo přetáhni obrázek
                    </p>
                    <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>
                        Klikni sem nebo vlož obrázek ze schránky
                    </p>
                </div>
            ) : (
                <div className="import-grid" style={{ display: "grid", gridTemplateColumns: image ? "1fr 1fr" : "1fr", gap: 16 }}>
                    {/* Image preview */}
                    {image && (
                        <div className="glass-card" style={{ padding: "1.25rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>📷 Náhled</h3>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button
                                        className={`btn btn-ghost ${restartStatus === 'error' ? 'text-error' : ''}`}
                                        style={{ padding: "4px 12px", fontSize: "0.8rem", color: restartStatus === 'restarting' ? 'var(--warning)' : (restartStatus === 'ok_confirmed' ? 'var(--success)' : '') }}
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
                                style={{ width: "100%", borderRadius: 12, border: "1px solid var(--border)" }} />

                            <div style={{ marginTop: 8, textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                                Využitý OCR profil: <strong style={{ color: "var(--text-primary)" }}>{ocrBookmaker === "tipsport" ? "Tipsport" : "Betano"}</strong>
                            </div>

                            {/* Raw OCR */}
                            {rawText && (
                                <details style={{ marginTop: 12 }}>
                                    <summary style={{ cursor: "pointer", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
                                        🔍 Raw OCR výstup
                                    </summary>
                                    <pre style={{ background: "var(--bg-input)", padding: 12, borderRadius: 8, marginTop: 8, fontSize: "0.75rem", whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>
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
                                <p style={{ marginTop: 12, color: "var(--text-secondary)" }}>
                                    Rozpoznávám tiket… (může trvat 10–30 s)
                                </p>
                                <p style={{ marginTop: 4, color: "var(--text-muted)", fontSize: "0.75rem" }}>
                                    První spuštění může trvat 1–3 minuty
                                </p>
                                <button
                                    type="button"
                                    className="btn btn-ghost"
                                    style={{ marginTop: 16, padding: "8px 16px", fontSize: "0.85rem" }}
                                    onClick={() => ocrAbortRef.current?.abort()}
                                >
                                    Zrušit OCR
                                </button>
                            </div>
                        ) : parsedTickets.length === 0 ? (
                            <div style={{ padding: "2rem", textAlign: "center" }}>
                                {ocrError ? (
                                    <div style={{ background: "var(--warning-soft)", padding: "12px 16px", borderRadius: 10, marginBottom: 12, fontSize: "0.85rem", color: "var(--warning)" }}>
                                        ⚠️ {ocrError}
                                    </div>
                                ) : (
                                    <p style={{ color: "var(--text-muted)" }}>
                                        Žádné tikety. Vlož screenshot nebo klikni "Přidat ručně".
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {parsedTickets.map((t, i) => {
                                    if (t._akuParentKey) return null;
                                    if (t._isAkuParent && t._akuKey) {
                                        const childIndices = parsedTickets.map((_, idx) => idx).filter(idx => parsedTickets[idx]._akuParentKey === t._akuKey);
                                        return (
                                            <AkuGroup
                                                key={t._akuKey}
                                                parentTicket={t}
                                                parentIndex={i}
                                                childIndices={childIndices}
                                                parsedTickets={parsedTickets}
                                                sports={sports}
                                                allMarketTypes={allMarketTypes}
                                                topMarketTypes={topMarketTypes}
                                                bookmakers={bookmakers}
                                                ocrBookmaker={ocrBookmaker}
                                                validationErrors={validationErrors}
                                                onUpdate={updateTicket}
                                                onRemove={removeTicket}
                                            />
                                        );
                                    }
                                    return (
                                        <TicketForm key={i} ticket={t} index={i} sports={sports}
                                            allMarketTypes={allMarketTypes}
                                            topMarketTypes={topMarketTypes}
                                            bookmakers={bookmakers}
                                            ocrBookmaker={ocrBookmaker}
                                            errors={validationErrors[i]}
                                            onUpdate={updateTicket} onRemove={removeTicket} />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function AkuGroup({ parentTicket, parentIndex, childIndices, parsedTickets, sports, allMarketTypes, topMarketTypes, bookmakers, ocrBookmaker, validationErrors, onUpdate, onRemove }) {
    return (
        <div style={{
            border: "2px solid var(--accent)",
            borderRadius: 14,
            padding: "1rem",
            background: "var(--bg-card)",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent)" }}>
                    🎫 AKU tiket (nadřazený)
                </span>
                <button type="button" style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1rem" }} onClick={() => onRemove(parentIndex)} title="Odstranit celý AKU tiket">✕</button>
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 12 }}>
                Systém rozpoznal AKU – níže doplňte každý zápas (subtiket) ručně.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16, alignItems: "end" }}>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Vklad</label>
                    <input type="number" className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        value={parentTicket.stake || ""} onChange={(e) => onUpdate(parentIndex, "stake", e.target.value)} placeholder="50" />
                </div>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Kurz</label>
                    <input type="number" step="0.01" className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        value={parentTicket.odds || ""} onChange={(e) => onUpdate(parentIndex, "odds", e.target.value)} placeholder="2.50" />
                </div>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Výhra</label>
                    <input type="number" className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        value={parentTicket.payout || ""} onChange={(e) => onUpdate(parentIndex, "payout", e.target.value)} placeholder="0" />
                </div>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Stav</label>
                    <select className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        value={parentTicket.status || "open"} onChange={(e) => onUpdate(parentIndex, "status", e.target.value)}>
                        <option value="won">✅ Výhra</option>
                        <option value="lost">❌ Prohra</option>
                        <option value="open">⏳ Čeká</option>
                        <option value="void">↩️ Vráceno</option>
                    </select>
                </div>
            </div>
            {validationErrors[parentIndex]?.length > 0 && (
                <div style={{ marginBottom: 12, padding: "6px 10px", background: "var(--danger-soft)", borderRadius: 8, fontSize: "0.75rem", color: "var(--danger)" }}>
                    {validationErrors[parentIndex].join(" • ")}
                </div>
            )}
            <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>Subtikety (doplňte ručně):</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {childIndices.map((ci, subIdx) => (
                    <div key={ci} style={{ paddingLeft: 12, borderLeft: "3px solid var(--border)" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>Subtiket #{subIdx + 1}</div>
                        <TicketForm
                            ticket={parsedTickets[ci]}
                            index={ci}
                            sports={sports}
                            allMarketTypes={allMarketTypes}
                            topMarketTypes={topMarketTypes}
                            bookmakers={bookmakers}
                            ocrBookmaker={ocrBookmaker}
                            errors={validationErrors[ci]}
                            onUpdate={onUpdate}
                            onRemove={onRemove}
                        />
                    </div>
                ))}
            </div>
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

    const bySport = allMarketTypes.filter(t => {
        if (!sportId) return true;
        const targetSportIds = t.sports ? t.sports.map(s => s.id) : [];
        return targetSportIds.length === 0 || targetSportIds.includes(sportId);
    });

    const listForDisplay = bySport.length > 0 ? bySport : allMarketTypes;
    const displayList = search
        ? listForDisplay.filter(t =>
            t.name.toLowerCase().includes((search || "").trim().toLowerCase())
          )
        : [...listForDisplay].sort((a, b) => {
            const aTop = sportTopTypes.some(st => st.id === a.id);
            const bTop = sportTopTypes.some(st => st.id === b.id);
            if (aTop && !bTop) return -1;
            if (!aTop && bTop) return 1;
            return (a.name || "").localeCompare(b.name || "");
          });

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
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 10, marginTop: 6, zIndex: 1000,
                    maxHeight: 280, overflowY: "auto",
                    boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.6)",
                    width: "max-content", minWidth: "100%",
                    padding: "4px"
                }}>
                    {!search && sportTopTypes.length > 0 && (
                        <div style={{ padding: "8px 12px", fontSize: "0.7rem", color: "var(--text-secondary)", background: "var(--surface-subtle)", borderRadius: "6px 6px 0 0", marginBottom: 2 }}>
                            🔥 Časté pro tento sport (nahoře), níže celý seznam typů
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
                                background: mt.name === value ? "var(--accent-soft)" : "transparent",
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
                                color: "var(--info)", fontWeight: 600,
                                borderRadius: 8,
                                background: "var(--info-soft)",
                                fontSize: "0.8rem",
                                marginTop: 4,
                                textAlign: "center",
                                border: "1px dashed var(--info)"
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
                        <div style={{ padding: "20px 12px", color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center" }}>
                            🔍 Žádný odpovídající typ nenalezen
                        </div>
                    )}

                    {displayList.length === 0 && !search && (
                        <div style={{ padding: "20px 12px", color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center" }}>
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

function TicketForm({ ticket: t, index: i, sports, allMarketTypes, topMarketTypes, bookmakers, ocrBookmaker = "tipsport", errors = [], onUpdate, onRemove }) {
    const defaultBookmakerId = bookmakers.find(b => b.name.toLowerCase() === (ocrBookmaker || "tipsport").toLowerCase())?.id;
    const hasErrors = Array.isArray(errors) && errors.length > 0;
    return (
        <div style={{
            background: "var(--bg-input)",
            borderRadius: 12, padding: "1rem",
            border: "1px solid var(--border)",
            borderLeft: hasErrors ? "3px solid var(--danger)" : undefined,
        }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    Tiket #{i + 1}
                    {t.ticket_type === "aku" && (
                        <span style={{ marginLeft: 8, padding: "2px 6px", borderRadius: 6, background: "var(--bg-card)", color: "var(--text-primary)", fontSize: "0.7rem", fontWeight: 600 }}>AKU</span>
                    )}
                </span>
                <button
                    style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "1rem" }}
                    onClick={() => onRemove(i)}
                >✕</button>
            </div>
            {t.ticket_type === "aku" && (
                <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 10 }}>AKU – doplňte ručně podle rozkliknutého tiketu.</p>
            )}

            {/* Sport, Sázkovka */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Sport</label>
                    <select className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        value={t.sport || ""} onChange={(e) => onUpdate(i, "sport", e.target.value)}>
                        <option value="">– vybrat –</option>
                        {sports.map(s => <option key={s.id} value={s.name}>{s.icon} {s.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Sázkovka</label>
                    <select className="input" style={{
                        padding: "6px 10px",
                        fontSize: "0.8rem",
                        color: (t.bookmaker_id || defaultBookmakerId) === bookmakers.find(b => b.name === 'Tipsport')?.id ? '#3498db' : ((t.bookmaker_id || defaultBookmakerId) === bookmakers.find(b => b.name === 'Betano')?.id ? '#ff7000' : 'inherit')
                    }}
                        value={t.bookmaker_id || defaultBookmakerId || ""} onChange={(e) => onUpdate(i, "bookmaker_id", e.target.value ? parseInt(e.target.value) : null)}>
                        {bookmakers.map(b => (
                            <option key={b.id} value={b.id} style={{ color: b.name === 'Tipsport' ? '#3498db' : '#ff7000' }}>
                                {b.name === 'Tipsport' ? '[T] ' : '[B] '}{b.name}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            {/* Domácí, Hosté */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, marginBottom: 10, alignItems: "end" }}>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Domácí</label>
                    <input className="input" style={{ padding: "8px 10px", fontSize: "0.85rem", fontWeight: 600 }}
                        placeholder="Domácí tým"
                        value={t.home_team || ""} onChange={(e) => onUpdate(i, "home_team", e.target.value)} />
                </div>
                <span style={{ padding: "8px 4px", color: "var(--text-muted)" }}>–</span>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Hosté</label>
                    <input className="input" style={{ padding: "8px 10px", fontSize: "0.85rem", fontWeight: 600 }}
                        placeholder="Hostující tým"
                        value={t.away_team || ""} onChange={(e) => onUpdate(i, "away_team", e.target.value)} />
                </div>
            </div>
            {/* Typ sázky, Výběr, Kurz, Vklad, Výhra */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: "0.8rem" }}>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Typ sázky</label>
                    <MarketTypeSelect
                        value={t.market_label}
                        allMarketTypes={allMarketTypes}
                        sportId={sports.find(s => s.name === t.sport)?.id}
                        onUpdate={(val) => onUpdate(i, "market_label", val)}
                    />
                </div>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Výběr</label>
                    <input className="input" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        placeholder={t.ticket_type === "aku" ? "AKU – vyplňte ručně" : "Over / Under / 1X2..."}
                        value={t.selection || ""} onChange={(e) => onUpdate(i, "selection", e.target.value)} />
                </div>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Kurz</label>
                    <input className="input" type="number" step="0.01" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        placeholder="2.22"
                        value={t.odds || ""} onChange={(e) => onUpdate(i, "odds", e.target.value)} />
                </div>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Vklad</label>
                    <input className="input" type="number" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        placeholder="50"
                        value={t.stake || ""} onChange={(e) => onUpdate(i, "stake", e.target.value)} />
                </div>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>Výhra</label>
                    <input className="input" type="number" style={{ padding: "6px 10px", fontSize: "0.8rem" }}
                        placeholder="111"
                        value={t.payout || ""} onChange={(e) => onUpdate(i, "payout", e.target.value)} />
                </div>
            </div>

            {/* Stav */}
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <div>
                    <label style={{ color: "var(--text-muted)", fontSize: "0.7rem", display: "block", marginBottom: 4 }}>Stav</label>
                    <select className="input" style={{ width: 130, padding: "6px 10px", fontSize: "0.8rem" }}
                        value={t.status || "open"} onChange={(e) => onUpdate(i, "status", e.target.value)}>
                    <option value="won">✅ Výhra</option>
                    <option value="lost">❌ Prohra</option>
                    <option value="open">⏳ Čeká</option>
                    <option value="void">↩️ Vráceno</option>
                    </select>
                </div>
            </div>
            {hasErrors && (
                <div style={{ marginTop: 8, padding: "6px 10px", background: "var(--danger-soft)", borderRadius: 8, fontSize: "0.75rem", color: "var(--danger)" }}>
                    {errors.join(" • ")}
                </div>
            )}
        </div>
    );
}

export default function ImportPage() {
    return (
        <Suspense fallback={<div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Načítání…</div>}>
            <ImportPageContent />
        </Suspense>
    );
}
