import csv
import io
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Ticket, TicketStatus, TicketType, TicketSource, Sport
from app.schemas import TicketCreate, TicketUpdate, TicketOut, TicketListResponse

router = APIRouter(prefix="/api/tickets", tags=["Tikety"])


@router.post("", response_model=TicketOut)
def create_ticket(data: TicketCreate, db: Session = Depends(get_db)):
    """Vytvořit nový tiket."""
    # Sport fallback: pokud sport_id neexistuje, použij "Ostatní"
    sport_id = data.sport_id
    if db.query(Sport).filter(Sport.id == sport_id).first() is None:
        fallback = db.query(Sport).filter(Sport.name == "Ostatní").first()
        if fallback is None:
            raise HTTPException(status_code=400, detail="Neplatný sport_id a v databázi chybí sport 'Ostatní'")
        sport_id = fallback.id
    ticket_data = data.model_dump()
    ticket_data["sport_id"] = sport_id
    if "ticket_type" in ticket_data and ticket_data["ticket_type"]:
        try:
            ticket_data["ticket_type"] = TicketType(ticket_data["ticket_type"])
        except ValueError:
            ticket_data["ticket_type"] = TicketType.solo
    ticket = Ticket(**ticket_data)

    # Automatický výpočet profitu
    if ticket.status == TicketStatus.won and ticket.stake:
        if ticket.payout is not None:
            ticket.profit = ticket.payout - ticket.stake
        else:
            ticket.payout = ticket.stake * ticket.odds
            ticket.profit = ticket.payout - ticket.stake
    elif ticket.status == TicketStatus.half_win and ticket.stake:
        if ticket.payout is not None:
            ticket.profit = ticket.payout - ticket.stake
        else:
            # polovina výhry: stake + (stake*odds - stake)/2
            ticket.payout = ticket.stake * (1 + float(ticket.odds)) / 2
            ticket.profit = ticket.payout - ticket.stake
    elif ticket.status == TicketStatus.lost:
        ticket.profit = -ticket.stake
        ticket.payout = 0
    elif ticket.status == TicketStatus.half_loss:
        ticket.profit = -(ticket.stake / 2)
        ticket.payout = ticket.stake / 2
    elif ticket.status == TicketStatus.void:
        ticket.profit = 0
        ticket.payout = ticket.stake

    db.add(ticket)
    db.commit()
    
    # Re-fetch with relationships to ensure they are populated in the response
    return db.query(Ticket).options(
        joinedload(Ticket.bookmaker),
        joinedload(Ticket.sport),
        joinedload(Ticket.league),
        joinedload(Ticket.market_type_rel),
    ).filter(Ticket.id == ticket.id).first()


@router.get("", response_model=TicketListResponse)
def list_tickets(
    sport_id: Optional[int] = None,
    league_id: Optional[int] = None,
    bookmaker_id: Optional[int] = None,
    status: Optional[str] = None,
    market_type_id: Optional[int] = None,
    parent_id: Optional[int] = None,
    ticket_type: Optional[str] = None,
    is_live: Optional[bool] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    odds_min: Optional[float] = None,
    odds_max: Optional[float] = None,
    sort_by: str = Query(default="created_at"),
    sort_dir: str = Query(default="desc"),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0),
    db: Session = Depends(get_db),
):
    """Seznam tiketů s filtry, řazením a stránkováním. Při výchozím řazení jdou děti hned za rodičem (AKU)."""
    query = _tickets_query(
        db, sport_id=sport_id, league_id=league_id, bookmaker_id=bookmaker_id,
        status=status, market_type_id=market_type_id,         parent_id=parent_id,
        ticket_type=ticket_type,
        is_live=is_live, date_from=date_from, date_to=date_to,
        odds_min=odds_min, odds_max=odds_max,
        sort_by=sort_by, sort_dir=sort_dir,
    )
    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"items": items, "total": total}


def _tickets_query(db: Session, sport_id=None, league_id=None, bookmaker_id=None, status=None,
                   market_type_id=None, parent_id=None, ticket_type=None, is_live=None, date_from=None, date_to=None,
                   odds_min=None, odds_max=None, sort_by="created_at", sort_dir="desc"):
    """Sdílený dotaz pro list_tickets a export."""
    query = db.query(Ticket).options(
        joinedload(Ticket.bookmaker),
        joinedload(Ticket.sport),
        joinedload(Ticket.league),
        joinedload(Ticket.market_type_rel),
    )
    if sport_id:
        query = query.filter(Ticket.sport_id == sport_id)
    if league_id:
        query = query.filter(Ticket.league_id == league_id)
    if bookmaker_id:
        query = query.filter(Ticket.bookmaker_id == bookmaker_id)
    if status:
        query = query.filter(Ticket.status == status)
    if market_type_id:
        query = query.filter(Ticket.market_type_id == market_type_id)
    if parent_id is not None:
        query = query.filter(Ticket.parent_id == parent_id)
    if ticket_type is not None:
        try:
            query = query.filter(Ticket.ticket_type == TicketType(ticket_type))
        except ValueError:
            pass
    if is_live is not None:
        query = query.filter(Ticket.is_live == is_live)
    if date_from:
        query = query.filter(Ticket.created_at >= date_from)
    if date_to:
        query = query.filter(Ticket.created_at <= date_to)
    if odds_min:
        query = query.filter(Ticket.odds >= odds_min)
    if odds_max:
        query = query.filter(Ticket.odds <= odds_max)

    # Řazení: rodič AKU + děti držet pohromadě
    order_key = case(
        (Ticket.parent_id.isnot(None), Ticket.parent_id),
        else_=Ticket.id,
    )

    # Speciální zacházení pro datumové řazení, aby šlo použít event_date i created_at
    if sort_by == "event_date":
        sort_col = case(
            (Ticket.event_date.is_(None), Ticket.created_at),
            else_=Ticket.event_date,
        )
        query = query.order_by(
            sort_col.desc() if sort_dir == "desc" else sort_col.asc(),
            Ticket.id.desc() if sort_dir == "desc" else Ticket.id.asc(),
        )
    else:
        sort_col = getattr(Ticket, sort_by, Ticket.created_at)
        if sort_by in ("created_at", "id"):
            query = query.order_by(
                order_key.desc() if sort_dir == "desc" else order_key.asc(),
                Ticket.id.desc() if sort_dir == "desc" else Ticket.id.asc(),
            )
        else:
            query = query.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    return query


