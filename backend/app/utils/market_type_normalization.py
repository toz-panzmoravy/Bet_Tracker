from __future__ import annotations

import re
import unicodedata


# Konzervativní seznam slov/fragmentů, které neovlivňují význam typu sázky,
# ale často se vyskytují v labelu (zápase, utkání, celkem...). Pracujeme už
# s řetězcem bez diakritiky.
_STOP_PHRASES = [
    " v zapase",
    " zapase",
    " zapasu",
    " v utkani",
    " utkani",
    " celkem",
    " celkovy",
]


_WHITESPACE_RE = re.compile(r"\s+")


def _strip_diacritics(text: str) -> str:
    """Odstraní diakritiku (převede 'č' -> 'c' apod.)."""
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in normalized if not unicodedata.combining(ch))


def normalize_market_label(raw: str | None) -> str:
    """
    Normalizuje text typu sázky na kanonickou podobu pro deduplikaci.

    Příklady:
    - 'Počet bodů' -> 'pocet bodu'
    - 'Počet bodů v zápase' -> 'pocet bodu'
    - 'Celkový počet bodů v utkání' -> 'pocet bodu'
    """
    if not raw:
        return ""

    # základ: trim + lowercase
    text = raw.strip().lower()

    # sjednocení čárky na tečku pro desetinná čísla
    text = text.replace(",", ".")

    # odstranit diakritiku
    text = _strip_diacritics(text)

    # odstranit "balastní" fráze (pracujeme na řetězci s mezerami)
    for phrase in _STOP_PHRASES:
        text = text.replace(phrase, " ")

    # nahradit všechno kromě písmen, číslic, tečky a mezer za mezeru
    text = re.sub(r"[^a-z0-9.\s]", " ", text)

    # znormalizovat mezery
    text = _WHITESPACE_RE.sub(" ", text).strip()

    return text

