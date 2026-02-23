import json
import re
import base64
import logging
import httpx
import time
from typing import Optional, List
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


async def _ollama_generate(model: str, prompt: str, images: Optional[list[str]] = None, system: Optional[str] = None) -> str:
    """Zavolá Ollama API a vrátí textovou odpověď."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 1024,
        }
    }
    if system:
        payload["system"] = system
    if images:
        payload["images"] = images

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
        try:
            parsed = json.loads(bracket_match.group())
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

        # --- ODDS (K:) ---
        odds_match = re.search(r'(?:K|Kurz|ODDS)[:\s]*(\d+[.,]\d+)', clean_block, re.IGNORECASE)
        if odds_match:
            ticket['odds'] = float(odds_match.group(1).replace(',', '.'))
        else:
            # Hledání jakékoliv desetinné čárky na konci řádku
            fallback_odds = re.search(r'(\d+[.,]\d{2})', clean_block)
            if fallback_odds: ticket['odds'] = float(fallback_odds.group(1).replace(',', '.'))

        # --- STAKE (V:) ---
        stake_match = re.search(r'(?:V|Vklad|STAKE)[:\s]*([\d\s]+)', clean_block, re.IGNORECASE)
        if stake_match:
            val = stake_match.group(1).replace(' ', '').strip()
            if val.isdigit(): ticket['stake'] = float(val)

        # --- PAYOUT (W:) ---
        payout_match = re.search(r'(?:W|Výhra|PAYOUT)[:\s]*([\d\s]+)', clean_block, re.IGNORECASE)
        if payout_match:
            val = payout_match.group(1).replace(' ', '').strip()
            if val.isdigit(): ticket['payout'] = float(val)

        # --- STATUS (S:) ---
        status_match = re.search(r'(?:S|STATUS|Stav)[:\s]*(\w+)', clean_block, re.IGNORECASE)
        if status_match:
            st = status_match.group(1).lower()
            ticket['status'] = 'won' if any(x in st for x in ['won', 'výhr', 'win']) else 'lost' if any(x in st for x in ['lost', 'proh', 'loss']) else 'open'
        else:
            if any(w in clean_block.lower() for w in ['výhra', 'won', '✓', '✅']):
                ticket['status'] = 'won'
            elif any(w in clean_block.lower() for w in ['prohra', 'lost', '✗', '❌']):
                ticket['status'] = 'lost'
                ticket['payout'] = 0
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


def _safe_ticket(item: dict) -> OcrParsedTicket:
    """Bezpečně vytvoří OcrParsedTicket z dict, ošetří chybějící/chybné hodnoty."""
    def safe_float(val, default=None):
        if val is None:
            return default
        try:
            return float(str(val).replace(',', '.'))
        except (ValueError, TypeError):
            return default

    return OcrParsedTicket(
        home_team=str(item.get("home_team", "") or ""),
        away_team=str(item.get("away_team", "") or ""),
        sport=str(item.get("sport", "") or ""),
        league=str(item.get("league", "") or ""),
        market_label=str(item.get("market_label", "") or item.get("market", "") or ""),
        selection=str(item.get("selection", "") or item.get("pick", "") or ""),
        odds=safe_float(item.get("odds")),
        stake=safe_float(item.get("stake")),
        payout=safe_float(item.get("payout", item.get("win", item.get("vyhra")))),
        status=str(item.get("status", "open") or "open"),
        is_live=bool(item.get("is_live", False)),
    )


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

async def parse_ticket_image(image_base64: str, bookmaker: str = "tipsport") -> dict:
    """OCR: pošle screenshot tiketu do vision modelu, vrátí parsovaná data přizpůsobená sázkovce."""

    if bookmaker == "betano":
        system_prompt = """Extract ALL betting tickets found in the image.
THERE MIGHT BE MULTIPLE TICKETS. Process them ONE BY ONE, top to bottom.
CRITICAL: Each ticket is enclosed in its own discrete box/rectangle with a thin grey border and rounded corners.
For each ticket, strictly extract the values ONLY from its own distinct block with a white background.
Output ONLY a valid JSON array of objects. DO NOT output any conversational text.

Field Extraction Guide:
- sport: Category icon (🏀=Basketbal, ⚽=Fotbal, 🎾=Tenis, 🏒=Lední hokej)
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
        system_prompt = """Extract ALL betting tickets found in the image.
THERE MIGHT BE MULTIPLE TICKETS. Process them ONE BY ONE, top to bottom.
For each ticket, strictly extract the values ONLY from its own distinct block.
Output ONLY a valid JSON array of objects. DO NOT output any conversational text.

Field Extraction Guide:
- home_team: Team before hyphen
- away_team: Team after hyphen
- odds: Number under 'Celkový kurz'
- stake: Number under 'Vklad'
- payout: Number under 'Skutečná výhra'
- status: 'won' if ✓ (green), 'lost' if ✗ (red), 'open' if grey pyramid
- market: Text below the teams
- sport: Icon next to SÓLO (⚽=Fotbal, 🎾=Tenis, 🏒=Lední hokej, 🏀=Basketbal)

JSON format for each ticket (Must NOT contain comments):
{
  "sport": "",
  "home_team": "",
  "away_team": "",
  "odds": 0.0,
  "stake": 0.0,
  "payout": 0.0,
  "status": "won",
  "market": ""
}"""

    prompt = f"Please extract all betting tickets from this {bookmaker.upper()} layout image into a strict JSON array. Return ONLY the JSON."

    logger.info(f"OCR: Odesílám obrázek ({len(image_base64)} znaků) do {settings.ollama_vision_model}")
    start_time = time.time()
    try:
        raw_response = await _ollama_generate(
            settings.ollama_vision_model,
            prompt,
            images=[image_base64],
            system=system_prompt
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

    if parsed_items:
        for item in parsed_items:
            try:
                tickets.append(_safe_ticket(item))
            except Exception as e:
                logger.warning(f"OCR: Chyba při vytváření tiketu: {e}")
                continue
        logger.info(f"OCR: Úspěšně parsováno {len(tickets)} tiketů")

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
                await client.post(
                    f"{settings.ollama_url}/api/generate",
                    json={"model": settings.ollama_vision_model, "keep_alive": 0}
                )
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
