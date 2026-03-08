"""
Mapování sportů z jednotlivých sázkových kanceláří na názvy sportů v našem systému.
Zdroj: Ticket_Mapping (Tipsport, Betano, Fortuna – ikony a názvy).

Použití: extension posílá sport_label nebo sport_icon_id → tento modul vrátí název
sportu v systému → _map_sport_label_to_id(db, label) najde nebo vytvoří Sport v DB.

Kontrolní přehled (Ticket_Mapping):
  Fortuna: 0i=Basketbal, 00=Fotbal, 0w=Hokej, 0m=Volejbal, 07=Ragby→Rugby, 0y=Házená→Handball, 0x=Tenis
  Betano:  BASK, ICEH, FOOT, HAND, TENN, ESPS → Basketbal, Hokej, Fotbal, Házená, Tenis, Esport
"""

# ─── Fortuna (ifortuna.cz) – kód ikony z URL ufo-sprt-XX.png (Ticket_Mapping cca ř. 56–62) ─
FORTUNA_ICON_TO_LABEL = {
    "0i": "Basketbal",
    "00": "Fotbal",
    "0w": "Hokej",
    "0m": "Volejbal",
    "07": "Ragby",
    "0y": "Házená",
    "0x": "Tenis",
}
# Staré číselné kódy (pro zpětnou kompatibilitu)
FORTUNA_ICON_TO_LABEL.update({
    "01": "Fotbal",
    "02": "Hokej",
    "03": "Basketbal",
    "04": "Tenis",
    "05": "Volejbal",
    "06": "Házená",
    "08": "Darts",
    "09": "Ostatní",
})

# ─── Betano – prefix z názvu ikony /myaccount/web/img/XXX...svg (viz Ticket_Mapping) ─
BETANO_ICON_TO_LABEL = {
    "bask": "Basketbal",
    "iceh": "Hokej",
    "foot": "Fotbal",
    "hand": "Házená",
    "tenn": "Tenis",
    "esps": "Esport",
}

# ─── Aliasy: název od sázkovky → název v DB (seed má Rugby, Handball; Fortuna používá Ragby, Házená) ─
SPORT_LABEL_ALIASES = {
    "ragby": "Rugby",
    "házená": "Handball",
    "hazena": "Handball",
}


def normalize_sport_label_for_db(label: str | None) -> str | None:
    """Převede název sportu od sázkovky na název používaný v našem systému (seed)."""
    if not label or not isinstance(label, str):
        return None
    s = label.strip()
    if not s:
        return None
    key = s.lower()
    return SPORT_LABEL_ALIASES.get(key) or s


def fortuna_icon_to_label(icon_id: str | None) -> str | None:
    """Vrátí název sportu pro Fortuna kód ikony (např. '07' z ufo-sprt-07.png). Použije název z DB (Rugby, Handball)."""
    if not icon_id:
        return None
    key = str(icon_id).strip().lower()
    if not key:
        return None
    label = FORTUNA_ICON_TO_LABEL.get(key)
    if label:
        return normalize_sport_label_for_db(label) or label
    return None


def betano_icon_to_label(icon_id: str | None) -> str | None:
    """Vrátí název sportu pro Betano ikonu (např. 'ICEH.GPAXOrbS' nebo cesta s 'foot')."""
    if not icon_id:
        return None
    src = str(icon_id).lower()
    for prefix, name in BETANO_ICON_TO_LABEL.items():
        if prefix in src:
            return name
    return None
