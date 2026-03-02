import json
import re
import base64
import logging
import httpx
import time
from typing import Optional, List, Union
from app.config import get_settings
from app.schemas import OcrParsedTicket

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Pridat souborový handler pro debugování, pokud neexistuje
if not any(isinstance(h, logging.FileHandler) for h in logger.handlers):
    fh = logging.FileHandler("ocr_debug.log")
    fh.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(fh)

settings = get_settings()


async def _ollama_generate(
    model: str,
    prompt: str,
    images: Optional[list[str]] = None,
    system: Optional[str] = None,
    keep_alive: Optional[Union[str, int]] = None,
    num_predict: int = 1024,
) -> str:
    """Zavolá Ollama API a vrátí textovou odpověď."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": num_predict,
        }
    }
    if system:
        payload["system"] = system
    if images:
        payload["images"] = images
    if keep_alive is not None:
        payload["keep_alive"] = keep_alive

    logger.info(f"Ollama: Volám model {model}, images={len(images) if images else 0}")

    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(
            f"{settings.ollama_url}/api/generate",
            json=payload
        )
        resp.raise_for_status()
        data = resp.json()
        response_text = data.get("response", "")
        logger.info(f"Ollama: Odpověď {len(response_text)} znaků. Prvních 100: {response_text[:100]}")
        return response_text


def _extract_json_from_text(text: str) -> Optional[list]:
    """Pokusí se extrahovat JSON pole nebo více objektů z textu LLM odpovědi."""

    # 1) Vyčistíme markdown bloky ```json ... ```
    clean_text = re.sub(r'```(?:json)?\s*([\s\S]*?)```', r'\1', text).strip()

    # 2) Přímý pokus najít JSON pole [...]
    bracket_match = re.search(r'\[[\s\S]*\]', clean_text)
    if bracket_match:
        raw_array = bracket_match.group()
        try:
            parsed = json.loads(raw_array)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
        # Trailing comma nebo poslední čárka před ] – častá chyba LLM výstupu
        fixed = re.sub(r',\s*\]', ']', raw_array)
        if fixed != raw_array:
            try:
                parsed = json.loads(fixed)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass

    # 3) Extrakce všech objektů {...} založená na závorkách
    objects = []
    depth = 0
    start = -1
    for i, char in enumerate(clean_text):
        if char == '{':
            if depth == 0: start = i
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0 and start != -1:
                objects.append(clean_text[start:i+1])
                start = -1

    if objects:
        results = []
        for obj_str in objects:
            try:
                parsed = json.loads(obj_str)
                # Validujeme, že se jedná o tiket (obsahuje týmy nebo aspoň něco sázkového)
                if isinstance(parsed, dict) and ('home_team' in parsed or 'T1' in parsed or 'odds' in parsed):
                    results.append(parsed)
            except json.JSONDecodeError:
                continue
        if results:
            return _deduplicate_tickets(results)

    # 4) Fallback: Regex extrakce více tiketů z textu
    return _extract_multi_from_plain_text(text)


def _extract_multi_from_plain_text(text: str) -> Optional[list]:
    """Hledá více tiketů pomocí minimalistických značek (T1:, T2:, K:, V:, W:, S:).
    Tato metoda je navržena pro maximální stabilitu u slabších vizuálních modelů."""
    results = []
    
    # 1. Agresivní rozdělení na bloky
    # Dělíme podle T1: nebo TEAMS: nebo data (20. 2.)
    blocks = re.split(r'(?=T1:|TEAMS?:|Tým:|\d{1,2}\.\s*\d{1,2}\.|SÓLO)', text)
    
    if len(blocks) < 2:
        blocks = text.split('\n\n')

    for block in blocks:
        clean_block = block.strip()
        if len(clean_block) < 10: continue
        
        ticket = {}
        
        # --- TEAMS ---
        # Zkusíme T1/T2 nebo řádek s TEAMS nebo první řádek
        stop_lookahead = r'(?=(?:,\s*|\s+)(?:T1|T2|K|V|W|S|M|SP|Kurz|Vklad|Výhra|Status|Stav|MARKET|Sázka|SPORT|PAYOUT|ODDS|STAKE|SPORT)[:\s]|\n|$)'
        t1 = re.search(r'T1[:\s]+(.*?)' + stop_lookahead, clean_block, re.IGNORECASE)
        t2 = re.search(r'T2[:\s]+(.*?)' + stop_lookahead, clean_block, re.IGNORECASE)
        
        if t1 and t2:
            ticket['home_team'] = t1.group(1).strip()
            ticket['away_team'] = t2.group(1).strip()
        else:
            # Klasické hledání s pomlčkou/vs (velmi benevolentní)
            teams_line = re.search(r'(?:TEAMS?[:\s]+)?([A-ZÁ-Ž][^-\n–—\.]+?)\s*(?:[-–—\.]| vs )+\s*([A-ZÁ-Ž].*?)' + stop_lookahead, clean_block, re.IGNORECASE)
            if teams_match := teams_line:
                ticket['home_team'] = teams_match.group(1).strip()
                ticket['away_team'] = teams_match.group(2).strip()

        # --- ODDS (K:, Celkový kurz - TIPSPORT) ---
        odds_match = re.search(r'(?:K|Kurz|ODDS|Celkový kurz)[:\s]*(\d+[.,]\d+)', clean_block, re.IGNORECASE)
        if odds_match:
            ticket['odds'] = float(odds_match.group(1).replace(',', '.'))
        else:
            fallback_odds = re.search(r'(\d+[.,]\d{2})', clean_block)
            if fallback_odds:
                ticket['odds'] = float(fallback_odds.group(1).replace(',', '.'))

        # --- STAKE (V:, Vklad - TIPSPORT) ---
        stake_match = re.search(r'(?:V|Vklad|STAKE)[:\s]*([\d\s]+)', clean_block, re.IGNORECASE)
        if stake_match:
            val = stake_match.group(1).replace(' ', '').strip()
            if val.isdigit():
                ticket['stake'] = float(val)

        # --- PAYOUT (W:, Skutečná výhra - TIPSPORT) ---
        payout_match = re.search(
            r'(?:W|Výhra|PAYOUT|Skutečná výhra|Skutecna vyhra)[:\s]*([\d\s]+)',
            clean_block, re.IGNORECASE
        )
        if payout_match:
            val = payout_match.group(1).replace(' ', '').strip()
            if val.isdigit():
                ticket['payout'] = float(val)

        # --- STATUS (S:, OK/KO - TIPSPORT: zelené kolečko + fajfka = OK, červené + křížek = KO) ---
        status_match = re.search(r'(?:S|STATUS|Stav)[:\s]*(\w+)', clean_block, re.IGNORECASE)
        if status_match:
            st = status_match.group(1).lower()
            if st in ('ok', 'won') or any(x in st for x in ['výhr', 'win', 'zelen']):
                ticket['status'] = 'won'
            elif st in ('ko', 'lost') or any(x in st for x in ['proh', 'loss', 'červen']):
                ticket['status'] = 'lost'
                ticket['payout'] = 0
            elif any(x in st for x in ['void', 'vrác', 'fialov']):
                ticket['status'] = 'void'
            else:
                ticket['status'] = 'open'
        else:
            if any(w in clean_block.lower() for w in ['ok tiket', 'ok', 'výhra', 'won', '✓', '✅', 'zelené', 'fajfka']):
                ticket['status'] = 'won'
            elif any(w in clean_block.lower() for w in ['ko tiket', 'ko', 'prohra', 'lost', '✗', '❌', 'červené', 'křížek']):
                ticket['status'] = 'lost'
                ticket['payout'] = 0
            elif any(w in clean_block.lower() for w in ['vráceno', 'void', 'fialové', '🟣']):
                ticket['status'] = 'void'
                ticket['payout'] = ticket.get('stake', 0)
            else:
                ticket['status'] = 'open'

        # --- MARKET ---
        market_match = re.search(r'(?:M|MARKET|Sázka)[:\s]+(.*?)' + stop_lookahead, clean_block, re.IGNORECASE)
        if market_match:
            ticket['market_label'] = market_match.group(1).strip()

        # --- SPORT (SP:) ---
        sport_match = re.search(r'(?:SP|SPORT|Sport)[:\s]+(.*?)' + stop_lookahead, clean_block, re.IGNORECASE)
        if sport_match:
            ticket['sport'] = sport_match.group(1).strip()

        if ticket.get('home_team') or ticket.get('odds'):
            results.append(ticket)

    if not results: return None

    # Deduplikace (pokud AI opakuje stejné bloky)
    return _deduplicate_tickets(results)


def _deduplicate_tickets(tickets: list) -> list:
    """Odstraní duplicitní tikety ze seznamu na základě týmů a klíčových hodnot."""
    unique_results = []
    seen = set()
    for t in tickets:
        # Normalizovaný klíč pro porovnání
        home = str(t.get('home_team', '')).strip().lower()
        away = str(t.get('away_team', '')).strip().lower()
        # Seřadíme týmy abychom poznali i prohozené (i když u sázek je to nepravděpodobné, pro OCR jistota)
        teams = tuple(sorted([home, away]))

        odds = t.get('odds')
        stake = t.get('stake')

        # Unikátní klíč: týmy + kurz + vklad
        key = (teams, odds, stake)

        if key not in seen:
            unique_results.append(t)
            seen.add(key)

    return unique_results


def _normalize_status(s: str) -> str:
    """Normalizuje status z OCR (OK/KO, česky, aj.) na won/lost/void/open."""
    if not s:
        return "open"
    s = str(s).strip().lower()
    if s in ("won", "ok", "vyhra", "výhra"):
        return "won"
    if s in ("lost", "ko", "prohra"):
        return "lost"
    if s in ("void", "vraceno", "vráceno"):
        return "void"
    if "win" in s or "ok" in s or "zelen" in s or "✓" in s:
        return "won"
    if "loss" in s or "proh" in s or "červen" in s or "✗" in s:
        return "lost"
    return "open"


def _safe_ticket(item: dict) -> OcrParsedTicket:
    """Bezpečně vytvoří OcrParsedTicket z dict, ošetří chybějící/chybné hodnoty."""
    def safe_float(val, default=None):
        if val is None:
            return default
        try:
            return float(str(val).replace(',', '.').replace(' ', ''))
        except (ValueError, TypeError):
            return default

    status = _normalize_status(item.get("status", "open"))
    payout = safe_float(
        item.get("payout") or item.get("win") or item.get("vyhra")
        or item.get("skutecna_vyhra") or item.get("skutečná_výhra")
    )
    if status == "lost" and payout is None:
        payout = 0.0
    elif status == "lost":
        payout = 0.0

    raw_odds = safe_float(item.get("odds"))
    # Často OCR zamění "Celkový kurz" (1.87) s "Skutečná výhra" (168) – kurz je vždy malé desetinné (1–50)
    if raw_odds is not None and (raw_odds > 50 or (raw_odds == 0 and (payout or 0) != 0)):
        raw_odds = None  # Pravděpodobně chyba – neukládáme, uživatel doplní v UI
    elif raw_odds is not None and payout is not None and abs(raw_odds - payout) < 0.01:
        raw_odds = None  # Kurz = výhra je záměna (např. 168 místo 1.68)

    raw_type = str(item.get("ticket_type", "") or "").strip().lower()
    ticket_type = "aku" if raw_type == "aku" else "solo"

    return OcrParsedTicket(
        home_team=str(item.get("home_team", "") or "").strip(),
        away_team=str(item.get("away_team", "") or "").strip(),
        sport=str(item.get("sport", "") or "").strip(),
        league=str(item.get("league", "") or ""),
        market_label=str(item.get("market_label", "") or item.get("market", "") or ""),
        selection=str(item.get("selection", "") or item.get("pick", "") or ""),
        odds=raw_odds,
        stake=safe_float(item.get("stake")),
        payout=payout,
        status=status,
        is_live=bool(item.get("is_live", False)),
        ticket_type=ticket_type,
    )


# Úlomky promptu, které nesmí skončit v polích tiketu (model echo / kontaminace)
# Fráze, které v celé odpovědi znamenají, že model vrátil instrukce místo JSON (kontaminace)
_RESPONSE_IS_INSTRUCTIONS = (
    "to process the image",
    "we will follow",
    "identify the ticket",
    "extract the required",
    "these steps:",
    "1. identify",
    "2. for each",
    "3. output",
)

_PROMPT_CONTAMINATION_PHRASES = (
    "request ",
    "extract ",
    "return only",
    "json array",
    "tipsport layout",
    "this image",
    "read team",
    "from the image only",
    "strict json",
    "output only",
    "valid json",
    "each object:",
)


def _response_looks_like_instructions(text: str) -> bool:
    """True, pokud odpověď vypadá jako text instrukcí místo JSON (model „odpovídá“ promptem)."""
    if not text or len(text.strip()) < 100:
        return False
    lower = text.strip().lower()
    return any(phrase in lower for phrase in _RESPONSE_IS_INSTRUCTIONS)


def _looks_like_prompt_contamination(item: dict) -> bool:
    """Vrátí True, pokud textová pole objektu obsahují úlomky našeho OCR promptu."""
    if not isinstance(item, dict):
        return False
    combined = " ".join(
        str(item.get(k, "") or "")
        for k in ("home_team", "away_team", "selection", "market_label")
    ).lower()
    return any(phrase in combined for phrase in _PROMPT_CONTAMINATION_PHRASES)


def _normalize_tipsport_selection(selection: str) -> str:
    """Pro Tipsport: pokud selection obsahuje dvojtečku, vrátí pouze text za poslední dvojtečkou (tmavší část řádku)."""
    if not selection or not isinstance(selection, str):
        return (selection or "").strip()
    s = selection.strip()
    if ":" in s:
        return s.rsplit(":", 1)[-1].strip()
    return s


def _normalize_tipsport_selection_and_market(selection: str) -> tuple:
    """Pro Tipsport: pokud řádek je tvaru 'X: Y', vrátí (Y, X) pro selection a market_label; jinak (selection, '')."""
    if not selection or not isinstance(selection, str):
        return ((selection or "").strip(), "")
    s = selection.strip()
    if ":" in s:
        parts = s.rsplit(":", 1)
        return (parts[1].strip(), parts[0].strip())
    return (s, "")


async def analyze_stats(aggregates: dict, question: str = None) -> str:
    """Odešle agregovaná data do textového modelu pro AI analýzu."""

    system_context = """Jsi analytik sportovního sázení.
