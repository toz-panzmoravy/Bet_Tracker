from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Ticket, TicketStatus, TicketSource
from app.schemas import TicketCreate, TicketUpdate, TicketOut

router = APIRouter(prefix="/api/tickets", tags=["Tikety"])


@router.post("", response_model=TicketOut)
def create_ticket(data: TicketCreate, db: Session = Depends(get_db)):
    """Vytvořit nový tiket."""
    ticket = Ticket(**data.model_dump())

    # Automatický výpočet profitu
    if ticket.status == TicketStatus.won and ticket.payout and ticket.stake:
        ticket.profit = ticket.payout - ticket.stake
    elif ticket.status == TicketStatus.lost:
        ticket.profit = -ticket.stake
        ticket.payout = 0
    elif ticket.status == TicketStatus.void:
        ticket.profit = 0
        ticket.payout = ticket.stake

    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("", response_model=List[TicketOut])
def list_tickets(
    sport_id: Optional[int] = None,
    league_id: Optional[int] = None,
    bookmaker_id: Optional[int] = None,
    status: Optional[str] = None,
    market_type: Optional[str] = None,
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
    """Seznam tiketů s filtry, řazením a stránkováním."""
    query = db.query(Ticket).options(
        joinedload(Ticket.bookmaker),
        joinedload(Ticket.sport),
        joinedload(Ticket.league),
    )

    if sport_id:
        query = query.filter(Ticket.sport_id == sport_id)
    if league_id:
        query = query.filter(Ticket.league_id == league_id)
    if bookmaker_id:
        query = query.filter(Ticket.bookmaker_id == bookmaker_id)
    if status:
        query = query.filter(Ticket.status == status)
    if market_type:
        query = query.filter(Ticket.market_type == market_type)
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

    # Řazení
    sort_col = getattr(Ticket, sort_by, Ticket.created_at)
    query = query.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())

    return query.offset(offset).limit(limit).all()


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    """Detail tiketu."""
    ticket = db.query(Ticket).options(
        joinedload(Ticket.bookmaker),
        joinedload(Ticket.sport),
        joinedload(Ticket.league),
    ).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Tiket nenalezen")
    return ticket


@router.put("/{ticket_id}", response_model=TicketOut)
def update_ticket(ticket_id: int, data: TicketUpdate, db: Session = Depends(get_db)):
    """Upravit tiket."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Tiket nenalezen")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(ticket, key, value)

    # Přepočítat profit pro vypořádané tikety
    if ticket.status in [TicketStatus.won, TicketStatus.half_win] and ticket.payout is not None and ticket.stake is not None:
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
    db.refresh(ticket)
    return ticket


@router.delete("/{ticket_id}")
def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    """Smazat tiket."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Tiket nenalezen")
    db.delete(ticket)
    db.commit()
    return {"detail": "Tiket smazán"}
