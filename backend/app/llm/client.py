import json
import re
import base64
import logging
import httpx
from typing import Optional, List
from app.config import get_settings
from app.schemas import OcrParsedTicket

logger = logging.getLogger(__name__)
settings = get_settings()


async def _ollama_generate(model: str, prompt: str, images: Optional[list[str]] = None) -> str:
    """Zavolá Ollama API a vrátí textovou odpověď."""
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 4096,
        }
    }
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
        logger.info(f"Ollama: Odpověď {len(response_text)} znaků")
        return response_text


def _extract_json_from_text(text: str) -> Optional[list]:
    """Pokusí se extrahovat JSON pole z textu LLM odpovědi - tolerantní parser."""

    # 1) Vyčistíme markdown bloky ```json ... ``` pokud tam jsou
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

    # 3) Pokus najít JSON objekt {...} (single ticket)
    brace_match = re.search(r'\{[\s\S]*\}', clean_text)
    if brace_match:
        try:
            parsed = json.loads(brace_match.group())
            if isinstance(parsed, dict):
                return [parsed]
        except json.JSONDecodeError:
            pass

    # 4) Pokus najít více JSON objektů oddělených čárkou/newlinem
    objects = re.findall(r'\{[^{}]+\}', clean_text)
    if objects:
        results = []
        for obj_str in objects:
            try:
                parsed = json.loads(obj_str)
                if isinstance(parsed, dict) and any(k in parsed for k in ['home_team', 'odds', 'stake']):
                    results.append(parsed)
            except json.JSONDecodeError:
                continue
        if results:
            return results

    # 5) Pokus o regex extrakci z nestrukturovaného textu
    ticket = _extract_from_plain_text(text)
    if ticket:
        return [ticket]

    return None


def _extract_from_plain_text(text: str) -> Optional[dict]:
    """Extrahuje data z plain-text odpovědi modelu pomocí regexů."""
    ticket = {}

    # Hledáme týmy (formát: "Tým1 - Tým2" nebo "Tým1 vs Tým2")
    teams_match = re.search(r'([A-ZÁ-Ža-zá-ž\s\.]+?)\s*[-–vs]+\s*([A-ZÁ-Ža-zá-ž\s\.]+)', text)
    if teams_match:
        ticket['home_team'] = teams_match.group(1).strip()
        ticket['away_team'] = teams_match.group(2).strip()

    # Kurz (číslo s tečkou/čárkou, typicky 1.xx - 99.xx)
    odds_match = re.search(r'(?:kurz|odds|celkov[ýy]\s*kurz)[:\s]*(\d+[.,]\d+)', text, re.IGNORECASE)
    if not odds_match:
        odds_match = re.search(r'(\d+[.,]\d{2})', text)
    if odds_match:
        ticket['odds'] = float(odds_match.group(1).replace(',', '.'))

    # Vklad
    stake_match = re.search(r'(?:vklad|stake)[:\s]*(\d+)', text, re.IGNORECASE)
    if stake_match:
        ticket['stake'] = float(stake_match.group(1))

    # Výhra
    payout_match = re.search(r'(?:výhra|skutečná výhra|payout|win)[:\s]*(\d+[\.,]?\d*)', text, re.IGNORECASE)
    if payout_match:
        ticket['payout'] = float(payout_match.group(1).replace(',', '.'))

    # Sport
    for sport in ['fotbal', 'hokej', 'basketbal', 'tenis', 'volejbal', 'házená']:
        if sport.lower() in text.lower():
            ticket['sport'] = sport.capitalize()
            break

    # Status
    if any(w in text.lower() for w in ['výhra', 'won', 'vyhrán', '✓', '✅']):
        ticket['status'] = 'won'
    elif any(w in text.lower() for w in ['prohra', 'lost', '✗', '❌']):
        ticket['status'] = 'lost'
    else:
        ticket['status'] = 'open'

    if ticket.get('home_team') or ticket.get('odds') or ticket.get('stake'):
        return ticket
    return None


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

    return await _ollama_generate(settings.ollama_text_model, prompt)


async def parse_ticket_image(image_base64: str) -> dict:
    """OCR: pošle screenshot tiketu do vision modelu, vrátí parsovaná data."""

    prompt = """Podívej se na tento screenshot z české sázkové kanceláře Tipsport.

ÚKOL: Najdi VŠECHNY sázkové tikety na obrázku a pro každý vypiš tyto informace ve formátu JSON.

Vrať POUZE platné JSON pole, žádný jiný text před ani za ním.
Formát:
[
  {
    "home_team": "název domácího týmu",
    "away_team": "název hostujícího týmu",
    "sport": "fotbal/hokej/basketbal/tenis",
    "league": "název ligy nebo prázdný string",
    "market_label": "typ sázky (např. Více než 2.5, Výsledek zápasu)",
    "selection": "co bylo vybráno",
    "odds": 2.22,
    "stake": 50,
    "payout": 111,
    "status": "won",
    "is_live": false
  }
]

PRAVIDLA:
- odds, stake, payout jsou ČÍSLA (ne text)
- status: "won" pokud zelená fajfka, "lost" pokud červený křížek, "open" pokud čeká
- Pokud vidíš "SÓLO" je to SÓLO tiket
- Vrať POUZE JSON pole, nic jiného"""

    logger.info(f"OCR: Odesílám obrázek ({len(image_base64)} znaků) do {settings.ollama_vision_model}")

    try:
        raw_response = await _ollama_generate(
            settings.ollama_vision_model,
            prompt,
            images=[image_base64]
        )
    except Exception as e:
        logger.error(f"OCR: Ollama volání selhalo: {e}", exc_info=True)
        return {
            "tickets": [],
            "raw_text": f"Chyba při volání Ollama: {str(e)}",
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
        "confidence": min(0.8, 0.2 * len(tickets)) if tickets else 0.0,
    }
