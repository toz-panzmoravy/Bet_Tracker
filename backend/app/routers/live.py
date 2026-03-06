"""
LIVE – příjem scraped stavu zápasu, vyhodnocení přes AI, webhook notifikace.
"""
import logging
import re
from datetime import datetime
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppSettings, Ticket
from app.schemas import LiveTicketStateIn, LiveLinkIn
from app.llm.client import evaluate_live_ticket_state

_TIPSPORT_REF_PREFIX = "tipsport:"

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/live", tags=["LIVE"])


def _get_settings(db: Session) -> AppSettings:
    s = db.query(AppSettings).first()
    if not s:
        s = AppSettings()
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


def _send_webhook(db: Session, payload: dict) -> None:
    """Odešle POST na webhook_url z AppSettings. Při chybě jen loguje."""
    settings = _get_settings(db)
    url = (settings.webhook_url or "").strip()
    if not url:
        return
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.post(url, json=payload)
            if r.status_code >= 400:
                logger.warning("Webhook POST %s returned %s: %s", url, r.status_code, r.text[:200])
    except Exception as e:
        logger.warning("Webhook POST failed: %s", e)


def _match_id_from_url(live_match_url: Optional[str]) -> Optional[str]:
    """Vytáhne tipsport_match_id z URL (poslední číselný segment)."""
    if not live_match_url:
        return None
    m = re.search(r"/(\d+)/?$", live_match_url.strip())
    return m.group(1) if m else None


@router.post("/link")
def post_live_link(data: LiveLinkIn, db: Session = Depends(get_db)):
    """
    Propojí tiket (podle tipsport_key) s URL live zápasu. Volá se z extension při zobrazení detailu tiketu.
    Díky tomu backend při pravidelném POST /state najde tiket podle tipsport_match_id z URL.
    """
    ref = f"{_TIPSPORT_REF_PREFIX}{data.tipsport_key.strip()}"
    ticket = db.query(Ticket).filter(Ticket.ocr_image_path == ref).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Tiket s tímto tipsport_key nenalezen")
    ticket.live_match_url = data.live_match_url.strip()
    mid = _match_id_from_url(ticket.live_match_url)
    if mid:
        ticket.tipsport_match_id = mid
    db.add(ticket)
    db.commit()
    return {"ok": True, "ticket_id": ticket.id}


@router.post("/state")
async def post_live_state(data: LiveTicketStateIn, db: Session = Depends(get_db)):
    """
    Přijme scraped stav zápasu od extension. Najde tiket (ticket_id nebo tipsport_match_id),
    uloží live_match_url/tipsport_match_id, vyhodnotí stav přes AI, při změně/konci pošle webhook.
    """
    ticket = None
    if data.ticket_id is not None:
        ticket = db.query(Ticket).filter(Ticket.id == data.ticket_id).first()
    if not ticket and data.tipsport_match_id:
        ticket = db.query(Ticket).filter(Ticket.tipsport_match_id == data.tipsport_match_id).first()
    if not ticket and data.live_match_url:
        match_id = _match_id_from_url(data.live_match_url)
        if match_id:
            ticket = db.query(Ticket).filter(Ticket.tipsport_match_id == match_id).first()
        if not ticket:
            ticket = db.query(Ticket).filter(Ticket.live_match_url == data.live_match_url).first()
    if not ticket:
        # Extension posílá stav i pro zápasy, které v DB nemáme (uživatel otevřel live stránku bez propojeného tiketu).
        # Vrátíme 200 s ok: False, aby extension nedostala 404 a nepřetěžovala backend opakovanými pokusy.
        return {
            "ok": False,
            "ticket_id": None,
            "detail": "Tiket nenalezen (ticket_id nebo tipsport_match_id). Propojte tiket přes detail tiketu na Tipsportu.",
        }

    # Uložit live_match_url a tipsport_match_id na tiket při prvním příjmu
    if data.live_match_url:
        ticket.live_match_url = data.live_match_url
        mid = _match_id_from_url(data.live_match_url)
        if mid:
            ticket.tipsport_match_id = mid
    if data.tipsport_match_id and not ticket.tipsport_match_id:
        ticket.tipsport_match_id = data.tipsport_match_id

    scraped = data.scraped or {}
    scraped_text = scraped.get("fullText") or scraped.get("scoreText") or ""
    if isinstance(scraped_text, dict):
        scraped_text = str(scraped_text)
    scraped_text = (scraped_text or "").strip()

    eval_result = await evaluate_live_ticket_state(
        market_label=ticket.market_label or "",
        selection=ticket.selection or "",
        home_team=ticket.home_team or "",
        away_team=ticket.away_team or "",
        scraped_text=scraped_text,
    )

    prev = (ticket.last_live_snapshot or {}) if isinstance(ticket.last_live_snapshot, dict) else {}
    snapshot = {
        "scraped_text": scraped_text[:2000],
        "match_ended": eval_result.get("match_ended"),
        "result": eval_result.get("result"),
        "message": eval_result.get("message"),
        "evaluated_at": datetime.utcnow().isoformat(),
    }
    ticket.last_live_snapshot = snapshot
    ticket.last_live_at = datetime.utcnow()
    db.add(ticket)
    db.commit()

    # Webhook při konci zápasu nebo při významné změně (např. první detekce match_ended)
    send_webhook = False
    event = "change"
    if eval_result.get("match_ended") and eval_result.get("result"):
        event = "match_end"
        send_webhook = True
    elif eval_result.get("match_ended") and not prev.get("match_ended"):
        send_webhook = True
    elif eval_result.get("message") and eval_result.get("message") != (prev.get("message") or ""):
        send_webhook = True

    if send_webhook:
        bookmaker_name = ticket.bookmaker.name if ticket.bookmaker else "Tipsport"
        _send_webhook(
            db,
            {
                "event": event,
                "ticket_id": ticket.id,
                "message": eval_result.get("message") or "",
                "bookmaker": bookmaker_name,
                "score": scraped_text[:200] if scraped_text else "",
                "result": eval_result.get("result"),
            },
        )

    return {
        "ok": True,
        "ticket_id": ticket.id,
        "match_ended": eval_result.get("match_ended"),
        "result": eval_result.get("result"),
        "message": eval_result.get("message"),
    }