Dostaneš statistická agregovaná data o sázkách jednoho sázkaře v JSONu.
Pracuj pouze s těmito daty, nic si nevymýšlej.
Identifikuj:
1) silné stránky (kde je ROI vysoká / stabilní),
2) slabiny a „leaky" (záporné ROI s velkým obratem),
3) konkrétní doporučení: co omezit, co rozvinout, na co si dát pozor,
4) případné upozornění na vysokou varianci.
Piš stručně, česky, v několika odstavcích a s odrážkami tam, kde se to hodí."""

    prompt = f"""{system_context}

Data:
```json
{json.dumps(aggregates, indent=2, ensure_ascii=False, default=str)}
```
"""
    if question:
        prompt += f"\nDoplňující otázka od uživatele: {question}\n"

    return await _ollama_generate(settings.ollama_text_model, prompt, system=system_context)


def _ticket_to_dict(t: OcrParsedTicket) -> dict:
    """Převod tiketu na dict pro JSON (AI korekce)."""
    return {
        "home_team": t.home_team or "",
        "away_team": t.away_team or "",
        "sport": t.sport or "",
        "league": t.league or "",
        "market_label": t.market_label or "",
        "selection": t.selection or "",
        "odds": float(t.odds) if t.odds is not None else None,
        "stake": float(t.stake) if t.stake is not None else None,
        "payout": float(t.payout) if t.payout is not None else None,
        "status": t.status or "open",
        "is_live": t.is_live,
    }


async def _correct_tickets_via_ai(tickets: List[OcrParsedTicket]) -> List[OcrParsedTicket]:
    """
    Pošle OCR výstup do textového AI modelu. Model zkontroluje konzistenci (např. sport
    podle názvů týmů – Oklahoma City Thunder, Denver Nuggets → Basketbal) a vrátí
    opravené tikety. Při chybě nebo prázdné odpovědi vrátí původní seznam.
    """
    if not tickets:
        return tickets

    system_prompt = """Jsi ověřovatel výstupu OCR pro sázkové tikety.
