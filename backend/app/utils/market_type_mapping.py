"""
Mapování názvů typů sázek od sázkových kanceláří na jeden kanonický název v systému.
Cíl: při importu z Tipsportu, Betana i Fortuny se stejný typ sázky vždy přiřadí k jednomu
„typu sázky“ v BetTrackeru – žádné duplicity („Vítěz“ vs „Vítěz zápasu“).

Sázky na hráče („Vstřelí: Jan Novák“, „Počet gólů: Petr Svoboda“) se redukují na
základ typu (část před dvojtečkou) a mapují na společné kanonické typy (Vstřelí hráč,
Počet gólů hráče), aby v DB nevznikaly stovky variant na každého hráče.

Klíče jsou normalizované (lowercase, bez diakritiky); hodnoty jsou kanonické názvy.
"""
from __future__ import annotations

from app.utils.market_type_normalization import normalize_market_label


def _norm_key(text: str | None) -> str:
    """Stejná normalizace jako klíč v mapě (pro vyhledání)."""
    return normalize_market_label(text or "")


def extract_base_market_label(raw: str | None) -> str:
    """
    U sázek na hráče má label často tvar „Typ sázky: Jméno hráče“.
    Pro mapování použijeme jen část před první dvojtečkou, aby „Vstřelí: Novák“
    i „Vstřelí: Svoboda“ spadly pod jeden kanonický typ „Vstřelí hráč“.
    """
    if not raw or not isinstance(raw, str):
        return ""
    s = raw.strip()
    if not s:
        return ""
    colon = s.find(":")
    if colon > 0 and colon < len(s) - 1:
        # Za dvojtečkou je něco (výběr / jméno) – pro typ sázky stačí část před ní
        before = s[:colon].strip()
        if len(before) >= 2:
            return before
    return s


# Mapování: normalizovaný tvar (od sázkovky) → kanonický název v našem systému.
# Doplňujte další varianty, které přicházejí z extension (Tipsport, Betano, Fortuna).
RAW_TO_CANONICAL_MARKET_TYPE: dict[str, str] = {
    # Vítěz zápasu
    "vitez zapasu": "Vítěz zápasu",
    "vitez": "Vítěz zápasu",
    "winner": "Vítěz zápasu",
    "vitezne znameni": "Vítěz zápasu",
    # Počet gólů / branek
    "pocet golu": "Počet gólů",
    "pocet golu v zapase": "Počet gólů",
    "pocet branek": "Počet gólů",
    "celkovy pocet golu": "Počet gólů",
    "over/under": "Počet gólů",
    # Over/Under (obecně)
    "over 2.5": "Over 2.5",
    "over 2,5": "Over 2.5",
    "under 2.5": "Under 2.5",
    "under 2,5": "Under 2.5",
    "mene nez 2.5": "Under 2.5",
    "vice nez 2.5": "Over 2.5",
    # Počet bodů (basketbal, hokej…)
    "pocet bodu": "Počet bodů",
    "celkovy pocet bodu": "Počet bodů",
    "pocet bodu v zapase": "Počet bodů",
    "celkovy pocet bodu v utkani": "Počet bodů",
    # Oba týmy vstřelí
    "oba tymy vstřeli": "Oba týmy vstřelí",
    "oba tymy vstřeli ano": "Oba týmy vstřelí",
    "btts": "Oba týmy vstřelí",
    # Handicap
    "handicap": "Handicap",
    "handicap zapasu": "Handicap",
    "zápas s handicapem": "Handicap",
    "zapas s handicapem": "Handicap",
    # Remíza
    "remiza": "Remíza",
    "remiza ano ne": "Remíza",
    # Polčas / poločas
    "polocas": "Poločas",
    "poločas": "Poločas",
    "vitez 1. polocasu": "Vítěz 1. poločasu",
    "vitez prvniho polocasu": "Vítěz 1. poločasu",
    # ─── Sázky na hráče (různé sporty) – jeden typ v systému, ne na každého hráče ───
    "vstreli": "Vstřelí hráč",
    "vstreli gol": "Vstřelí hráč",
    "vstreli branku": "Vstřelí hráč",
    "vstreli branky": "Vstřelí hráč",
    "vstreli ano ne": "Vstřelí hráč",
    "prvni gol": "První gól (hráč)",
    "prvni gol v zapase": "První gól (hráč)",
    "pocet golu hrace": "Počet gólů hráče",
    "goly hrace": "Počet gólů hráče",
    "asistent": "Asistence hráče",
    "asistence": "Asistence hráče",
    "asistence hrace": "Asistence hráče",
    "zluta karta": "Karty (hráč)",
    "cervena karta": "Karty (hráč)",
    "karta hrace": "Karty (hráč)",
    "bodu hrace": "Počet bodů hráče",
    "pocet bodu hrace": "Počet bodů hráče",
}


def market_label_to_canonical(raw: str | None) -> str | None:
    """
    Převede surový název typu sázky od sázkovky na kanonický název v našem systému.
    U tvaru „Typ: Hráč“ se pro mapování bere jen část před dvojtečkou.
    Pokud je raw prázdný nebo neznámý, vrátí None (volající může použít původní raw).
    """
    if not raw or not isinstance(raw, str):
        return None
    base = extract_base_market_label(raw)
    if not base:
        return None
    key = _norm_key(base)
    if not key:
        return None
    return RAW_TO_CANONICAL_MARKET_TYPE.get(key)
