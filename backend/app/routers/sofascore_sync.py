"""
Endpoint pro SofaScore FAV extension: seznam zápasů z otevřených tiketů (stejná pravidla jako overlay).
"""
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Ticket, TicketStatus
from app.schemas import SofaScoreEventOut

router = APIRouter(prefix="/api/sofascore-sync", tags=["SofaScore FAV"])

# Stejné okno jako overlay: zápas se skryje 3 h po začátku
PAST_EVENT_MINUTES = 180
# Tikety bez event_date: posílat jen pokud jsou „čerstvé“ (max 36 h od vytvoření)
MAX_AGE_NO_DATE_HOURS = 36


@router.get("/events", response_model=List[SofaScoreEventOut])
def get_events_for_sofascore(
    limit: int = Query(default=200, le=200, description="Max počet unikátních zápasů"),
    db: Session = Depends(get_db),
):
    """
    Vrací unikátní zápasy z nevyhodnocených tiketů (status=open), které by se zobrazily v overlay.
    Vyřadí zápasy starší než 3 h od začátku; tikety bez event_date jen pokud jsou mladší než 36 h.
    """
    now = datetime.utcnow()
    past_threshold = now - timedelta(minutes=PAST_EVENT_MINUTES)
    recent_cutoff = now - timedelta(days=MAX_AGE_NO_DATE_DAYS)

    # Jen open (jako overlay). event_date: buď null (a tiket nedávno vytvořen), nebo v okně 3 h
    query = (
        db.query(Ticket)
        .options(joinedload(Ticket.sport), joinedload(Ticket.league))
        .filter(Ticket.status == TicketStatus.open)
        .filter(
            or_(
                Ticket.event_date > past_threshold,
                and_(Ticket.event_date.is_(None), Ticket.created_at > recent_cutoff),
            )
        )
    )
    tickets = query.order_by(Ticket.event_date.asc().nulls_last(), Ticket.id.asc()).limit(limit * 3).all()

    # Agregace na unikátní zápasy: klíč (home_team, away_team, datum den)
    seen = set()
    events: List[SofaScoreEventOut] = []
    for t in tickets:
        if len(events) >= limit:
            break
        day = None
        if t.event_date:
            day = t.event_date.date() if hasattr(t.event_date, "date") else t.event_date
        key = (t.home_team or "", t.away_team or "", day)
        if key in seen:
            continue
        seen.add(key)
        sport_name = t.sport.name if t.sport else "Ostatní"
        league_name = t.league.name if t.league else None
        event_date_iso = t.event_date.isoformat() if t.event_date else None
        events.append(
            SofaScoreEventOut(
                home_team=t.home_team or "",
                away_team=t.away_team or "",
                event_date=event_date_iso,
                sport=sport_name,
                league=league_name,
                is_live=bool(t.is_live),
            )
        )
    return events