Dostaneš JSON pole objektů (tikety). Tvůj úkol:
1) Zkontrolovat konzistenci: podle názvů týmů/hráčů urči správný sport (Fotbal, Hokej, Basketbal, Tenis, Esport, atd.).
   Příklady: "Oklahoma City Thunder" a "Denver Nuggets" = Basketbal. "Detroit Pistons" a "Cleveland Cavaliers" = Basketbal.
   "Fijian Drua" a "Hurricanes" = Rugby. "Tremblay" a "Dunkerque" může být florbal nebo jiný sport dle kontextu.
2) Oprav POUZE pole "sport" na správnou hodnotu v češtině (Fotbal, Basketbal, Hokej, Tenis, Rugby, Florbal, Esport, atd.).
3) KRITICKY: home_team a away_team NIKDY neměň – zkopíruj je beze změny z vstupu. Nesmíš je rozšiřovat (např. "Philadelphia" na "Philadelphia Eagles") ani nahrazovat jinými názvy. Pouze sport můžeš opravit.
4) Ostatní pole (selection, odds, stake, payout, status) zkopíruj z vstupu beze změny.
5) Vrať POUZE validní JSON pole stejné délky – žádný úvodní text, žádné markdown. Každý objekt musí mít klíče: home_team, away_team, sport, league, market_label, selection, odds, stake, payout, status, is_live."""

    tickets_json = json.dumps(
        [_ticket_to_dict(t) for t in tickets],
        ensure_ascii=False,
        indent=2,
    )
    prompt = f"""Zkontroluj a oprav sport (a případně další zjevné chyby) u těchto tiketů z OCR. Vrať pouze JSON pole.

