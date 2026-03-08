"""
Live skóre pro fotbal přes football-data.org API (jen fotbal).
Bez Playwrightu, jeden HTTP request pro fotbalové tikety.
"""
import logging
import re
import unicodedata
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

FOOTBALL_DATA_API_BASE = "https://api.football-data.org/v4"


def _get_api_key() -> str:
    """API klíč z env FOOTBALL_DATA_ORG_API_KEY nebo z app config."""
    try:
        from app.config import get_settings
        return (get_settings().football_data_org_api_key or "").strip()
    except Exception:
        pass
    import os
    return (os.environ.get("FOOTBALL_DATA_ORG_API_KEY") or "").strip()

# Názvy sportu v DB, které považujeme za fotbal (case-insensitive)
FOOTBALL_SPORT_NAMES = {"fotbal", "football", "soccer", "fußball"}


def _normalize(s: str) -> str:
    """Pro porovnání názvů týmů: lowercase, bez diakritiky, bez FC/BC…"""
    if not s:
        return ""
    n = unicodedata.normalize("NFKD", s.strip().lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    n = re.sub(r"\b(FC|BC|FK|CF|SC)\b", " ", n, flags=re.IGNORECASE)
    n = re.sub(r"[\-–—:\s]+", " ", n)
    return " ".join(n.split())


def _team_tokens(name: str) -> list:
    """Slova z názvu (min 2 znaky) pro porovnání."""
    n = _normalize(name or "")
    return [w for w in n.split() if len(w) >= 2 and not w.isdigit()]


def _teams_match(api_home: str, api_away: str, our_home: str, our_away: str) -> bool:
    """Oba páry: každý token našeho názvu musí být v názvu z API (nebo celý název sedí)."""
    ah = _normalize(api_home or "")
    aa = _normalize(api_away or "")
    oh = _normalize(our_home or "")
    oa = _normalize(our_away or "")
    if not oh and not oa:
        return False
    for (our, api) in [(oh, ah), (oa, aa)]:
        if not our:
            continue
        if not api:
            return False
        tokens = _team_tokens(our)
        if tokens:
            if not all(t in api for t in tokens):
                return False
        elif our not in api and api not in our:
            return False
    return True


def fetch_live_score_football_api(home_team: str, away_team: str) -> Optional[dict]:
    """
    Pro fotbal: načte live zápasy z football-data.org a vrátí skóre pro shodující se zápas.
    Vrací dict: { minute, score_home, score_away, source, scraped_text }.
    """
    api_key = _get_api_key()
    if not api_key:
        return None
    url = f"{FOOTBALL_DATA_API_BASE}/matches?status=LIVE"
    try:
        with httpx.Client(timeout=8.0) as client:
            r = client.get(
                url,
                headers={"X-Auth-Token": api_key, "Accept": "application/json"},
            )
        if r.status_code != 200:
            logger.debug("football-data.org API %s: %s", r.status_code, r.text[:200])
            return None
        data = r.json()
        matches = data.get("matches") if isinstance(data, dict) else []
        if not isinstance(matches, list):
            return None
        for m in matches:
            ht = (m.get("homeTeam") or {}).get("name") or ""
            at = (m.get("awayTeam") or {}).get("name") or ""
            if not _teams_match(ht, at, home_team, away_team):
                continue
            score = m.get("score") or {}
            ft = score.get("fullTime") or score.get("regularTime") or {}
            sh = ft.get("home")
            sa = ft.get("away")
            if sh is None and sa is None:
                sh = score.get("home")
                sa = score.get("away")
            minute = m.get("minute")
            if minute is None and "minute" in m:
                minute = m["minute"]
            if isinstance(minute, (int, float)):
                minute = int(minute)
            parts = []
            if minute is not None:
                parts.append(f"{int(minute)}'")
            if sh is not None and sa is not None:
                parts.append(f"{int(sh)}:{int(sa)}")
            return {
                "minute": int(minute) if minute is not None else None,
                "score_home": int(sh) if sh is not None else None,
                "score_away": int(sa) if sa is not None else None,
                "source": "football-data.org",
                "scraped_text": " · ".join(parts) if parts else None,
            }
        return None
    except Exception as e:
        logger.debug("football-data.org fetch failed: %s", e)
        return None


def is_football_sport(sport_name: Optional[str]) -> bool:
    """True pokud název sportu odpovídá fotbalu."""
    if not sport_name:
        return False
    return sport_name.strip().lower() in FOOTBALL_SPORT_NAMES