@router.get("/export")
def export_tickets_csv(
    sport_id: Optional[int] = None,
    league_id: Optional[int] = None,
    bookmaker_id: Optional[int] = None,
    status: Optional[str] = None,
    market_type_id: Optional[int] = None,
    is_live: Optional[bool] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    odds_min: Optional[float] = None,
    odds_max: Optional[float] = None,
    sort_by: str = Query(default="created_at"),
    sort_dir: str = Query(default="desc"),
    db: Session = Depends(get_db),
):
    """Export tiketů jako CSV (s aktuálními filtry)."""
    query = _tickets_query(
        db, sport_id=sport_id, league_id=league_id, bookmaker_id=bookmaker_id,
        status=status, market_type_id=market_type_id, is_live=is_live,
        date_from=date_from, date_to=date_to, odds_min=odds_min, odds_max=odds_max,
        sort_by=sort_by, sort_dir=sort_dir,
    )
    rows = query.all()
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow([
        "id", "created_at", "sport", "bookmaker", "league", "home_team", "away_team",
        "market_label", "selection", "odds", "stake", "payout", "profit", "status", "ticket_type", "parent_id", "is_live",
    ])
    for t in rows:
        writer.writerow([
            t.id,
            t.created_at.isoformat() if t.created_at else "",
            t.sport.name if t.sport else "",
            t.bookmaker.name if t.bookmaker else "",
            t.league.name if t.league else "",
            t.home_team or "",
            t.away_team or "",
            t.market_label or "",
            t.selection or "",
            str(t.odds) if t.odds is not None else "",
            str(t.stake) if t.stake is not None else "",
            str(t.payout) if t.payout is not None else "",
            str(t.profit) if t.profit is not None else "",
            t.status.value if hasattr(t.status, "value") else str(t.status),
            t.ticket_type.value if hasattr(t.ticket_type, "value") else str(t.ticket_type),
            str(t.parent_id) if t.parent_id is not None else "",
            "1" if t.is_live else "0",
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=tikety_export.csv"},
    )


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    """Detail tiketu."""
    ticket = db.query(Ticket).options(
        joinedload(Ticket.bookmaker),
        joinedload(Ticket.sport),
        joinedload(Ticket.league),
        joinedload(Ticket.market_type_rel),
    ).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Tiket nenalezen")
    return ticket


@router.put("/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: int, data: TicketUpdate, db: Session = Depends(get_db)):
    """Upravit tiket."""
    ticket = db.query(Ticket).options(
        joinedload(Ticket.bookmaker),
        joinedload(Ticket.sport),
        joinedload(Ticket.league),
        joinedload(Ticket.market_type_rel),
    ).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Tiket nenalezen")

    update_data = data.model_dump(exclude_unset=True)
    if "ticket_type" in update_data and update_data["ticket_type"] is not None:
        try:
            update_data["ticket_type"] = TicketType(update_data["ticket_type"])
        except ValueError:
            pass  # nechat stávající
    for key, value in update_data.items():
        setattr(ticket, key, value)

    # Přepočítat profit; u výhry doplnit payout z odds*stake, pokud chybí
    if ticket.status == TicketStatus.won and ticket.stake is not None:
        if ticket.payout is None or ticket.payout == 0:
            ticket.payout = ticket.stake * ticket.odds
        ticket.profit = ticket.payout - ticket.stake
    elif ticket.status == TicketStatus.half_win and ticket.payout is not None and ticket.stake is not None:
        ticket.profit = ticket.payout - ticket.stake
    elif ticket.status == TicketStatus.lost:
        ticket.profit = -ticket.stake
        ticket.payout = 0
    elif ticket.status == TicketStatus.half_loss:
        ticket.profit = -(ticket.stake / 2)
        ticket.payout = ticket.stake / 2
    elif ticket.status == TicketStatus.void:
        ticket.profit = 0
        ticket.payout = ticket.stake

    db.commit()
    
    # Re-fetch with relationships to ensure they are populated in the response
    return db.query(Ticket).options(
        joinedload(Ticket.bookmaker),
        joinedload(Ticket.sport),
        joinedload(Ticket.league),
        joinedload(Ticket.market_type_rel),
    ).filter(Ticket.id == ticket_id).first()


@router.delete("/{ticket_id}")
def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    """Smazat tiket."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Tiket nenalezen")
    db.delete(ticket)
    db.commit()
    return {"detail": "Tiket smazán"}