{tickets_json}"""

    try:
        raw = await _ollama_generate(
            settings.ollama_text_model,
            prompt,
            system=system_prompt,
        )
        corrected_items = _extract_json_from_text(raw)
        if not corrected_items or len(corrected_items) != len(tickets):
            logger.warning(
                f"OCR AI korekce: očekáváno {len(tickets)} objektů, dostáno {len(corrected_items) if corrected_items else 0}. Vracím původní tikety."
            )
            return tickets
        result = []
        for i, item in enumerate(corrected_items):
            try:
                corrected = _safe_ticket(item)
                # Zachovat home_team, away_team a ticket_type z OCR – AI je nesmí přepisovat
                if i < len(tickets):
                    orig = tickets[i]
                    corrected = OcrParsedTicket(
                        home_team=orig.home_team,
                        away_team=orig.away_team,
                        sport=corrected.sport or orig.sport,
                        league=corrected.league or orig.league,
                        market_label=corrected.market_label or orig.market_label,
                        selection=corrected.selection or orig.selection,
                        odds=corrected.odds if corrected.odds is not None else orig.odds,
                        stake=corrected.stake if corrected.stake is not None else orig.stake,
                        payout=corrected.payout if corrected.payout is not None else orig.payout,
                        status=corrected.status or orig.status,
                        is_live=corrected.is_live,
                        ticket_type=orig.ticket_type,
                    )
                result.append(corrected)
            except Exception as e:
                logger.warning(f"OCR AI korekce: chyba u položky {i}: {e}. Použiju původní tiket.")
                if i < len(tickets):
                    result.append(tickets[i])
        if len(result) == len(tickets):
            logger.info(f"OCR AI korekce: úspěšně opraveno {len(result)} tiketů.")
            return result
    except Exception as e:
        logger.warning(f"OCR AI korekce selhala: {e}. Vracím původní tikety.", exc_info=True)
    return tickets


async def parse_ticket_image(image_base64: str, bookmaker: str = "tipsport") -> dict:
    """OCR: pošle screenshot tiketu do vision modelu, vrátí parsovaná data přizpůsobená sázkovce."""

    # Na začátku každého OCR vyložit model, aby další běh začínal jako čerstvý import (žádná paměť)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": settings.ollama_vision_model,
                    "prompt": "",
                    "keep_alive": 0,
                },
            )
        logger.info("OCR: Vision model vyložen před novým během (čistý start).")
    except Exception as pre_unload_err:
        logger.debug(f"OCR: Předběžný unload přeskočen (model možná nebyl načten): {pre_unload_err}")

    if bookmaker == "betano":
        system_prompt = """You have no memory of any previous request or image. Process only this single image as if this is the first and only request.

Extract ALL betting tickets found in the image.
THERE MIGHT BE MULTIPLE TICKETS. Process them ONE BY ONE, top to bottom.
CRITICAL: Each ticket is enclosed in its own discrete box/rectangle with a thin grey border and rounded corners.
For each ticket, strictly extract the values ONLY from its own distinct block with a white background.
Output ONLY a valid JSON array of objects. DO NOT output any conversational text.

Field Extraction Guide:
- sport: Category icon (⚽=Fotbal, 🏒=Hokej, 🎾=Tenis, 🏀=Basketbal, 🎮=Esport, 🏑=Florbal, 🎯=Darts, 🏉=Rugby, 🤾=Handball, 🥍=Lacros, ⚾=Baseball, 🏈=NFL)
- selection: The main bold betting tip next to the sport icon
- market: The text directly below the selection
- home_team: Team before hyphen on the 'Team 1 - Team 2' line
- away_team: Team after hyphen on the 'Team 1 - Team 2' line
- odds: Number ON THE FAR RIGHT, on the same line as 'selection'. It is NOT the stake!
- stake: Number next to the word 'Vsazeno' or 'SOLO sázka'. It is usually a round number like 50.00. Don't include 'Kč'
- payout: Number next to the word 'Výhry'. Don't include 'Kč'
- status: 'won' if there is a green circle checkmark or green 'Výhra' button. 'lost' if red circle cross or red 'Prohra' button

JSON format for each ticket (Must NOT contain comments):
{
  "sport": "",
  "selection": "",
  "market": "",
  "home_team": "",
  "away_team": "",
  "odds": 0.0,
  "stake": 0.0,
  "payout": 0.0,
  "status": "won"
}"""
    else:
        # TIPSPORT: layout – jeden tiket = jedna horizontální karta. Žádné "steps" v promptu (model je pak nesmí opakovat).
        system_prompt = """You have no memory of previous requests. Process only this image. Reply with ONLY a JSON array – no explanation, no steps, no other text. Your first character must be [ and last character ].

TIPSPORT: Each ticket is one horizontal CARD (grey rectangle). Cards stacked top to bottom.
LEFT side of each card: colored bar (red=lost, green=won), date/time, "AKU" or "SÓLO", sport icon, match line (e.g. "Philadelphia - Georgia"), then smaller line ("Vítěz zápasu: Team Voca" or "a 1 další příležitost").
RIGHT side: a vertical block with columns Vklad | Skutečná výhra | Celkový kurz, and status icon (red X / green check).

CRITICAL – ONE ROW OF NUMBERS PER CARD: On the right, the numbers are in ROWS. Row 1 (first number in each column) = TOPMOST card only. Row 2 = SECOND card only. Row 3 = THIRD card only. Never take stake/payout/odds from row 2 or 3 for the first card. Never take from row 1 or 3 for the second card. Example: if the top card shows "Philadelphia - Georgia" and the first row on the right is 75, 0, 2.35 then that card gets stake=75, payout=0, odds=2.35. The card below gets only the second row of numbers; the bottom card gets only the third row. Match each card's match line with the SAME row's numbers.

Rules: (1) One JSON object per card, same order as cards top to bottom. (2) home_team = first name before dash, away_team = second name on THAT card's match line only. (3) selection = bold/darker part after colon on the line BELOW that same card's match (e.g. under "LAG Gaming - Team Voca" the line "Vítěz zápasu: Team Voca" gives selection "Team Voca"); do not take selection from another card. For "a 1 další příležitost" leave selection empty. (4) market_label = text before colon if "X: Y" on that card. (5) ticket_type = "aku" if card shows AKU on first line, else "solo". (6) sport from icon on that card (racket=Tenis, etc.). (7) status and stake/payout/odds from THAT card's row on the right only. Lost => payout 0.

Format per object: {"sport":"","home_team":"","away_team":"","selection":"","stake":0.0,"payout":0.0,"odds":0.0,"status":"won","market_label":"","ticket_type":"solo"}
Reply ONLY with the array, starting with [."""

    prompt = "Return only a JSON array. One object per card, top to bottom. For each card use ONLY that card's row of numbers on the right (Vklad, Skutečná výhra, Celkový kurz) – do not use numbers from another row. First character: ["

    logger.info(
        f"OCR: Odesílám obrázek ({len(image_base64)} znaků), system prompt {len(system_prompt)} znaků, do {settings.ollama_vision_model}"
    )
    start_time = time.time()
    try:
        raw_response = await _ollama_generate(
            settings.ollama_vision_model,
            prompt,
            images=[image_base64],
            system=system_prompt,
            keep_alive=0,
            num_predict=2048,
        )
        duration = time.time() - start_time
        logger.info(f"OCR: Ollama odpověděla za {duration:.2f}s")
    except Exception as e:
        logger.error(f"OCR: Ollama volání selhalo: {repr(e)}", exc_info=True)
        return {
            "tickets": [],
            "raw_text": f"Chyba při volání Ollama: {repr(e)}",
            "confidence": 0.0,
        }

    logger.info(f"OCR raw response length: {len(raw_response)}")
    if len(raw_response) < 50:
        logger.warning(f"OCR: Podezřele krátká odpověď: {raw_response}")
    else:
        logger.info(f"OCR raw response (start): {raw_response[:500]}")

    # Pokus o parsování - tolerantní
    tickets = []
    parsed_items = _extract_json_from_text(raw_response)

    # Pokud model vrátil text instrukcí místo JSON, neukazovat ho uživateli a vrátit srozumitelnou zprávu
    if not parsed_items and _response_looks_like_instructions(raw_response):
        logger.warning("OCR: Model vrátil instrukce místo JSON – kontaminace promptem.")
        raw_response = (
            "OCR vrátil text instrukcí místo dat. Zkuste: Restart OCR (tlačítko výše), "
            "pak znovu nahrajte obrázek. Pokud problém trvá, zkuste jiný vision model v Ollama."
        )

    if parsed_items:
        for item in parsed_items:
            if _looks_like_prompt_contamination(item):
                logger.warning("OCR: Vynechána položka – vypadá jako kontaminace promptem.")
                continue
            if bookmaker == "tipsport":
                item = dict(item)
                raw_line = (item.get("selection") or item.get("market_label") or "").strip()
                sel, mkt = _normalize_tipsport_selection_and_market(raw_line)
                item["selection"] = sel
                if ":" in raw_line and mkt:
                    item["market_label"] = mkt
            try:
                tickets.append(_safe_ticket(item))
            except Exception as e:
                logger.warning(f"OCR: Chyba při vytváření tiketu: {e}")
                continue
        if parsed_items and not tickets:
            logger.warning("OCR: Všechny položky byly vyřazeny kvůli kontaminaci promptem.")
        logger.info(f"OCR: Úspěšně parsováno {len(tickets)} tiketů (response {len(raw_response)} znaků)")

    # Po každém OCR explicitně vyložit vision model z paměti, aby další import neviděl stará data
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"{settings.ollama_url}/api/generate",
                json={
                    "model": settings.ollama_vision_model,
                    "prompt": "",
                    "keep_alive": 0,
                },
            )
        logger.info("OCR: Vision model vyložen z paměti (další import poběží s čistým stavem).")
    except Exception as unload_err:
        logger.warning(f"OCR: Nepodařilo se vyložit model po odpovědi: {unload_err}")

    # Ověření a korekce přes textový AI model (sport dle názvů týmů, konzistence)
    if tickets:
        try:
            tickets = await _correct_tickets_via_ai(tickets)
        except Exception as e:
            logger.warning(f"OCR: AI korekce přeskočena: {e}")

    return {
        "tickets": tickets,
        "raw_text": raw_response,
        "confidence": 0.85 if tickets else 0.0,
    }


async def check_ocr_health(unload: bool = False) -> bool:
    """Ověří, zda je Ollama a vision model dostupný.
    Pokud unload=True, pošle požadavek na uvolnění modelu z VRAM."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            if unload:
                logger.info(f"OCR: Unloading model {settings.ollama_vision_model}")
                resp = await client.post(
                    f"{settings.ollama_url}/api/generate",
                    json={
                        "model": settings.ollama_vision_model,
                        "prompt": "",
                        "keep_alive": 0,
                    },
                )
                if resp.status_code != 200:
                    logger.warning(f"OCR: Unload request returned {resp.status_code}")
                return True

            resp = await client.get(f"{settings.ollama_url}/api/tags")
            if resp.status_code != 200:
                return False
            
            # Volitelně můžeme zkontrolovat, zda model existuje
            data = resp.json()
            models = [m.get("name") for m in data.get("models", [])]
            return settings.ollama_vision_model in models or f"{settings.ollama_vision_model}:latest" in models
    except Exception:
        return False
